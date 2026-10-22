/** zod schemas for notifications (API_CONTRACT §13 student, §30 admin, §15 WHK-03). */
import { paginationQuery } from '../../common/utils/pagination.js';
import { boolQuery, isoDate, localized, uuid } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

const channel = z.enum(['push', 'in_app', 'sms', 'whatsapp', 'email']);
const type = z.enum(['otp', 'payment_confirmation', 'subscription_expiry', 'new_lesson', 'unfinished_lesson', 'exam_reminder', 'progress_reminder', 'support_message']);
const platform = z.enum(['web', 'ios', 'android']);
const multi = <T extends z.ZodTypeAny>(item: T) => z.preprocess((v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v), z.array(item));
const loc = (min = 0) => z.object({ en: z.string().trim().min(min).max(5000), ar: z.string().trim().min(min).max(5000) });

// ── student ──
export const inboxQuery = z.object({
  filter: z.enum(['all', 'unread', 'lesson', 'exam', 'payment', 'subscription', 'system']).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const appNotificationDto = z
  .object({
    id: uuid,
    type: z.enum(['lesson', 'exam', 'payment', 'subscription', 'system']),
    title: localized,
    body: localized,
    date: z.string(),
    read: z.boolean(),
    link: z.string().nullable(),
    target: z.object({ kind: z.string(), id: z.string().nullable() }),
  })
  .openapi('AppNotification');

// ── templates ──
const adminRef = z.object({ id: uuid, name: localized, avatarUrl: z.string().nullable() });
const studentRef = z.object({ id: z.string(), name: localized, mobile: z.string(), avatarUrl: z.string().nullable() });
export const templateDto = z
  .object({
    id: uuid,
    name: z.string(),
    type: z.string(),
    channel,
    subject: localized,
    body: localized,
    variables: z.array(z.string()),
    active: z.boolean(),
    updatedAt: z.string(),
    updatedBy: adminRef.nullable(),
  })
  .openapi('NotificationTemplateDto');

export const templatesQuery = paginationQuery.extend({ type: multi(z.string()).optional(), channel: multi(channel).optional(), active: boolQuery.optional() });
const templateBase = z.object({ name: z.string().trim().min(3).max(120), type, channel, active: z.boolean().default(true), subject: loc(), body: loc(5) });
const needsSubject = (b: { channel?: string; subject?: { en: string; ar: string } }) => !(b.channel === 'email' || b.channel === 'push') || !!(b.subject?.en && b.subject?.ar);
export const createTemplateBody = templateBase.refine(needsSubject, { message: 'subject is required for email and push', path: ['subject'] });
export const patchTemplateBody = templateBase.partial().refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });
export const templatesBulkBody = z.object({ ids: z.array(uuid).min(1).max(500), action: z.enum(['activate', 'deactivate', 'delete']) });
export const templatePreviewBody = z.object({ channel, subject: loc(), body: loc(), lang: z.enum(['en', 'ar']) });
export const variablesDto = z.array(z.object({ key: z.string(), sample: localized, description: localized, types: z.array(type).nullable() }));

// ── campaigns ──
export const campaignFilters = z
  .object({
    packageId: z.string().max(64).nullable().optional(),
    subjectId: uuid.nullable().optional(),
    governorateId: z.string().max(64).nullable().optional(),
    schoolId: z.string().max(64).nullable().optional(),
    inactiveDays: z.number().int().min(1).max(3650).nullable().optional(),
    platforms: z.array(platform).max(3).nullable().optional(),
    subscriptionStatus: z.enum(['active', 'expired', 'trial', 'none', 'cancelled']).nullable().optional(),
  })
  .openapi('CampaignFilters');
export const campaignDto = z
  .object({
    id: uuid,
    name: z.string(),
    channel,
    templateId: uuid.nullable(),
    template: z.object({ id: uuid, name: z.string() }).nullable(),
    filters: campaignFilters,
    audienceCount: z.number().int(),
    status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed']),
    scheduledAt: z.string().nullable(),
    sentAt: z.string().nullable(),
    stats: z.object({ queued: z.number(), sent: z.number(), delivered: z.number(), failed: z.number() }),
    createdBy: adminRef,
    createdAt: z.string(),
  })
  .openapi('CampaignDto');
export const campaignsQuery = paginationQuery.extend({ status: multi(z.string()).optional(), channel: multi(channel).optional(), pageSize: z.coerce.number().int().min(1).max(100).default(5) });
export const audiencePreviewBody = z.object({ filters: campaignFilters.default({}), channel, templateId: uuid.optional() });
export const audiencePreviewDto = z.object({
  matched: z.number(),
  reachable: z.number(),
  total: z.number(),
  excluded: z.object({ noEmail: z.number(), noPushToken: z.number(), optedOut: z.number(), locked: z.number() }),
});
export const createCampaignBody = z.object({
  name: z.string().trim().min(3).max(160),
  channel,
  templateId: uuid,
  filters: campaignFilters.default({}),
  sendAt: isoDate.nullable().default(null),
  draft: z.boolean().optional(),
});

// ── deliveries ──
export const deliveryDto = z
  .object({
    id: uuid,
    campaignId: uuid.nullable(),
    template: z.object({ id: uuid, name: z.string() }).nullable(),
    recipient: studentRef,
    channel,
    provider: z.string(),
    status: z.enum(['queued', 'sent', 'delivered', 'failed']),
    error: z.string().nullable(),
    attempts: z.number().int(),
    platform: platform.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('DeliveryDto');
export const deliveriesQuery = paginationQuery.extend({
  channel: multi(channel).optional(),
  status: multi(z.enum(['queued', 'sent', 'delivered', 'failed'])).optional(),
  provider: multi(z.string()).optional(),
  campaignId: uuid.optional(),
  templateId: uuid.optional(),
  studentId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export const deliveryStatsDto = z.object({
  total: z.number(),
  delivered: z.number(),
  failed: z.number(),
  queued: z.number(),
  rate: z.number(),
  byProvider: z.array(z.object({ provider: z.string(), channel, total: z.number(), delivered: z.number(), failed: z.number(), rate: z.number() })),
});
export const retryBody = z.object({ ids: z.array(uuid).max(5000).optional(), filter: z.record(z.unknown()).optional() }).refine((b) => !!b.ids?.length || !!b.filter, { message: 'ids or filter required' });
export const bulkResultDto = z.object({ succeeded: z.array(z.string()), failed: z.array(z.object({ id: z.string(), code: z.string(), reason: z.string().optional(), message: z.string() })) }).openapi('BulkResult');

// ── webhook ──
const receiptEvent = z.object({
  messageId: z.string().max(200).optional(),
  providerMessageId: z.string().max(200).optional(),
  deliveryId: uuid.optional(),
  status: z.enum(['sent', 'delivered', 'failed']),
  error: z.string().max(500).optional(),
});
export const receiptBody = z.union([receiptEvent, z.array(receiptEvent).max(1000), z.object({ events: z.array(receiptEvent).max(1000) })]);
export const providerParam = z.object({ provider: z.string().regex(/^[a-z0-9_-]{2,40}$/) });
