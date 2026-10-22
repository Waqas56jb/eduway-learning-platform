/* Linked WhatsApp number (Baileys) — Settings → WhatsApp (contract §31a, ADM-WA-01..05). */
import { api } from './client';
import { qk } from './keys';
import { useApiMutation, useApiQuery } from './hooks';

export type WhatsAppStatus = 'disconnected' | 'qr_pending' | 'connecting' | 'connected';

export interface WhatsAppStatusDto {
  status: WhatsAppStatus;
  since: string;
  phone: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastError: string | null;
  qrAvailable: boolean;
  qrUpdatedAt: string | null;
  owner: 'this' | 'other' | null;
  provider: { selected: boolean; configured: boolean; active: string; smsFallback: string };
  otpPreview: { en: string; ar: string; expirySeconds: number; codeLength: number };
}
export interface WhatsAppQrDto {
  status: WhatsAppStatus;
  /** PNG data URL, or null when no QR is pending. */
  qr: string | null;
  updatedAt: string | null;
}

export const whatsappApi = {
  status: () => api.get<WhatsAppStatusDto>('/admin/whatsapp/status'),
  qr: () => api.get<WhatsAppQrDto>('/admin/whatsapp/qr'),
  connect: () => api.post<WhatsAppStatusDto & { qr: string | null }>('/admin/whatsapp/connect', {}, { timeout: 45_000 }),
  disconnect: (logout = true) => api.post<WhatsAppStatusDto>('/admin/whatsapp/disconnect', { logout }),
  testSend: (body: { phone: string; text?: string }) => api.post<{ messageId: string; to: string; channel: 'whatsapp' }>('/admin/whatsapp/test-send', body, { timeout: 45_000 }),
};

const PENDING: WhatsAppStatus[] = ['qr_pending', 'connecting'];

/** Status, polled every 3 s while linking is in progress, every 30 s otherwise. */
export function useWhatsAppStatus() {
  return useApiQuery(qk.whatsapp.sub('status'), whatsappApi.status, {
    refetchInterval: (q) => (q.state.data && PENDING.includes(q.state.data.status) ? 3000 : 30_000),
  });
}

/** Current QR (WhatsApp rotates it every ~20 s) — polled every 2.5 s while a QR is pending. */
export function useWhatsAppQr(enabled: boolean) {
  return useApiQuery(qk.whatsapp.sub('qr'), whatsappApi.qr, { enabled, refetchInterval: enabled ? 2500 : false });
}

export function useWhatsAppConnect() {
  return useApiMutation(() => whatsappApi.connect(), { invalidate: [qk.whatsapp.all] });
}

export function useWhatsAppDisconnect() {
  return useApiMutation((logout: boolean) => whatsappApi.disconnect(logout), { invalidate: [qk.whatsapp.all], success: 'whatsapp.toast.disconnected' });
}

export function useWhatsAppTestSend() {
  return useApiMutation((b: { phone: string; text?: string }) => whatsappApi.testSend(b), { success: 'whatsapp.toast.testSent' });
}
