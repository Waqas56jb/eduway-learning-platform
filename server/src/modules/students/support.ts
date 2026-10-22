/** Support tickets (ADM-SUP-01…06) — the users module owns them (permission users.*). PUB-10 creates them. */
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { adminRef, studentRef } from '../../common/dto/refs.js';
import { NotFoundError, ValidationError } from '../../common/errors/index.js';
import { adminInbox } from '../../common/services/admin-inbox.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { orderBy } from '../../common/utils/pagination.js';
import { notify } from '../notifications/notify.js';
import { emailStudent, userUrl } from '../notifications/email/recipients.js';
import { isEmailAddress, queueEmail } from '../notifications/email/send.js';
import type { SupportTicketDetailDto, SupportTicketDto, SupportTicketMessageDto } from './types.js';
import { likeContains } from '../../common/utils/like.js';

const SELECT = `
  SELECT t.*, u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.phone AS u_phone, u.avatar_url AS u_avatar_url,
         a.id AS a_id, a.name_en AS a_name_en, a.name_ar AS a_name_ar, a.avatar_url AS a_avatar_url,
         (SELECT count(*)::int FROM ${T.support_ticket_messages} m WHERE m.ticket_id = t.id AND m.author_kind = 'admin') AS replies
    FROM ${T.support_tickets} t
    LEFT JOIN ${T.users} u ON u.id = t.user_id
    LEFT JOIN ${T.users} a ON a.id = t.assignee_id`;

const SORT = { createdAt: 't.created_at', priority: "array_position(ARRAY['low','medium','high']::text[], t.priority)", status: 't.status', updatedAt: 't.updated_at', number: 't.number' };

export type TicketStatus = SupportTicketDto['status'];
export interface TicketFilter {
  status?: string;
  category?: string;
  priority?: string;
  source?: string;
  assigneeId?: string;
  studentId?: string;
  q?: string;
  ids?: string[];
}

