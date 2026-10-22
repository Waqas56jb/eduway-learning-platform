/* RBAC helpers driven by GET /auth/me (`permissions: PermissionKey[]`, `role.permissions` matrix).
 * Super Admin bypasses. The dev "preview as role" (Topbar) narrows client-side gating only.
 *
 *   const { has, can } = usePermissions();  has('content.approve')  can('content', 'approve')
 *   <Can perm="users.edit">…</Can>           <Can perm={['payments.approve', 'payments.edit']} mode="any">…</Can>
 */
import { createElement, Fragment, type ReactNode } from 'react';
import type { ModuleKey, PermAction } from '@/types';
import { checkPermission, useAuth } from '@/store/auth';
import type { MeAdminDto, PermissionKey, RoleDto } from './types';

function split(key: PermissionKey | string): [ModuleKey, PermAction] {
  const [m, a] = key.split('.') as [ModuleKey, PermAction];
  return [m, a ?? 'view'];
}

/** Pure check (no React). */
export function hasPermission(me: MeAdminDto | null, key: PermissionKey | string, preview: RoleDto | null = null): boolean {
  const [m, a] = split(key);
  return checkPermission(me, preview, m, a);
}

/** Non-reactive check against the current session (event handlers, loaders). */
export function hasPermissionNow(key: PermissionKey | string): boolean {
  const { me, previewRole } = useAuth.getState();
  return hasPermission(me, key, previewRole);
}

export function usePermissions() {
  const me = useAuth((s) => s.me);
  const preview = useAuth((s) => s.previewRole);
  const has = (key: PermissionKey | string) => hasPermission(me, key, preview);
  return {
    me,
    permissions: me?.permissions ?? [],
    isSuperAdmin: !preview && (me?.role?.key === 'super_admin' || !!me?.roles?.includes('super_admin')),
    has,
    any: (...keys: (PermissionKey | string)[]) => keys.some(has),
    all: (...keys: (PermissionKey | string)[]) => keys.every(has),
    can: (module: ModuleKey, action: PermAction = 'view') => checkPermission(me, preview, module, action),
  };
}

export interface CanProps {
  perm: PermissionKey | string | (PermissionKey | string)[];
  /** With several perms: require all (default) or any. */
  mode?: 'all' | 'any';
  children: ReactNode;
  fallback?: ReactNode;
}

/** Render children only when the current admin has the permission(s). */
export function Can({ perm, mode = 'all', children, fallback = null }: CanProps) {
  const p = usePermissions();
  const list = Array.isArray(perm) ? perm : [perm];
  const ok = mode === 'any' ? p.any(...list) : p.all(...list);
  return createElement(Fragment, null, ok ? children : fallback);
}
