/**
 * Throttled WhatsApp outbox on pg-boss (`eduway.whatsapp-send`). Payloads (message text, OTP code) are encrypted
 * with the session cipher before they are written to the queue table. The handler sends through the live socket
 * (serialized with a random gap, see session.ts); when this instance has no live socket, the number is not on
 * WhatsApp, the code expired or the send fails, an OTP falls back to the SMS provider and the OTP row records
 * the channel actually used.
 */
import { T } from '../../../config/constants.js';
import { db } from '../../../config/db.js';
import { logger } from '../../../config/logger.js';
import { enqueue, jobsRunning } from '../../../jobs/index.js';
import { maskPhone } from '../../utils/phone.js';
import type { SessionCipher } from './cipher.js';
import type { WhatsAppSessionManager } from './session.js';

export const WHATSAPP_SEND_JOB = 'eduway.whatsapp-send';
const AAD = 'whatsapp-outbox';

export interface WhatsAppOutboxItem {
  to: string;
  /** Pre-resolved WhatsApp JID from the onWhatsApp check (optional). */
  jid?: string | null;
  text: string;
  /** OTP only: SMS fallback text + code, and the OTP row to update. */
  fallback?: { text: string; devCode?: string };
  otpId?: string;
  /** ISO time after which the message is pointless (OTP expiry). */
  expiresAt?: string;
}

/** What is stored in pg-boss (all content encrypted). */
export interface WhatsAppJobData {
  v: 1;
  payload: string;
}

export interface SendOutcome {
  channel: 'whatsapp' | 'sms' | 'dropped';
  provider: string;
  providerMessageId: string | null;
}

export interface SmsFallback {
  name: string;
  send(msg: { to: string; text: string; channel: 'sms'; devCode?: string }): Promise<{ providerMessageId: string }>;
}

export function sealJob(cipher: SessionCipher, item: WhatsAppOutboxItem): WhatsAppJobData {
  return { v: 1, payload: cipher.encrypt(JSON.stringify(item), AAD) };
}

export function openJob(cipher: SessionCipher, data: WhatsAppJobData): WhatsAppOutboxItem {
  return JSON.parse(cipher.decrypt(data.payload, AAD)) as WhatsAppOutboxItem;
}

export async function recordOtpChannel(otpId: string, channel: 'sms' | 'whatsapp', provider: string): Promise<void> {
  await db.query(`UPDATE ${T.otp_codes} SET channel = $2, provider = $3 WHERE id = $1`, [otpId, channel, provider]).catch((err: Error) => logger.warn({ err: err.message }, 'whatsapp: OTP channel not recorded'));
}

/** Deliver one outbox item (job handler body; also run inline when the queue is not running). */
export async function deliver(item: WhatsAppOutboxItem, session: WhatsAppSessionManager, smsFallback: () => SmsFallback): Promise<SendOutcome> {
  if (item.expiresAt && Date.parse(item.expiresAt) <= Date.now()) {
    logger.warn({ to: maskPhone(item.to) }, 'whatsapp: queued message expired before it could be sent — dropped');
    return { channel: 'dropped', provider: 'baileys', providerMessageId: null };
  }
  let failure = 'not_connected';
  if (session.isLive()) {
    try {
      let jid = item.jid ?? null;
      if (!jid) {
        const check = await session.checkNumber(item.to);
        if (check && !check.exists) failure = 'not_on_whatsapp';
        else jid = check?.jid ?? null;
      }
      if (failure !== 'not_on_whatsapp') {
        const id = await session.sendText(item.to, item.text, jid);
        if (item.otpId) await recordOtpChannel(item.otpId, 'whatsapp', 'baileys');
        return { channel: 'whatsapp', provider: 'baileys', providerMessageId: id };
      }
    } catch (err) {
      failure = 'send_failed';
      logger.warn({ err: (err as Error).message, to: maskPhone(item.to) }, 'whatsapp: send failed');
    }
  }
  if (!item.fallback) throw new Error(`whatsapp: message not delivered (${failure})`);
  const sms = smsFallback();
  logger.info({ to: maskPhone(item.to), reason: failure, provider: sms.name }, 'whatsapp: OTP falling back to SMS');
  const res = await sms.send({ to: item.to, text: item.fallback.text, channel: 'sms', devCode: item.fallback.devCode });
  if (item.otpId) await recordOtpChannel(item.otpId, 'sms', sms.name);
  return { channel: 'sms', provider: sms.name, providerMessageId: res.providerMessageId };
}

/**
 * Queue a message. With pg-boss running → `{ jobId }`; otherwise (dev without jobs) it is delivered inline and the
 * real outcome is returned so the caller reports the channel actually used.
 */
export async function queueWhatsApp(
  item: WhatsAppOutboxItem,
  cipher: SessionCipher,
  session: WhatsAppSessionManager,
  smsFallback: () => SmsFallback,
): Promise<{ jobId: string | null; outcome: SendOutcome | null }> {
  if (!jobsRunning()) return { jobId: null, outcome: await deliver(item, session, smsFallback) };
  const ttl = item.expiresAt ? Math.max(30, Math.ceil((Date.parse(item.expiresAt) - Date.now()) / 1000)) : 3600;
  const jobId = await enqueue(WHATSAPP_SEND_JOB, sealJob(cipher, item), { retryLimit: 0, expireInSeconds: Math.min(ttl, 3600) });
  return { jobId, outcome: null };
}
