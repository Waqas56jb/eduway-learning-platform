import type { RbacAction, RbacModule } from '../../config/constants.js';
import type { Localized } from '../../common/i18n/index.js';

export type PermissionMatrix = Record<RbacModule, Record<RbacAction, boolean>>;

export interface RoleDto {
  id: string;
  key: string;
  name: Localized;
  description: Localized;
  system: boolean;
  permissions: PermissionMatrix;
  createdAt: string;
  updatedAt: string;
  assignedAdmins: { id: string; name: Localized; avatarUrl: string | null }[];
  assignedCount: number;
  grantedCount: number;
}

export interface RoleRow {
  id: string;
  key: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}
