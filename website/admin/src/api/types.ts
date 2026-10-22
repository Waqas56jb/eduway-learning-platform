/* Shared DTOs from docs/API_CONTRACT.md §0–§1 and §18 (admin identity).
   Module-specific DTOs live next to their API module (src/api/<module>.ts). */
import type { ModuleKey, PermAction } from '@/types';

export type ID = string;
export type ISODate = string;
export type DateOnly = string;
export type Lang = 'en' | 'ar';
export interface Localized {
  en: string;
  ar: string;
}
export type Platform = 'web' | 'ios' | 'android';
export type ClientPlatform = Platform | 'admin';
export type IQD = number;
export type Currency = 'IQD' | 'USD';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type SubjectSlug = string;
export type Grain = 'day' | 'week' | 'month';
export type ExportFormat = 'csv' | 'xlsx';
export interface OkDto {
  ok: true;
}

// ─── Envelope ────────────────────────────────────────────────────────────────
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  nextCursor: string | null;
  [extra: string]: unknown;
}
export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}
export interface ErrorEnvelope {
  success: false;
  error: { code: ApiErrorCode; message: string; details?: ApiErrorDetails };
}
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'SUBSCRIPTION_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_ENTITLED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'NETWORK_ERROR'
  | (string & {});
export interface ApiErrorDetails {
  reason?: string;
  fields?: Record<string, string>;
  permission?: string;
  entity?: string;
  retryAfterSeconds?: number;
  requestId?: string;
  count?: number;
  [k: string]: unknown;
}

/** A list response: rows + pagination meta. */
export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

// ─── RBAC ────────────────────────────────────────────────────────────────────
export type PermissionKey = `${ModuleKey}.${PermAction}`;
export type PermissionMatrix = Record<ModuleKey, Record<PermAction, boolean>>;

// ─── References (§1.3) ───────────────────────────────────────────────────────
export interface SubjectRef {
  id: ID;
  slug: SubjectSlug;
  name: Localized;
  color: string;
}
export interface UnitRef {
  id: ID;
  name: Localized;
  order: number;
}
export interface TopicRef {
  id: ID;
  name: Localized;
  order: number;
  unitId: ID;
}
export interface LessonRef {
  id: ID;
  title: Localized;
  order: number;
  subjectId: ID;
  subjectSlug: SubjectSlug;
}
export interface PackageRef {
  id: ID;
  name: Localized;
}
export interface SchoolRef {
  id: ID;
  name: Localized;
  code: string;
}
export interface MarketerRef {
  id: ID;
  name: Localized;
  avatarUrl: string | null;
}
export interface StudentRef {
  id: ID;
  name: Localized;
  mobile: string;
  avatarUrl: string | null;
}
export interface AdminRef {
  id: ID;
  name: Localized;
  avatarUrl: string | null;
  roleName?: Localized;
}
export interface GovernorateDto {
  id: string;
  name: Localized;
}
export interface TeacherRef {
  id: ID;
  name: Localized;
  avatarUrl: string | null;
}

// ─── Entitlement (§1.4) ──────────────────────────────────────────────────────
export type LockedReason = 'NO_SUBSCRIPTION' | 'SUBJECT_NOT_IN_PACKAGE' | 'EXPIRED' | 'AI_NOT_INCLUDED';
export interface EntitlementDto {
  id: ID;
  subjectId: ID;
  subjectSlug: SubjectSlug;
  source: 'package' | 'manual';
  startsAt: ISODate;
  expiresAt: ISODate;
  packageId: ID | null;
  grantedBy: AdminRef | null;
  reason: string | null;
}

// ─── Sessions / AI allowance (§1.5) ──────────────────────────────────────────
export interface SessionDto {
  id: ID;
  device: string;
  platform: Platform | 'admin';
  browser: string | null;
  ip: string;
  location: Localized;
  countryCode: string | null;
  createdAt: ISODate;
  lastActive: ISODate;
  current: boolean;
}
export interface AiAllowance {
  enabled: boolean;
  disabledReason: 'GLOBAL' | 'USER' | 'NOT_INCLUDED' | null;
  used: number;
  quota: number;
  remaining: number;
  cycle: 'calendar' | 'billing';
  resetsAt: ISODate;
}
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresAt: ISODate;
}

// ─── Admin generic (§1.9) ────────────────────────────────────────────────────
export interface ExportRequest {
  format: ExportFormat;
  filters?: Record<string, unknown>;
  ids?: ID[];
  columns?: string[];
}
export interface BulkResult {
  succeeded: ID[];
  failed: { id: ID; code: string; reason?: string; message: string }[];
}
export interface ReasonBody {
  reason: string;
}
export interface NoteDto {
  id: ID;
  author: AdminRef;
  body: string;
  createdAt: ISODate;
}
export interface SeriesPoint {
  date: string;
  label: string;
  value: number;
}
export interface Kpi {
  value: number;
  prev: number | null;
  deltaPct: number | null;
  spark: number[];
}

// ─── Uploads (§1.10, §16) ────────────────────────────────────────────────────
export type UploadPurpose =
  | 'lesson_video'
  | 'lesson_thumbnail'
  | 'lesson_resource'
  | 'lesson_captions'
  | 'subject_image'
  | 'question_image'
  | 'question_import'
  | 'teacher_avatar'
  | 'logo'
  | 'admin_avatar'
  | 'student_avatar'
  | 'ai_attachment'
  | 'reconciliation_import'
  | 'testimonial_avatar';
export type FileKey = string;
export interface FileRefDto {
  fileKey: FileKey;
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  expiresAt: ISODate;
}
export interface SignedUploadDto {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  fileKey: FileKey;
  expiresAt: ISODate;
  tusEndpoint: string | null;
}

// ─── Admin identity (§18) ────────────────────────────────────────────────────
export interface AdminUserDto {
  id: ID;
  name: Localized;
  email: string;
  mobile: string | null;
  roleId: ID;
  role: { id: ID; key: string; name: Localized };
  avatarUrl: string | null;
  mfaEnabled: boolean;
  status: 'active' | 'invited' | 'deactivated';
  lastLogin: ISODate | null;
  createdAt: ISODate;
}
export interface RoleDto {
  id: ID;
  key: string;
  name: Localized;
  description: Localized;
  system: boolean;
  permissions: PermissionMatrix;
  createdAt: ISODate;
  updatedAt: ISODate;
  assignedAdmins: { id: ID; name: Localized; avatarUrl: string | null }[];
  assignedCount: number;
  grantedCount: number;
}
export interface MeAdminDto {
  admin: AdminUserDto;
  role: RoleDto;
  permissions: PermissionKey[];
  roles: string[];
  preferences: { language: Lang; theme: 'light' | 'dark' | 'system'; emailAlerts?: boolean };
  unreadNotifications: number;
}
export interface AdminInboxNotification {
  id: ID;
  title: Localized;
  body: Localized;
  at: ISODate;
  read: boolean;
  href: string;
  kind: 'info' | 'warning' | 'success' | 'danger';
}
export interface AdminSessionDto {
  id: ID;
  adminId?: ID;
  admin?: AdminRef;
  device: string;
  browser: string | null;
  ip: string;
  location: Localized;
  countryCode?: string | null;
  startedAt?: ISODate;
  createdAt?: ISODate;
  lastActive: ISODate;
  current: boolean;
}
