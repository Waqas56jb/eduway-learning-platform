/**
 * PackagePublic mapper (API_CONTRACT §14) — shared by /packages (packages module), MySubscription and /auth/me.
 */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import type { Localized } from '../i18n/index.js';

export interface PackageComparison {
  subjectsCount: number;
  lessons: boolean;
  quizzes: boolean;
  questionBank: 'subject' | 'full' | 'unlimited';
  mistakes: boolean;
  examSimulator: boolean | 'unlimited';
  aiQuota: number;
  pdfResources: boolean;
  analytics: boolean;
  devices: number;
  prioritySupport: boolean;
}

export interface PackagePublic {
  id: string;
  name: Localized;
  tagline: Localized;
  description: Localized;
  priceMonthly: number;
  priceYearly: number | null;
  yearlySavingPct: number | null;
  baseValidity: { type: 'days' | 'months' | 'until_date'; value: number; validUntil: string | null; days: number };
  currency: 'IQD' | 'USD';
  currencyLabel: Localized;
  subjects: string[];
  subjectIds: string[];
  aiQuota: number;
  popular: boolean;
  features: Localized[];
  comparison: PackageComparison;
  renewal: 'manual' | 'auto' | 'none';
  accessStart: 'immediate' | 'from_date';
  accessStartDate: string | null;
  order: number;
  isCurrent: boolean | null;
}

export interface PackageRow {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  tagline_en: string;
  tagline_ar: string;
  description_en: string;
  description_ar: string;
  price: number;
  yearly_price: number | null;
  yearly_validity_days: number;
  currency: 'IQD' | 'USD';
  currency_label_en: string;
  currency_label_ar: string;
  validity_type: 'days' | 'months' | 'until_date';
  validity_value: number;
  valid_until: Date | null;
  renewal: 'manual' | 'auto' | 'none';
  access_start: 'immediate' | 'from_date';
  access_start_date: Date | null;
  ai_quota: number | null;
  is_featured: boolean;
  sort_order: number;
  comparison: Partial<PackageComparison>;
  status: string;
}

/** Validity of the base plan in days (until_date resolved against `from`). */
export function baseValidityDays(p: Pick<PackageRow, 'validity_type' | 'validity_value' | 'valid_until'>, from = new Date()): number {
  if (p.validity_type === 'days') return p.validity_value;
  if (p.validity_type === 'months') return Math.round(p.validity_value * 30.4375);
  if (p.valid_until) return Math.max(0, Math.ceil((p.valid_until.getTime() - from.getTime()) / 86_400_000));
  return 0;
}

export function toPackagePublic(
  p: PackageRow,
  extra: { subjects: { id: string; slug: string }[]; features: Localized[]; defaultAiQuota: number; currentPackageId?: string | null; devices?: number },
): PackagePublic {
  const aiQuota = p.ai_quota ?? extra.defaultAiQuota;
  const days = baseValidityDays(p);
  const monthlyEquivalent = p.validity_type === 'months' && p.validity_value === 1 ? p.price : null;
  const yearlySavingPct = p.yearly_price && monthlyEquivalent ? Math.round((1 - p.yearly_price / (monthlyEquivalent * 12)) * 1000) / 10 : null;
  const comparison: PackageComparison = {
    subjectsCount: extra.subjects.length,
    lessons: true,
    quizzes: true,
    questionBank: extra.subjects.length >= 5 ? 'unlimited' : extra.subjects.length > 1 ? 'full' : 'subject',
    mistakes: true,
    examSimulator: extra.subjects.length >= 5 ? 'unlimited' : extra.subjects.length > 1,
    aiQuota,
    pdfResources: extra.subjects.length > 1,
    analytics: extra.subjects.length >= 5,
    devices: extra.devices ?? 2,
    prioritySupport: extra.subjects.length >= 5,
    ...p.comparison,
  };
  return {
    id: p.id,
    name: { en: p.name_en, ar: p.name_ar },
    tagline: { en: p.tagline_en, ar: p.tagline_ar },
    description: { en: p.description_en, ar: p.description_ar },
    priceMonthly: p.price,
    priceYearly: p.yearly_price,
    yearlySavingPct,
    baseValidity: { type: p.validity_type, value: p.validity_value, validUntil: p.valid_until?.toISOString() ?? null, days },
    currency: p.currency,
    currencyLabel: { en: p.currency_label_en, ar: p.currency_label_ar },
    subjects: extra.subjects.map((s) => s.slug),
    subjectIds: extra.subjects.map((s) => s.id),
    aiQuota,
    popular: p.is_featured,
    features: extra.features,
    comparison,
    renewal: p.renewal,
    accessStart: p.access_start,
    accessStartDate: p.access_start_date?.toISOString() ?? null,
    order: p.sort_order,
    isCurrent: extra.currentPackageId === undefined ? null : extra.currentPackageId === p.id,
  };
}

/** Load subjects + features for packages in one round trip each. */
export async function loadPackageExtras(packageIds: string[], ex?: Executor) {
  if (!packageIds.length) return { subjects: new Map<string, { id: string; slug: string }[]>(), features: new Map<string, Localized[]>() };
  const subj = await db.many<{ package_id: string; id: string; slug: string }>(
    `SELECT ps.package_id, s.id, s.slug FROM ${T.package_subjects} ps JOIN ${T.subjects} s ON s.id = ps.subject_id
      WHERE ps.package_id = ANY($1::uuid[]) ORDER BY s.sort_order`,
    [packageIds],
    ex,
  );
  const feat = await db.many<{ package_id: string; text_en: string; text_ar: string }>(
    `SELECT package_id, text_en, text_ar FROM ${T.package_features} WHERE package_id = ANY($1::uuid[]) ORDER BY sort_order`,
    [packageIds],
    ex,
  );
  const subjects = new Map<string, { id: string; slug: string }[]>();
  for (const r of subj) subjects.set(r.package_id, [...(subjects.get(r.package_id) ?? []), { id: r.id, slug: r.slug }]);
  const features = new Map<string, Localized[]>();
  for (const r of feat) features.set(r.package_id, [...(features.get(r.package_id) ?? []), { en: r.text_en, ar: r.text_ar }]);
  return { subjects, features };
}
