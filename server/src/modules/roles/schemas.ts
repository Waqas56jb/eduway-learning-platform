import { RBAC_ACTIONS, RBAC_MODULES } from '../../config/constants.js';
import { localized } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

/** PermissionMatrix: { [module]: { [action]: boolean } } — unknown modules/actions are ignored, missing = false. */
export const permissionMatrix = z
  .record(z.enum(RBAC_MODULES), z.record(z.enum(RBAC_ACTIONS), z.boolean()))
  .openapi('PermissionMatrix');

const loc2 = z.object({ en: z.string().trim().min(2).max(80), ar: z.string().trim().min(2).max(80) });

export const roleWriteBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{2,40}$/),
  name: loc2,
  description: z.object({ en: z.string().max(500), ar: z.string().max(500) }).optional(),
  permissions: permissionMatrix,
});

/** confirmKey may come in the body or as ?confirmKey= (DELETE bodies are dropped by some clients). */
export const roleDeleteBody = z.object({ confirmKey: z.string().min(1).optional() }).default({});

export const roleDto = z
  .object({
    id: z.string().uuid(),
    key: z.string(),
    name: localized,
    description: localized,
    system: z.boolean(),
    permissions: permissionMatrix,
    createdAt: z.string(),
    updatedAt: z.string(),
    assignedAdmins: z.array(z.object({ id: z.string(), name: localized, avatarUrl: z.string().nullable() })),
    assignedCount: z.number(),
    grantedCount: z.number(),
  })
  .openapi('RoleDto');

export const permissionCatalogDto = z.object({ modules: z.array(z.string()), actions: z.array(z.string()), labels: z.record(localized) });
