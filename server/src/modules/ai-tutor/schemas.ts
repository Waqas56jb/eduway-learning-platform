/** zod request + response schemas for the AI tutor (API_CONTRACT §12 student, §28 admin). */
import { fileKey, idOrSlug, isoDate, localized, localizedInput, studentPlatform, uuid } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { paginationQuery } from '../../common/utils/pagination.js';

const lang = z.enum(['en', 'ar']);
const severity = z.enum(['low', 'medium', 'high']);
const flagReason = z.enum(['off_topic', 'abuse', 'cheating', 'prompt_injection', 'self_harm']);
const flagStatus = z.enum(['open', 'reviewed', 'dismissed']);
const csvOrArray = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v), z.array(item));

// ── shared DTOs (documentation) ──
const studentRef = z.object({ id: uuid, name: localized, mobile: z.string(), avatarUrl: z.string().nullable() });
const adminRef = z.object({ id: uuid, name: localized, avatarUrl: z.string().nullable() });
const subjectRef = z.object({ id: uuid, slug: z.string(), name: localized, color: z.string() });

export const aiAllowanceDto = z
  .object({
    enabled: z.boolean(),
    disabledReason: z.enum(['GLOBAL', 'USER', 'NOT_INCLUDED']).nullable(),
    used: z.number().int(),
    quota: z.number().int(),
    remaining: z.number().int(),
    cycle: z.enum(['calendar', 'billing']),
    resetsAt: z.string(),
  })
  .openapi('AiAllowance');

export const tutorMessageDto = z
  .object({
    id: uuid,
    conversationId: uuid,
    role: z.enum(['student', 'tutor']),
    kind: z.enum(['message', 'welcome']),
    text: z.string(),
    content: localized,
    imageUrl: z.string().nullable(),
    status: z.enum(['pending', 'streaming', 'complete', 'failed', 'blocked']),
    rating: z.enum(['up', 'down']).nullable(),
    date: z.string(),
    at: z.string(),
  })
  .openapi('TutorMessage');

export const conversationSummaryDto = z
  .object({
    id: uuid,
    subjectId: uuid,
    subjectSlug: z.string(),
    title: z.string(),
    lastMessagePreview: z.string(),
    messageCount: z.number().int(),
    updatedAt: z.string(),
    createdAt: z.string(),
  })
  .openapi('ConversationSummary');

export const conversationDto = conversationSummaryDto.extend({ messages: z.array(tutorMessageDto) }).openapi('ConversationDto');

export const sendMessageResponse = z.object({ studentMessage: tutorMessageDto, tutorMessage: tutorMessageDto, allowance: aiAllowanceDto, pollAfterMs: z.number().int() });

export const aiSettingsDto = z
  .object({
    enabled: z.boolean(),
    disabledReason: z.string().nullable(),
    monthlyAllowance: z.number().int(),
    resetCycle: z.enum(['calendar', 'billing']),
    provider: z.enum(['openai', 'anthropic', 'azure']),
    model: z.string(),
    activeProvider: z.string(),
    temperature: z.number(),
    maxTokens: z.number().int(),
    retrieval: z.object({ transcripts: z.boolean(), explanations: z.boolean(), lessonNotes: z.boolean() }),
    vectorRetrieval: z.boolean(),
    safetyRules: z.string(),
    disabledUserIds: z.array(uuid),
    disabledUsers: z.array(studentRef),
    rateLimitPerMinute: z.number().int(),
    rateLimitPerHour: z.number().int(),
    blockedKeywords: z.array(z.string()),
    suggestedPrompts: z.record(z.array(localized)),
    updatedAt: z.string(),
    updatedBy: adminRef.nullable(),
  })
  .openapi('AiSettingsDto');

