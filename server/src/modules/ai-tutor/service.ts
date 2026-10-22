/**
 * Student AI tutor (AIT-01…10).
 *
 * AIT-08 send flow — checks in contract order: global kill switch → per-user disable → package includes AI →
 * allowance → rate limits → blocked keywords. Then the student + tutor messages are stored and a *generation task*
 * runs independently of the HTTP response: SSE clients subscribe to its deltas; polling clients read the partial
 * text via AIT-09 (kept in memory + flushed to the DB every ~400 ms). If the SSE client disconnects the task still
 * finishes, so a reconnecting client can fetch the final answer. The allowance is consumed only when the answer
 * completes successfully.
 */
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { AppError, BusinessRuleError, ForbiddenError, NotFoundError, PaymentRequiredError, RateLimitError } from '../../common/errors/index.js';
import { translate } from '../../common/i18n/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { storage } from '../../common/services/storage.js';
import { aiAllowance, currentSubscriptionRow, type AiAllowance } from '../../common/services/student-summary.js';
import type { StudentPrincipal } from '../../common/types/index.js';
import { paged } from '../../common/utils/response.js';
import { costUsd, denialFor, periodFor } from './allowance.js';
import { toSummary, toTutorMessage, type TutorMessage } from './dto.js';
import { providerFor, type AiChatMessage, type RetrievedChunk } from './providers/index.js';
import { aiRepo, type ConversationRow, type MessageRow } from './repository.js';
import { retrieveContext } from './retrieval.js';
import { classifyMessage, excerpt, findBlockedKeyword } from './safety.js';
import { DEFAULT_SUGGESTIONS, loadAiSettings } from './settings.js';
import { SseWriter } from './sse.js';

type Lang = 'en' | 'ar';

const IMAGE_PROMPT: Record<Lang, string> = { en: 'Explain this image step by step.', ar: 'اشرح هذه الصورة خطوة بخطوة.' };
const FAILED_TEXT: Record<Lang, string> = { en: 'Sorry, I could not answer this time. Please try again.', ar: 'عذراً، لم أتمكن من الإجابة هذه المرة. يرجى المحاولة مرة أخرى.' };

// ── live generations (single process; DB flushes make progress visible to other instances) ──
interface LiveGeneration {
  text: string;
  listeners: Set<(e: { type: 'delta'; text: string } | { type: 'done'; message: TutorMessage; allowance: AiAllowance } | { type: 'error'; code: string; reason: string; message: string; allowance: AiAllowance }) => void>;
  done: Promise<void>;
}
const live = new Map<string, LiveGeneration>();
const inFlight = new Set<string>();

export function liveText(messageId: string): string | undefined {
  return live.get(messageId)?.text;
}

function systemPrompt(safetyRules: string, lang: Lang, subject: { en: string; ar: string } | null): string {
  const base =
    'You are EDUWAY Tutor, a patient study assistant for Iraqi 6th-grade scientific students. Explain step by step, use Markdown, ' +
    'and write math in LaTeX ($…$ inline, $$…$$ display). Never give answers to live exam questions.';
  const langLine = lang === 'ar' ? 'Answer in Arabic (Modern Standard Arabic).' : 'Answer in English.';
  const subj = subject ? `Current subject: ${subject.en} (${subject.ar}).` : '';
  return [base, safetyRules.trim(), subj, langLine].filter(Boolean).join('\n\n');
}

async function ownConversation(userId: string, id: string): Promise<ConversationRow> {
  const c = await aiRepo.getConversation(userId, id);
  if (!c) throw new NotFoundError('conversation');
  return c;
}

async function resolveSubject(idOrSlug: string) {
  const s = await aiRepo.subjectByIdOrSlug(idOrSlug);
  if (!s) throw new NotFoundError('subject');
  return s;
}

