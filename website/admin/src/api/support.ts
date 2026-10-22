/* Admin support tickets (contract §19: ADM-SUP-01…06). Tickets come from the public contact form (PUB-10),
 * the student apps and admins. Permission: users.view / users.edit / users.delete / users.export. */
import { api, type Query } from './client';
import { qk } from './keys';
import { useApiMutation, useApiQuery } from './hooks';
import type { AdminRef, ID, ISODate, Localized, OkDto, PageMeta, Paged, StudentRef } from './types';

export type TicketStatus = 'open' | 'pending' | 'resolved';
export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketCategory = 'payment' | 'access' | 'video' | 'content' | 'account';
export type TicketSource = 'contact_form' | 'app' | 'admin';

export const TICKET_STATUSES: TicketStatus[] = ['open', 'pending', 'resolved'];
export const TICKET_PRIORITIES: TicketPriority[] = ['high', 'medium', 'low'];
export const TICKET_CATEGORIES: TicketCategory[] = ['payment', 'access', 'video', 'content', 'account'];
export const TICKET_SOURCES: TicketSource[] = ['contact_form', 'app', 'admin'];

export interface SupportTicketDto {
  /** Ticket number `EW-T-NNNNN`. */
  id: string;
  student: StudentRef | null;
  contact: { name: string; contact: string } | null;
  subject: Localized;
  message: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignee: AdminRef | null;
  source: TicketSource;
  locale: 'en' | 'ar';
  replies: number;
  resolvedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface SupportTicketMessageDto {
  id: ID;
  authorKind: 'student' | 'admin' | 'system';
  author: AdminRef | null;
  body: string;
  createdAt: ISODate;
}

export interface SupportTicketDetailDto extends SupportTicketDto {
  messages: SupportTicketMessageDto[];
}

export type TicketCounts = Record<TicketStatus, number>;
export type TicketsPage = Paged<SupportTicketDto> & { counts: TicketCounts };

export interface TicketPatch {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: ID | null;
}

export const supportApi = {
  list: async (p: Query): Promise<TicketsPage> => {
    const r = await api.list<SupportTicketDto>('/admin/support-tickets', p);
    const m = r.meta as PageMeta & { counts?: Partial<TicketCounts> };
    return { ...r, counts: { open: m.counts?.open ?? 0, pending: m.counts?.pending ?? 0, resolved: m.counts?.resolved ?? 0 } };
  },
  get: (id: string) => api.get<SupportTicketDetailDto>(`/admin/support-tickets/${encodeURIComponent(id)}`),
  update: (id: string, body: TicketPatch) => api.patch<SupportTicketDto>(`/admin/support-tickets/${encodeURIComponent(id)}`, body),
  reply: (id: string, body: { body: string; status?: TicketStatus }) =>
    api.post<SupportTicketDetailDto>(`/admin/support-tickets/${encodeURIComponent(id)}/replies`, body),
  remove: (id: string) => api.delete<OkDto>(`/admin/support-tickets/${encodeURIComponent(id)}`),
};

// ─── hooks ───────────────────────────────────────────────────────────────────
export const useSupportTicket = (id?: string | null) =>
  useApiQuery(qk.support.detail(id), () => supportApi.get(id!), { enabled: !!id });

/** Mutations shared by the list and the ticket drawer; every write refreshes lists, the open ticket and the dashboard counts. */
export function useTicketMutations() {
  const invalidate = [qk.support.all, qk.dashboard.all, qk.students.all];
  return {
    update: useApiMutation((v: { id: string; patch: TicketPatch }) => supportApi.update(v.id, v.patch), { invalidate, success: 'toast.saved' }),
    reply: useApiMutation((v: { id: string; body: string; status?: TicketStatus }) => supportApi.reply(v.id, { body: v.body, status: v.status }), {
      invalidate,
      success: 'support.toast.replied',
    }),
    remove: useApiMutation((id: string) => supportApi.remove(id), { invalidate, success: 'support.toast.deleted' }),
  };
}
