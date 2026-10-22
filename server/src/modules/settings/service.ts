/**
 * Settings sections (ADM-CFG-*), feature flags (ADM-FLG-*). Values take effect without deploy: every write
 * invalidates the settings cache so /public/app-config and the auth/OTP rules see them immediately.
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { devFlags } from '../../config/env.js';
import { adminRef } from '../../common/dto/refs.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { settingsStore, type SettingsKey, type SettingsValue } from '../../common/services/settings-store.js';
import { storage } from '../../common/services/storage.js';
import { invalidateLookups } from '../admins/lookups.js';
import { likeContains } from '../../common/utils/like.js';
import { gatewayMode } from '../payments/providers.js';

export const SECTIONS = ['general', 'otp', 'app', 'support', 'payments', 'learning', 'marketing', 'security'] as const;
export type SettingsSection = (typeof SECTIONS)[number];

export interface AppSettingsDto {
  minVersionIos: string;
  minVersionAndroid: string;
  latestVersion: string;
  forceUpdate: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: Localized;
  deviceLimit: number;
  sessionTimeoutMinutes: number;
  storeUrls: { ios: string | null; android: string | null };
  maintenanceAppliesTo: ('web' | 'ios' | 'android')[];
}

async function appDto(): Promise<AppSettingsDto> {
  settingsStore.invalidate('app');
  const a = await settingsStore.app();
  return {
    minVersionIos: a.minVersionIos,
    minVersionAndroid: a.minVersionAndroid,
    latestVersion: a.latestVersion,
    forceUpdate: a.forceUpdate,
    maintenanceMode: a.maintenanceMode,
    maintenanceMessage: a.maintenanceMessage,
    deviceLimit: a.deviceLimit,
    sessionTimeoutMinutes: a.sessionTimeoutMinutes,
    storeUrls: { ios: a.storeUrlIos, android: a.storeUrlAndroid },
    maintenanceAppliesTo: a.maintenancePlatforms,
  };
}

/** Section DTO as returned by ADM-CFG-01. */
export async function getSection(section: SettingsSection): Promise<unknown> {
  if (section === 'app') return appDto();
  settingsStore.invalidate(section);
  const v = await settingsStore.get(section);
  if (section === 'otp') {
    const o = v as SettingsValue<'otp'>;
    return {
      expirySeconds: o.expirySeconds,
      codeLength: o.codeLength,
      resendLimit: o.resendLimit,
      resendCooldownSeconds: o.resendCooldownSeconds,
      maxAttempts: o.maxAttempts,
      lockoutMinutes: o.lockoutMinutes,
      provider: o.provider,
      fallbackProvider: o.fallbackProvider,
      devBypassCode: devFlags.otpBypass ? o.devBypassCode : null,
    };
  }
  if (section === 'general') {
    const g = v as SettingsValue<'general'>;
    return { ...g, logoUrl: await storage.resolveUrl(g.logoUrl) };
  }
  if (section === 'payments') {
    const p = v as SettingsValue<'payments'>;
    const mockOn = devFlags.mockPayments ? p.mockGatewayEnabled : false;
    const gateways = p.gateways.filter((g) => g.id !== 'mock' || mockOn);
    // Read-only: how each gateway runs right now (live | sandbox | mock | disabled), from server env — not saved.
    return { ...p, mockGatewayEnabled: mockOn, gateways, gatewayModes: Object.fromEntries(gateways.map((g) => [g.id, gatewayMode(g.id)])) };
  }
  return v;
}

/** Flat diff of changed keys (audit). */
export function diffKeys(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k] ?? null;
      a[k] = after[k] ?? null;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

export async function putSection(section: SettingsSection, body: Record<string, unknown>, by: string): Promise<{ before: unknown; after: unknown }> {
  const before = await getSection(section);
  if (section === 'app') {
    const cur = before as AppSettingsDto;
    const n = { ...cur, ...body } as AppSettingsDto;
    await db.query(
      `INSERT INTO ${T.app_settings} (id, min_version_ios, min_version_android, latest_version, force_update, store_url_ios, store_url_android,
         maintenance_mode, maintenance_message_en, maintenance_message_ar, maintenance_platforms, device_limit, session_timeout_minutes, updated_by)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET min_version_ios = EXCLUDED.min_version_ios, min_version_android = EXCLUDED.min_version_android,
         latest_version = EXCLUDED.latest_version, force_update = EXCLUDED.force_update, store_url_ios = EXCLUDED.store_url_ios,
         store_url_android = EXCLUDED.store_url_android, maintenance_mode = EXCLUDED.maintenance_mode,
         maintenance_message_en = EXCLUDED.maintenance_message_en, maintenance_message_ar = EXCLUDED.maintenance_message_ar,
         maintenance_platforms = EXCLUDED.maintenance_platforms, device_limit = EXCLUDED.device_limit,
         session_timeout_minutes = EXCLUDED.session_timeout_minutes, updated_by = EXCLUDED.updated_by`,
      [n.minVersionIos, n.minVersionAndroid, n.latestVersion, n.forceUpdate, n.storeUrls.ios, n.storeUrls.android, n.maintenanceMode, n.maintenanceMessage.en, n.maintenanceMessage.ar, n.maintenanceAppliesTo, n.deviceLimit, n.sessionTimeoutMinutes, by],
    );
    settingsStore.invalidate('app');
    return { before, after: await appDto() };
  }
  const patch: Record<string, unknown> = { ...body };
  if (section === 'otp') {
    const prov = (patch.provider ?? (before as { provider: string }).provider) as string;
    if (patch.fallbackProvider && patch.fallbackProvider === prov) throw new BusinessRuleError('INVALID_TRANSITION', { field: 'fallbackProvider' });
    if (!devFlags.otpBypass) delete patch.devBypassCode;
  }
  if (section === 'general' && 'logoFileKey' in patch) {
    const key = patch.logoFileKey as string | null;
    delete patch.logoFileKey;
    if (key === null) patch.logoUrl = null;
    else if (key) {
      const up = await storage.attachUpload(key, { purpose: 'logo', entityType: 'settings', entityId: '00000000-0000-0000-0000-000000000001' });
      patch.logoUrl = storage.ref(up.bucket, up.path);
    }
  } else if (section === 'general') delete patch.logoUrl;
  if (section === 'payments') invalidateLookups();
  await settingsStore.set(section as SettingsKey, patch as Partial<SettingsValue<SettingsKey>>, by);
  return { before, after: await getSection(section) };
}