async function conversationDto(c: ConversationRow, locale: Lang, before: Date | null = null, limit = 50) {
  const msgs = await aiRepo.messages(c.id, before, limit);
  return { ...toSummary(c), messages: await Promise.all(msgs.map((m) => toTutorMessage(m, locale, c, liveText(m.id)))) };
}

/** Throws the contract error for a denied allowance. */
function throwDenial(a: AiAllowance): void {
  const d = denialFor(a);
  if (d === 'AI_GLOBALLY_DISABLED') throw new ForbiddenError('AI_GLOBALLY_DISABLED');
  if (d === 'AI_DISABLED') throw new ForbiddenError('AI_DISABLED');
  if (d === 'AI_NOT_INCLUDED') throw new PaymentRequiredError({ reason: 'AI_NOT_INCLUDED' });
  if (d === 'AI_ALLOWANCE_EXHAUSTED') throw new BusinessRuleError('AI_ALLOWANCE_EXHAUSTED', { allowance: a });
}

export const aiTutorService = {
  allowance: (userId: string) => aiAllowance(userId),

  async suggestions(subjectIdOrSlug?: string): Promise<{ en: string; ar: string }[]> {
    const s = await loadAiSettings();
    const slug = subjectIdOrSlug ? (await aiRepo.subjectByIdOrSlug(subjectIdOrSlug))?.slug : undefined;
    const pool = (slug ? (s.suggested_prompts?.[slug] ?? DEFAULT_SUGGESTIONS[slug]) : undefined) ?? Object.values({ ...DEFAULT_SUGGESTIONS, ...s.suggested_prompts }).flat();
    return pool.slice(0, 3);
  },

  async listConversations(userId: string, q: { subjectId?: string; page: number; pageSize: number }) {
    const subjectId = q.subjectId ? (await resolveSubject(q.subjectId)).id : null;
    const offset = (q.page - 1) * q.pageSize;
    const { rows, total } = await aiRepo.listConversations(userId, subjectId, q.pageSize, offset);
    return paged(rows.map(toSummary), { page: q.page, pageSize: q.pageSize, total, nextCursor: null });
  },

  async createConversation(student: StudentPrincipal, body: { subjectId: string; title?: string }, locale: Lang) {
    const subject = await resolveSubject(body.subjectId);
    const id = await aiRepo.createConversation(student.userId, subject.id, body.title ?? '', student.platform);
    return conversationDto(await ownConversation(student.userId, id), locale);
  },

  async getConversation(userId: string, id: string, q: { before?: string; limit: number }, locale: Lang) {
    return conversationDto(await ownConversation(userId, id), locale, q.before ? new Date(q.before) : null, q.limit);
  },

  async patchConversation(userId: string, id: string, body: { subjectId?: string; title?: string }) {
    const c = await ownConversation(userId, id);
    let subjectId: string | undefined;
    if (body.subjectId) {
      subjectId = (await resolveSubject(body.subjectId)).id;
      if (subjectId !== c.subject_id && (await aiRepo.hasStudentMessages(id))) throw new BusinessRuleError('AI_SUBJECT_LOCKED');
    }
    await aiRepo.updateConversation(id, { subjectId, title: body.title });
    return toSummary(await ownConversation(userId, id));
  },

  async deleteConversation(userId: string, id: string) {
    if (!(await aiRepo.softDeleteConversation(userId, id))) throw new NotFoundError('conversation');
    return { ok: true as const };
  },

  async getMessage(userId: string, messageId: string, locale: Lang) {
    const m = await aiRepo.getMessageForUser(userId, messageId);
    if (!m) throw new NotFoundError('resource');
    return toTutorMessage(m, locale, null, liveText(m.id));
  },

  async feedback(userId: string, messageId: string, rating: 'up' | 'down' | null, comment: string | undefined, locale: Lang) {
    const m = await aiRepo.getMessageForUser(userId, messageId);
    if (!m || m.role !== 'assistant') throw new NotFoundError('resource');
    return toTutorMessage(await aiRepo.setFeedback(messageId, rating, comment ?? null), locale);
  },

  /**
   * AIT-08. `sse` = Accept: text/event-stream. Returns the JSON payload for polling mode, or undefined after
   * having streamed the SSE response.
   */
  async sendMessage(
    student: StudentPrincipal,
    conversationId: string,
    body: { text: string; attachmentFileKey?: string; lang: Lang; clientMessageId?: string },
    opts: { sse: boolean; res?: Response; locale: Lang },
  ): Promise<unknown> {
    const userId = student.userId;
    const conv = await ownConversation(userId, conversationId);
    const text = body.text.trim();
    if (!text && !body.attachmentFileKey) throw new AppError('VALIDATION_ERROR', 400, { reason: 'AI_MESSAGE_EMPTY' });

    // Offline retry of the same client message → replay instead of asking again.
    if (body.clientMessageId) {
      const prev = await aiRepo.byClientMessageId(conversationId, body.clientMessageId);
      if (prev) return this.replay(student, conv, prev, opts);
    }

    const settings = await loadAiSettings();
    const allowance = await aiAllowance(userId);
    throwDenial(allowance);

    // Rate limits (admin-configurable) + one in-flight answer per student.
    if (inFlight.has(userId)) throw new RateLimitError(5, 'AI_RATE_LIMITED');
    const [perMin, perHour] = await Promise.all([aiRepo.recentQuestionCount(userId, 60), aiRepo.recentQuestionCount(userId, 3600)]);
    if (perMin >= settings.rate_limit_per_minute) throw new RateLimitError(60, 'AI_RATE_LIMITED');
    if (perHour >= settings.rate_limit_per_hour) {
      if (!(await aiRepo.recentRateLimitFlag(userId))) {
        await aiRepo.insertFlag({ conversationId, messageId: null, userId, subjectId: conv.subject_id, reason: 'abuse', severity: 'low', excerpt: `Hourly limit reached (${perHour}/${settings.rate_limit_per_hour})`, source: 'rate_limit' });
      }
      throw new RateLimitError(3600, 'AI_RATE_LIMITED');
    }

    // Blocked keywords → message stored as blocked + flag, request rejected.
    const blocked = text ? findBlockedKeyword(text, settings.blocked_keywords ?? []) : null;
    if (blocked) {
      const m = await aiRepo.insertMessage({ conversationId, role: 'user', content: text, status: 'blocked', clientMessageId: body.clientMessageId, lang: body.lang });
      await aiRepo.touchConversation(conversationId, 1, null);
      const cls = classifyMessage(text);
      await aiRepo.insertFlag({ conversationId, messageId: m.id, userId, subjectId: conv.subject_id, reason: cls?.reason ?? 'abuse', severity: cls?.severity ?? 'medium', excerpt: excerpt(text), source: 'keyword' });
      throw new BusinessRuleError('AI_BLOCKED_CONTENT');
    }

    // Attachment (feature flag `ai_tutor_attachments`).
    const studentMsgId = randomUUID();
    let imageUrl: string | null = null;
    if (body.attachmentFileKey) {
      if (!(await settingsStore.flag('ai_tutor_attachments', true))) throw new BusinessRuleError('FEATURE_DISABLED');
      const up = await storage.attachUpload(body.attachmentFileKey, { purpose: 'ai_attachment', entityType: 'ai_message', entityId: studentMsgId, ownerId: userId });
      imageUrl = (await storage.signedUrl(up.bucket, up.path)).url;
    }

    const question = text || IMAGE_PROMPT[body.lang];
    const studentRow = await aiRepo.insertMessage({ id: studentMsgId, conversationId, role: 'user', content: question, status: 'complete', attachmentFileKey: body.attachmentFileKey ?? null, clientMessageId: body.clientMessageId, lang: body.lang });
    const tutorRow = await aiRepo.insertMessage({ conversationId, role: 'assistant', content: '', status: 'pending', lang: body.lang, createdAt: new Date(studentRow.created_at.getTime() + 1) });
    await aiRepo.touchConversation(conversationId, 2, question.slice(0, 60));

    const cls = text ? classifyMessage(text) : null;
    if (cls) await aiRepo.insertFlag({ conversationId, messageId: studentRow.id, userId, subjectId: conv.subject_id, reason: cls.reason, severity: cls.severity, excerpt: excerpt(text), source: 'auto' });

    const gen = this.startGeneration({ student, conv, studentRow, tutorRow, question, imageUrl, lang: body.lang, locale: opts.locale });
    const studentMessage = await toTutorMessage(studentRow, opts.locale, conv);

    if (!opts.sse || !opts.res) {
      return { studentMessage, tutorMessage: await toTutorMessage(tutorRow, opts.locale, conv), allowance, pollAfterMs: 800 };
    }
    const sse = new SseWriter(opts.res).open();
    sse.send('meta', { studentMessage, tutorMessageId: tutorRow.id, allowance });
    await new Promise<void>((resolve) => {
      const listener: Parameters<LiveGeneration['listeners']['add']>[0] = (e) => {
        if (e.type === 'delta') sse.send('delta', { text: e.text });
        else {
          if (e.type === 'done') sse.send('done', { message: e.message, allowance: e.allowance });
          else sse.send('error', { code: e.code, reason: e.reason, message: e.message, allowance: e.allowance });
          gen.listeners.delete(listener);
          sse.close();
          resolve();
        }
      };
      gen.listeners.add(listener);
      opts.res?.on('close', () => {
        gen.listeners.delete(listener);
        sse.stop();
        resolve();
      });
    });
    return undefined;
  },

  /** Replays an already-sent client message (idempotent offline retries). */
  async replay(student: StudentPrincipal, conv: ConversationRow, prev: MessageRow, opts: { sse: boolean; res?: Response; locale: Lang }) {
    const reply = await aiRepo.replyTo(prev);
    const allowance = await aiAllowance(student.userId);
    const studentMessage = await toTutorMessage(prev, opts.locale, conv);
    if (prev.status === 'blocked') throw new BusinessRuleError('AI_BLOCKED_CONTENT');
    const tutorMessage = reply ? await toTutorMessage(reply, opts.locale, conv, liveText(reply.id)) : null;
    if (!opts.sse || !opts.res) return { studentMessage, tutorMessage, allowance, pollAfterMs: 800 };
    const sse = new SseWriter(opts.res, 0).open();
    sse.send('meta', { studentMessage, tutorMessageId: reply?.id ?? null, allowance });
    if (reply && live.has(reply.id)) {
      await live.get(reply.id)?.done;
      const fresh = await aiRepo.getMessageForUser(student.userId, reply.id);
      if (fresh) sse.send(fresh.status === 'complete' ? 'done' : 'error', fresh.status === 'complete' ? { message: await toTutorMessage(fresh, opts.locale, conv), allowance: await aiAllowance(student.userId) } : { code: 'INTERNAL', reason: 'AI_PROVIDER_ERROR', message: translate('INTERNAL', opts.locale, undefined, 'AI_PROVIDER_ERROR'), allowance });
    } else if (tutorMessage?.status === 'complete') sse.send('done', { message: tutorMessage, allowance });
    else sse.send('error', { code: 'INTERNAL', reason: 'AI_PROVIDER_ERROR', message: translate('INTERNAL', opts.locale, undefined, 'AI_PROVIDER_ERROR'), allowance });
    sse.close();
    return undefined;
  },

  startGeneration(input: { student: StudentPrincipal; conv: ConversationRow; studentRow: MessageRow; tutorRow: MessageRow; question: string; imageUrl: string | null; lang: Lang; locale: Lang }): LiveGeneration {
    const { student, conv, tutorRow, lang } = input;
    const userId = student.userId;
    inFlight.add(userId);
    const gen: LiveGeneration = { text: '', listeners: new Set(), done: Promise.resolve() };
    live.set(tutorRow.id, gen);
    const emit = (e: Parameters<Parameters<LiveGeneration['listeners']['add']>[0]>[0]) => {
      for (const l of [...gen.listeners]) {
        try {
          l(e);
        } catch {
          /* listener errors never break generation */
        }
      }
    };

    gen.done = (async () => {
      let lastFlush = Date.now();
      try {
        const settings = await loadAiSettings();
        const history = (await aiRepo.history(conv.id, 12)).filter((m) => m.id !== input.studentRow.id);
        const context: RetrievedChunk[] = await retrieveContext({
          userId,
          subjectId: conv.subject_id,
          question: input.question,
          lang,
          toggles: { transcripts: settings.retrieval_transcripts, explanations: settings.retrieval_explanations, lessonNotes: settings.retrieval_lesson_notes },
        });
        const messages: AiChatMessage[] = [
          ...history.map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content })),
          { role: 'user', content: input.question, imageUrl: input.imageUrl },
        ];
        const provider = providerFor(settings.provider);
        const result = await provider.stream(
          {
            model: settings.model,
            system: systemPrompt(settings.safety_rules, lang, conv.subject_name_en ? { en: conv.subject_name_en, ar: conv.subject_name_ar ?? '' } : null),
            messages,
            temperature: Number(settings.temperature),
            maxTokens: settings.max_tokens,
            lang,
            subjectSlug: conv.subject_slug,
            context,
          },
          (delta) => {
            gen.text += delta;
            emit({ type: 'delta', text: delta });
            if (Date.now() - lastFlush > 400) {
              lastFlush = Date.now();
              void aiRepo.setPartial(tutorRow.id, gen.text).catch(() => undefined);
            }
          },
        );
        const finalText = result.text || gen.text;
        if (!finalText.trim()) throw new Error('empty answer');
        const cost = costUsd(result.tokensIn, result.tokensOut, Number(settings.cost_per_1k_input_usd), Number(settings.cost_per_1k_output_usd));
        // Consume one question of the allowance (successful generation only) BEFORE the answer becomes
        // visible as complete — otherwise a polling client can read the allowance in between and see a stale count.
        const sub = await currentSubscriptionRow(userId);
        const before = await aiAllowance(userId, sub);
        const period = periodFor(settings.reset_cycle, sub && sub.ends_at > new Date() ? sub.starts_at : null);
        await aiRepo.addUsage({ userId, periodStart: period.start, periodEnd: period.end, allowance: before.quota, tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd: cost });
        await aiRepo.markCounted(input.studentRow.id);
        const done = await aiRepo.completeMessage(tutorRow.id, {
          content: finalText,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: cost,
          model: result.model,
          citations: context.map((c) => ({ type: c.sourceType, id: c.sourceId, lessonId: c.lessonId, title: c.title })),
        });
        await db.query(`UPDATE ${T.users} SET last_active_at = now() WHERE id = $1`, [userId]).catch(() => undefined);
        emit({ type: 'done', message: await toTutorMessage(done, input.locale, conv), allowance: await aiAllowance(userId) });
      } catch (err) {
        logger.warn({ err: (err as Error).message, messageId: tutorRow.id }, 'AI generation failed');
        await aiRepo.failMessage(tutorRow.id, (err as Error).message, gen.text || FAILED_TEXT[lang]).catch(() => undefined);
        emit({ type: 'error', code: 'INTERNAL', reason: 'AI_PROVIDER_ERROR', message: translate('INTERNAL', input.locale, undefined, 'AI_PROVIDER_ERROR'), allowance: await aiAllowance(userId).catch(() => null as unknown as AiAllowance) });
      } finally {
        inFlight.delete(userId);
        setTimeout(() => live.delete(tutorRow.id), 30_000).unref();
      }
    })();
    return gen;
  },

  /** Test helper: wait for every running generation. */
  async drain(): Promise<void> {
    await Promise.all([...live.values()].map((g) => g.done));
  },
};
