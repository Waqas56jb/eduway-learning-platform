/** Notifications services: student inbox (NTF-01…05) + admin templates/campaigns/deliveries (ADM-NTT/CMP/DLV) + WHK-03. */
import { randomBytes } from 'node:crypto';
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { adminRef, studentRef, type StudentRef } from '../../common/dto/refs.js';
import { BusinessRuleError, ConflictError, NotFoundError, bulkItemError } from '../../common/errors/index.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { cursorPage, decodeCursor } from '../../common/utils/pagination.js';
import { enqueue } from '../../jobs/index.js';
import { buildAudienceCountQuery, buildAudienceQuery, type CampaignFilters } from './audience.js';
import { providerNameFor } from './channels.js';
import { dispatchQueued, refreshCampaign } from './dispatch.js';
import { notificationsRepo as repo, type InboxRow, type Row, type TemplateRow } from './repository.js';
import { categoryForType, extractVariables, inboxTypeFor, linkForType, NOTIF_CHANNELS, NOTIF_TYPES, renderTemplate, smsInfo, type NotifChannel } from './templates.js';
import { likeContains } from '../../common/utils/like.js';

type L = { en: string; ar: string };

// ── student ──────────────────────────────────────────────────────────────────────────────────────────
const TARGET_KINDS = ['lesson', 'subject', 'exams', 'exam_result', 'mistakes', 'subscription', 'notifications', 'progress', 'tutor', 'none'];

export function targetFromLink(link: string | null): { kind: string; id: string | null } {
  if (!link) return { kind: 'none', id: null };
  const m = /^\/(lesson|subject)\/([\w-]+)/.exec(link);
  if (m) return { kind: m[1] as string, id: m[2] as string };
  const r = /^\/exams\/result\/([\w-]+)/.exec(link);
  if (r) return { kind: 'exam_result', id: r[1] as string };
  const k = link.replace(/^\//, '').split(/[/?#]/)[0] ?? '';
  return { kind: TARGET_KINDS.includes(k) ? k : 'none', id: null };
}

export function toAppNotification(n: InboxRow) {
  const type = ['lesson', 'exam', 'payment', 'subscription'].includes(n.type) ? n.type : 'system';
  const target = n.data?.target && TARGET_KINDS.includes(n.data.target.kind) ? { kind: n.data.target.kind, id: n.data.target.id ?? null } : targetFromLink(n.link);
  return {
    id: n.id,
    type,
    title: { en: n.title_en, ar: n.title_ar },
    body: { en: n.body_en, ar: n.body_ar },
    date: n.created_at.toISOString(),
    read: n.read_at !== null,
    link: n.link,
    target,
  };
}

export const studentNotifications = {
  async list(userId: string, q: { filter?: string; cursor?: string; limit: number }) {
    const cursor = decodeCursor(q.cursor);
    const rows = await repo.inbox(userId, q.filter, cursor, q.limit);
    const page = cursorPage(rows, q.limit, (r) => [r.created_at, r.id]);
    const counts = await repo.inboxCounts(userId);
    return { items: page.items.map(toAppNotification), meta: { page: 1, pageSize: q.limit, total: counts[q.filter && q.filter in counts ? q.filter : 'all'] ?? 0, nextCursor: page.meta.nextCursor ?? null, unreadCount: counts.unread ?? 0, counts } };
  },
  unreadCount: async (userId: string) => ({ unreadCount: await repo.unreadCount(userId) }),
  async read(userId: string, id: string) {
    if (!(await repo.markRead(userId, id))) throw new NotFoundError('notification');
    return { id, read: true as const, unreadCount: await repo.unreadCount(userId) };
  },
  async readAll(userId: string) {
    const updated = await repo.markAllRead(userId);
    return { unreadCount: 0 as const, updated };
  },
  async remove(userId: string, id: string) {
    if (!(await repo.remove(userId, id))) throw new NotFoundError('notification');
    return { unreadCount: await repo.unreadCount(userId) };
  },
};

// ── templates ────────────────────────────────────────────────────────────────────────────────────────
export function toTemplateDto(t: TemplateRow) {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    channel: t.channel,
    subject: { en: t.subject_en, ar: t.subject_ar },
    body: { en: t.body_en, ar: t.body_ar },
    variables: t.variables?.length ? t.variables : extractVariables(t.subject_en, t.subject_ar, t.body_en, t.body_ar),
    active: t.active,
    updatedAt: t.updated_at.toISOString(),
    updatedBy: adminRef(t as unknown as Row, 'ub_'),
  };
}
export type TemplateDto = ReturnType<typeof toTemplateDto>;

