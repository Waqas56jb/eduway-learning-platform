/* Admin notifications (contract §30): templates ADM-NTT-01..10, campaigns ADM-CMP-01..06, deliveries ADM-DLV-01..04.
 * DTOs (Localized) are mapped to the existing flat UI types (`subject_en`, `body_ar`, …). */
import type { Campaign, DeliveryLogEntry, NotifChannel, NotificationTemplate, NotifType } from '@/types';
import { api, idempotency, type Query } from './client';
import { flatRef } from './adapters';
import type { AdminRef, BulkResult, ID, ISODate, Lang, Localized, OkDto, Paged, Platform, StudentRef } from './types';

export const NOTIF_TYPES: NotifType[] = [
  'otp',
  'payment_confirmation',
  'subscription_expiry',
  'new_lesson',
  'unfinished_lesson',
  'exam_reminder',
  'progress_reminder',
  'support_message',
];
export const NOTIF_CHANNELS: NotifChannel[] = ['push', 'in_app', 'sms', 'whatsapp', 'email'];
export const PLATFORMS: Platform[] = ['web', 'ios', 'android'];

// ─── DTOs ────────────────────────────────────────────────────────────────────
export type SubscriptionStatus = 'active' | 'expired' | 'trial' | 'none' | 'cancelled';

export interface NotificationTemplateDto {
  id: ID;
  name: string;
  type: NotifType;
  channel: NotifChannel;
  subject: Localized;
  body: Localized;
  variables: string[];
  active: boolean;
  updatedAt: ISODate;
  updatedBy: AdminRef | null;
}
export type TemplateMatrix = Record<NotifType, Record<NotifChannel, { count: number; active: boolean }>>;

export interface TemplateWrite {
  name: string;
  type: NotifType;
  channel: NotifChannel;
  active: boolean;
  subject: Localized;
  body: Localized;
}

export interface TemplateVariableDto {
  key: string;
  sample: Localized;
  description: Localized;
  types: NotifType[] | null;
}

export interface CampaignFilters {
  packageId?: ID | null;
  subjectId?: ID | null;
  governorateId?: string | null;
  schoolId?: ID | null;
  inactiveDays?: number | null;
  platforms?: Platform[] | null;
  subscriptionStatus?: SubscriptionStatus | null;
}
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';
export interface CampaignDto {
  id: ID;
  name: string;
  channel: NotifChannel;
  templateId: ID | null;
  template: { id: ID; name: string } | null;
  filters: CampaignFilters;
  audienceCount: number;
  status: CampaignStatus;
  scheduledAt: ISODate | null;
  sentAt: ISODate | null;
  stats: { queued: number; sent: number; delivered: number; failed: number };
  createdBy: AdminRef;
  createdAt: ISODate;
}
export interface AudiencePreviewDto {
  matched: number;
  reachable: number;
  total: number;
  excluded: { noEmail: number; noPushToken: number; optedOut: number; locked: number };
}

export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed';
export interface DeliveryDto {
  id: ID;
  campaignId: ID | null;
  template: { id: ID; name: string } | null;
  recipient: StudentRef;
  channel: NotifChannel;
  provider: string;
  status: DeliveryStatus;
  error: string | null;
  attempts: number;
  platform: Platform | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}
export interface DeliveryStatsDto {
  total: number;
  delivered: number;
  failed: number;
  queued: number;
  rate: number;
  byProvider: { provider: string; channel: NotifChannel; total: number; delivered: number; failed: number; rate: number }[];
}

// ─── UI view models (existing flat types + extras) ───────────────────────────
export type TemplateVM = NotificationTemplate & { updatedBy: string | null };

export interface CampaignVM extends Omit<Campaign, 'status' | 'filters'> {
  status: CampaignStatus;
  filters: CampaignFilters;
  templateName: string | null;
  stats: CampaignDto['stats'];
  createdAt: ISODate;
}

export interface DeliveryVM extends DeliveryLogEntry {
  templateName: string | null;
  recipient: (StudentRef & { name_en: string; name_ar: string }) | null;
  platform: Platform | null;
}

export const toTemplate = (d: NotificationTemplateDto): TemplateVM => ({
  id: d.id,
  name: d.name,
  type: d.type,
  channel: d.channel,
  subject_en: d.subject?.en ?? '',
  subject_ar: d.subject?.ar ?? '',
  body_en: d.body?.en ?? '',
  body_ar: d.body?.ar ?? '',
  variables: d.variables ?? [],
  active: d.active,
  updatedAt: d.updatedAt,
  updatedBy: d.updatedBy?.name.en ?? null,
});

