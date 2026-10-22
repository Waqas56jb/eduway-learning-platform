import { Router, type Request, type Response } from 'express';
import { BusinessRuleError } from '../../common/errors/index.js';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { exportRequest, sendExport, type ExportColumn, type ExportRequest } from '../../common/services/exporter.js';
import { toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import { idParam, okDto, reasonBody } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { aiAdminService, type AiFlagDto, type FlaggedUserDto } from './admin.service.js';
import { createRun, knowledgeBaseStatus, toRunDto } from './knowledge-base.js';
import * as s from './schemas.js';
import { aiTutorService } from './service.js';
import { wantsEventStream } from './sse.js';

export const router = Router();
const STU = ['AI tutor'];
const ADM = ['Admin · AI tutor'];
const A = 'admin' as const;

// ── student (AIT-01…10) ──
defineRoute(router, { method: 'get', path: '/ai-tutor/allowance', tags: STU, summary: 'AI allowance status (AIT-01)', auth: 'student', response: s.aiAllowanceDto }, ({ student }) => aiTutorService.allowance(student.userId));
defineRoute(router, { method: 'get', path: '/ai-tutor/suggestions', tags: STU, summary: 'Suggested prompts (AIT-02)', auth: 'student', query: s.suggestionsQuery, response: z.array(z.object({ en: z.string(), ar: z.string() })) }, ({ query }) => aiTutorService.suggestions(query.subjectId));
defineRoute(router, { method: 'get', path: '/ai-tutor/conversations', tags: STU, summary: 'My conversations (AIT-03)', auth: 'student', query: s.conversationsQuery, response: z.array(s.conversationSummaryDto) }, ({ student, query }) => aiTutorService.listConversations(student.userId, query));
defineRoute(router, { method: 'post', path: '/ai-tutor/conversations', tags: STU, summary: 'New conversation with welcome message (AIT-04)', auth: 'student', body: s.createConversationBody, response: s.conversationDto, status: 201 }, ({ student, body, locale }) => aiTutorService.createConversation(student, body, locale));
defineRoute(router, { method: 'get', path: '/ai-tutor/conversations/:id', tags: STU, summary: 'Conversation with messages (AIT-05)', auth: 'student', params: idParam, query: s.conversationQuery, response: s.conversationDto }, ({ student, params, query, locale }) => aiTutorService.getConversation(student.userId, params.id, query, locale));
defineRoute(router, { method: 'patch', path: '/ai-tutor/conversations/:id', tags: STU, summary: 'Rename / change subject (AIT-06)', auth: 'student', params: idParam, body: s.patchConversationBody, response: s.conversationSummaryDto }, ({ student, params, body }) => aiTutorService.patchConversation(student.userId, params.id, body));
defineRoute(router, { method: 'delete', path: '/ai-tutor/conversations/:id', tags: STU, summary: 'Delete conversation (AIT-07)', auth: 'student', params: idParam, response: okDto }, ({ student, params }) => aiTutorService.deleteConversation(student.userId, params.id));
defineRoute(
  router,
  {
    method: 'post',
    path: '/ai-tutor/conversations/:id/messages',
    tags: STU,
    summary: 'Ask the tutor — SSE stream or polling fallback (AIT-08)',
    description:
      '`Accept: text/event-stream` → SSE events `meta` {studentMessage, tutorMessageId, allowance}, `delta` {text}, `done` {message (full text), allowance}, `error` {code, reason, message, allowance}; heartbeat comment every 15 s. ' +
      'Otherwise JSON `{ studentMessage, tutorMessage (pending), allowance, pollAfterMs }` → poll AIT-09. `text` may be empty when `attachmentFileKey` is sent. ' +
      'Pre-stream errors: 402 AI_NOT_INCLUDED, 403 AI_DISABLED / AI_GLOBALLY_DISABLED, 422 AI_ALLOWANCE_EXHAUSTED / AI_BLOCKED_CONTENT, 429 AI_RATE_LIMITED.',
    auth: 'student',
    rateLimit: rateLimits.ai,
    params: idParam,
    body: s.sendMessageBody,
    response: s.sendMessageResponse,
    status: 200,
  },
  async ({ req, res, student, params, body, locale }) => {
    const sse = wantsEventStream(req.get('accept'));
    const r = await aiTutorService.sendMessage(student, params.id, body, { sse, res, locale });
    if (sse && r === undefined) return undefined;
    return r;
  },
);
defineRoute(router, { method: 'get', path: '/ai-tutor/messages/:messageId', tags: STU, summary: 'Message (partial while streaming) — polling fallback (AIT-09)', auth: 'student', params: s.messageIdParam, response: s.tutorMessageDto }, ({ student, params, locale }) => aiTutorService.getMessage(student.userId, params.messageId, locale));
defineRoute(router, { method: 'post', path: '/ai-tutor/messages/:messageId/feedback', tags: STU, summary: 'Rate a tutor answer (AIT-10)', auth: 'student', params: s.messageIdParam, body: s.feedbackBody, response: s.tutorMessageDto }, ({ student, params, body, locale }) => aiTutorService.feedback(student.userId, params.messageId, body.rating, body.comment, locale));

// ── admin (ADM-AI-01…15) ──
const FLAG_COLUMNS: ExportColumn<AiFlagDto>[] = [
  { key: 'createdAt', header: 'created_at', value: (r) => r.createdAt },
  { key: 'student', header: 'student', value: (r) => r.student.name.en },
  { key: 'mobile', header: 'mobile', value: (r) => r.student.mobile },
  { key: 'subject', header: 'subject', value: (r) => r.subject?.slug ?? '' },
  { key: 'reason', header: 'reason', value: (r) => r.reason },
  { key: 'severity', header: 'severity', value: (r) => r.severity },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'source', header: 'source', value: (r) => r.source },
  { key: 'excerpt', header: 'excerpt', value: (r) => r.excerpt },
  { key: 'reviewedBy', header: 'reviewed_by', value: (r) => r.reviewedBy?.name.en ?? '' },
  { key: 'reviewedAt', header: 'reviewed_at', value: (r) => r.reviewedAt },
  { key: 'note', header: 'note', value: (r) => r.note },
];
const FLAGGED_USER_COLUMNS: ExportColumn<FlaggedUserDto & { id: string }>[] = [
  { key: 'student', header: 'student', value: (r) => r.student.name.en },
  { key: 'mobile', header: 'mobile', value: (r) => r.student.mobile },
  { key: 'flags', header: 'flags', value: (r) => r.flags },
  { key: 'open', header: 'open', value: (r) => r.open },
  { key: 'highest', header: 'highest', value: (r) => r.highest },
  { key: 'last', header: 'last', value: (r) => r.last },
  { key: 'aiDisabled', header: 'ai_disabled', value: (r) => r.aiDisabled },
  { key: 'locked', header: 'locked', value: (r) => r.locked },
  { key: 'warnedAt', header: 'warned_at', value: (r) => r.warnedAt },
];