export interface TemplateListQuery {
  type?: string[];
  channel?: string[];
  active?: boolean;
  q?: string;
  sort?: string;
  page: number;
  pageSize: number;
}

function templateWhere(q: Partial<TemplateListQuery>) {
  const params: unknown[] = [];
  const cond = ['TRUE'];
  if (q.type?.length) {
    params.push(q.type);
    cond.push(`t.type = ANY($${params.length}::text[])`);
  }
  if (q.channel?.length) {
    params.push(q.channel);
    cond.push(`t.channel = ANY($${params.length}::text[])`);
  }
  if (q.active !== undefined) {
    params.push(q.active);
    cond.push(`t.active = $${params.length}`);
  }
  if (q.q) {
    params.push(likeContains(q.q));
    const n = params.length;
    cond.push(`(t.name ILIKE $${n} OR t.body_en ILIKE $${n} OR t.body_ar ILIKE $${n} OR t.type ILIKE $${n} OR t.channel ILIKE $${n})`);
  }
  return { where: cond.join(' AND '), params };
}

const SYSTEM_TYPES = new Set(NOTIF_TYPES);

export const templatesService = {
  async list(q: Partial<TemplateListQuery>, order: string, limit: number, offset: number) {
    const { where, params } = templateWhere(q);
    const [{ rows, total }, matrixRows] = await Promise.all([repo.templates(where, params, order, limit, offset), repo.matrix()]);
    const matrix: Record<string, Record<string, { count: number; active: boolean }>> = {};
    for (const t of NOTIF_TYPES) matrix[t] = Object.fromEntries(NOTIF_CHANNELS.map((c) => [c, { count: 0, active: false }]));
    for (const m of matrixRows) {
      matrix[m.type] ??= {};
      (matrix[m.type] as Record<string, { count: number; active: boolean }>)[m.channel] = { count: m.count, active: m.active };
    }
    return { items: rows.map(toTemplateDto), total, matrix };
  },

  async get(id: string) {
    const t = await repo.template(id);
    if (!t) throw new NotFoundError('template');
    return toTemplateDto(t);
  },

  async create(b: { name: string; type: string; channel: string; active: boolean; subject: L; body: L }, admin: AdminPrincipal) {
    const id = await repo.insertTemplate({
      key: `${b.type}_${b.channel}_${randomBytes(4).toString('hex')}`,
      name: b.name,
      type: b.type,
      channel: b.channel,
      subject: b.subject,
      body: b.body,
      variables: extractVariables(b.subject.en, b.subject.ar, b.body.en, b.body.ar),
      active: b.active,
      by: admin.userId,
    });
    return this.get(id);
  },

  async update(id: string, b: Partial<{ name: string; type: string; channel: string; active: boolean; subject: L; body: L }>, admin: AdminPrincipal) {
    const cur = await repo.template(id);
    if (!cur) throw new NotFoundError('template');
    if (b.active === false && cur.active && SYSTEM_TYPES.has(cur.type as never) && !(await repo.otherActiveCount(id, cur.type, cur.channel))) {
      // Deactivating the last active system template is allowed but logged (jobs fall back to built-in texts).
      logger.warn({ templateId: id, type: cur.type, channel: cur.channel }, 'last active system template deactivated');
    }
    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) patch.name = b.name;
    if (b.type !== undefined) patch.type = b.type;
    if (b.channel !== undefined) patch.channel = b.channel;
    if (b.active !== undefined) patch.active = b.active;
    if (b.subject) {
      patch.subject_en = b.subject.en;
      patch.subject_ar = b.subject.ar;
    }
    if (b.body) {
      patch.body_en = b.body.en;
      patch.body_ar = b.body.ar;
    }
    const subj = b.subject ?? { en: cur.subject_en, ar: cur.subject_ar };
    const body = b.body ?? { en: cur.body_en, ar: cur.body_ar };
    patch.variables = extractVariables(subj.en, subj.ar, body.en, body.ar);
    await repo.updateTemplate(id, patch, admin.userId);
    return { before: toTemplateDto(cur), after: await this.get(id) };
  },

  async remove(id: string) {
    const cur = await repo.template(id);
    if (!cur) throw new NotFoundError('template');
    if (cur.active && SYSTEM_TYPES.has(cur.type as never) && !(await repo.otherActiveCount(id, cur.type, cur.channel))) {
      throw new ConflictError('HAS_DEPENDENTS', { count: 1, type: cur.type, channel: cur.channel });
    }
    await repo.deleteTemplate(id);
    return toTemplateDto(cur);
  },

  async duplicate(id: string, admin: AdminPrincipal) {
    const cur = await repo.template(id);
    if (!cur) throw new NotFoundError('template');
    return this.create({ name: `${cur.name} (copy)`, type: cur.type, channel: cur.channel, active: false, subject: { en: cur.subject_en, ar: cur.subject_ar }, body: { en: cur.body_en, ar: cur.body_ar } }, admin);
  },

  async bulk(ids: string[], action: 'activate' | 'deactivate' | 'delete', admin: AdminPrincipal) {
    const succeeded: string[] = [];
    const failed: { id: string; code: string; reason?: string; message: string }[] = [];
    for (const id of ids) {
      try {
        if (action === 'delete') await this.remove(id);
        else await this.update(id, { active: action === 'activate' }, admin);
        succeeded.push(id);
      } catch (err) {
        const e = err as { code?: string; reason?: string; message: string };
        failed.push({ id, ...bulkItemError(e) });
      }
    }
    return { succeeded, failed };
  },

  preview(b: { channel: NotifChannel; subject: L; body: L; lang: 'en' | 'ar' }, vars: Record<string, L>) {
    const body = renderTemplate(b.body[b.lang], vars, b.lang);
    return {
      subject: b.channel === 'sms' || b.channel === 'whatsapp' ? '' : renderTemplate(b.subject[b.lang], vars, b.lang),
      body,
      sms: b.channel === 'sms' || b.channel === 'whatsapp' ? smsInfo(body) : null,
    };
  },
};

