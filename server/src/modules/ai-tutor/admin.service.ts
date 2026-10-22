/** Admin AI tutor (ADM-AI-01…15): usage dashboard, settings, kill switch, per-user disable, flags & abuse. */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { adminRef, refCols, studentRef, subjectRef, type StudentRef } from '../../common/dto/refs.js';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../common/errors/index.js';
import { hasPermission } from '../../common/middleware/rbac.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { dayjs, BUSINESS_TZ } from '../../common/utils/dates.js';
import { notify } from '../notifications/notify.js';
import type { FlagsQuery, FlaggedUsersQuery, PatchSettingsBody } from './schemas.js';
import { activeProviderName } from './providers/index.js';
import { aiRepo, type AiSettingsRow } from './repository.js';
import { vectorStoreReady } from './retrieval.js';
import { maxSeverity, type Severity } from './safety.js';
import { invalidateAiSettings, loadAiSettings, modelCatalog } from './settings.js';
import { likeContains } from '../../common/utils/like.js';

type Row = Record<string, unknown>;

export interface Kpi {
  value: number;
  prev: number | null;
  deltaPct: number | null;
  spark: number[];
}

export function kpi(value: number, prev: number | null, spark: number[]): Kpi {
  const deltaPct = prev === null ? null : prev === 0 ? (value === 0 ? 0 : 100) : Math.round(((value - prev) / prev) * 1000) / 10;
  return { value: Math.round(value * 1e4) / 1e4, prev: prev === null ? null : Math.round(prev * 1e4) / 1e4, deltaPct, spark };
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

async function settingsDto(row?: AiSettingsRow) {
  const s = row ?? (await loadAiSettings());
  const disabled = await db.many<Row>(
    `SELECT ${refCols.user('u', 's_')} FROM ${T.student_profiles} p JOIN ${T.users} u ON u.id = p.user_id WHERE p.ai_disabled ORDER BY u.name_en`,
  );
  const disabledUsers = disabled.map((r) => studentRef(r, 's_')).filter((x): x is StudentRef => !!x);
  const provider = s.provider === 'mock' ? 'anthropic' : s.provider;
  return {
    enabled: s.enabled,
    disabledReason: s.enabled ? null : s.disabled_reason,
    monthlyAllowance: s.monthly_allowance,
    resetCycle: s.reset_cycle,
    provider,
    model: s.model,
    activeProvider: activeProviderName(s.provider),
    temperature: Number(s.temperature),
    maxTokens: s.max_tokens,
    retrieval: { transcripts: s.retrieval_transcripts, explanations: s.retrieval_explanations, lessonNotes: s.retrieval_lesson_notes },
    vectorRetrieval: await vectorStoreReady(),
    safetyRules: s.safety_rules,
    disabledUserIds: disabledUsers.map((u) => u.id),
    disabledUsers,
    rateLimitPerMinute: s.rate_limit_per_minute,
    rateLimitPerHour: s.rate_limit_per_hour,
    blockedKeywords: s.blocked_keywords ?? [],
    suggestedPrompts: s.suggested_prompts ?? {},
    updatedAt: s.updated_at.toISOString(),
    updatedBy: adminRef(s as unknown as Row, 'ub_'),
  };
}
export type AiSettingsDto = Awaited<ReturnType<typeof settingsDto>>;

async function fresh() {
  invalidateAiSettings();
  return settingsDto(await loadAiSettings());
}

const FLAG_SELECT = `
  SELECT f.*, ${refCols.user('u', 'st_')}, ${refCols.subject('s', 'sj_')},
         r.id AS rv_id, r.name_en AS rv_name_en, r.name_ar AS rv_name_ar, r.avatar_url AS rv_avatar_url
    FROM ${T.ai_flags} f
    JOIN ${T.users} u ON u.id = f.user_id
    LEFT JOIN ${T.subjects} s ON s.id = f.subject_id
    LEFT JOIN ${T.users} r ON r.id = f.reviewed_by`;

function toFlag(r: Row) {
  return {
    id: String(r.id),
    student: studentRef(r, 'st_') as StudentRef,
    subject: subjectRef(r, 'sj_'),
    conversationId: (r.conversation_id as string | null) ?? null,
    messageId: (r.message_id as string | null) ?? null,
    excerpt: String(r.excerpt ?? ''),
    reason: r.reason as string,
    severity: r.severity as Severity,
    status: r.status as string,
    source: (r.source as string) ?? 'auto',
    reviewedBy: adminRef(r, 'rv_'),
    reviewedAt: r.reviewed_at ? (r.reviewed_at as Date).toISOString() : null,
    note: (r.note as string | null) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
  };
}
export type AiFlagDto = ReturnType<typeof toFlag>;

const FLAG_SORT: Record<string, string> = {
  createdAt: 'f.created_at',
  reason: 'f.reason',
  severity: `array_position(ARRAY['low','medium','high'], f.severity)`,
  status: 'f.status',
};

function sortSql(sort: string | undefined, allowed: Record<string, string>, fallback: string): string {
  const pick = (s: string) => {
    const desc = s.startsWith('-');
    const col = allowed[desc ? s.slice(1) : s];
    return col ? `${col} ${desc ? 'DESC' : 'ASC'} NULLS LAST` : null;
  };
  return pick(sort ?? '') ?? (pick(fallback) as string);
}

function flagWhere(q: Partial<FlagsQuery>): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const cond: string[] = ['TRUE'];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    cond.push(sql.replace('?', `$${params.length}`));
  };
  if (q.status?.length) add('f.status = ANY(?::text[])', q.status);
  if (q.severity?.length) add('f.severity = ANY(?::text[])', q.severity);
  if (q.reason?.length) add('f.reason = ANY(?::text[])', q.reason);
  if (q.studentId) add('f.user_id = ?', q.studentId);
  if (q.from) add('f.created_at >= ?', q.from);
  if (q.to) add('f.created_at <= ?', q.to);
  if (q.q) add(`(f.excerpt ILIKE ? OR u.name_en ILIKE $${params.length + 1} OR u.name_ar ILIKE $${params.length + 1} OR u.phone ILIKE $${params.length + 1})`, likeContains(q.q));
  return { where: cond.join(' AND '), params };
}