async function doExport<T extends { id: string }>(req: Request, res: Response, body: ExportRequest, report: string, columns: ExportColumn<T>[], rows: T[]) {
  const selected = body.ids?.length ? rows.filter((r) => body.ids?.includes(r.id)) : rows;
  if (!selected.length) throw new BusinessRuleError('NO_ROWS');
  const f = (body.filters ?? {}) as { from?: string; to?: string };
  await sendExport(req, res, { report, format: body.format, columns, selected: body.columns, rows: selected, filters: body.filters, from: f.from, to: f.to });
}

defineRoute(router, { method: 'get', path: '/admin/ai/usage', tags: ADM, summary: 'Usage dashboard + cost metrics (ADM-AI-01)', auth: A, permission: 'aitutor.view', query: s.usageQuery, response: s.aiUsageDto }, ({ query }) => aiAdminService.usage(query));
defineRoute(router, { method: 'get', path: '/admin/ai/settings', tags: ADM, summary: 'AI settings (ADM-AI-02)', auth: A, permission: 'aitutor.view', response: s.aiSettingsDto }, () => aiAdminService.settings());
defineRoute(router, { method: 'patch', path: '/admin/ai/settings', tags: ADM, summary: 'Update AI settings — takes effect immediately (ADM-AI-03)', auth: A, permission: 'aitutor.edit', body: s.patchSettingsBody, response: s.aiSettingsDto }, async ({ req, admin, body }) => {
  const before = await aiAdminService.settings();
  const r = await aiAdminService.patchSettings(body, admin);
  req.audit = { action: r.action, entity: 'ai_settings', entityId: '1', summary: `Updated AI settings: ${Object.keys(body).join(', ')}`, before: Object.fromEntries(Object.keys(body).map((k) => [k, (before as Record<string, unknown>)[k]])), after: body };
  return r.dto;
});
defineRoute(router, { method: 'post', path: '/admin/ai/settings/enable', tags: ADM, summary: 'Global kill switch — enable (ADM-AI-04)', auth: A, permission: 'aitutor.edit', response: s.aiSettingsDto }, async ({ req, admin }) => {
  const dto = await aiAdminService.setEnabled(true, null, admin);
  req.audit = { action: 'ai_settings.enable', entity: 'ai_settings', entityId: '1', summary: 'AI tutor enabled', before: { enabled: false }, after: { enabled: true } };
  return dto;
});
defineRoute(router, { method: 'post', path: '/admin/ai/settings/disable', tags: ADM, summary: 'Global kill switch — disable with reason (ADM-AI-05)', auth: A, permission: 'aitutor.edit', body: reasonBody, response: s.aiSettingsDto }, async ({ req, admin, body }) => {
  const dto = await aiAdminService.setEnabled(false, body.reason, admin);
  req.audit = { action: 'ai_settings.disable', entity: 'ai_settings', entityId: '1', summary: `AI tutor disabled: ${body.reason}`, before: { enabled: true }, after: { enabled: false, reason: body.reason } };
  return dto;
});
defineRoute(router, { method: 'put', path: '/admin/ai/disabled-users/:studentId', tags: ADM, summary: 'Disable AI for a student (ADM-AI-06)', auth: A, permission: 'aitutor.edit', params: s.studentIdParam, body: s.disableUserBody, response: s.aiSettingsDto }, async ({ req, admin, params, body }) => {
  const dto = await aiAdminService.setUserDisabled(params.studentId, true, body.reason ?? null, admin);
  req.audit = { action: 'ai_settings.user_disable', entity: 'student', entityId: params.studentId, summary: `AI tutor disabled for student${body.reason ? `: ${body.reason}` : ''}`, before: { aiDisabled: false }, after: { aiDisabled: true, reason: body.reason ?? null } };
  return dto;
});
defineRoute(router, { method: 'delete', path: '/admin/ai/disabled-users/:studentId', tags: ADM, summary: 'Re-enable AI for a student (ADM-AI-07)', auth: A, permission: 'aitutor.edit', params: s.studentIdParam, response: s.aiSettingsDto }, async ({ req, admin, params }) => {
  const dto = await aiAdminService.setUserDisabled(params.studentId, false, null, admin);
  req.audit = { action: 'ai_settings.user_enable', entity: 'student', entityId: params.studentId, summary: 'AI tutor re-enabled for student', before: { aiDisabled: true }, after: { aiDisabled: false } };
  return dto;
});
defineRoute(router, { method: 'get', path: '/admin/ai/flags', tags: ADM, summary: 'Flagged conversations (ADM-AI-08)', auth: A, permission: 'aitutor.view', query: s.flagsQuery, response: z.array(s.aiFlagDto) }, async ({ query }) => {
  const p = toPagination(query);
  const r = await aiAdminService.flags(query, p.limit, p.offset);
  return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
});
defineRoute(router, { method: 'post', path: '/admin/ai/flags/export', tags: ADM, summary: 'Export flags (ADM-AI-13)', auth: A, permission: 'aitutor.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, async ({ req, res, body }) => {
  const r = await aiAdminService.flags((body.filters ?? {}) as Partial<s.FlagsQuery>, 50_000, 0);
  await doExport(req, res, body, 'ai-flags', FLAG_COLUMNS, r.items);
});
defineRoute(router, { method: 'get', path: '/admin/ai/flags/:id', tags: ADM, summary: 'Flag with transcript (ADM-AI-09)', description: 'Transcript (90-day retention) only with `aitutor.approve` or Super Admin; otherwise `[]`.', auth: A, permission: 'aitutor.view', params: idParam, response: s.aiFlagDetailDto }, ({ admin, params }) => aiAdminService.flag(params.id, admin));
defineRoute(router, { method: 'patch', path: '/admin/ai/flags/:id', tags: ADM, summary: 'Review / dismiss / reopen flag (ADM-AI-10)', auth: A, permission: 'aitutor.edit', params: idParam, body: s.patchFlagBody, response: s.aiFlagDto }, async ({ req, admin, params, body }) => {
  const r = await aiAdminService.patchFlag(params.id, body, admin);
  const verb = body.status === 'reviewed' ? 'review' : body.status === 'dismissed' ? 'dismiss' : 'open';
  req.audit = { action: `ai_flag.${verb}`, entity: 'ai_flag', entityId: params.id, summary: `Flag ${verb}${body.note ? `: ${body.note}` : ''}`, before: r.before, after: { status: body.status, note: body.note ?? null } };
  return r.after;
});
defineRoute(router, { method: 'get', path: '/admin/ai/flagged-users', tags: ADM, summary: 'Flagged users (ADM-AI-11)', auth: A, permission: 'aitutor.view', query: s.flaggedUsersQuery, response: z.array(s.flaggedUserDto) }, async ({ query }) => {
  const p = toPagination(query);
  const r = await aiAdminService.flaggedUsers(query, p.limit, p.offset);
  return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
});
defineRoute(router, { method: 'post', path: '/admin/ai/flagged-users/export', tags: ADM, summary: 'Export flagged users (ADM-AI-14)', auth: A, permission: 'aitutor.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, async ({ req, res, body }) => {
  const r = await aiAdminService.flaggedUsers((body.filters ?? {}) as Partial<s.FlaggedUsersQuery>, 50_000, 0);
  await doExport(req, res, body, 'ai-flagged-users', FLAGGED_USER_COLUMNS, r.items.map((x) => ({ ...x, id: x.student.id })));
});
defineRoute(router, { method: 'post', path: '/admin/ai/flagged-users/:studentId/warn', tags: ADM, summary: 'Warn student (in-app + push) (ADM-AI-12)', auth: A, permission: 'aitutor.edit', params: s.studentIdParam, body: s.warnBody, response: s.flaggedUserDto }, async ({ req, admin, params, body }) => {
  const dto = await aiAdminService.warn(params.studentId, body.message, admin);
  req.audit = { action: 'student.ai_warning', entity: 'student', entityId: params.studentId, summary: 'AI usage warning sent', before: null, after: { message: body.message ?? 'default' } };
  return dto;
});
defineRoute(router, { method: 'get', path: '/admin/ai/models', tags: ADM, summary: 'Provider → model catalogue (ADM-AI-15)', auth: A, permission: 'aitutor.view', response: s.aiModelsDto }, () => aiAdminService.models());