// ── campaigns ────────────────────────────────────────────────────────────────────────────────────────
export function toCampaignDto(r: Row) {
  const live = r.d_total ? { queued: Number(r.d_queued), sent: Number(r.d_sent), delivered: Number(r.d_delivered), failed: Number(r.d_failed) } : null;
  const stored = (r.stats ?? {}) as Partial<Record<'queued' | 'sent' | 'delivered' | 'failed', number>>;
  const f = (r.audience_filters ?? {}) as Record<string, unknown>;
  const filters = {
    packageId: (f.packageId ?? f.package ?? null) as string | null,
    subjectId: (f.subjectId ?? f.subject ?? null) as string | null,
    governorateId: (f.governorateId ?? f.governorate ?? null) as string | null,
    schoolId: (f.schoolId ?? f.school ?? null) as string | null,
    inactiveDays: (f.inactiveDays ?? null) as number | null,
    platforms: (f.platforms ?? (Array.isArray(r.platforms) ? r.platforms : null)) as string[] | null,
    subscriptionStatus: (f.subscriptionStatus ?? null) as string | null,
  };
  return {
    id: String(r.id),
    name: String(r.name),
    channel: r.channel as NotifChannel,
    templateId: (r.template_id as string | null) ?? null,
    template: r.template_id ? { id: String(r.template_id), name: String(r.template_name ?? '') } : null,
    filters,
    audienceCount: Number(r.audience_count ?? 0),
    status: r.status as string,
    scheduledAt: r.scheduled_at ? (r.scheduled_at as Date).toISOString() : null,
    sentAt: r.sent_at ? (r.sent_at as Date).toISOString() : null,
    stats: live ?? { queued: stored.queued ?? 0, sent: stored.sent ?? 0, delivered: stored.delivered ?? 0, failed: stored.failed ?? 0 },
    createdBy: adminRef(r, 'cb_') ?? { id: '', name: { en: String(r.created_by_name ?? ''), ar: String(r.created_by_name ?? '') }, avatarUrl: null },
    createdAt: (r.created_at as Date).toISOString(),
  };
}
export type CampaignDto = ReturnType<typeof toCampaignDto>;

export interface CampaignListQuery {
  status?: string[];
  channel?: string[];
  q?: string;
  sort?: string;
  page: number;
  pageSize: number;
}

