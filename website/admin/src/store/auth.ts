/* Admin session state backed by the real API (contract §4.2, §18).
 * Tokens live in `tokenStore` (src/api/client.ts); this store keeps the auth stage + `MeAdminDto`. */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AdminUser, ModuleKey, PermAction, Role } from '@/types';
import { setAuthLostHandler, tokenStore } from '@/api/client';
import { authApi } from '@/api/auth';
import { queryClient } from '@/api/queryClient';
import type { AuthTokens, MeAdminDto, PermissionKey, RoleDto } from '@/api/types';

/** Stages: `anon` → (`2fa` | `enroll`) → `auth`. */
type Stage = 'anon' | '2fa' | 'enroll' | 'auth';

interface AuthState {
  stage: Stage;
  me: MeAdminDto | null;
  /** Current admin id (`me.admin.id`), kept for convenience. */
  adminId: string | null;
  /** Short-lived token from AUTH-10 when MFA is required / enrolment is forced. */
  mfaToken: string | null;
  remember: boolean;
  /** Dev helper: preview the portal as another role without changing the account (client-side gating only). */
  previewRole: RoleDto | null;
  previewRoleId: string | null;
  /** Called after any successful token issuance. */
  setSession: (tokens: AuthTokens, me: MeAdminDto, remember?: boolean) => void;
  setMe: (me: MeAdminDto) => void;
  setMfa: (mfaToken: string, enroll: boolean, remember: boolean) => void;
  logout: (opts?: { silent?: boolean }) => void;
  setPreviewRole: (role: RoleDto | null) => void;
}

const KEY = 'eduway.admin.auth';
const storage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k) ?? sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      const remember = JSON.parse(v)?.state?.remember;
      (remember ? localStorage : sessionStorage).setItem(k, v);
      (remember ? sessionStorage : localStorage).removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      stage: tokenStore.get() ? 'auth' : 'anon',
      me: null,
      adminId: null,
      mfaToken: null,
      remember: true,
      previewRole: null,
      previewRoleId: null,

      setSession: (tokens, me, remember = get().remember) => {
        tokenStore.set(tokens, remember);
        set({ stage: 'auth', me, adminId: me.admin.id, mfaToken: null, remember, previewRole: null, previewRoleId: null });
        queryClient.setQueryData(['me'], me);
      },
      setMe: (me) => set({ me, adminId: me.admin.id }),
      setMfa: (mfaToken, enroll, remember) => set({ stage: enroll ? 'enroll' : '2fa', mfaToken, remember }),

      logout: (opts) => {
        const refresh = tokenStore.get()?.refreshToken;
        if (refresh && !opts?.silent) authApi.logout(refresh).catch(() => undefined);
        tokenStore.clear();
        queryClient.clear();
        set({ stage: 'anon', me: null, adminId: null, mfaToken: null, previewRole: null, previewRoleId: null });
      },

      setPreviewRole: (role) => set({ previewRole: role, previewRoleId: role?.id ?? null }),
    }),
    {
      name: KEY,
      version: 2,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ stage: s.stage === 'auth' ? 'auth' : 'anon', me: s.stage === 'auth' ? s.me : null, remember: s.remember }) as AuthState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AuthState>;
        // Tokens are the source of truth: no tokens → signed out.
        const hasTokens = !!tokenStore.get();
        const me = hasTokens ? (p.me ?? null) : null;
        return { ...current, ...p, stage: hasTokens ? 'auth' : 'anon', me, adminId: me?.admin?.id ?? null };
      },
      migrate: () => ({ stage: 'anon', me: null, remember: true }) as unknown as AuthState,
    },
  ),
);

// Refresh failure anywhere → back to login.
setAuthLostHandler(() => {
  if (useAuth.getState().stage === 'auth') useAuth.getState().logout({ silent: true });
});

// ─── adapters to the existing flat UI types ──────────────────────────────────
export function roleFromDto(r: RoleDto): Role {
  return {
    id: r.id,
    key: r.key,
    name_en: r.name.en,
    name_ar: r.name.ar,
    description_en: r.description?.en ?? '',
    description_ar: r.description?.ar ?? '',
    system: r.system,
    permissions: r.permissions,
    createdAt: r.createdAt,
  };
}

export function adminFromMe(me: MeAdminDto): AdminUser {
  const a = me.admin;
  return {
    id: a.id,
    name: a.name.en,
    name_ar: a.name.ar,
    email: a.email,
    mobile: a.mobile ?? '',
    roleId: a.roleId,
    avatar: a.avatarUrl ?? '',
    mfaEnabled: a.mfaEnabled,
    status: a.status,
    lastLogin: a.lastLogin,
    createdAt: a.createdAt,
  };
}

/** Current admin record (reactive), in the UI's flat shape. */
export function useCurrentAdmin(): AdminUser | undefined {
  const me = useAuth((s) => s.me);
  return me ? adminFromMe(me) : undefined;
}

/** Effective role — the preview role if set, otherwise the admin's own role (reactive). */
export function useCurrentRole(): Role | undefined {
  const me = useAuth((s) => s.me);
  const preview = useAuth((s) => s.previewRole);
  const r = preview ?? me?.role;
  return r ? roleFromDto(r) : undefined;
}

// ─── permission checks ───────────────────────────────────────────────────────
export function checkPermission(me: MeAdminDto | null, preview: RoleDto | null, module: ModuleKey, action: PermAction = 'view') {
  if (preview) return !!preview.permissions?.[module]?.[action];
  if (!me) return false;
  if (me.role?.key === 'super_admin' || me.roles?.includes('super_admin')) return true;
  const key = `${module}.${action}` as PermissionKey;
  if (me.permissions?.includes(key)) return true;
  return !!me.role?.permissions?.[module]?.[action];
}

/** Permission check hook: `const can = useCan(); can('content', 'approve')`. */
export function useCan() {
  const me = useAuth((s) => s.me);
  const preview = useAuth((s) => s.previewRole);
  return (module: ModuleKey, action: PermAction = 'view') => checkPermission(me, preview, module, action);
}

/** Non-reactive permission check for use inside handlers. */
export function canNow(module: ModuleKey, action: PermAction = 'view') {
  const { me, previewRole } = useAuth.getState();
  return checkPermission(me, previewRole, module, action);
}
