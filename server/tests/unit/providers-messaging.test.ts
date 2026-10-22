/** SMS / WhatsApp, email and push adapters — mocked HTTP / injected clients, no network. */
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it } from 'vitest';
import { env, type Env } from '../../src/config/env.js';
import { mailer, selectEmailProvider, setMailTransport, smtpOptions } from '../../src/common/providers/mail.js';
import { mockSms, selectSmsProviders, SmsSendError, TwilioSmsProvider, WhatsAppCloudProvider, type TwilioConfig, type WhatsAppCloudConfig } from '../../src/common/providers/sms.js';
import { describeProviders } from '../../src/common/providers/status.js';
import { ExpoPushProvider, selectPushProvider, type ExpoClientLike } from '../../src/modules/notifications/channels.js';
import { fakeHttp } from './helpers/fake-http.js';

const dev = (over: Partial<Env>): Env => ({ ...env, NODE_ENV: 'development', ...over }) as Env;

const TWILIO: TwilioConfig = { accountSid: 'AC123', authToken: 'tok', from: '+15005550006', whatsappFrom: '+14155238886', whatsappContentSid: 'HX111' };

describe('TwilioSmsProvider', () => {
  it('sends SMS via the Messages API with Basic auth (form-encoded)', async () => {
    const f = fakeHttp(() => ({ status: 201, data: { sid: 'SM1' } }));
    const r = await new TwilioSmsProvider(TWILIO, f.http).send({ to: '+9647701234567', text: 'code 1234', channel: 'sms' });
    expect(r.providerMessageId).toBe('SM1');
    expect(f.calls[0]?.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(f.calls[0]?.auth).toEqual({ username: 'AC123', password: 'tok' });
    expect(f.body()).toEqual({ To: '+9647701234567', From: '+15005550006', Body: 'code 1234' });
  });
  it('prefers a Messaging Service SID over From', () => {
    const form = new TwilioSmsProvider({ ...TWILIO, messagingServiceSid: 'MG1' }).buildForm({ to: '+9647701234567', text: 'x', channel: 'sms' });
    expect(form.get('MessagingServiceSid')).toBe('MG1');
    expect(form.get('From')).toBeNull();
  });
  it('WhatsApp OTPs use the approved Content template with the code as {{1}}', () => {
    const form = new TwilioSmsProvider(TWILIO).buildForm({ to: '9647701234567', text: 'code 1234', channel: 'whatsapp', devCode: '1234' });
    expect(form.get('To')).toBe('whatsapp:+9647701234567');
    expect(form.get('From')).toBe('whatsapp:+14155238886');
    expect(form.get('ContentSid')).toBe('HX111');
    expect(JSON.parse(form.get('ContentVariables') ?? '{}')).toEqual({ 1: '1234' });
    expect(form.get('Body')).toBeNull();
  });
  it('4xx errors are permanent, 5xx/429 are retryable', async () => {
    const bad = fakeHttp(() => ({ status: 400, data: { code: 21211, message: "The 'To' number is not valid" } }));
    const e1 = await new TwilioSmsProvider(TWILIO, bad.http).send({ to: '+1', text: 'x', channel: 'sms' }).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(SmsSendError);
    expect((e1 as SmsSendError).permanent).toBe(true);
    expect((e1 as SmsSendError).message).toContain('21211');
    const busy = fakeHttp(() => ({ status: 429, data: {} }));
    const e2 = (await new TwilioSmsProvider(TWILIO, busy.http).send({ to: '+1', text: 'x', channel: 'sms' }).catch((e: unknown) => e)) as SmsSendError;
    expect(e2.permanent).toBe(false);
  });
});

const WA: WhatsAppCloudConfig = { token: 'EAAG', phoneNumberId: '1098', apiVersion: 'v21.0', otpTemplate: 'eduway_otp', templateLang: 'ar', otpButton: true };

describe('WhatsAppCloudProvider', () => {
  it('sends the authentication template with body + copy-code button parameters', async () => {
    const f = fakeHttp(() => ({ data: { messages: [{ id: 'wamid.X' }] } }));
    const r = await new WhatsAppCloudProvider(WA, f.http).send({ to: '+9647701234567', text: 'code 4321', channel: 'whatsapp', devCode: '4321' });
    expect(r.providerMessageId).toBe('wamid.X');
    expect(f.calls[0]?.url).toBe('https://graph.facebook.com/v21.0/1098/messages');
    expect(f.calls[0]?.headers?.Authorization).toBe('Bearer EAAG');
    expect(f.body()).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '9647701234567',
      type: 'template',
      template: {
        name: 'eduway_otp',
        language: { code: 'ar' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '4321' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '4321' }] },
        ],
      },
    });
  });
  it('non-OTP messages use the notify template, else plain text', () => {
    const p1 = new WhatsAppCloudProvider({ ...WA, notifyTemplate: 'eduway_note' }).buildPayload({ to: '+964770', text: 'hello', channel: 'whatsapp' });
    expect((p1.template as { name: string }).name).toBe('eduway_note');
    const p2 = new WhatsAppCloudProvider(WA).buildPayload({ to: '+964770', text: 'hello', channel: 'whatsapp' });
    expect(p2).toMatchObject({ type: 'text', text: { body: 'hello' } });
  });
  it('an OTP without a configured template fails permanently', () => {
    expect(() => new WhatsAppCloudProvider({ ...WA, otpTemplate: undefined }).buildPayload({ to: '+1', text: 'x', channel: 'whatsapp', devCode: '1' })).toThrow(SmsSendError);
  });
  it('maps Graph API errors', async () => {
    const f = fakeHttp(() => ({ status: 400, data: { error: { message: 'Template name does not exist', code: 132001 } } }));
    const e = (await new WhatsAppCloudProvider(WA, f.http).send({ to: '+1', text: 'x', channel: 'whatsapp', devCode: '1' }).catch((x: unknown) => x)) as SmsSendError;
    expect(e.message).toContain('Template name does not exist');
    expect(e.permanent).toBe(true);
  });
});