function campaignWhere(q: Partial<CampaignListQuery>) {
  const params: unknown[] = [];
  const cond = ['TRUE'];
  if (q.status?.length) {
    params.push(q.status);
    cond.push(`c.status = ANY($${params.length}::text[])`);
  }
  if (q.channel?.length) {
    params.push(q.channel);
    cond.push(`c.channel = ANY($${params.length}::text[])`);
  }
  if (q.q) {
    params.push(likeContains(q.q));
    cond.push(`c.name ILIKE $${params.length}`);
  }
  return { where: cond.join(' AND '), params };
}

async function audienceRows(filters: CampaignFilters, channel: NotifChannel, templateType: string | null) {
  const q = buildAudienceQuery(filters, channel, templateType);
  return db.many<{ user_id: string; name_en: string; name_ar: string; locale: string; email: string | null; phone: string | null; excluded: string | null }>(q.sql, q.params);
}

export const campaignsService = {
  async list(q: Partial<CampaignListQuery>, order: string, limit: number, offset: number) {
    const { where, params } = campaignWhere(q);
    const { rows, total } = await repo.campaigns(where, params, order, limit, offset);
    return { items: rows.map(toCampaignDto), total };
  },

  async get(id: string) {
    const r = await repo.campaign(id);
    if (!r) throw new NotFoundError('campaign');
    return toCampaignDto(r);
  },

  async preview(filters: CampaignFilters, channel: NotifChannel, templateType: string | null = null) {
    const q = buildAudienceCountQuery(filters, channel, templateType);
    const r = await db.one<{ matched: number; reachable: number; no_email: number; no_push: number; opted_out: number; locked: number; total: number }>(q.sql, q.params);
    return { matched: r.matched, reachable: r.reachable, total: r.total, excluded: { noEmail: r.no_email, noPushToken: r.no_push, optedOut: r.opted_out, locked: r.locked } };
  },

  async create(b: { name: string; channel: NotifChannel; templateId: string; filters: CampaignFilters; sendAt: string | null; draft?: boolean }, admin: AdminPrincipal) {
    const template = await repo.template(b.templateId);
    if (!template) throw new NotFoundError('template');
    if (!template.active) throw new BusinessRuleError('TEMPLATE_INACTIVE');
    if (template.channel !== b.channel && !(b.channel === 'push' && template.channel === 'in_app') && !(b.channel === 'in_app' && template.channel === 'push')) {
      throw new BusinessRuleError('TEMPLATE_CHANNEL_MISMATCH', { templateChannel: template.channel });
    }
    const sendAt = b.sendAt ? new Date(b.sendAt) : null;
    if (sendAt && sendAt.getTime() <= Date.now()) throw new BusinessRuleError('SEND_AT_IN_PAST');
    const counts = await this.preview(b.filters, b.channel, template.type);
    if (!b.draft && counts.reachable === 0) throw new BusinessRuleError('NO_RECIPIENTS', { audience: counts });
    const status = b.draft ? 'draft' : sendAt ? 'scheduled' : 'sending';
    const id = await repo.insertCampaign({
      name: b.name,
      channel: b.channel,
      templateId: b.templateId,
      template,
      filters: { ...b.filters },
      platforms: b.filters.platforms?.length ? b.filters.platforms : ['web', 'ios', 'android'],
      audienceCount: counts.reachable,
      status,
      scheduledAt: sendAt,
      by: admin.userId,
      byName: admin.name,
    });
    if (status === 'sending') await this.launch(id);
    return { dto: await this.get(id), action: status === 'scheduled' ? 'campaign.schedule' : status === 'draft' ? 'campaign.draft' : 'campaign.send' };
  },

  /** Materialize inbox rows + deliveries for a `sending` campaign and queue the dispatcher. */
  async launch(id: string): Promise<number> {
    const c = await db.maybeOne<{ id: string; channel: NotifChannel; template_id: string | null; audience_filters: CampaignFilters; status: string; title_en: string; title_ar: string; body_en: string; body_ar: string }>(
      `SELECT id, channel, template_id, audience_filters, status, title_en, title_ar, body_en, body_ar FROM ${T.campaigns} WHERE id = $1`,
      [id],
    );
    if (!c || c.status !== 'sending') return 0;
    const already = await db.scalar<number>(`SELECT count(*)::int FROM ${T.notification_deliveries} WHERE campaign_id = $1`, [id]);
    if (already) {
      void enqueue('eduway.notification-dispatch', { campaignId: id }).catch(() => undefined);
      return already;
    }
    const tpl = c.template_id ? await repo.template(c.template_id) : null;
    const type = tpl?.type ?? 'general';
    const subject = { en: tpl?.subject_en ?? c.title_en, ar: tpl?.subject_ar ?? c.title_ar };
    const body = { en: tpl?.body_en ?? c.body_en, ar: tpl?.body_ar ?? c.body_ar };
    const recipients = (await audienceRows(c.audience_filters ?? {}, c.channel, type)).filter((r) => r.excluded === null);
    const def = linkForType(type);
    const platforms = (c.audience_filters?.platforms?.length ? c.audience_filters.platforms : ['ios', 'android']).filter((p) => p !== 'web');
    const provider = providerNameFor(c.channel);
    let n = 0;
    for (let i = 0; i < recipients.length; i += 200) {
      const chunk = recipients.slice(i, i + 200);
      n += await tx(async (cx) => {
      let k = 0;
      for (const r of chunk) {
        const lang = r.locale === 'en' ? 'en' : 'ar';
        const vars = { student_name: { en: r.name_en, ar: r.name_ar || r.name_en } };
        const title = { en: renderTemplate(subject.en, vars, 'en'), ar: renderTemplate(subject.ar, vars, 'ar') };
        const text = { en: renderTemplate(body.en, vars, 'en'), ar: renderTemplate(body.ar, vars, 'ar') };
        let notificationId: string | null = null;
        if (c.channel === 'in_app' || c.channel === 'push') {
          notificationId = (
            await db.one<{ id: string }>(
              `INSERT INTO ${T.notifications} (user_id, type, title_en, title_ar, body_en, body_ar, link, data, campaign_id, template_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING id`,
              [r.user_id, inboxTypeFor(type), title.en || title.ar, title.ar || title.en, text.en, text.ar, def.link, JSON.stringify({ target: def.target }), id, c.template_id],
              cx,
            )
          ).id;
        }
        const payload = { title: title[lang], subject: title[lang], body: text[lang], data: { link: def.link, target: def.target, notificationId, campaignId: id } };
        const ins = (recipient: string | null, platform: string | null, status: 'queued' | 'delivered') =>
          db.query(
            `INSERT INTO ${T.notification_deliveries} (notification_id, campaign_id, template_id, user_id, channel, provider, recipient, status, platform, payload, sent_at, delivered_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb, CASE WHEN $8 = 'delivered' THEN now() END, CASE WHEN $8 = 'delivered' THEN now() END)`,
            [notificationId, id, c.template_id, r.user_id, c.channel, provider, recipient, status, platform, JSON.stringify(payload)],
            cx,
          );
        if (c.channel === 'in_app') await ins(null, null, 'delivered');
        else if (c.channel === 'push') {
          const tokens = await db.many<{ token: string; platform: string }>(
            `SELECT token, platform::text AS platform FROM ${T.push_tokens} WHERE user_id = $1 AND revoked_at IS NULL AND platform::text = ANY($2::text[])`,
            [r.user_id, platforms],
            cx,
          );
          for (const t of tokens) await ins(t.token, t.platform, 'queued');
        } else if (c.channel === 'email') await ins(r.email, null, 'queued');
        else await ins(r.phone, null, 'queued');
        k++;
      }
      return k;
      });
    }
    await db.query(`UPDATE ${T.campaigns} SET audience_count = $2, updated_at = now() WHERE id = $1`, [id, n]);
    await refreshCampaign(id);
    void enqueue('eduway.notification-dispatch', { campaignId: id }).catch((err: Error) => logger.warn({ err: err.message }, 'dispatch enqueue failed'));
    return n;
  },

  async cancel(id: string) {
    const cur = await db.maybeOne<{ status: string }>(`SELECT status FROM ${T.campaigns} WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundError('campaign');
    if (cur.status !== 'scheduled') throw new BusinessRuleError('CAMPAIGN_NOT_SCHEDULED', { status: cur.status });
    await db.query(`UPDATE ${T.campaigns} SET status = 'draft', scheduled_at = NULL, cancelled_at = now(), updated_at = now() WHERE id = $1`, [id]);
    return this.get(id);
  },

  /** Cron `eduway.campaign-scheduled-send`: launch due scheduled campaigns. */
  async sendDue(): Promise<number> {
    const due = await repo.claimDueCampaigns();
    for (const c of due) {
      try {
        await this.launch(c.id);
      } catch (err) {
        logger.error({ err: (err as Error).message, campaignId: c.id }, 'scheduled campaign launch failed');
        await db.query(`UPDATE ${T.campaigns} SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [c.id, (err as Error).message.slice(0, 500)]);
      }
    }
    return due.length;
  },
};

