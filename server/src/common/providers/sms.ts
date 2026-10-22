/**
 * SMS / WhatsApp provider abstraction (OTP + notification deliveries).
 *
 *   MockSmsProvider        — dev/test: logs messages (the OTP code is printed outside production)
 *   HttpSmsProvider        — generic JSON gateway (POST { to, text, channel } with a bearer token)
 *   TwilioSmsProvider      — Twilio Programmable Messaging (SMS, and WhatsApp via the `whatsapp:` address prefix)
 *   WhatsAppCloudProvider  — Meta WhatsApp Cloud API (approved authentication template for OTPs)
 *   BaileysWhatsAppProvider — WhatsApp Web session of a number linked by QR in the admin portal (unofficial client;
 *                            `whatsapp` channel only, OTPs fall back to the SMS provider — see docs/PROVIDERS.md)
 *
 * Selection: SMS_PROVIDER handles the `sms` channel, WHATSAPP_PROVIDER (default SMS_PROVIDER) the `whatsapp`
 * channel. A provider whose credentials are missing falls back to the mock (with a warning at startup) so the
 * server always boots. NODE_ENV=test always uses the mock.
 */
import axios, { type AxiosInstance } from 'axios';
import { env, isProd, type Env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { maskPhone } from '../utils/phone.js';
import type { BaileysPort } from '../services/whatsapp/index.js';
import { buildWhatsAppOtpText, type OtpLocale } from './otp-message.js';

export interface SmsMessage {
  to: string; // E.164
  text: string;
  channel: 'sms' | 'whatsapp';
  /** The OTP code when the message is an OTP. Used as the template parameter by WhatsApp templates; logged only by the mock outside production. */
  devCode?: string;
  /** OTP only: recipient language and code validity (Baileys builds its own bilingual text from them). */
  locale?: OtpLocale;
  ttlSeconds?: number;
  /** OTP only: the otp_codes row, so a later fallback can record the channel actually used. */
  otpId?: string;
}

export interface SmsSendResult {
  providerMessageId: string;
  /** Channel actually used when it differs from the requested one (e.g. WhatsApp → SMS fallback). */
  channel?: 'sms' | 'whatsapp';
  /** Provider actually used (when a fallback happened). */
  provider?: string;
}

export interface SmsProvider {
  readonly name: string;
  send(msg: SmsMessage): Promise<SmsSendResult>;
  /** Optional: true when OTPs without an explicit channel should go through this (WhatsApp) provider. */
  prefersOtp?(): Promise<boolean>;
}

export type SmsProviderId = 'mock' | 'http' | 'twilio' | 'whatsapp_cloud';
export type WhatsAppProviderId = SmsProviderId | 'baileys';

/** Raised for non-retryable provider errors (bad number, template rejected…) so deliveries are not retried. */
export class SmsSendError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SmsSendError';
  }
}

function httpError(provider: string, err: unknown): SmsSendError {
  const ax = err as { response?: { status?: number; data?: unknown }; message?: string };
  const status = ax.response?.status;
  const data = ax.response?.data as { message?: string; code?: number | string; error?: { message?: string; code?: number } } | undefined;
  const detail = data?.error?.message ?? data?.message ?? ax.message ?? 'request failed';
  // 4xx (except 408/429) are permanent: invalid number, unapproved template, auth problems.
  const permanent = !!status && status >= 400 && status < 500 && status !== 408 && status !== 429;
  return new SmsSendError(`${provider}: ${detail}${data?.code ? ` (code ${String(data.code)})` : ''}`, permanent, status);
}

const e164 = (to: string) => (to.startsWith('+') ? to : `+${to.replace(/^00/, '')}`);

export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  readonly outbox: SmsMessage[] = [];

  async send(msg: SmsMessage): Promise<{ providerMessageId: string }> {
    this.outbox.push(msg);
    if (this.outbox.length > 100) this.outbox.shift();
    if (isProd) logger.warn({ to: maskPhone(msg.to) }, 'MockSmsProvider used in production — message NOT delivered');
    // Dev convenience: the OTP is printed so testers can sign in without a real SMS gateway.
    else logger.info({ to: msg.to, channel: msg.channel, code: msg.devCode }, `[MockSms] ${msg.text}`);
    return { providerMessageId: `mock_${Date.now()}` };
  }

  /** Test helper: last code sent to a phone. */
  lastCodeFor(phone: string): string | undefined {
    return [...this.outbox].reverse().find((m) => m.to === phone)?.devCode;
  }
}

