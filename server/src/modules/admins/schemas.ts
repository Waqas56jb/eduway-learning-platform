import { localized } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { paginationQuery } from '../../common/utils/pagination.js';

export const adminUserDto = z
  .object({
    id: z.string().uuid(),
    name: localized,
    email: z.string(),
    mobile: z.string().nullable(),
    roleId: z.string(),
    role: z.object({ id: z.string(), key: z.string(), name: localized }),
    avatarUrl: z.string().nullable(),
    mfaEnabled: z.boolean(),
    status: z.enum(['active', 'invited', 'deactivated']),
    lastLogin: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('AdminUserDto');

export const meAdminDto = z
  .object({
    admin: adminUserDto,
    role: z.record(z.unknown()),
    permissions: z.array(z.string()),
    roles: z.array(z.string()),
    preferences: z.object({ language: z.enum(['en', 'ar']), theme: z.enum(['light', 'dark', 'system']), emailAlerts: z.boolean() }),
    unreadNotifications: z.number(),
  })
  .openapi('MeAdminDto');

const ADMIN_PHONE = /^\+964\s?7\d{2}\s?\d{3}\s?\d{4}$/;
const loc3 = z.object({ en: z.string().trim().min(3).max(80), ar: z.string().trim().min(3).max(80) });

export const updateMeBody = z.object({
  name: loc3.optional(),
  email: z.string().email().max(200).optional(),
  mobile: z.string().regex(ADMIN_PHONE).optional(),
  avatarFileKey: z.string().regex(/^upl_[0-9a-f-]{36}$/).nullable().optional(),
});

export const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });
export const preferencesBody = z.object({ language: z.enum(['en', 'ar']).optional(), theme: z.enum(['light', 'dark', 'system']).optional(), emailAlerts: z.boolean().optional() });

export const inboxQuery = z.object({
  unread: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(500).optional(),
});

export const adminListQuery = paginationQuery.extend({
  roleId: z.string().uuid().optional(),
  status: z.enum(['active', 'invited', 'deactivated']).optional(),
});

export const inviteBody = z.object({
  name: z.object({ en: z.string().trim().min(2).max(80), ar: z.string().trim().max(80).default('') }),
  email: z.string().email().max(200),
  roleId: z.string().uuid(),
  mobile: z.string().max(25).nullable().optional(),
});

export const roleIdBody = z.object({ roleId: z.string().uuid() });

