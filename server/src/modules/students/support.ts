/** Support tickets (ADM-SUP-01/02) — the users module owns them (permission users.*). PUB-10 creates them. */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { adminRef, studentRef } from '../../common/dto/refs.js';
import { NotFoundError } from '../../common/errors/index.js';
import { adminInbox } from '../../common/services/admin-inbox.js';
import { orderBy } from '../../common/utils/pagination.js';
import type { SupportTicketDto } from './types.js';

const SELECT = `
  SELECT t.*, u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.phone AS u_phone, u.avatar_url AS u_avatar_url,
         a.id AS a_id, a.name_en AS a_name_en, a.name_ar AS a_name_ar, a.avatar_url AS a_avatar_url
    FROM ${T.support_tickets} t
    LEFT JOIN ${T.users} u ON u.id = t.user_id
    LEFT JOIN ${T.users} a ON a.id = t.assignee_id`;

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
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

export const supportService = {
  async list(f: { status?: string; category?: string; priority?: string; q?: string; sort?: string; limit: number; offset: number }) {
    const w: string[] = [];
    const p: unknown[] = [];
    for (const k of ['status', 'category', 'priority'] as const) {
      if (f[k]) {
        p.push(f[k]);
        w.push(`t.${k} = $${p.length}`);
      }
    }
    if (f.q) {
      p.push(`%${f.q.toLowerCase()}%`);
      w.push(`(lower(t.subject_en) LIKE $${p.length} OR t.subject_ar LIKE $${p.length} OR lower(t.number) LIKE $${p.length} OR lower(coalesce(u.name_en,'')) LIKE $${p.length} OR coalesce(u.phone,'') LIKE $${p.length})`);
    }
    const where = w.length ? ` WHERE ${w.join(' AND ')}` : '';
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM (${SELECT}${where}) x`, p)) ?? 0;
    const order = orderBy(f.sort, { createdAt: 't.created_at', priority: 't.priority', status: 't.status', updatedAt: 't.updated_at' }, '-createdAt');
    const rows = await db.many<Record<string, unknown>>(`${SELECT}${where} ORDER BY ${order} LIMIT $${p.length + 1} OFFSET $${p.length + 2}`, [...p, f.limit, f.offset]);
    return { items: rows.map(toDto), total };
  },

  async get(number: string) {
    const r = await db.maybeOne<Record<string, unknown>>(`${SELECT} WHERE t.number = $1 OR t.id::text = $1`, [number]);
    if (!r) throw new NotFoundError('ticket');
    return toDto(r);
  },

  async update(number: string, patch: { status?: string; priority?: string; assigneeId?: string | null }) {
    const before = await this.get(number);
    const sets: string[] = [];
    const p: unknown[] = [number];
    if (patch.status) {
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
    if (sets.length) await db.query(`UPDATE ${T.support_tickets} SET ${sets.join(', ')} WHERE number = $1 OR id::text = $1`, p);
    return { before, after: await this.get(number) };
  },

  /** Creates a ticket (PUB-10 contact form / in-app) and notifies admins. Returns the EW-T-NNNNN number. */
  async create(input: { userId?: string | null; contactName?: string; contactValue?: string; subject: string; message: string; category: string; source: 'contact_form' | 'app' | 'admin'; locale?: string }) {
    const seq = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.support_tickets}`)) ?? 0;
    let number = `EW-T-${String(10001 + seq).padStart(5, '0')}`;
    for (let i = 0; (await db.scalar<number>(`SELECT count(*)::int FROM ${T.support_tickets} WHERE number = $1`, [number])) ?? 0; i++) number = `EW-T-${String(10001 + seq + i + 1).padStart(5, '0')}`;
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
      href: '/users',
      dedupeKey: `ticket:${row.number}`,
    });
    return { ticketId: row.number, createdAt: row.created_at.toISOString() };
  },
};
