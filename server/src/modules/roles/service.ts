import { RBAC_ACTIONS, RBAC_MODULES, SUPER_ADMIN_ROLE, type RbacAction, type RbacModule } from '../../config/constants.js';
import { tx } from '../../config/db.js';
import { invalidatePrincipal } from '../../common/auth/principal.js';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { rolesRepo } from './repository.js';
import type { PermissionMatrix, RoleDto, RoleRow } from './types.js';

export const MODULE_LABELS: Record<RbacModule, Localized> = {
  dashboard: { en: 'Dashboard', ar: 'لوحة التحكم' },
  users: { en: 'Users', ar: 'المستخدمون' },
  content: { en: 'Content', ar: 'المحتوى' },
  questions: { en: 'Question bank', ar: 'بنك الأسئلة' },
  assessments: { en: 'Assessments', ar: 'التقييمات' },
  packages: { en: 'Packages', ar: 'الباقات' },
  payments: { en: 'Payments', ar: 'المدفوعات' },
  schools: { en: 'Schools', ar: 'المدارس' },
  marketers: { en: 'Marketers', ar: 'المسوّقون' },
  aitutor: { en: 'AI Tutor', ar: 'المعلّم الذكي' },
  analytics: { en: 'Analytics', ar: 'التحليلات' },
  notifications: { en: 'Notifications', ar: 'الإشعارات' },
  settings: { en: 'Settings', ar: 'الإعدادات' },
  security: { en: 'Security', ar: 'الأمان' },
};

export function emptyMatrix(): PermissionMatrix {
  return Object.fromEntries(RBAC_MODULES.map((m) => [m, Object.fromEntries(RBAC_ACTIONS.map((a) => [a, false]))])) as PermissionMatrix;
}

/** Permission keys → matrix. */
export function toMatrix(keys: Iterable<string>): PermissionMatrix {
  const m = emptyMatrix();
  for (const k of keys) {
    const [mod, act] = k.split('.') as [RbacModule, RbacAction];
    if (m[mod] && act in m[mod]) m[mod][act] = true;
  }
  return m;
}

/** Matrix → normalized permission keys (any action ⇒ view; no view ⇒ nothing for that module). */
export function normalizeMatrix(matrix: Partial<Record<string, Partial<Record<string, boolean>>>>): string[] {
  const keys: string[] = [];
  for (const mod of RBAC_MODULES) {
    const row = matrix[mod] ?? {};
    const actions = RBAC_ACTIONS.filter((a) => row[a]);
    if (!actions.length) continue;
    const withView = new Set<RbacAction>(['view', ...actions]);
    for (const a of RBAC_ACTIONS) if (withView.has(a)) keys.push(`${mod}.${a}`);
  }
  return keys;
}

async function toDtos(rows: RoleRow[]): Promise<RoleDto[]> {
  const ids = rows.map((r) => r.id);
  const perms = await rolesRepo.permissionsByRole(ids);
  const admins = await rolesRepo.assignedAdmins(ids);
  return rows.map((r) => {
    const keys = r.key === SUPER_ADMIN_ROLE ? RBAC_MODULES.flatMap((m) => RBAC_ACTIONS.map((a) => `${m}.${a}`)) : (perms.get(r.id) ?? []);
    const assigned = admins.filter((a) => a.role_id === r.id);
    return {
      id: r.id,
      key: r.key,
      name: { en: r.name_en, ar: r.name_ar },
      description: { en: r.description_en, ar: r.description_ar },
      system: r.is_system,
      permissions: toMatrix(keys),
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      assignedAdmins: assigned.slice(0, 8).map((a) => ({ id: a.id, name: { en: a.name_en, ar: a.name_ar || a.name_en }, avatarUrl: a.avatar_url })),
      assignedCount: assigned.length,
      grantedCount: keys.length,
    };
  });
}

export interface RoleWrite {
  key: string;
  name: Localized;
  description?: Localized;
  permissions: Partial<Record<string, Partial<Record<string, boolean>>>>;
}

