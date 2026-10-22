import { normalizeIraqiPhone } from '../../common/utils/phone.js';
import { z } from '../../common/validation/zod.js';

/** Any international number (E.164 after normalization); Iraqi local formats (07…) are accepted too. */
export const anyPhone = z
  .string()
  .trim()
  .max(40)
  .transform((v, ctx) => {
    const iraqi = normalizeIraqiPhone(v);
    if (iraqi) return iraqi;
    const digits = v.replace(/[\s\-().]/g, '').replace(/^00/, '+');
    const e164 = digits.startsWith('+') ? digits : `+${digits}`;
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PHONE_INVALID' });
      return z.NEVER;
    }
    return e164;
  })
  .openapi({ example: '+9647701234567', description: 'International number, normalized to E.164' });

export const disconnectBody = z.object({ logout: z.boolean().default(true) }).default({});

export const testSendBody = z.object({
  phone: anyPhone,
  /** Custom text; omitted → a short bilingual test message. */
  text: z.string().trim().min(1).max(1000).optional(),
});

const status = z.enum(['disconnected', 'qr_pending', 'connecting', 'connected']);

export const whatsappStatusDto = z
  .object({
    status,
    since: z.string(),
    phone: z.string().nullable(),
    displayName: z.string().nullable(),
    connectedAt: z.string().nullable(),
    lastError: z.string().nullable(),
    qrAvailable: z.boolean(),
    qrUpdatedAt: z.string().nullable(),
    owner: z.enum(['this', 'other']).nullable(),
    provider: z.object({ selected: z.boolean(), configured: z.boolean(), active: z.string(), smsFallback: z.string() }),
    otpPreview: z.object({ en: z.string(), ar: z.string(), expirySeconds: z.number(), codeLength: z.number() }),
  })
  .openapi('WhatsAppStatusDto');

export const whatsappQrDto = z.object({ status, qr: z.string().nullable(), updatedAt: z.string().nullable() }).openapi('WhatsAppQrDto');

export const whatsappConnectDto = whatsappStatusDto.extend({ qr: z.string().nullable() }).openapi('WhatsAppConnectDto');

export const whatsappTestSendDto = z.object({ messageId: z.string(), to: z.string(), channel: z.literal('whatsapp') }).openapi('WhatsAppTestSendDto');
