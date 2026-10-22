/**
 * Admin Settings → WhatsApp: link a WhatsApp number by QR (Baileys session), watch its status, unlink it, send a
 * test message and preview the OTP text students receive.
 */
import { env } from '../../config/env.js';
import { AppError, BusinessRuleError, ConflictError } from '../../common/errors/index.js';
import { buildWhatsAppOtpText } from '../../common/providers/otp-message.js';
import { smsSelection } from '../../common/providers/sms.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { whatsappSession, WhatsAppError, type SessionSnapshot } from '../../common/services/whatsapp/index.js';

export type WhatsAppStatusDto = Omit<SessionSnapshot, 'jid' | 'desired'> & {
  provider: { selected: boolean; configured: boolean; active: string; smsFallback: string };
  otpPreview: { en: string; ar: string; expirySeconds: number; codeLength: number };
};

const SAMPLE_CODE = '482913';

/** Session errors → API errors (localized via details.reason). */
function mapError(err: unknown): never {
  if (err instanceof WhatsAppError) {
    if (err.reason === 'WHATSAPP_OTHER_INSTANCE') throw new ConflictError(err.reason);
    if (err.reason === 'WHATSAPP_SEND_FAILED') throw new AppError('INTERNAL', 502, { reason: err.reason });
    throw new BusinessRuleError(err.reason);
  }
  throw err;
}

async function decorate(s: SessionSnapshot): Promise<WhatsAppStatusDto> {
  const otp = await settingsStore.get('otp');
  const sel = smsSelection();
  const code = SAMPLE_CODE.padEnd(otp.codeLength, '0').slice(0, otp.codeLength);
  const { jid: _jid, desired: _desired, ...rest } = s;
  return {
    ...rest,
    provider: { selected: env.WHATSAPP_PROVIDER === 'baileys', configured: whatsappSession.configured, active: sel.whatsapp.active, smsFallback: sel.sms.active },
    otpPreview: { en: buildWhatsAppOtpText(code, otp.expirySeconds, 'en'), ar: buildWhatsAppOtpText(code, otp.expirySeconds, 'ar'), expirySeconds: otp.expirySeconds, codeLength: otp.codeLength },
  };
}

const TEST_TEXT = 'EDUWAY: رسالة تجريبية — واتساب متصل ويعمل.\nEDUWAY: test message — WhatsApp is connected and working.';

export const whatsappService = {
  async status(): Promise<WhatsAppStatusDto> {
    return decorate(await whatsappSession.snapshot());
  },

  async connect(): Promise<WhatsAppStatusDto & { qr: string | null }> {
    try {
      const snap = await whatsappSession.connect();
      const qr = snap.qrAvailable ? (await whatsappSession.qrDataUrl()).qr : null;
      return { ...(await decorate(snap)), qr };
    } catch (err) {
      return mapError(err);
    }
  },

  qr() {
    return whatsappSession.qrDataUrl();
  },

  async disconnect(logout: boolean): Promise<WhatsAppStatusDto> {
    try {
      return await decorate(await whatsappSession.disconnect({ logout }));
    } catch (err) {
      return mapError(err);
    }
  },

  async testSend(phone: string, text?: string): Promise<{ messageId: string; to: string; channel: 'whatsapp' }> {
    try {
      if (!whatsappSession.configured) throw new WhatsAppError('WHATSAPP_NOT_CONFIGURED');
      if (!whatsappSession.isLive()) throw new WhatsAppError((await whatsappSession.remoteConnected()) ? 'WHATSAPP_OTHER_INSTANCE' : 'WHATSAPP_NOT_CONNECTED');
      const check = await whatsappSession.checkNumber(phone);
      if (check && !check.exists) throw new WhatsAppError('WHATSAPP_NOT_ON_WHATSAPP');
      const messageId = await whatsappSession.sendText(phone, text ?? TEST_TEXT, check?.jid ?? null);
      return { messageId, to: phone, channel: 'whatsapp' };
    } catch (err) {
      return mapError(err);
    }
  },
};