function toDto(r: Record<string, unknown>): SupportTicketDto {
  return {
    id: String(r.number),
    student: studentRef(r, 'u_'),
    contact: r.contact_name || r.contact_value ? { name: String(r.contact_name ?? ''), contact: String(r.contact_value ?? '') } : null,
    subject: { en: String(r.subject_en), ar: String(r.subject_ar || r.subject_en) },
    message: String(r.message ?? ''),
    category: (r.category === 'other' ? 'account' : r.category) as SupportTicketDto['category'],
    priority: r.priority as SupportTicketDto['priority'],
    status: r.status as SupportTicketDto['status'],
    assignee: adminRef(r, 'a_'),
    source: r.source as SupportTicketDto['source'],
    locale: r.locale === 'en' ? 'en' : 'ar',
    replies: Number(r.replies ?? 0),
    resolvedAt: r.resolved_at ? (r.resolved_at as Date).toISOString() : null,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

function where(f: TicketFilter, opts: { ignoreStatus?: boolean } = {}) {
  const w: string[] = [];
  const p: unknown[] = [];
  const add = (sql: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(sql(`$${p.length}`));
  };
  if (f.status && !opts.ignoreStatus) add((n) => `t.status = ${n}`, f.status);
  // 'account' in the API also covers the legacy 'other' storage value.
  if (f.category) add((n) => (f.category === 'account' ? `t.category IN (${n}, 'other')` : `t.category = ${n}`), f.category);
  if (f.priority) add((n) => `t.priority = ${n}`, f.priority);
  if (f.source) add((n) => `t.source = ${n}`, f.source);
  if (f.assigneeId === '__none') w.push('t.assignee_id IS NULL');
  else if (f.assigneeId) add((n) => `t.assignee_id = ${n}::uuid`, f.assigneeId);
  if (f.studentId) add((n) => `t.user_id = ${n}::uuid`, f.studentId);
  if (f.ids?.length) add((n) => `(t.number = ANY(${n}::text[]) OR t.id::text = ANY(${n}::text[]))`, f.ids);
  if (f.q) {
    add(
      (n) =>
        `(lower(t.subject_en) LIKE ${n} OR t.subject_ar LIKE ${n} OR lower(t.number) LIKE ${n} OR lower(t.message) LIKE ${n}
          OR lower(coalesce(u.name_en,'')) LIKE ${n} OR coalesce(u.name_ar,'') LIKE ${n} OR coalesce(u.phone,'') LIKE ${n}
          OR lower(coalesce(t.contact_name,'')) LIKE ${n} OR lower(coalesce(t.contact_value,'')) LIKE ${n})`,
      likeContains(f.q.toLowerCase()),
    );
  }
  return { sql: w.length ? ` WHERE ${w.join(' AND ')}` : '', params: p };
}

async function resolveRowId(idOrNumber: string): Promise<{ id: string; number: string; user_id: string | null; status: string; locale: string }> {
  const r = await db.maybeOne<{ id: string; number: string; user_id: string | null; status: string; locale: string }>(
    `SELECT id, number, user_id, status, locale FROM ${T.support_tickets} WHERE number = $1 OR id::text = $1`,
    [idOrNumber],
  );
  if (!r) throw new NotFoundError('ticket');
  return r;
}

export const supportService = {
  sortKeys: SORT,

  async list(f: TicketFilter & { sort?: string; limit: number; offset: number }) {
    const w = where(f);
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.support_tickets} t LEFT JOIN ${T.users} u ON u.id = t.user_id${w.sql}`, w.params)) ?? 0;
    const order = orderBy(f.sort, SORT, '-createdAt');
    const rows = await db.many<Record<string, unknown>>(`${SELECT}${w.sql} ORDER BY ${order}, t.number DESC LIMIT $${w.params.length + 1} OFFSET $${w.params.length + 2}`, [
      ...w.params,
      f.limit,
      f.offset,
    ]);
    // Status tab counts for the same filters (status itself ignored).
    const cw = where(f, { ignoreStatus: true });
    const c = await db.many<{ status: TicketStatus; n: number }>(
      `SELECT t.status, count(*)::int AS n FROM ${T.support_tickets} t LEFT JOIN ${T.users} u ON u.id = t.user_id${cw.sql} GROUP BY t.status`,
      cw.params,
    );
    const counts = { open: 0, pending: 0, resolved: 0 } as Record<TicketStatus, number>;
    for (const r of c) counts[r.status] = r.n;
    return { items: rows.map(toDto), total, counts };
  },

  async get(idOrNumber: string) {
    const r = await db.maybeOne<Record<string, unknown>>(`${SELECT} WHERE t.number = $1 OR t.id::text = $1`, [idOrNumber]);
    if (!r) throw new NotFoundError('ticket');
    return toDto(r);
  },

  /** Ticket + conversation thread (ADM-SUP-03). */
  async detail(idOrNumber: string): Promise<SupportTicketDetailDto> {
    const r = await db.maybeOne<Record<string, unknown>>(`${SELECT} WHERE t.number = $1 OR t.id::text = $1`, [idOrNumber]);
    if (!r) throw new NotFoundError('ticket');
    const msgs = await db.many<Record<string, unknown>>(
      `SELECT m.id, m.author_kind, m.body, m.created_at, au.id AS au_id, au.name_en AS au_name_en, au.name_ar AS au_name_ar, au.avatar_url AS au_avatar_url
         FROM ${T.support_ticket_messages} m LEFT JOIN ${T.users} au ON au.id = m.author_id
        WHERE m.ticket_id = $1 ORDER BY m.created_at, m.id`,
      [r.id],
    );
    const messages: SupportTicketMessageDto[] = msgs.map((m) => ({
      id: String(m.id),
      authorKind: m.author_kind as SupportTicketMessageDto['authorKind'],
      author: adminRef(m, 'au_'),
      body: String(m.body),
      createdAt: (m.created_at as Date).toISOString(),
    }));
    return { ...toDto(r), messages };
  },

  async update(idOrNumber: string, patch: { status?: string; priority?: string; assigneeId?: string | null }) {
    const before = await this.get(idOrNumber);
    if (patch.assigneeId) {
      const ok = await db.scalar<number>(`SELECT count(*)::int FROM ${T.users} WHERE id = $1 AND kind = 'admin' AND deleted_at IS NULL`, [patch.assigneeId]);
      if (!ok) throw new ValidationError([{ path: 'assigneeId', message: 'Assignee must be an admin user' }]);
    }
    const sets: string[] = [];
    const p: unknown[] = [idOrNumber];
    if (patch.status && patch.status !== before.status) {
      p.push(patch.status);
      sets.push(`status = $${p.length}`, `resolved_at = CASE WHEN $${p.length} = 'resolved' THEN now() ELSE NULL END`);
    }
    if (patch.priority) {
      p.push(patch.priority);
      sets.push(`priority = $${p.length}`);
    }
    if (patch.assigneeId !== undefined) {
      p.push(patch.assigneeId);
      sets.push(`assignee_id = $${p.length}`);
    }
    if (sets.length) await db.query(`UPDATE ${T.support_tickets} SET ${sets.join(', ')}, updated_at = now() WHERE number = $1 OR id::text = $1`, p);
    return { before, after: await this.get(idOrNumber) };
  },

  /**
   * Admin reply (ADM-SUP-04): appends an `admin` message, moves the ticket to `status` (default: `pending` =
   * waiting for the student, unless it is already resolved and no status is given) and notifies a registered
   * student in-app + push + email (confirmed address only). Contact-form tickets have no account: when the contact
   * on the ticket is an email address the reply is emailed to it; otherwise the agent answers through the contact
   * channel shown on the ticket (phone).
   */
  async reply(idOrNumber: string, admin: AdminPrincipal, input: { body: string; status?: TicketStatus }) {
    const row = await resolveRowId(idOrNumber);
    const before = await this.get(row.number);
    const next: TicketStatus = input.status ?? (before.status === 'resolved' ? 'resolved' : 'pending');
    await tx(async (c) => {
      await c.query(`INSERT INTO ${T.support_ticket_messages} (ticket_id, author_id, author_kind, body) VALUES ($1, $2, 'admin', $3)`, [row.id, admin.userId, input.body]);
      await c.query(
        `UPDATE ${T.support_tickets}
            SET status = $2, resolved_at = CASE WHEN $2 = 'resolved' THEN coalesce(resolved_at, now()) ELSE NULL END,
                assignee_id = coalesce(assignee_id, $3), updated_at = now()
          WHERE id = $1`,
        [row.id, next, admin.userId],
      );
    });
    let notified = false;
    if (row.user_id) {
      const r = await notify({
        userId: row.user_id,
        templateType: 'support_message',
        channels: ['in_app', 'push'],
        notificationType: 'system',
        fallback: {
          title: { en: `Reply to your ticket ${row.number}`, ar: `رد على تذكرتك ${row.number}` },
          body: { en: input.body, ar: input.body },
        },
        vars: { support_message: { en: input.body, ar: input.body }, ticket_id: row.number },
        target: { kind: 'support_ticket', id: row.number },
      });
      notified = !!r.notificationId || r.deliveryIds.length > 0;
      const emailed = await emailStudent(
        row.user_id,
        'support_reply',
        { ticket: row.number, subject: before.subject, message: input.body, link: userUrl('/student/notifications') },
      );
      notified = notified || !!emailed;
    } else if (before.contact && isEmailAddress(before.contact.contact)) {
      const name = before.contact.name || '';
      const emailed = await queueEmail({
        to: before.contact.contact,
        template: 'support_reply',
        vars: { name: { en: name, ar: name }, ticket: row.number, subject: before.subject, message: input.body },
        lang: before.locale,
      });
      notified = !!emailed;
    }
    const after = await this.detail(row.number);
    return { before, after, notified };
  },

  /** Hard delete (ADM-SUP-05) — messages cascade. */
  async remove(idOrNumber: string) {
    const before = await this.get(idOrNumber);
    await tx(async (c) => {
      await c.query(`DELETE FROM ${T.support_tickets} WHERE number = $1`, [before.id]);
      // The "new ticket" inbox items point at a ticket that no longer exists.
      await c.query(`DELETE FROM ${T.admin_notifications} WHERE dedupe_key = $1`, [`ticket:${before.id}`]);
    });
    return before;
  },

  /** Rows for ADM-SUP-06 export. */
  async exportRows(f: TicketFilter & { sort?: string }) {
    const w = where(f);
    const rows = await db.many<Record<string, unknown>>(`${SELECT}${w.sql} ORDER BY ${orderBy(f.sort, SORT, '-createdAt')} LIMIT 50000`, w.params);
    return rows.map(toDto);
  },

  /** Creates a ticket (PUB-10 contact form / in-app) and notifies admins. Returns the EW-T-NNNNN number. */
  async create(input: { userId?: string | null; contactName?: string; contactValue?: string; subject: string; message: string; category: string; source: 'contact_form' | 'app' | 'admin'; locale?: string }) {
    // Next number after the highest one (never reuses the number of a deleted ticket); retried on a unique clash.
    const last = (await db.scalar<number>(`SELECT coalesce(max(substring(number FROM 6)::int), 10000) FROM ${T.support_tickets} WHERE number ~ '^EW-T-[0-9]+$'`)) ?? 10000;
    let number = `EW-T-${String(last + 1).padStart(5, '0')}`;
    for (let i = 1; (await db.scalar<number>(`SELECT count(*)::int FROM ${T.support_tickets} WHERE number = $1`, [number])) ?? 0; i++) number = `EW-T-${String(last + 1 + i).padStart(5, '0')}`;
    const row = await db.one<{ number: string; created_at: Date }>(
      `INSERT INTO ${T.support_tickets} (number, user_id, subject_en, subject_ar, message, category, source, contact_name, contact_value, locale)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9) RETURNING number, created_at`,
      [number, input.userId ?? null, input.subject, input.message, input.category, input.source, input.contactName ?? null, input.contactValue ?? null, input.locale ?? 'ar'],
    );
    await adminInbox.notify({
      permission: 'users.view',
      kind: 'info',
      category: 'support',
      title: { en: `New support ticket ${row.number}`, ar: `تذكرة دعم جديدة ${row.number}` },
      body: { en: input.subject, ar: input.subject },
      href: `/support?ticket=${encodeURIComponent(row.number)}`,
      dedupeKey: `ticket:${row.number}`,
    });
    return { ticketId: row.number, createdAt: row.created_at.toISOString() };
  },
};