// ── feature flags ─────────────────────────────────────────────────────────────────────────────────────
export interface FeatureFlagDto {
  id: string;
  key: string;
  name: Localized;
  description: Localized;
  enabled: boolean;
  environment: 'production' | 'staging' | 'beta';
  platforms: ('web' | 'ios' | 'android')[];
  rolloutPct: number;
  updatedAt: string;
  updatedBy: { id: string; name: Localized; avatarUrl: string | null } | null;
}

const FLAG_SELECT = `SELECT f.*, u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.avatar_url AS u_avatar_url
  FROM ${T.feature_flags} f LEFT JOIN ${T.users} u ON u.id = f.updated_by`;

function flagDto(r: Record<string, unknown>): FeatureFlagDto {
  return {
    id: String(r.id),
    key: String(r.key),
    name: { en: String(r.name_en), ar: String(r.name_ar) },
    description: { en: String(r.description_en), ar: String(r.description_ar) },
    enabled: Boolean(r.enabled),
    environment: r.environment as FeatureFlagDto['environment'],
    platforms: r.platforms as FeatureFlagDto['platforms'],
    rolloutPct: Number(r.rollout_percent),
    updatedAt: (r.updated_at as Date).toISOString(),
    updatedBy: adminRef(r, 'u_'),
  };
}

export const flagsService = {
  async list(f: { environment?: string; q?: string }) {
    const p: unknown[] = [];
    const w: string[] = [];
    if (f.environment) {
      p.push(f.environment);
      w.push(`f.environment = $${p.length}`);
    }
    if (f.q) {
      p.push(likeContains(f.q.toLowerCase()));
      w.push(`(lower(f.key) LIKE $${p.length} OR lower(f.name_en) LIKE $${p.length} OR f.name_ar LIKE $${p.length})`);
    }
    const rows = await db.many<Record<string, unknown>>(`${FLAG_SELECT}${w.length ? ` WHERE ${w.join(' AND ')}` : ''} ORDER BY f.name_en`, p);
    const all = await db.one<{ total: number; enabled: number; production: number; beta_staging: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE enabled)::int AS enabled,
              count(*) FILTER (WHERE environment = 'production')::int AS production,
              count(*) FILTER (WHERE environment <> 'production')::int AS beta_staging FROM ${T.feature_flags}`,
    );
    return { items: rows.map(flagDto), counts: { total: all.total, enabled: all.enabled, production: all.production, betaStaging: all.beta_staging } };
  },
  async get(id: string) {
    const r = await db.maybeOne<Record<string, unknown>>(`${FLAG_SELECT} WHERE f.id = $1`, [id]);
    if (!r) throw new NotFoundError('featureFlag');
    return flagDto(r);
  },
  async update(id: string, patch: { enabled?: boolean; platforms?: string[]; rolloutPct?: number }, by: string) {
    const before = await this.get(id);
    await db.query(
      `UPDATE ${T.feature_flags} SET enabled = COALESCE($2, enabled), platforms = COALESCE($3, platforms), rollout_percent = COALESCE($4, rollout_percent), updated_by = $5 WHERE id = $1`,
      [id, patch.enabled ?? null, patch.platforms ?? null, patch.rolloutPct ?? null, by],
    );
    settingsStore.invalidate('flags');
    return { before, after: await this.get(id) };
  },
  async create(input: { key: string; name: Localized; description: Localized; environment: string; enabled: boolean }, by: string) {
    const exists = await db.scalar<number>(`SELECT count(*)::int FROM ${T.feature_flags} WHERE key = $1`, [input.key]);
    if (exists) throw new ConflictError('ALREADY_EXISTS', { field: 'key' });
    const r = await db.one<{ id: string }>(
      `INSERT INTO ${T.feature_flags} (key, name_en, name_ar, description_en, description_ar, environment, enabled, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [input.key, input.name.en, input.name.ar, input.description.en, input.description.ar, input.environment, input.enabled, by],
    );
    settingsStore.invalidate('flags');
    return this.get(r.id);
  },
  async remove(id: string) {
    const before = await this.get(id);
    await db.query(`DELETE FROM ${T.feature_flags} WHERE id = $1`, [id]);
    settingsStore.invalidate('flags');
    return before;
  },
};
