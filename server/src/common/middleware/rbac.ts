/**
 * RBAC: `requirePermission('content.edit')` — admin must hold ALL listed permissions (Super Admin bypasses).
 * `requireAnyPermission('payments.view', 'users.view')` — at least one.
 */
import type { NextFunction, Request, Response } from 'express';
import type { PermissionKey } from '../../config/constants.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import type { AdminPrincipal } from '../types/index.js';

export function hasPermission(admin: Pick<AdminPrincipal, 'isSuperAdmin' | 'permissions'> | undefined, perm: string): boolean {
  if (!admin) return false;
  return admin.isSuperAdmin || admin.permissions.has(perm);
}

export function hasAllPermissions(admin: Pick<AdminPrincipal, 'isSuperAdmin' | 'permissions'> | undefined, perms: readonly string[]): boolean {
  return perms.every((p) => hasPermission(admin, p));
}

export function hasAnyPermission(admin: Pick<AdminPrincipal, 'isSuperAdmin' | 'permissions'> | undefined, perms: readonly string[]): boolean {
  return perms.length === 0 || perms.some((p) => hasPermission(admin, p));
}

export function requirePermission(...perms: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.admin) throw new UnauthorizedError();
    if (!hasAllPermissions(req.admin, perms)) {
      throw new ForbiddenError(undefined, { permission: perms[0], required: perms });
    }
    next();
  };
}

export function requireAnyPermission(...perms: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.admin) throw new UnauthorizedError();
    if (!hasAnyPermission(req.admin, perms)) {
      throw new ForbiddenError(undefined, { permission: perms[0], requiredAny: perms });
    }
    next();
  };
}

/** Throwing helper for services: `assertPermission(req.admin, 'payments.approve')`. */
export function assertPermission(admin: AdminPrincipal | undefined, perm: PermissionKey): void {
  if (!hasPermission(admin, perm)) throw new ForbiddenError(undefined, { permission: perm });
}