/** Generic HTTP gateway: POST { to, text, channel } with a bearer token. */
export class HttpSmsProvider implements SmsProvider {
  readonly name = 'http';
  constructor(
    private readonly cfg: { url?: string; token?: string } = { url: env.SMS_HTTP_URL, token: env.SMS_HTTP_TOKEN },
    private readonly http: AxiosInstance = axios,
  ) {}
  async send(msg: SmsMessage): Promise<{ providerMessageId: string }> {
    if (!this.cfg.url) throw new SmsSendError('SMS_HTTP_URL not configured', true);
    try {
      const res = await this.http.post<{ id?: string }>(
        this.cfg.url,
        { to: msg.to, text: msg.text, channel: msg.channel },
        { headers: { Authorization: `Bearer ${this.cfg.token ?? ''}` }, timeout: 10_000 },
      );
      return { providerMessageId: res.data?.id ?? `http_${Date.now()}` };
    } catch (err) {
      throw httpError('http-sms', err);
    }
  }
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from?: string;
  messagingServiceSid?: string;
  whatsappFrom?: string;
  whatsappContentSid?: string;
}

/**
 * Twilio Programmable Messaging — POST /2010-04-01/Accounts/{sid}/Messages.json (form-encoded, Basic auth).
 * WhatsApp: To/From prefixed with `whatsapp:`. Business-initiated WhatsApp messages (OTPs) must use an approved
 * template: set TWILIO_WHATSAPP_CONTENT_SID (ContentSid + ContentVariables {"1": code}).
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';
  constructor(
    private readonly cfg: TwilioConfig,
    private readonly http: AxiosInstance = axios,
    private readonly baseUrl = 'https://api.twilio.com',
  ) {}

  static fromEnv(e: Env): TwilioSmsProvider | null {
    if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN) return null;
    return new TwilioSmsProvider({
      accountSid: e.TWILIO_ACCOUNT_SID,
      authToken: e.TWILIO_AUTH_TOKEN,
      from: e.TWILIO_FROM,
      messagingServiceSid: e.TWILIO_MESSAGING_SERVICE_SID,
      whatsappFrom: e.TWILIO_WHATSAPP_FROM,
      whatsappContentSid: e.TWILIO_WHATSAPP_CONTENT_SID,
    });
  }

  /** Form body for a message (exported for tests). */
  buildForm(msg: SmsMessage): URLSearchParams {
    const form = new URLSearchParams();
    if (msg.channel === 'whatsapp') {
      if (!this.cfg.whatsappFrom) throw new SmsSendError('twilio: TWILIO_WHATSAPP_FROM not configured', true);
      form.set('To', `whatsapp:${e164(msg.to)}`);
      form.set('From', `whatsapp:${e164(this.cfg.whatsappFrom.replace(/^whatsapp:/, ''))}`);
      if (this.cfg.whatsappContentSid && msg.devCode) {
        form.set('ContentSid', this.cfg.whatsappContentSid);
        form.set('ContentVariables', JSON.stringify({ 1: msg.devCode }));
      } else form.set('Body', msg.text);
      return form;
    }
    form.set('To', e164(msg.to));
    if (this.cfg.messagingServiceSid) form.set('MessagingServiceSid', this.cfg.messagingServiceSid);
    else if (this.cfg.from) form.set('From', this.cfg.from);
    else throw new SmsSendError('twilio: TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID not configured', true);
    form.set('Body', msg.text);
    return form;
  }

  async send(msg: SmsMessage): Promise<{ providerMessageId: string }> {
    const form = this.buildForm(msg);
    try {
      const res = await this.http.post<{ sid: string }>(`${this.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.cfg.accountSid)}/Messages.json`, form.toString(), {
        auth: { username: this.cfg.accountSid, password: this.cfg.authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15_000,
      });
      return { providerMessageId: res.data.sid };
    } catch (err) {
      throw httpError('twilio', err);
    }
  }
}

export interface WhatsAppCloudConfig {
  token: string;
  phoneNumberId: string;
  apiVersion: string;
  otpTemplate?: string;
  templateLang: string;
  otpButton: boolean;
  notifyTemplate?: string;
}

/**
 * Meta WhatsApp Cloud API — POST https://graph.facebook.com/{version}/{phone-number-id}/messages (Bearer token).
 * OTPs use the approved AUTHENTICATION template (body {{1}} = code; copy-code button parameter = code).
 * Other messages use WHATSAPP_CLOUD_NOTIFY_TEMPLATE (body {{1}} = text) when set, else a plain text message
 * (Meta only delivers free text inside a 24h customer-service window).
 */
