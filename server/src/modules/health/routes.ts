import { Router } from 'express';
import { AppError } from '../../common/errors/index.js';
import { defineRoute } from '../../common/http/route.js';
import { healthService } from './service.js';

export const router = Router();
const tags = ['Health'];

defineRoute(router, { method: 'get', path: '/health', tags, summary: 'Liveness (HLT-01)', auth: 'public' }, () => healthService.live());

defineRoute(router, { method: 'get', path: '/health/ready', tags, summary: 'Readiness: db, storage, queue, sms, ai, payments (HLT-02) — 503 when db is down', auth: 'public' }, async () => {
  const r = await healthService.ready();
  if (r.checks.db.status === 'down') throw new AppError('INTERNAL', 503, { reason: 'SERVICE_UNAVAILABLE', details: { checks: r.checks } });
  return r;
});

defineRoute(router, { method: 'get', path: '/admin/system/health', tags: ['Admin · Dashboard'], summary: 'System health panel (ADM-DSH-02)', auth: 'admin', permission: 'dashboard.view' }, () => healthService.systemHealth());
