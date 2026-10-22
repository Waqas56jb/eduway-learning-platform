/**
 * Delivery channel providers. Push: Expo push API (axios) or a mock in development. SMS/WhatsApp: the shared
 * `SmsProvider` abstraction (MockSmsProvider in dev). Email: nodemailer (`mailer`, logs in dev). In-app needs no
 * provider (the inbox row is the delivery).
 */
import axios from 'axios';
import { env, isProd } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { mailer } from '../../common/providers/mail.js';
import { smsProvider } from '../../common/providers/sms.js';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}
export interface PushTicket {
  ok: boolean;
  id?: string;
  error?: string;
  /** Token is permanently invalid (DeviceNotRegistered) → revoke it. */
  invalidToken?: boolean;
}

export interface PushProvider {
  readonly name: string;
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  /** Expo push receipts: ticket id → final status. */
  receipts?(ids: string[]): Promise<Record<string, { ok: boolean; error?: string; invalidToken?: boolean }>>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';

  private headers() {
    return { 'Content-Type': 'application/json', Accept: 'application/json', ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}) };
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const out: PushTicket[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const res = await axios.post<{ data: { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } }[] }>(
          EXPO_PUSH_URL,
          chunk.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data ?? {}, sound: 'default', priority: 'high', channelId: 'default' })),
          { headers: this.headers(), timeout: 15_000 },
        );
        for (const t of res.data.data) {
          out.push(t.status === 'ok' ? { ok: true, id: t.id } : { ok: false, error: t.details?.error ?? t.message ?? 'error', invalidToken: t.details?.error === 'DeviceNotRegistered' });
        }
      } catch (err) {
        const msg = (err as Error).message;
        for (let k = 0; k < chunk.length; k++) out.push({ ok: false, error: `expo: ${msg}` });
      }
    }
    return out;
  }

  async receipts(ids: string[]) {
    const out: Record<string, { ok: boolean; error?: string; invalidToken?: boolean }> = {};
    for (let i = 0; i < ids.length; i += 300) {
      const res = await axios.post<{ data: Record<string, { status: 'ok' | 'error'; message?: string; details?: { error?: string } }> }>(
        EXPO_RECEIPTS_URL,
        { ids: ids.slice(i, i + 300) },
        { headers: this.headers(), timeout: 15_000 },
      );
      for (const [id, r] of Object.entries(res.data.data ?? {})) {
        out[id] = r.status === 'ok' ? { ok: true } : { ok: false, error: r.details?.error ?? r.message ?? 'error', invalidToken: r.details?.error === 'DeviceNotRegistered' };
      }
    }
    return out;
  }
}

/** Development push: logs and accepts every well-formed Expo token (ids `mock_<n>`, receipts always ok). */
export class MockPushProvider implements PushProvider {
  readonly name = 'mock-push';
  readonly outbox: PushMessage[] = [];
  private n = 0;

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    return messages.map((m) => {
      this.outbox.push(m);
      if (this.outbox.length > 200) this.outbox.shift();
      if (!/^Expo(nent)?PushToken\[.+\]$/.test(m.to)) return { ok: false, error: 'DeviceNotRegistered', invalidToken: true };
      logger.info({ to: m.to.slice(0, 28), title: m.title }, '[MockPush] push notification');
      return { ok: true, id: `mock_${Date.now()}_${++this.n}` };
    });
  }

  async receipts(ids: string[]) {
    return Object.fromEntries(ids.map((id) => [id, { ok: true }]));
  }
}

const mockPush = new MockPushProvider();
export function pushProvider(): PushProvider {
  const mode = env.PUSH_PROVIDER === 'auto' ? (isProd ? 'expo' : 'mock') : env.PUSH_PROVIDER;
  return mode === 'expo' && env.NODE_ENV !== 'test' ? new ExpoPushProvider() : mockPush;
}

export async function sendSms(to: string, text: string, channel: 'sms' | 'whatsapp'): Promise<{ provider: string; id: string }> {
  const p = smsProvider();
  const r = await p.send({ to, text, channel });
  return { provider: channel === 'whatsapp' ? `${p.name}-whatsapp` : p.name, id: r.providerMessageId };
}

export async function sendEmail(to: string, subject: string, text: string): Promise<{ provider: string }> {
  await mailer.send({ to, subject, text });
  return { provider: env.SMTP_URL ? 'smtp' : 'mock-email' };
}

/** Provider name per channel (delivery rows, provider health cards). */
export function providerNameFor(channel: string): string {
  if (channel === 'push') return pushProvider().name;
  if (channel === 'in_app') return 'in-app';
  if (channel === 'email') return env.SMTP_URL ? 'smtp' : 'mock-email';
  const sms = smsProvider().name;
  return channel === 'whatsapp' ? `${sms}-whatsapp` : sms;
}
