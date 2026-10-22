/**
 * Shared reference DTO mappers (API_CONTRACT §1.3). Use these everywhere so embedded summaries are identical.
 * SQL helpers return the column lists to select with a given table alias.
 */
import type { Localized } from '../i18n/index.js';

export interface AdminRef {
  id: string;
  name: Localized;
  avatarUrl: string | null;
  roleName?: Localized;
}
export interface StudentRef {
  id: string;
  name: Localized;
  mobile: string;
  avatarUrl: string | null;
}
export interface SubjectRef {
  id: string;
  slug: string;
  name: Localized;
  color: string;
}
export interface Governorate {
  id: string;
  name: Localized;
}
export interface SchoolRef {
  id: string;
  name: Localized;
  code: string;
}
export interface MarketerRef {
  id: string;
  name: Localized;
  avatarUrl: string | null;
}
export interface PackageRef {
  id: string;
  name: Localized;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const sn = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** `prefix` = column alias prefix used in the SELECT, e.g. `actor_` for actor_id, actor_name_en … */
export function adminRef(r: Row, prefix: string): AdminRef | null {
  const id = r[`${prefix}id`];
  if (!id) return null;
  return { id: String(id), name: { en: s(r[`${prefix}name_en`]), ar: s(r[`${prefix}name_ar`]) || s(r[`${prefix}name_en`]) }, avatarUrl: sn(r[`${prefix}avatar_url`]) };
}

export function studentRef(r: Row, prefix: string): StudentRef | null {
  const id = r[`${prefix}id`];
  if (!id) return null;
  return {
    id: String(id),
    name: { en: s(r[`${prefix}name_en`]), ar: s(r[`${prefix}name_ar`]) || s(r[`${prefix}name_en`]) },
    mobile: s(r[`${prefix}phone`]),
    avatarUrl: sn(r[`${prefix}avatar_url`]),
  };
}

export function subjectRef(r: Row, prefix: string): SubjectRef | null {
  const id = r[`${prefix}id`];
  if (!id) return null;
  return { id: String(id), slug: s(r[`${prefix}slug`]), name: { en: s(r[`${prefix}name_en`]), ar: s(r[`${prefix}name_ar`]) }, color: s(r[`${prefix}color`]) };
}

export function governorateRef(r: Row, prefix: string): Governorate | null {
  const code = r[`${prefix}code`];
  if (!code) return null;
  return { id: String(code), name: { en: s(r[`${prefix}name_en`]), ar: s(r[`${prefix}name_ar`]) } };
}

export function schoolRef(r: Row, prefix: string): SchoolRef | null {
  const id = r[`${prefix}id`];
  if (!id) return null;
  return { id: String(id), name: { en: s(r[`${prefix}name_en`]), ar: s(r[`${prefix}name_ar`]) }, code: s(r[`${prefix}code`]) };
}

export function marketerRef(r: Row, prefix: string): MarketerRef | null {
  const id = r[`${prefix}id`];
  if (!id) return null;
  return { id: String(id), name: { en: s(r[`${prefix}name_en`]), ar: s(r[`${prefix}name_ar`]) }, avatarUrl: sn(r[`${prefix}avatar_url`]) };
}

export function packageRef(r: Row, prefix: string): PackageRef | null {
  const id = r[`${prefix}id`];
  if (!id) return null;
  return { id: String(id), name: { en: s(r[`${prefix}name_en`]), ar: s(r[`${prefix}name_ar`]) } };
}

/** SELECT fragments: `${refCols('u', 'actor_', 'user')}` */
export const refCols = {
  user: (alias: string, prefix: string) =>
    `${alias}.id AS ${prefix}id, ${alias}.name_en AS ${prefix}name_en, ${alias}.name_ar AS ${prefix}name_ar, ${alias}.avatar_url AS ${prefix}avatar_url, ${alias}.phone AS ${prefix}phone`,
  subject: (alias: string, prefix: string) =>
    `${alias}.id AS ${prefix}id, ${alias}.slug AS ${prefix}slug, ${alias}.name_en AS ${prefix}name_en, ${alias}.name_ar AS ${prefix}name_ar, ${alias}.color AS ${prefix}color`,
  governorate: (alias: string, prefix: string) =>
    `${alias}.code AS ${prefix}code, ${alias}.name_en AS ${prefix}name_en, ${alias}.name_ar AS ${prefix}name_ar`,
  school: (alias: string, prefix: string) =>
    `${alias}.id AS ${prefix}id, ${alias}.name_en AS ${prefix}name_en, ${alias}.name_ar AS ${prefix}name_ar, ${alias}.code AS ${prefix}code`,
  marketer: (alias: string, prefix: string) =>
    `${alias}.id AS ${prefix}id, ${alias}.name_en AS ${prefix}name_en, ${alias}.name_ar AS ${prefix}name_ar, ${alias}.avatar_url AS ${prefix}avatar_url`,
  package: (alias: string, prefix: string) => `${alias}.id AS ${prefix}id, ${alias}.name_en AS ${prefix}name_en, ${alias}.name_ar AS ${prefix}name_ar`,
};

export const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
export const OK = { ok: true } as const;
