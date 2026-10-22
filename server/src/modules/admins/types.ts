import type { Localized } from '../../common/i18n/index.js';
import type { RoleDto } from '../roles/types.js';

export interface AdminUserDto {
  id: string;
  name: Localized;
  email: string;
  mobile: string | null;
  roleId: string;
  role: { id: string; key: string; name: Localized };
  avatarUrl: string | null;
  mfaEnabled: boolean;
  status: 'active' | 'invited' | 'deactivated';
  lastLogin: string | null;
  createdAt: string;
}

export interface AdminPreferences {
  language: 'en' | 'ar';
  theme: 'light' | 'dark' | 'system';
}

export interface MeAdminDto {
  admin: AdminUserDto;
  role: RoleDto;
  permissions: string[];
  roles: string[];
  preferences: AdminPreferences;
  unreadNotifications: number;
}

export interface AdminRow {
  id: string;
  name_en: string;
  name_ar: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  status: 'active' | 'invited' | 'deactivated' | 'locked';
  created_at: Date;
  admin_user_id: string;
  password_hash: string | null;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  mfa_pending_secret: string | null;
  last_login_at: Date | null;
  preferences: Partial<AdminPreferences>;
  role_id: string | null;
  role_key: string | null;
  role_name_en: string | null;
  role_name_ar: string | null;
}

export interface AdminInboxNotification {
  id: string;
  title: Localized;
  body: Localized;
  at: string;
  read: boolean;
  href: string;
  kind: 'info' | 'warning' | 'success' | 'danger';
}
