import type { Request, Response } from 'express';
import type { ExportColumn, ExportRequest } from '../../common/services/exporter.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import { sendTableExport } from '../commerce/lib.js';
import { emailSubscriptionActivated, subscriptionEngine } from './engine.js';
import type { SubscriptionListQuery } from './schemas.js';
import { subscriptionsService, type AdminSubscriptionDto } from './service.js';

const COLUMNS: ExportColumn<AdminSubscriptionDto>[] = [
  { key: 'student', header: 'student', value: (r) => r.student.name.en },
  { key: 'mobile', header: 'mobile', value: (r) => r.student.mobile },
  { key: 'package', header: 'package', value: (r) => r.package.name.en },
  { key: 'cycle', header: 'cycle', value: (r) => r.cycle },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'source', header: 'source', value: (r) => r.source },
  { key: 'startedAt', header: 'started_at', value: (r) => r.startedAt },
  { key: 'endsAt', header: 'ends_at', value: (r) => r.endsAt },
  { key: 'cancelledAt', header: 'cancelled_at', value: (r) => r.cancelledAt },
];

const actorOf = (a: AdminPrincipal) => ({ id: a.userId, name: a.name });

export const subscriptionsController = {
  async list(q: SubscriptionListQuery) {
    const p = toPagination(q);
    const r = await subscriptionsService.list(q, q.sort, p.limit, p.offset);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
  },
  async grant(req: Request, admin: AdminPrincipal, body: { studentId: string; packageId: string; days?: number; startsAt?: string; reason: string }) {
    const id = await subscriptionEngine.grantManual({ ...body, actor: actorOf(admin) });
    void emailSubscriptionActivated(id);
    const dto = await subscriptionsService.get(id);
    req.audit = { action: 'subscription.grant', entity: 'subscription', entityId: id, summary: `Granted ${dto.package.name.en} to ${dto.student.name.en} until ${dto.endsAt.slice(0, 10)}: ${body.reason}`, after: dto };
    return dto;
  },
  async changePackage(req: Request, admin: AdminPrincipal, id: string, body: { packageId: string; reason: string; keepEndDate: boolean }) {
    const before = await subscriptionsService.get(id);
    await subscriptionEngine.changePackage(id, { ...body, actor: actorOf(admin) });
    const after = await subscriptionsService.get(id);
    req.audit = { action: 'subscription.change_package', entity: 'subscription', entityId: id, summary: `${before.package.name.en} → ${after.package.name.en}: ${body.reason}`, before: { package: before.package, endsAt: before.endsAt }, after: { package: after.package, endsAt: after.endsAt } };
    return after;
  },
  async extend(req: Request, admin: AdminPrincipal, id: string, body: { days: number; reason: string }) {
    const before = await subscriptionsService.get(id);
    await subscriptionEngine.extend(id, body.days, body.reason, actorOf(admin));
    const after = await subscriptionsService.get(id);
    req.audit = { action: 'subscription.extend', entity: 'subscription', entityId: id, summary: `Extended by ${body.days} days: ${body.reason}`, before: { endsAt: before.endsAt }, after: { endsAt: after.endsAt } };
    return after;
  },
  async cancel(req: Request, admin: AdminPrincipal, id: string, body: { reason: string; immediate: boolean }) {
    const before = await subscriptionsService.get(id);
    await subscriptionEngine.cancel(id, body.reason, body.immediate, actorOf(admin));
    const after = await subscriptionsService.get(id);
    req.audit = { action: 'subscription.cancel', entity: 'subscription', entityId: id, summary: `Cancelled${body.immediate ? ' immediately' : ''}: ${body.reason}`, before: { status: before.status, endsAt: before.endsAt }, after: { status: after.status, endsAt: after.endsAt } };
    return after;
  },
  async export(req: Request, res: Response, body: ExportRequest) {
    const f = (body.filters ?? {}) as Partial<SubscriptionListQuery>;
    const r = await subscriptionsService.list({ ...f, ids: body.ids }, f.sort, 50_000, 0);
    await sendTableExport(req, res, { report: 'subscriptions', format: body.format, columns: COLUMNS, selected: body.columns, rows: r.items, filters: body.filters });
  },
};
