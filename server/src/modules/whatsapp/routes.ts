import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { whatsappController as c } from './controller.js';
import { disconnectBody, testSendBody, whatsappConnectDto, whatsappQrDto, whatsappStatusDto, whatsappTestSendDto } from './schemas.js';

export const router = Router();
const tags = ['Admin · WhatsApp'];
const A = 'admin' as const;

defineRoute(router, { method: 'get', path: '/admin/whatsapp/status', tags, summary: 'Linked WhatsApp number status + OTP message preview (ADM-WA-01)', auth: A, permission: 'settings.view', response: whatsappStatusDto }, () => c.status());
defineRoute(router, { method: 'post', path: '/admin/whatsapp/connect', tags, summary: 'Start linking: returns the status and the QR code to scan (ADM-WA-02)', auth: A, permission: 'settings.edit', response: whatsappConnectDto }, ({ req }) => c.connect(req));
defineRoute(router, { method: 'get', path: '/admin/whatsapp/qr', tags, summary: 'Current QR code as a PNG data URL — poll every 2–3 s while qr_pending (ADM-WA-03)', auth: A, permission: 'settings.edit', response: whatsappQrDto }, () => c.qr());
defineRoute(router, { method: 'post', path: '/admin/whatsapp/disconnect', tags, summary: 'Disconnect; logout=true (default) also unlinks the device and wipes the session (ADM-WA-04)', auth: A, permission: 'settings.edit', body: disconnectBody, response: whatsappStatusDto }, ({ req, body }) => c.disconnect(req, body.logout));
defineRoute(router, { method: 'post', path: '/admin/whatsapp/test-send', tags, summary: 'Send a test WhatsApp message through the linked number (ADM-WA-05)', auth: A, permission: 'settings.edit', body: testSendBody, response: whatsappTestSendDto }, ({ req, body }) => c.testSend(req, body));