// ── knowledge base / RAG index (ADM-AI-16/17) ──
defineRoute(router, { method: 'get', path: '/admin/ai/knowledge-base', tags: ADM, summary: 'Knowledge-base index status + recent runs (ADM-AI-16)', auth: A, permission: 'aitutor.view', response: s.kbStatusDto }, () => knowledgeBaseStatus());
defineRoute(
  router,
  {
    method: 'post',
    path: '/admin/ai/knowledge-base/reindex',
    tags: ADM,
    summary: 'Reindex the knowledge base (ADM-AI-17)',
    description: 'Queues a full, incremental (hash-based) reindex — `force: true` re-embeds every chunk. Returns the run (202); poll ADM-AI-16 for progress. If a run is already in progress it is returned instead.',
    auth: A,
    permission: 'aitutor.edit',
    body: s.kbReindexBody,
    response: s.kbRunDto,
    status: 202,
    audit: { action: 'ai.kb_reindex', entity: 'ai_settings', entityId: () => '1' },
  },
  async ({ admin, body }) => {
    const status = await knowledgeBaseStatus();
    if (status.running && status.lastRun && (status.lastRun.status === 'running' || status.lastRun.status === 'queued')) return status.lastRun;
    const run = await createRun('manual', undefined, admin.userId, body.force);
    const { enqueue } = await import('../../jobs/index.js');
    // Fire-and-forget: without a running queue `enqueue` executes inline, which must not hold the request open.
    void enqueue('eduway.kb-index', { runId: run.id }).catch(() => undefined);
    return toRunDto(run);
  },
);
