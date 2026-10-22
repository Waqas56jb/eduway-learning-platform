/**
 * Provider status at startup: one log line per provider saying which implementation is active (never secrets —
 * only provider ids and the NAMES of missing variables). Also used by tests and `describeProviders()` callers.
 */
import { env, resolveDevFlags, type Env } from '../../config/env.js';
import type { Logger } from 'pino';
import { resolveAiProvider, type ProviderName } from '../../modules/ai-tutor/providers/index.js';
import { selectPushProvider } from '../../modules/notifications/channels.js';
import { fastPayMissing } from '../../modules/payments/gateways/fastpay.js';
import { qiMissing } from '../../modules/payments/gateways/qicard.js';
import { zainCashMissing } from '../../modules/payments/gateways/zaincash.js';
import { selectEmailProvider } from './mail.js';
import { selectSmsProviders } from './sms.js';

export interface ProviderStatus {
  provider: string;
  requested: string;
  active: string;
  /** Names of env vars that are required for the requested provider but missing. */
  missing: string[];
}

const SMS_REQUIRED: Record<string, (keyof Env)[]> = {
  mock: [],
  http: ['SMS_HTTP_URL'],
  twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  whatsapp_cloud: ['WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_CLOUD_PHONE_NUMBER_ID'],
  baileys: ['WHATSAPP_SESSION_SECRET'],
};
const missingOf = (e: Env, keys: (keyof Env)[]) => keys.filter((k) => !e[k]) as string[];

export function describeProviders(e: Env = env): ProviderStatus[] {
  const sms = selectSmsProviders(e);
  const smsMissing = [...missingOf(e, SMS_REQUIRED[sms.sms.requested] ?? []), ...(sms.sms.requested === 'twilio' && !e.TWILIO_FROM && !e.TWILIO_MESSAGING_SERVICE_SID ? ['TWILIO_FROM|TWILIO_MESSAGING_SERVICE_SID'] : [])];
  const waMissing = [
    ...missingOf(e, SMS_REQUIRED[sms.whatsapp.requested] ?? []),
    ...(sms.whatsapp.requested === 'twilio' && !e.TWILIO_WHATSAPP_FROM ? ['TWILIO_WHATSAPP_FROM'] : []),
    ...(sms.whatsapp.requested === 'whatsapp_cloud' && !e.WHATSAPP_CLOUD_OTP_TEMPLATE ? ['WHATSAPP_CLOUD_OTP_TEMPLATE'] : []),
  ];
  const email = selectEmailProvider(e);
  const aiWanted = (e.AI_PROVIDER ?? 'admin-setting') as string;
  const aiKey: Record<string, (keyof Env)[]> = { anthropic: ['ANTHROPIC_API_KEY'], openai: ['OPENAI_API_KEY'], azure: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_BASE_URL'] };
  const push = selectPushProvider(e);
  const gateways: [string, string[]][] = [
    ['zaincash', zainCashMissing(e)],
    ['fastpay', fastPayMissing(e)],
    ['qicard', qiMissing(e)],
  ];
  return [
    { provider: 'sms', requested: sms.sms.requested, active: sms.sms.active, missing: smsMissing },
    { provider: 'whatsapp', requested: sms.whatsapp.requested, active: sms.whatsapp.active, missing: waMissing },
    { provider: 'email', requested: email.requested, active: email.active, missing: email.requested === 'smtp' && email.active !== 'smtp' ? ['SMTP_URL|SMTP_HOST'] : [] },
    { provider: 'push', requested: e.PUSH_PROVIDER, active: push === 'expo' ? 'expo' : 'mock-push', missing: [] },
    {
      provider: 'ai',
      requested: aiWanted,
      // With no AI_PROVIDER the admin setting decides per request; report what an Anthropic choice resolves to.
      active: e.AI_PROVIDER ? resolveAiProvider(e.AI_PROVIDER as ProviderName, e) : `admin-setting (anthropic→${resolveAiProvider('anthropic', e)}, openai→${resolveAiProvider('openai', e)})`,
      missing: e.AI_PROVIDER ? missingOf(e, aiKey[e.AI_PROVIDER] ?? []) : [],
    },
    ...gateways.map(([id, missing]) => ({ provider: `payments.${id}`, requested: id, active: missing.length ? (resolveDevFlags(e, e === env ? process.env.NODE_ENV : e.NODE_ENV).mockPayments ? 'mock-confirm' : 'disabled') : 'live', missing })),
  ];
}

export function logProviderStatus(log: Logger, e: Env = env): void {
  for (const s of describeProviders(e)) {
    const line = { provider: s.provider, requested: s.requested, active: s.active, ...(s.missing.length ? { missing: s.missing } : {}) };
    const fellBack = s.missing.length > 0 && s.requested !== 'mock' && s.requested !== 'auto' && s.requested !== 'admin-setting' && !s.provider.startsWith('payments.');
    if (fellBack) log.warn(line, `provider ${s.provider}: ${s.requested} requested but not configured — using ${s.active}`);
    else log.info(line, `provider ${s.provider}: ${s.active}`);
  }
}