export const aiAdminService = {
  settings: () => settingsDto(),

  models: async () => modelCatalog(await loadAiSettings()),

  async patchSettings(body: PatchSettingsBody, admin: AdminPrincipal) {
    const cur = await loadAiSettings();
    const provider = body.provider ?? (cur.provider === 'mock' ? 'anthropic' : cur.provider);
    const model = body.model ?? cur.model;
    if (body.provider !== undefined || body.model !== undefined) {
      const catalog = modelCatalog(cur)[provider];
      if (!catalog.some((m) => m.value === model)) throw new BusinessRuleError('AI_MODEL_INVALID', { provider, model });
    }
    const perMin = body.rateLimitPerMinute ?? cur.rate_limit_per_minute;
    const perHour = body.rateLimitPerHour ?? cur.rate_limit_per_hour;
    if (perHour < perMin) throw new ValidationError([{ path: 'rateLimitPerHour', message: `must be ≥ rateLimitPerMinute (${perMin})` }]);

    const patch: Record<string, unknown> = {};
    if (body.monthlyAllowance !== undefined) patch.monthly_allowance = body.monthlyAllowance;
    if (body.resetCycle !== undefined) patch.reset_cycle = body.resetCycle;
    if (body.provider !== undefined) patch.provider = body.provider;
    if (body.model !== undefined) patch.model = body.model;
    if (body.temperature !== undefined) patch.temperature = body.temperature;
    if (body.maxTokens !== undefined) patch.max_tokens = body.maxTokens;
    if (body.retrieval?.transcripts !== undefined) patch.retrieval_transcripts = body.retrieval.transcripts;
    if (body.retrieval?.explanations !== undefined) patch.retrieval_explanations = body.retrieval.explanations;
    if (body.retrieval?.lessonNotes !== undefined) patch.retrieval_lesson_notes = body.retrieval.lessonNotes;
    if (body.safetyRules !== undefined) patch.safety_rules = body.safetyRules;
    if (body.rateLimitPerMinute !== undefined) patch.rate_limit_per_minute = body.rateLimitPerMinute;
    if (body.rateLimitPerHour !== undefined) patch.rate_limit_per_hour = body.rateLimitPerHour;
    if (body.blockedKeywords !== undefined) patch.blocked_keywords = [...new Set(body.blockedKeywords.map((k) => k.trim()).filter(Boolean))];
    if (body.suggestedPrompts !== undefined) patch.suggested_prompts = body.suggestedPrompts;
    await aiRepo.updateSettings(patch, admin.userId);

    if (body.disabledUserIds !== undefined) {
      await db.query(
        `UPDATE ${T.student_profiles} SET ai_disabled = false, ai_disabled_reason = NULL, ai_disabled_at = NULL, ai_disabled_by = NULL
          WHERE ai_disabled AND NOT (user_id = ANY($1::uuid[]))`,
        [body.disabledUserIds],
      );
      await db.query(
        `UPDATE ${T.student_profiles} SET ai_disabled = true, ai_disabled_at = now(), ai_disabled_by = $2
          WHERE NOT ai_disabled AND user_id = ANY($1::uuid[])`,
        [body.disabledUserIds, admin.userId],
      );
    }
    const keys = Object.keys(body);
    const action = keys.every((k) => k === 'rateLimitPerMinute' || k === 'rateLimitPerHour')
      ? 'ai_settings.rate_limits'
      : keys.every((k) => k === 'blockedKeywords')
        ? 'ai_settings.blocked_keywords'
        : 'ai_settings.update';
    return { action, dto: await fresh() };
  },

  async setEnabled(enabled: boolean, reason: string | null, admin: AdminPrincipal) {
    await db.query(
      `UPDATE ${T.ai_settings} SET enabled = $1, disabled_reason = $2, disabled_at = CASE WHEN $1 THEN NULL ELSE now() END,
              disabled_by = CASE WHEN $1 THEN NULL ELSE $3::uuid END, updated_by = $3, updated_at = now() WHERE id = 1`,
      [enabled, enabled ? null : reason, admin.userId],
    );
    return fresh();
  },

  async setUserDisabled(studentId: string, disabled: boolean, reason: string | null, admin: AdminPrincipal) {
    const n = await db.exec(
      `UPDATE ${T.student_profiles} SET ai_disabled = $2, ai_disabled_reason = $3, ai_disabled_at = CASE WHEN $2 THEN now() ELSE NULL END,
              ai_disabled_by = CASE WHEN $2 THEN $4::uuid ELSE NULL END, updated_at = now() WHERE user_id = $1`,
      [studentId, disabled, disabled ? reason : null, admin.userId],
    );
    if (!n) throw new NotFoundError('student');
    return fresh();
  },

  async usage(q: { from?: string; to?: string; platform?: string }) {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : dayjs(to).subtract(29, 'day').tz(BUSINESS_TZ).startOf('day').toDate();
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const sparkFrom = dayjs(to).tz(BUSINESS_TZ).subtract(19, 'day').startOf('day').toDate();
    const scanFrom = new Date(Math.min(prevFrom.getTime(), sparkFrom.getTime()));
    const platform = q.platform ?? null;

    const daily = await db.many<{ d: string; questions: number; users: number; tokens: number; cost: number }>(
      `SELECT to_char((m.created_at AT TIME ZONE '${BUSINESS_TZ}')::date, 'YYYY-MM-DD') AS d,
              count(*) FILTER (WHERE m.role = 'user' AND m.status <> 'blocked')::int AS questions,
              count(DISTINCT c.user_id) FILTER (WHERE m.role = 'user')::int AS users,
              coalesce(sum(m.tokens_in + m.tokens_out), 0)::int AS tokens,
              coalesce(sum(m.cost_usd), 0)::float8 AS cost
         FROM ${T.ai_messages} m JOIN ${T.ai_conversations} c ON c.id = m.conversation_id
        WHERE m.created_at >= $1 AND m.created_at <= $2 AND ($3::text IS NULL OR c.platform::text = $3)
        GROUP BY 1 ORDER BY 1`,
      [scanFrom, to, platform],
    );
    const agg = async (a: Date, b: Date) =>
      db.one<{ questions: number; users: number; tokens: number; cost: number }>(
        `SELECT count(*) FILTER (WHERE m.role = 'user' AND m.status <> 'blocked')::int AS questions,
                count(DISTINCT c.user_id) FILTER (WHERE m.role = 'user')::int AS users,
                coalesce(sum(m.tokens_in + m.tokens_out), 0)::int AS tokens, coalesce(sum(m.cost_usd), 0)::float8 AS cost
           FROM ${T.ai_messages} m JOIN ${T.ai_conversations} c ON c.id = m.conversation_id
          WHERE m.created_at >= $1 AND m.created_at <= $2 AND ($3::text IS NULL OR c.platform::text = $3)`,
        [a, b, platform],
      );
    const [cur, prev] = await Promise.all([agg(from, to), agg(prevFrom, from)]);
    const byDay = new Map(daily.map((r) => [r.d, r]));
    const days = (a: Date, b: Date) => {
      const out: string[] = [];
      for (let d = dayjs(a).tz(BUSINESS_TZ).startOf('day'); !d.isAfter(dayjs(b).tz(BUSINESS_TZ)); d = d.add(1, 'day')) out.push(d.format('YYYY-MM-DD'));
      return out;
    };
    const rangeDays = days(from, to);
    const prevDays = days(prevFrom, new Date(from.getTime() - 1));
    const sparkDays = days(sparkFrom, to);
    const peak = (ds: string[]) => Math.max(0, ...ds.map((d) => byDay.get(d)?.users ?? 0));
    const spark = (f: (d: string) => number) => sparkDays.map(f);

    const s = await loadAiSettings();
    const [bySubject, topUsers, openFlags] = await Promise.all([
      db.many<Row>(
        `SELECT ${refCols.subject('s', 'sj_')}, count(*)::int AS value
           FROM ${T.ai_messages} m JOIN ${T.ai_conversations} c ON c.id = m.conversation_id JOIN ${T.subjects} s ON s.id = c.subject_id
          WHERE m.role = 'user' AND m.status <> 'blocked' AND m.created_at >= $1 AND m.created_at <= $2 AND ($3::text IS NULL OR c.platform::text = $3)
          GROUP BY s.id ORDER BY value DESC`,
        [from, to, platform],
      ),
      db.many<Row>(
        `SELECT ${refCols.user('u', 'st_')}, a.questions_used, a.allowance, coalesce(a.last_used_at, u.last_active_at) AS last_active
           FROM ${T.ai_usage} a JOIN ${T.users} u ON u.id = a.user_id
          WHERE a.period_start <= now() AND a.period_end > now()
          ORDER BY a.questions_used DESC, a.last_used_at DESC NULLS LAST LIMIT 8`,
      ),
      db.many<Row>(`${FLAG_SELECT} WHERE f.status = 'open' ORDER BY f.created_at DESC LIMIT 5`),
    ]);

    return {
      kpis: {
        questions: kpi(cur.questions, prev.questions, spark((d) => byDay.get(d)?.questions ?? 0)),
        peakActiveUsers: kpi(peak(rangeDays), peak(prevDays), spark((d) => byDay.get(d)?.users ?? 0)),
        avgPerUser: kpi(cur.users ? round(cur.questions / cur.users, 1) : 0, prev.users ? round(prev.questions / prev.users, 1) : 0, spark((d) => {
          const r = byDay.get(d);
          return r?.users ? round(r.questions / r.users, 1) : 0;
        })),
        costUsd: kpi(round(cur.cost), round(prev.cost), spark((d) => round(byDay.get(d)?.cost ?? 0))),
        costIqd: Math.round(cur.cost * s.iqd_per_usd),
        tokens: kpi(cur.tokens, prev.tokens, spark((d) => byDay.get(d)?.tokens ?? 0)),
      },
      daily: rangeDays.map((d) => ({ date: d, questions: byDay.get(d)?.questions ?? 0, users: byDay.get(d)?.users ?? 0, tokens: byDay.get(d)?.tokens ?? 0, costUsd: round(byDay.get(d)?.cost ?? 0) })),
      bySubject: bySubject.map((r) => {
        const sj = subjectRef(r, 'sj_');
        return { subjectId: sj?.id ?? '', slug: sj?.slug ?? '', name: sj?.name ?? { en: '', ar: '' }, value: Number(r.value), color: sj?.color ?? '' };
      }),
      topUsers: topUsers.map((r) => ({
        student: studentRef(r, 'st_') as StudentRef,
        used: Number(r.questions_used),
        allowance: Number(r.allowance),
        lastActive: r.last_active ? (r.last_active as Date).toISOString() : null,
      })),
      openFlags: openFlags.map(toFlag),
      enabled: s.enabled,
      monthlyAllowance: s.monthly_allowance,
      iqdPerUsd: s.iqd_per_usd,
    };
  },

  async flags(q: Partial<FlagsQuery>, limit: number, offset: number) {
    const { where, params } = flagWhere(q);
    const order = sortSql(q.sort, FLAG_SORT, '-createdAt');
    const [rows, total] = await Promise.all([
      db.many<Row>(`${FLAG_SELECT} WHERE ${where} ORDER BY ${order}, f.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
      db.scalar<number>(`SELECT count(*)::int FROM ${T.ai_flags} f JOIN ${T.users} u ON u.id = f.user_id WHERE ${where}`, params),
    ]);
    return { items: rows.map(toFlag), total: total ?? 0 };
  },

  async flag(id: string, admin: AdminPrincipal) {
    const r = await db.maybeOne<Row>(`${FLAG_SELECT} WHERE f.id = $1`, [id]);
    if (!r) throw new NotFoundError('resource');
    const dto = toFlag(r);
    const canSee = admin.isSuperAdmin || hasPermission(admin, 'aitutor.approve');
    const transcript =
      canSee && dto.conversationId
        ? (
            await db.many<{ id: string; role: string; content: string; created_at: Date }>(
              `SELECT id, role, content, created_at FROM ${T.ai_messages}
                WHERE conversation_id = $1 AND role IN ('user', 'assistant') AND created_at > now() - interval '90 days'
                ORDER BY created_at LIMIT 500`,
              [dto.conversationId],
            )
          ).map((m) => ({ role: m.role === 'user' ? ('student' as const) : ('tutor' as const), text: m.content, at: m.created_at.toISOString(), flagged: m.id === dto.messageId }))
        : [];
    return { ...dto, transcript };
  },

  async patchFlag(id: string, body: { status: 'open' | 'reviewed' | 'dismissed'; note?: string }, admin: AdminPrincipal) {
    const before = await db.maybeOne<{ status: string }>(`SELECT status FROM ${T.ai_flags} WHERE id = $1`, [id]);
    if (!before) throw new NotFoundError('resource');
    await db.query(
      `UPDATE ${T.ai_flags} SET status = $2, note = coalesce($3, note),
              reviewed_by = CASE WHEN $2 = 'open' THEN NULL ELSE $4::uuid END, reviewed_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END,
              updated_at = now() WHERE id = $1`,
      [id, body.status, body.note ?? null, admin.userId],
    );
    const r = await db.one<Row>(`${FLAG_SELECT} WHERE f.id = $1`, [id]);
    return { before, after: toFlag(r) };
  },

  async flaggedUsers(q: Partial<FlaggedUsersQuery>, limit: number, offset: number) {
    const params: unknown[] = [];
    let search = 'TRUE';
    if (q.q) {
      params.push(likeContains(q.q));
      search = `(u.name_en ILIKE $1 OR u.name_ar ILIKE $1 OR u.phone ILIKE $1)`;
    }
    const SORT: Record<string, string> = {
      flags: 'g.flags',
      open: 'g.open',
      highest: 'g.highest_rank',
      last: 'g.last',
    };
    const order = q.sort ? sortSql(q.sort, SORT, '-highest') : 'g.highest_rank DESC, g.open DESC, g.last DESC';
    const base = `
      WITH g AS (
        SELECT f.user_id, count(*)::int AS flags, count(*) FILTER (WHERE f.status = 'open')::int AS open,
               max(array_position(ARRAY['low','medium','high'], f.severity)) AS highest_rank, max(f.created_at) AS last
          FROM ${T.ai_flags} f GROUP BY f.user_id)
      SELECT g.*, ${refCols.user('u', 'st_')}, u.status AS user_status, coalesce(p.ai_disabled, false) AS ai_disabled,
             (SELECT max(w.created_at) FROM ${T.ai_warnings} w WHERE w.user_id = g.user_id) AS warned_at
        FROM g JOIN ${T.users} u ON u.id = g.user_id LEFT JOIN ${T.student_profiles} p ON p.user_id = g.user_id
       WHERE ${search}`;
    const [rows, total] = await Promise.all([
      db.many<Row>(`${base} ORDER BY ${order}, g.user_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
      db.scalar<number>(`SELECT count(*)::int FROM (${base}) x`, params),
    ]);
    return { items: rows.map(toFlaggedUser), total: total ?? 0 };
  },

  async flaggedUser(studentId: string) {
    const r = await this.flaggedUsersFor(studentId);
    if (!r) throw new NotFoundError('student');
    return r;
  },

  async flaggedUsersFor(studentId: string) {
    const r = await db.maybeOne<Row>(
      `SELECT f.user_id, count(f.id)::int AS flags, count(f.id) FILTER (WHERE f.status = 'open')::int AS open,
              max(array_position(ARRAY['low','medium','high'], f.severity)) AS highest_rank, coalesce(max(f.created_at), now()) AS last,
              ${refCols.user('u', 'st_')}, u.status AS user_status, coalesce(p.ai_disabled, false) AS ai_disabled,
              (SELECT max(w.created_at) FROM ${T.ai_warnings} w WHERE w.user_id = u.id) AS warned_at
         FROM ${T.users} u LEFT JOIN ${T.ai_flags} f ON f.user_id = u.id LEFT JOIN ${T.student_profiles} p ON p.user_id = u.id
        WHERE u.id = $1 AND u.kind = 'student' GROUP BY f.user_id, u.id, p.ai_disabled`,
      [studentId],
    );
    return r ? toFlaggedUser(r) : null;
  },

  async warn(studentId: string, message: { en: string; ar: string } | undefined, admin: AdminPrincipal) {
    const exists = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.users} WHERE id = $1 AND kind = 'student'`, [studentId]);
    if (!exists) throw new NotFoundError('student');
    const fallback = {
      en: 'Please keep your AI Tutor questions focused on your studies. Repeated misuse may disable the tutor for your account.',
      ar: 'يرجى أن تكون أسئلتك للمعلّم الذكي متعلقة بدراستك. تكرار سوء الاستخدام قد يؤدي إلى إيقاف المعلّم الذكي لحسابك.',
    };
    const msg = message ?? fallback;
    const flag = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.ai_flags} WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [studentId]);
    await db.query(`INSERT INTO ${T.ai_warnings} (user_id, flag_id, message_en, message_ar, issued_by) VALUES ($1,$2,$3,$4,$5)`, [studentId, flag?.id ?? null, msg.en, msg.ar, admin.userId]);
    await notify({
      userId: studentId,
      templateType: 'support_message',
      channels: ['in_app', 'push'],
      notificationType: 'system',
      fallback: { title: { en: 'AI Tutor usage warning', ar: 'تنبيه حول استخدام المعلّم الذكي' }, body: msg },
      vars: { support_message: msg },
      link: '/tutor',
      target: { kind: 'tutor', id: null },
    });
    return (await this.flaggedUsersFor(studentId)) as ReturnType<typeof toFlaggedUser>;
  },
};

const SEV: Severity[] = ['low', 'medium', 'high'];
function toFlaggedUser(r: Row) {
  const rank = Number(r.highest_rank ?? 1);
  return {
    student: studentRef(r, 'st_') as StudentRef,
    flags: Number(r.flags ?? 0),
    open: Number(r.open ?? 0),
    highest: SEV.reduce<Severity>((acc, s, i) => (i + 1 === rank ? maxSeverity(acc, s) : acc), 'low'),
    last: (r.last as Date).toISOString(),
    aiDisabled: Boolean(r.ai_disabled),
    locked: r.user_status === 'locked',
    warned: !!r.warned_at,
    warnedAt: r.warned_at ? (r.warned_at as Date).toISOString() : null,
  };
}
export type FlaggedUserDto = ReturnType<typeof toFlaggedUser>;