export const aiFlagDto = z
  .object({
    id: uuid,
    student: studentRef,
    subject: subjectRef.nullable(),
    conversationId: uuid.nullable(),
    messageId: uuid.nullable(),
    excerpt: z.string(),
    reason: flagReason,
    severity,
    status: flagStatus,
    source: z.enum(['auto', 'keyword', 'rate_limit', 'manual']),
    reviewedBy: adminRef.nullable(),
    reviewedAt: z.string().nullable(),
    note: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('AiFlagDto');

export const aiFlagDetailDto = aiFlagDto.extend({
  transcript: z.array(z.object({ role: z.enum(['student', 'tutor']), text: z.string(), at: z.string(), flagged: z.boolean() })),
});

export const flaggedUserDto = z
  .object({
    student: studentRef,
    flags: z.number().int(),
    open: z.number().int(),
    highest: severity,
    last: z.string(),
    aiDisabled: z.boolean(),
    locked: z.boolean(),
    warned: z.boolean(),
    warnedAt: z.string().nullable(),
  })
  .openapi('FlaggedUserDto');

const kpi = z.object({ value: z.number(), prev: z.number().nullable(), deltaPct: z.number().nullable(), spark: z.array(z.number()) });
export const aiUsageDto = z.object({
  kpis: z.object({ questions: kpi, peakActiveUsers: kpi, avgPerUser: kpi, costUsd: kpi, costIqd: z.number(), tokens: kpi }),
  daily: z.array(z.object({ date: z.string(), questions: z.number(), users: z.number(), tokens: z.number(), costUsd: z.number() })),
  bySubject: z.array(z.object({ subjectId: uuid, slug: z.string(), name: localized, value: z.number(), color: z.string() })),
  topUsers: z.array(z.object({ student: studentRef, used: z.number(), allowance: z.number(), lastActive: z.string().nullable() })),
  openFlags: z.array(aiFlagDto),
  enabled: z.boolean(),
  monthlyAllowance: z.number(),
  iqdPerUsd: z.number(),
});

export const aiModelsDto = z.record(z.array(z.object({ value: z.string(), label: z.string() })));

// ── student requests ──
export const conversationsQuery = z.object({
  subjectId: idOrSlug.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const suggestionsQuery = z.object({ subjectId: idOrSlug.optional() });
export const createConversationBody = z.object({ subjectId: idOrSlug, title: z.string().trim().max(120).optional() });
export const conversationQuery = z.object({ before: isoDate.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });
export const patchConversationBody = z
  .object({ subjectId: idOrSlug.optional(), title: z.string().trim().min(1).max(120).optional() })
  .refine((b) => b.subjectId !== undefined || b.title !== undefined, { message: 'Nothing to update' });
export const sendMessageBody = z.object({
  text: z.string().max(1200).default(''),
  attachmentFileKey: fileKey.optional(),
  lang: lang.default('ar'),
  clientMessageId: z.string().trim().max(100).optional(),
});
export const feedbackBody = z.object({ rating: z.enum(['up', 'down']).nullable(), comment: z.string().trim().max(1000).optional() });
export const messageIdParam = z.object({ messageId: uuid });

// ── admin requests ──
export const usageQuery = z.object({ from: isoDate.optional(), to: isoDate.optional(), platform: studentPlatform.optional() });

export const patchSettingsBody = z
  .object({
    monthlyAllowance: z.number().int().min(0).max(1000),
    resetCycle: z.enum(['calendar', 'billing']),
    provider: z.enum(['openai', 'anthropic', 'azure']),
    model: z.string().trim().min(1).max(100),
    temperature: z.number().min(0).max(1),
    maxTokens: z.number().int().min(64).max(8192),
    retrieval: z.object({ transcripts: z.boolean(), explanations: z.boolean(), lessonNotes: z.boolean() }).partial(),
    safetyRules: z.string().max(10_000),
    disabledUserIds: z.array(uuid).max(5000),
    rateLimitPerMinute: z.number().int().min(1).max(1000),
    rateLimitPerHour: z.number().int().min(1).max(100_000),
    blockedKeywords: z.array(z.string().trim().min(1).max(100)).max(500),
    suggestedPrompts: z.record(z.string().min(1).max(60), z.array(localizedInput).max(10)),
  })
  .partial()
  .strict();
export type PatchSettingsBody = z.infer<typeof patchSettingsBody>;

export const disableUserBody = z.object({ reason: z.string().trim().max(500).optional() }).default({});
export const studentIdParam = z.object({ studentId: uuid });

export const flagsQuery = paginationQuery.extend({
  status: csvOrArray(flagStatus).optional(),
  severity: csvOrArray(severity).optional(),
  reason: csvOrArray(flagReason).optional(),
  studentId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type FlagsQuery = z.infer<typeof flagsQuery>;

export const patchFlagBody = z.object({ status: flagStatus, note: z.string().trim().max(1000).optional() });
export const flaggedUsersQuery = paginationQuery.extend({ pageSize: z.coerce.number().int().min(1).max(100).default(5) });
export type FlaggedUsersQuery = z.infer<typeof flaggedUsersQuery>;
export const warnBody = z.object({ message: localizedInput.optional() }).default({});