export class WhatsAppCloudProvider implements SmsProvider {
  readonly name = 'whatsapp_cloud';
  constructor(
    private readonly cfg: WhatsAppCloudConfig,
    private readonly http: AxiosInstance = axios,
    private readonly baseUrl = 'https://graph.facebook.com',
  ) {}

  static fromEnv(e: Env): WhatsAppCloudProvider | null {
    if (!e.WHATSAPP_CLOUD_TOKEN || !e.WHATSAPP_CLOUD_PHONE_NUMBER_ID) return null;
    return new WhatsAppCloudProvider({
      token: e.WHATSAPP_CLOUD_TOKEN,
      phoneNumberId: e.WHATSAPP_CLOUD_PHONE_NUMBER_ID,
      apiVersion: e.WHATSAPP_CLOUD_API_VERSION,
      otpTemplate: e.WHATSAPP_CLOUD_OTP_TEMPLATE,
      templateLang: e.WHATSAPP_CLOUD_TEMPLATE_LANG,
      otpButton: e.WHATSAPP_CLOUD_OTP_BUTTON,
      notifyTemplate: e.WHATSAPP_CLOUD_NOTIFY_TEMPLATE,
    });
  }

  /** Graph API payload for a message (exported for tests). */
  buildPayload(msg: SmsMessage): Record<string, unknown> {
    const to = e164(msg.to).slice(1); // Graph API expects digits without "+"
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
    if (msg.devCode) {
      if (!this.cfg.otpTemplate) throw new SmsSendError('whatsapp_cloud: WHATSAPP_CLOUD_OTP_TEMPLATE not configured', true);
      const components: Record<string, unknown>[] = [{ type: 'body', parameters: [{ type: 'text', text: msg.devCode }] }];
      if (this.cfg.otpButton) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: msg.devCode }] });
      return { ...base, type: 'template', template: { name: this.cfg.otpTemplate, language: { code: this.cfg.templateLang }, components } };
    }
    if (this.cfg.notifyTemplate) {
      return {
        ...base,
        type: 'template',
        template: { name: this.cfg.notifyTemplate, language: { code: this.cfg.templateLang }, components: [{ type: 'body', parameters: [{ type: 'text', text: msg.text.slice(0, 1000) }] }] },
      };
    }
    return { ...base, type: 'text', text: { preview_url: false, body: msg.text } };
  }

  async send(msg: SmsMessage): Promise<{ providerMessageId: string }> {
    const payload = this.buildPayload(msg);
    try {
      const res = await this.http.post<{ messages?: { id: string }[] }>(`${this.baseUrl}/${this.cfg.apiVersion}/${encodeURIComponent(this.cfg.phoneNumberId)}/messages`, payload, {
        headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
        timeout: 15_000,
      });
      return { providerMessageId: res.data.messages?.[0]?.id ?? `wa_${Date.now()}` };
    } catch (err) {
      throw httpError('whatsapp_cloud', err);
    }
  }
}

/**
 * Linked WhatsApp number (Baileys). Pre-checks: session connected (this or another instance) and — when the socket
 * is local — that the number is on WhatsApp. Then the message is queued (pg-boss, throttled). OTPs use the
 * bilingual text from otp-message.ts and fall back to the SMS provider when WhatsApp cannot deliver; other
 * messages (campaigns) fail permanently instead of silently switching to paid SMS.
 */
export class BaileysWhatsAppProvider implements SmsProvider {
  readonly name = 'baileys';
  private port: BaileysPort | null = null;
  constructor(
    private readonly fallback: SmsProvider,
    private readonly loadPort: () => Promise<BaileysPort> = async () => (await import('../services/whatsapp/index.js')).baileysPort,
  ) {}

  private async getPort(): Promise<BaileysPort> {
    return (this.port ??= await this.loadPort());
  }

  async prefersOtp(): Promise<boolean> {
    try {
      return await (await this.getPort()).remoteConnected();
    } catch {
      return false;
    }
  }

  private async viaFallback(msg: SmsMessage, reason: string): Promise<SmsSendResult> {
    if (!msg.devCode) throw new SmsSendError(`baileys: ${reason}`, true);
    logger.info({ to: maskPhone(msg.to), reason, provider: this.fallback.name }, 'whatsapp (baileys): OTP sent by SMS instead');
    const res = await this.fallback.send({ ...msg, channel: 'sms' });
    return { providerMessageId: res.providerMessageId, channel: 'sms', provider: this.fallback.name };
  }