// ── deliveries ───────────────────────────────────────────────────────────────────────────────────────
export interface DeliveryQuery {
  channel?: string[];
  status?: string[];
  provider?: string[];
  campaignId?: string;
  templateId?: string;
  studentId?: string;
  from?: string;
  to?: string;
  q?: string;
  sort?: string;
  page: number;
  pageSize: number;
}

export function deliveryWhere(q: Partial<DeliveryQuery>, opts: { ignoreStatus?: boolean } = {}) {
  const params: unknown[] = [];
  const cond = ['TRUE'];
  const add = (sql: (n: string) => string, v: unknown) => {
    params.push(v);
    cond.push(sql(`$${params.length}`));
  };
  if (q.channel?.length) add((n) => `d.channel = ANY(${n}::text[])`, q.channel);
  if (q.status?.length && !opts.ignoreStatus) add((n) => `d.status = ANY(${n}::text[])`, q.status);
  if (q.provider?.length) add((n) => `d.provider = ANY(${n}::text[])`, q.provider);
  if (q.campaignId) add((n) => `d.campaign_id = ${n}::uuid`, q.campaignId);
  if (q.templateId) add((n) => `d.template_id = ${n}::uuid`, q.templateId);
  if (q.studentId) add((n) => `d.user_id = ${n}::uuid`, q.studentId);
  if (q.from) add((n) => `d.created_at >= ${n}::timestamptz`, q.from);
  if (q.to) add((n) => `d.created_at <= ${n}::timestamptz`, q.to);
  if (q.q) add((n) => `(d.id::text ILIKE ${n} OR u.name_en ILIKE ${n} OR u.name_ar ILIKE ${n} OR u.phone ILIKE ${n} OR d.provider ILIKE ${n} OR d.error ILIKE ${n})`, likeContains(q.q));
  return { where: cond.join(' AND '), params };
}