describe('SMS provider selection', () => {
  it('falls back to the mock when credentials are missing', () => {
    const s = selectSmsProviders(dev({ SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: undefined }));
    expect(s.sms).toEqual({ requested: 'twilio', active: 'mock' });
  });
  it('routes sms → Twilio and whatsapp → WhatsApp Cloud when both are configured', () => {
    const s = selectSmsProviders(dev({ SMS_PROVIDER: 'twilio', WHATSAPP_PROVIDER: 'whatsapp_cloud', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', WHATSAPP_CLOUD_TOKEN: 'w', WHATSAPP_CLOUD_PHONE_NUMBER_ID: '1' }));
    expect(s.sms.active).toBe('twilio');
    expect(s.whatsapp.active).toBe('whatsapp_cloud');
    expect(s.provider.nameFor('whatsapp')).toBe('whatsapp_cloud');
  });
  it('NODE_ENV=test always uses the mock', () => {
    const s = selectSmsProviders({ ...env, SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' } as Env);
    expect(s.provider.sms).toBe(mockSms);
  });
});

describe('email (SMTP via nodemailer)', () => {
  afterEach(() => setMailTransport(null));
  it('builds SMTP options from SMTP_URL or host/port/user/pass', () => {
    expect(smtpOptions(dev({ SMTP_URL: 'smtps://u:p@smtp.example.com:465' }))).toBe('smtps://u:p@smtp.example.com:465');
    expect(smtpOptions(dev({ SMTP_URL: undefined, SMTP_HOST: 'smtp.example.com', SMTP_PORT: 465, SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_SECURE: undefined }))).toEqual({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'u', pass: 'p' },
    });
    expect(smtpOptions(dev({ SMTP_URL: undefined, SMTP_HOST: 'smtp.example.com', SMTP_PORT: undefined }))).toMatchObject({ port: 587, secure: false });
  });
  it('selects smtp only when configured; mock otherwise', () => {
    expect(selectEmailProvider(dev({ EMAIL_PROVIDER: undefined, SMTP_URL: undefined, SMTP_HOST: undefined })).active).toBe('mock-email');
    expect(selectEmailProvider(dev({ EMAIL_PROVIDER: undefined, SMTP_HOST: 'smtp.example.com' })).active).toBe('smtp');
    expect(selectEmailProvider(dev({ EMAIL_PROVIDER: 'mock', SMTP_HOST: 'smtp.example.com' })).active).toBe('mock-email');
    expect(selectEmailProvider(dev({ EMAIL_PROVIDER: 'smtp', SMTP_URL: undefined, SMTP_HOST: undefined })).active).toBe('mock-email');
  });
  it('sends through the transport with MAIL_FROM', async () => {
    const t = nodemailer.createTransport({ streamTransport: true, buffer: true });
    setMailTransport(t);
    const r = await mailer.sendOrThrow({ to: 'a@example.com', subject: 'Hi', text: 'Body' });
    expect(r.messageId).toBeTruthy();
  });
});

describe('ExpoPushProvider (expo-server-sdk)', () => {
  const token = (n: number) => `ExponentPushToken[tok${n}]`;
  function fakeExpo(sendImpl: (msgs: { to: unknown }[]) => unknown[]): ExpoClientLike & { sent: number[] } {
    const sent: number[] = [];
    return {
      sent,
      chunkPushNotifications: (m) => {
        const out = [];
        for (let i = 0; i < m.length; i += 2) out.push(m.slice(i, i + 2));
        return out;
      },
      chunkPushNotificationReceiptIds: (ids) => [ids],
      sendPushNotificationsAsync: async (m) => {
        sent.push(m.length);
        return sendImpl(m) as never;
      },
      getPushNotificationReceiptsAsync: async () => ({ r1: { status: 'ok' }, r2: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } }),
    };
  }
  it('chunks, maps tickets back to messages and flags invalid tokens', async () => {
    const client = fakeExpo((m) => m.map((x) => (x.to === token(3) ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: `id_${String(x.to)}` })));
    const p = new ExpoPushProvider(client);
    const tickets = await p.send([1, 2, 3].map((n) => ({ to: token(n), title: 't', body: 'b' })).concat([{ to: 'not-a-token', title: 't', body: 'b' }]));
    expect(client.sent).toEqual([2, 1]);
    expect(tickets[0]).toEqual({ ok: true, id: `id_${token(1)}` });
    expect(tickets[2]).toMatchObject({ ok: false, invalidToken: true });
    expect(tickets[3]).toMatchObject({ ok: false, invalidToken: true });
  });
  it('a failed chunk marks only its messages as retryable failures', async () => {
    let n = 0;
    const client = fakeExpo((m) => {
      if (n++ === 0) throw new Error('503');
      return m.map(() => ({ status: 'ok', id: 'x' }));
    });
    const tickets = await new ExpoPushProvider(client).send([1, 2, 3].map((i) => ({ to: token(i), title: 't', body: 'b' })));
    expect(tickets.map((t) => t.ok)).toEqual([false, false, true]);
    expect(tickets[0]?.invalidToken).toBeUndefined();
  });
  it('receipts → delivered / failed with DeviceNotRegistered cleanup flag', async () => {
    const r = await new ExpoPushProvider(fakeExpo(() => [])).receipts(['r1', 'r2']);
    expect(r).toEqual({ r1: { ok: true }, r2: { ok: false, error: 'DeviceNotRegistered', invalidToken: true } });
  });
  it('selection: auto = expo only in production; test is always mock', () => {
    expect(selectPushProvider({ PUSH_PROVIDER: 'auto', NODE_ENV: 'production' })).toBe('expo');
    expect(selectPushProvider({ PUSH_PROVIDER: 'auto', NODE_ENV: 'development' })).toBe('mock');
    expect(selectPushProvider({ PUSH_PROVIDER: 'expo', NODE_ENV: 'test' })).toBe('mock');
  });
});

describe('startup provider status', () => {
  it('reports active providers and names (not values) of missing variables', () => {
    const rows = describeProviders(dev({ SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: 'secret-value', ZAINCASH_MERCHANT_ID: 'm' }));
    const sms = rows.find((r) => r.provider === 'sms');
    expect(sms).toMatchObject({ requested: 'twilio', active: 'mock' });
    expect(sms?.missing).toContain('TWILIO_ACCOUNT_SID');
    expect(JSON.stringify(rows)).not.toContain('secret-value');
    expect(rows.find((r) => r.provider === 'payments.zaincash')?.active).toBe('mock-confirm');
  });
});
