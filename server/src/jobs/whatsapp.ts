/**
 * eduway.whatsapp-send — throttled WhatsApp outbox for the linked (Baileys) number. Payloads are encrypted; the
 * handler sends through the live socket or falls back to SMS for OTPs (see common/services/whatsapp/outbox.ts).
 * No pg-boss retries: an OTP must arrive within its validity, so failures fall back to SMS immediately instead.
 */
import { smsProvider } from '../common/providers/sms.js';
import type { WhatsAppJobData } from '../common/services/whatsapp/outbox.js';
import { registerJob } from './index.js';

registerJob<WhatsAppJobData>({
  name: 'eduway.whatsapp-send',
  description: 'Send a queued WhatsApp message through the linked number (OTP falls back to SMS)',
  retryLimit: 0,
  handler: async (data) => {
    const { handleWhatsAppJob } = await import('../common/services/whatsapp/index.js');
    await handleWhatsAppJob(data, () => smsProvider().sms);
  },
});