export const rolesService = {
  async list(): Promise<{ items: RoleDto[]; meta: { customCount: number; assignedAdmins: number } }> {
    const items = await toDtos(await rolesRepo.list());
    return {
      items,
      meta: { customCount: items.filter((r) => !r.system).length, assignedAdmins: items.reduce((s, r) => s + r.assignedCount, 0) },
    };
  },

  async get(id: string): Promise<RoleDto> {
    const row = await rolesRepo.get(id);
    if (!row) throw new NotFoundError('role');
    return (await toDtos([row]))[0] as RoleDto;
  },

  async create(input: RoleWrite): Promise<RoleDto> {
    if ((await rolesRepo.keyExists(input.key)) ?? 0) throw new ConflictError('ALREADY_EXISTS', { field: 'key' });
    const id = await tx(async (c) => {
      const row = await rolesRepo.insert({ key: input.key, nameEn: input.name.en, nameAr: input.name.ar, descEn: input.description?.en ?? '', descAr: input.description?.ar ?? '' }, c);
      await rolesRepo.setPermissions(row.id, normalizeMatrix(input.permissions), c);
      return row.id;
    });
    return this.get(id);
  },

  async update(id: string, input: RoleWrite): Promise<RoleDto> {
    const row = await rolesRepo.get(id);
    if (!row) throw new NotFoundError('role');
    if (row.key === SUPER_ADMIN_ROLE) throw new ForbiddenError('SYSTEM_ROLE');
    const key = row.is_system ? row.key : input.key;
    if (key !== row.key && ((await rolesRepo.keyExists(key)) ?? 0)) throw new ConflictError('ALREADY_EXISTS', { field: 'key' });
    await tx(async (c) => {
      await rolesRepo.update(id, { key, nameEn: input.name.en, nameAr: input.name.ar, descEn: input.description?.en ?? row.description_en, descAr: input.description?.ar ?? row.description_ar }, c);
      await rolesRepo.setPermissions(id, normalizeMatrix(input.permissions), c);
    });
    invalidatePrincipal(); // permission changes apply on the affected admins' next request
    return this.get(id);
  },

  async clone(id: string): Promise<RoleDto> {
    const src = await this.get(id);
    let key = `${src.key}_copy`;
    for (let n = 2; (await rolesRepo.keyExists(key)) ?? 0; n++) key = `${src.key}_copy_${n}`;
    return this.create({
      key,
      name: { en: `Copy of ${src.name.en}`, ar: `نسخة من ${src.name.ar}` },
      description: src.description,
      permissions: src.permissions,
    });
  },

  async remove(id: string, confirmKey: string): Promise<void> {
    const row = await rolesRepo.get(id);
    if (!row) throw new NotFoundError('role');
    if (row.is_system) throw new ForbiddenError('SYSTEM_ROLE');
    if (confirmKey !== row.key) throw new BusinessRuleError('CONFIRM_KEY_MISMATCH');
    const assigned = (await rolesRepo.countAssigned(id)) ?? 0;
    if (assigned > 0) throw new ConflictError('HAS_DEPENDENTS', { count: assigned });
    await tx((c) => rolesRepo.delete(id, c));
  },

  catalog() {
    return { modules: [...RBAC_MODULES], actions: [...RBAC_ACTIONS], labels: MODULE_LABELS };
  },

  /** Diff of matrix cells for the audit log: { "content.edit": false } → { "content.edit": true } */
  diff(before: PermissionMatrix, after: PermissionMatrix) {
    const b: Record<string, boolean> = {};
    const a: Record<string, boolean> = {};
    for (const m of RBAC_MODULES) {
      for (const act of RBAC_ACTIONS) {
        if (before[m][act] !== after[m][act]) {
          b[`${m}.${act}`] = before[m][act];
          a[`${m}.${act}`] = after[m][act];
        }
      }
    }
    return { before: b, after: a };
  },
};
