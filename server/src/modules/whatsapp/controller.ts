import type { Request } from 'express';
import { maskPhone } from '../../common/utils/phone.js';
import { whatsappService as s } from './service.js';

/** Audit entries carry the status only — never the QR code. */
export const whatsappController = {
  status: () => s.status(),
  qr: () => s.qr(),
  async connect(req: Request) {
    const out = await s.connect();
    req.audit = { action: 'whatsapp.connect', entity: 'whatsapp_session', entityId: 'default', summary: `Started WhatsApp linking (status: ${out.status})`, before: null, after: { status: out.status } };
    return out;
  },
  async disconnect(req: Request, logout: boolean) {
    const before = await s.status();
    const out = await s.disconnect(logout);
    req.audit = {
      action: logout ? 'whatsapp.logout' : 'whatsapp.disconnect',
      entity: 'whatsapp_session',
      entityId: 'default',
      summary: logout ? `Unlinked WhatsApp ${before.phone ? maskPhone(before.phone) : ''}`.trim() : 'Stopped the WhatsApp session',
      before: { status: before.status, phone: before.phone ? maskPhone(before.phone) : null },
      after: { status: out.status },
    };
    return out;
  },
  async testSend(req: Request, body: { phone: string; text?: string }) {
    const out = await s.testSend(body.phone, body.text);
    req.audit = { action: 'whatsapp.test_send', entity: 'whatsapp_session', entityId: 'default', summary: `Sent a WhatsApp test message to ${maskPhone(body.phone)}`, before: null, after: { to: maskPhone(body.phone), custom: !!body.text } };
    return { ...out, to: maskPhone(out.to) };
  },
};
