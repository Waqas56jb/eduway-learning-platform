/**
 * SMS / WhatsApp provider abstraction. `MockSmsProvider` (dev/test) logs messages instead of sending them.
 * A real provider (Korek / Twilio / WhatsApp Cloud) implements `SmsProvider` and is selected with SMS_PROVIDER.
 */
import axios from 'axios';
import { env, isProd } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { maskPhone } from '../utils/phone.js';

export interface SmsMessage {
  to: string; // E.164
  text: string;
  channel: 'sms' | 'whatsapp';
  /** For dev logging only (never logged in production). */
  devCode?: string;
}

export interface SmsProvider {
  readonly name: string;
  send(msg: SmsMessage): Promise<{ providerMessageId: string }>;
}

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

/** Generic HTTP gateway stub: POST { to, text, channel } with a bearer token. Adapt to the chosen vendor. */
export class HttpSmsProvider implements SmsProvider {
  readonly name = 'http';
  async send(msg: SmsMessage): Promise<{ providerMessageId: string }> {
    if (!env.SMS_HTTP_URL) throw new Error('SMS_HTTP_URL not configured');
    const res = await axios.post<{ id?: string }>(
      env.SMS_HTTP_URL,
      { to: msg.to, text: msg.text, channel: msg.channel },
      { headers: { Authorization: `Bearer ${env.SMS_HTTP_TOKEN ?? ''}` }, timeout: 10_000 },
    );
    return { providerMessageId: res.data?.id ?? `http_${Date.now()}` };
  }
}

export const mockSms = new MockSmsProvider();

export function smsProvider(): SmsProvider {
  return env.SMS_PROVIDER === 'http' ? new HttpSmsProvider() : mockSms;
}
