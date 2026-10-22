/**
 * Delivery channel providers. Push: Expo (expo-server-sdk) or a mock in development. SMS/WhatsApp: the shared
 * `SmsProvider` abstraction (MockSmsProvider in dev). Email: nodemailer (`mailer`, logs in dev). In-app needs no
 * provider (the inbox row is the delivery).
 */
import { Expo, type ExpoPushMessage, type ExpoPushReceipt, type ExpoPushTicket } from 'expo-server-sdk';
import { env, type Env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { emailProviderName } from '../../common/providers/mail.js';
import { SmsSendError, smsProvider } from '../../common/providers/sms.js';
import { sendEmailPayload, type EmailPayload } from './email/send.js';

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

/** The part of the Expo SDK client we use (injectable for tests). */
export interface ExpoClientLike {
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
  chunkPushNotificationReceiptIds(ids: string[]): string[][];
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  getPushNotificationReceiptsAsync(ids: string[]): Promise<Record<string, ExpoPushReceipt>>;
}

const isDeviceNotRegistered = (r: { status: string; details?: { error?: string } }) => r.status === 'error' && r.details?.error === 'DeviceNotRegistered';

/**
 * Real Expo push via expo-server-sdk: messages are chunked (100 per request), tickets mapped back to their
 * message, invalid tokens (`DeviceNotRegistered` / malformed tokens) are flagged so the dispatcher revokes them,
 * and receipts are fetched in chunks of 300 by the `eduway.expo-push-receipts` job.
 */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  private readonly client: ExpoClientLike;

  constructor(client?: ExpoClientLike, accessToken = env.EXPO_ACCESS_TOKEN) {
    this.client = client ?? new Expo(accessToken ? { accessToken } : {});
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const out: PushTicket[] = new Array<PushTicket>(messages.length);
    const valid: { idx: number; msg: ExpoPushMessage }[] = [];
    messages.forEach((m, idx) => {
      if (!Expo.isExpoPushToken(m.to)) out[idx] = { ok: false, error: 'DeviceNotRegistered', invalidToken: true };
      else valid.push({ idx, msg: { to: m.to, title: m.title, body: m.body, data: m.data ?? {}, sound: 'default', priority: 'high', channelId: 'default' } });
    });
    // Chunk ourselves over the index list so each ticket maps back to its source message.
    const chunks = this.client.chunkPushNotifications(valid.map((v) => v.msg));
    let cursor = 0;
    for (const chunk of chunks) {
      const slice = valid.slice(cursor, cursor + chunk.length);
      cursor += chunk.length;
      try {
        const tickets = await this.client.sendPushNotificationsAsync(chunk);
        slice.forEach((v, k) => {
          const t = tickets[k];
          if (!t) out[v.idx] = { ok: false, error: 'no ticket' };
          else if (t.status === 'ok') out[v.idx] = { ok: true, id: t.id };
          else out[v.idx] = { ok: false, error: t.details?.error ?? t.message ?? 'error', invalidToken: isDeviceNotRegistered(t) };
        });
      } catch (err) {
        for (const v of slice) out[v.idx] = { ok: false, error: `expo: ${(err as Error).message}` };
      }
    }
    return out;
  }

  async receipts(ids: string[]) {
    const out: Record<string, { ok: boolean; error?: string; invalidToken?: boolean }> = {};
    for (const chunk of this.client.chunkPushNotificationReceiptIds(ids)) {
      try {
        const res = await this.client.getPushNotificationReceiptsAsync(chunk);
        for (const [id, r] of Object.entries(res)) {
          out[id] = r.status === 'ok' ? { ok: true } : { ok: false, error: r.details?.error ?? r.message ?? 'error', invalidToken: isDeviceNotRegistered(r) };
        }
      } catch (err) {
        // Receipts not fetched stay `sent`; the next run (within a day) retries them.
        logger.warn({ err: (err as Error).message, count: chunk.length }, 'expo receipts fetch failed');
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

/** Pure push selection: `auto` = Expo in production, mock elsewhere; NODE_ENV=test is always mock. */
export function selectPushProvider(e: Pick<Env, 'PUSH_PROVIDER' | 'NODE_ENV'>): 'expo' | 'mock' {
  const mode = e.PUSH_PROVIDER === 'auto' ? (e.NODE_ENV === 'production' ? 'expo' : 'mock') : e.PUSH_PROVIDER;
  return mode === 'expo' && e.NODE_ENV !== 'test' ? 'expo' : 'mock';
}

let expoPush: ExpoPushProvider | null = null;
export function pushProvider(): PushProvider {
  return selectPushProvider(env) === 'expo' ? (expoPush ??= new ExpoPushProvider()) : mockPush;
}

export async function sendSms(to: string, text: string, channel: 'sms' | 'whatsapp'): Promise<{ provider: string; id: string }> {
  const p = smsProvider();
  try {
    const r = await p.send({ to, text, channel });
    return { provider: smsChannelName(channel), id: r.providerMessageId };
  } catch (err) {
    // Non-retryable provider errors (invalid number, template rejected) fail the delivery without retries.
    throw Object.assign(err as Error, { permanent: err instanceof SmsSendError ? err.permanent : false });
  }
}

function smsChannelName(channel: 'sms' | 'whatsapp'): string {
  const name = smsProvider().nameFor(channel);
  return channel === 'whatsapp' && !name.startsWith('whatsapp') ? `${name}-whatsapp` : name;
}

/**
 * Email delivery: transactional template rows (`payload.template`) and plain notification/campaign rows are both
 * rendered into the branded bilingual HTML layout (+ plain-text part, attachments) — see ./email/.
 * SMTP 5xx / invalid-recipient errors are permanent (no retry); connection errors and 4xx are retried.
 */
export async function sendEmail(to: string, payload: EmailPayload): Promise<{ provider: string; id?: string | null }> {
  try {
    const r = await sendEmailPayload(to, payload);
    return { provider: emailProviderName(), id: r.messageId };
  } catch (err) {
    const e = err as Error & { responseCode?: number; code?: string; permanent?: boolean };
    const permanent = e.permanent === true || e.code === 'EENVELOPE' || (typeof e.responseCode === 'number' && e.responseCode >= 500 && e.code !== 'EAUTH');
    throw Object.assign(e, { permanent });
  }
}

/** Provider name per channel (delivery rows, provider health cards). */
export function providerNameFor(channel: string): string {
  if (channel === 'push') return pushProvider().name;
  if (channel === 'in_app') return 'in-app';
  if (channel === 'email') return emailProviderName();
  return smsChannelName(channel === 'whatsapp' ? 'whatsapp' : 'sms');
}