export function toDeliveryDto(r: Row) {
  return {
    id: String(r.id),
    campaignId: (r.campaign_id as string | null) ?? null,
    template: r.template_id ? { id: String(r.template_id), name: String(r.template_name ?? '') } : null,
    recipient: (studentRef(r, 'st_') ?? { id: '', name: { en: '', ar: '' }, mobile: '', avatarUrl: null }) as StudentRef,
    channel: r.channel as NotifChannel,
    provider: String(r.provider ?? ''),
    status: r.status as string,
    error: (r.error as string | null) ?? null,
    attempts: Number(r.attempts ?? 0),
    platform: (r.platform as string | null) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}
export type DeliveryDto = ReturnType<typeof toDeliveryDto>;

export const deliveriesService = {
  async list(q: Partial<DeliveryQuery>, order: string, limit: number, offset: number) {
    const { where, params } = deliveryWhere(q);
    const [rows, total] = await Promise.all([
      db.many<Row>(`${repo.deliverySelect()} WHERE ${where} ORDER BY ${order}, d.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
      db.scalar<number>(`SELECT count(*)::int FROM ${T.notification_deliveries} d LEFT JOIN ${T.users} u ON u.id = d.user_id WHERE ${where}`, params),
    ]);
    return { items: rows.map(toDeliveryDto), total: total ?? 0 };
  },

  async stats(q: Partial<DeliveryQuery>) {
    const { where, params } = deliveryWhere(q, { ignoreStatus: true });
    const rows = await db.many<{ provider: string; channel: NotifChannel; total: number; delivered: number; failed: number; queued: number }>(
      `SELECT d.provider, d.channel, count(*)::int AS total, count(*) FILTER (WHERE d.status IN ('sent', 'delivered'))::int AS delivered,
              count(*) FILTER (WHERE d.status = 'failed')::int AS failed, count(*) FILTER (WHERE d.status = 'queued')::int AS queued
         FROM ${T.notification_deliveries} d LEFT JOIN ${T.users} u ON u.id = d.user_id
        WHERE ${where} GROUP BY d.provider, d.channel ORDER BY total DESC`,
      params,
    );
    const rate = (ok: number, failed: number) => (ok + failed === 0 ? 0 : Math.round((ok / (ok + failed)) * 1000) / 10);
    const sum = (k: 'total' | 'delivered' | 'failed' | 'queued') => rows.reduce((s, r) => s + r[k], 0);
    return {
      total: sum('total'),
      delivered: sum('delivered'),
      failed: sum('failed'),
      queued: sum('queued'),
      rate: rate(sum('delivered'), sum('failed')),
      byProvider: rows.map((r) => ({ provider: r.provider || providerNameFor(r.channel), channel: r.channel, total: r.total, delivered: r.delivered, failed: r.failed, rate: rate(r.delivered, r.failed) })),
    };
  },

  async retry(b: { ids?: string[]; filter?: Record<string, unknown> }) {
    let ids = b.ids ?? [];
    if (!ids.length && b.filter) {
      const { where, params } = deliveryWhere({ ...(b.filter as Partial<DeliveryQuery>), status: ['failed'] });
      ids = (await db.many<{ id: string }>(`SELECT d.id FROM ${T.notification_deliveries} d LEFT JOIN ${T.users} u ON u.id = d.user_id WHERE ${where} LIMIT 5000`, params)).map((r) => r.id);
    }
    const rows = ids.length ? await db.many<{ id: string; status: string }>(`SELECT id, status FROM ${T.notification_deliveries} WHERE id = ANY($1::uuid[])`, [ids]) : [];
    const found = new Map(rows.map((r) => [r.id, r.status]));
    const succeeded: string[] = [];
    const failed: { id: string; code: string; reason?: string; message: string }[] = [];
    for (const id of ids) {
      const st = found.get(id);
      if (!st) failed.push({ id, code: 'NOT_FOUND', message: 'delivery not found' });
      else if (st !== 'failed') failed.push({ id, code: 'BUSINESS_RULE', reason: 'INVALID_TRANSITION', message: `delivery is ${st}` });
      else succeeded.push(id);
    }
    if (succeeded.length) {
      await db.query(
        `UPDATE ${T.notification_deliveries} SET status = 'queued', error = NULL, attempts = 0, next_attempt_at = NULL, updated_at = now() WHERE id = ANY($1::uuid[]) AND status = 'failed'`,
        [succeeded],
      );
      const campaigns = await db.many<{ campaign_id: string }>(`SELECT DISTINCT campaign_id FROM ${T.notification_deliveries} WHERE id = ANY($1::uuid[]) AND campaign_id IS NOT NULL`, [succeeded]);
      for (const c of campaigns) await db.query(`UPDATE ${T.campaigns} SET status = 'sending' WHERE id = $1 AND status IN ('sent', 'failed')`, [c.campaign_id]);
      void enqueue('eduway.notification-dispatch', { ids: succeeded }).catch(() => undefined);
    }
    return { succeeded, failed };
  },

  /** WHK-03 delivery receipts. Accepts one event or an array: { messageId|providerMessageId|deliveryId, status, error? }. */
  async receipt(provider: string, events: { messageId?: string; providerMessageId?: string; deliveryId?: string; status: 'sent' | 'delivered' | 'failed'; error?: string }[]) {
    let updated = 0;
    const campaigns = new Set<string>();
    for (const e of events) {
      const pid = e.providerMessageId ?? e.messageId ?? null;
      const rows = await db.many<{ campaign_id: string | null }>(
        `UPDATE ${T.notification_deliveries} SET status = $3, error = $4, delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE delivered_at END, updated_at = now()
          WHERE (($1::text IS NOT NULL AND provider_message_id = $1) OR ($2::uuid IS NOT NULL AND id = $2)) AND status <> 'delivered'
            AND (provider = $5 OR left(provider, length($5) + 1) = $5 || '-')
          RETURNING campaign_id`,
        // SEC-25: a receipt posted to /webhooks/notifications/:provider only touches deliveries of that provider
        // (`twilio` also matches `twilio-whatsapp`).
        [pid, e.deliveryId ?? null, e.status, e.status === 'failed' ? (e.error ?? 'failed').slice(0, 500) : null, provider],
      );
      updated += rows.length;
      for (const r of rows) if (r.campaign_id) campaigns.add(r.campaign_id);
    }
    for (const c of campaigns) await refreshCampaign(c);
    logger.info({ provider, events: events.length, updated }, 'notification delivery receipts');
    return { received: true as const, updated };
  },

  dispatchNow: dispatchQueued,
};

export const notificationTypes = { NOTIF_TYPES, NOTIF_CHANNELS, categoryForType };