  async send(msg: SmsMessage): Promise<SmsSendResult> {
    const port = await this.getPort();
    if (!port.configured() || !(await port.remoteConnected().catch(() => false))) return this.viaFallback(msg, 'not_connected');
    let jid: string | null = null;
    if (port.isLive()) {
      const check = await port.checkNumber(msg.to).catch(() => null);
      if (check && !check.exists) return this.viaFallback(msg, 'not_on_whatsapp');
      jid = check?.jid ?? null;
    }
    const ttl = msg.ttlSeconds ?? 300;
    const isOtp = !!msg.devCode;
    const text = isOtp ? buildWhatsAppOtpText(msg.devCode as string, ttl, msg.locale ?? 'ar') : msg.text;
    const fallback = this.fallback;
    const { jobId, outcome } = await port.queue(
      {
        to: msg.to,
        jid,
        text,
        ...(isOtp ? { fallback: { text: msg.text, devCode: msg.devCode }, otpId: msg.otpId, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() } : {}),
      },
      () => ({ name: fallback.name, send: (m) => fallback.send(m) }),
    );
    if (outcome) {
      if (outcome.channel === 'dropped') throw new SmsSendError('baileys: message expired before sending', true);
      return { providerMessageId: outcome.providerMessageId ?? `baileys_${Date.now()}`, channel: outcome.channel, provider: outcome.provider };
    }
    return { providerMessageId: `baileys_job_${jobId ?? Date.now()}`, channel: 'whatsapp', provider: 'baileys' };
  }
}

/** Routes each message to the SMS or WhatsApp provider by channel. `name` is the SMS-side provider. */
export class ChannelRouterSmsProvider implements SmsProvider {
  constructor(
    readonly sms: SmsProvider,
    readonly whatsapp: SmsProvider,
  ) {}
  get name(): string {
    return this.sms.name;
  }
  nameFor(channel: 'sms' | 'whatsapp'): string {
    return channel === 'whatsapp' ? this.whatsapp.name : this.sms.name;
  }
  send(msg: SmsMessage): Promise<SmsSendResult> {
    return (msg.channel === 'whatsapp' ? this.whatsapp : this.sms).send(msg);
  }
  /** Channel for an OTP request that did not name one: WhatsApp when the WhatsApp provider asks for it (linked number connected), else SMS. */
  async otpDefaultChannel(): Promise<'sms' | 'whatsapp'> {
    return (await this.whatsapp.prefersOtp?.()) ? 'whatsapp' : 'sms';
  }
}

export const mockSms = new MockSmsProvider();

/** Build one provider by id from an env object; null when its credentials are missing. */
export function buildSmsProvider(id: SmsProviderId, e: Env): SmsProvider | null {
  switch (id) {
    case 'mock':
      return mockSms;
    case 'http':
      return e.SMS_HTTP_URL ? new HttpSmsProvider({ url: e.SMS_HTTP_URL, token: e.SMS_HTTP_TOKEN }) : null;
    case 'twilio':
      return TwilioSmsProvider.fromEnv(e);
    case 'whatsapp_cloud':
      return WhatsAppCloudProvider.fromEnv(e);
  }
}

export interface SmsSelection {
  provider: ChannelRouterSmsProvider;
  sms: { requested: SmsProviderId; active: string };
  whatsapp: { requested: WhatsAppProviderId; active: string };
}

/** Pure selection (unit-tested): requested provider → real adapter, or the mock when credentials are missing. */
export function selectSmsProviders(e: Env): SmsSelection {
  const smsId = e.SMS_PROVIDER;
  const waId = e.WHATSAPP_PROVIDER ?? e.SMS_PROVIDER;
  const test = e.NODE_ENV === 'test';
  const sms = test ? mockSms : (buildSmsProvider(smsId, e) ?? mockSms);
  const wa = test ? mockSms : waId === 'baileys' ? (e.WHATSAPP_SESSION_SECRET ? new BaileysWhatsAppProvider(sms) : mockSms) : (buildSmsProvider(waId, e) ?? mockSms);
  return { provider: new ChannelRouterSmsProvider(sms, wa), sms: { requested: smsId, active: sms.name }, whatsapp: { requested: waId, active: wa.name } };
}

let selected: SmsSelection | null = null;
export function smsSelection(): SmsSelection {
  return (selected ??= selectSmsProviders(env));
}

export function smsProvider(): ChannelRouterSmsProvider {
  return smsSelection().provider;
}