export const toCampaign = (d: CampaignDto): CampaignVM => ({
  id: d.id,
  name: d.name,
  channel: d.channel,
  templateId: d.templateId,
  templateName: d.template?.name ?? null,
  audienceCount: d.audienceCount,
  filters: d.filters ?? {},
  status: d.status,
  scheduledAt: d.scheduledAt,
  sentAt: d.sentAt,
  stats: d.stats ?? { queued: 0, sent: 0, delivered: 0, failed: 0 },
  createdBy: d.createdBy?.name.en ?? '—',
  createdAt: d.createdAt,
});

export const toDelivery = (d: DeliveryDto): DeliveryVM => ({
  id: d.id,
  campaignId: d.campaignId,
  templateId: d.template?.id ?? '',
  templateName: d.template?.name ?? null,
  studentId: d.recipient?.id ?? '',
  recipient: flatRef(d.recipient),
  channel: d.channel,
  provider: d.provider,
  status: d.status,
  error: d.error,
  attempts: d.attempts,
  platform: d.platform,
  createdAt: d.createdAt,
});

const listTemplates = async (params: Query) => {
  const r = await api.list<NotificationTemplateDto>('/admin/notification-templates', params);
  return { items: r.items.map(toTemplate), meta: r.meta } as Paged<TemplateVM>;
};

// ─── endpoints ───────────────────────────────────────────────────────────────
export const notificationsApi = {
  // templates
  listTemplates,
  /** Full matrix + rows (small table) — fetched unpaged for the Type×Channel coverage card. */
  templatesWithMatrix: async (params: Query = {}) => {
    const r = await api.list<NotificationTemplateDto>('/admin/notification-templates', { pageSize: 100, ...params });
    return { items: r.items.map(toTemplate), matrix: (r.meta.matrix as TemplateMatrix | undefined) ?? null, total: r.meta.total };
  },
  template: async (id: ID) => toTemplate(await api.get<NotificationTemplateDto>(`/admin/notification-templates/${id}`)),
  createTemplate: async (body: TemplateWrite) => toTemplate(await api.post<NotificationTemplateDto>('/admin/notification-templates', body)),
  updateTemplate: async (id: ID, body: Partial<TemplateWrite>) =>
    toTemplate(await api.patch<NotificationTemplateDto>(`/admin/notification-templates/${id}`, body)),
  deleteTemplate: (id: ID) => api.delete<OkDto>(`/admin/notification-templates/${id}`),
  duplicateTemplate: async (id: ID) => toTemplate(await api.post<NotificationTemplateDto>(`/admin/notification-templates/${id}/duplicate`)),
  bulkTemplates: (ids: ID[], action: 'activate' | 'deactivate' | 'delete') =>
    api.post<BulkResult>('/admin/notification-templates/bulk', { ids, action }),
  variables: () => api.get<TemplateVariableDto[]>('/admin/notification-templates/variables'),
  preview: (body: { channel: NotifChannel; subject: Localized; body: Localized; lang: Lang }) =>
    api.post<{ subject: string; body: string; sms: { chars: number; segments: number; encoding: 'GSM-7' | 'UCS-2' } | null }>(
      '/admin/notification-templates/preview',
      body,
    ),

  // campaigns
  listCampaigns: async (params: Query) => {
    const r = await api.list<CampaignDto>('/admin/campaigns', params);
    return { items: r.items.map(toCampaign), meta: r.meta } as Paged<CampaignVM>;
  },
  audiencePreview: (filters: CampaignFilters, channel: NotifChannel) =>
    api.post<AudiencePreviewDto>('/admin/campaigns/audience-preview', { filters, channel }),
  createCampaign: async (
    body: { name: string; channel: NotifChannel; templateId: ID; filters: CampaignFilters; sendAt: ISODate | null; draft?: boolean },
    key?: string,
  ) => toCampaign(await api.post<CampaignDto>('/admin/campaigns', body, idempotency(key))),
  cancelCampaign: async (id: ID) => toCampaign(await api.post<CampaignDto>(`/admin/campaigns/${id}/cancel`)),

  // deliveries
  listDeliveries: async (params: Query) => {
    const r = await api.list<DeliveryDto>('/admin/deliveries', params);
    return { items: r.items.map(toDelivery), meta: r.meta } as Paged<DeliveryVM>;
  },
  deliveryStats: (params: Query) => api.get<DeliveryStatsDto>('/admin/deliveries/stats', params),
  retry: (body: { ids?: ID[]; filter?: Query }) => api.post<BulkResult>('/admin/deliveries/retry', body),
};

/** Map a UI date-range preset ('1' | '7' | '30' days) to `from`. */
export const fromDaysAgo = (days: string) => (days ? new Date(Date.now() - Number(days) * 86_400_000).toISOString() : undefined);
