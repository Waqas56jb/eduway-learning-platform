import { Router } from 'express';
import { AppError } from '../../common/errors/index.js';
import { defineRoute } from '../../common/http/route.js';
import { isProd } from '../../config/env.js';
import { healthService, type Check } from './service.js';

export const router = Router();
const tags = ['Health'];

defineRoute(router, { method: 'get', path: '/health', tags, summary: 'Liveness (HLT-01)', auth: 'public' }, () => healthService.live());

/** SEC-31: the public readiness probe never shows check messages in production (they can carry upstream error text). */
export function publicChecks<C extends Record<string, Check>>(checks: C, prod = isProd): C {
  if (!prod) return checks;
  return Object.fromEntries(Object.entries(checks).map(([k, c]) => [k, { status: c.status, latencyMs: c.latencyMs }])) as C;
}

defineRoute(router, { method: 'get', path: '/health/ready', tags, summary: 'Readiness: db, storage, queue, sms, ai, payments (HLT-02) — 503 when db is down', auth: 'public' }, async () => {
  const r = await healthService.ready();
  const checks = publicChecks(r.checks);
  if (r.checks.db.status === 'down') throw new AppError('INTERNAL', 503, { reason: 'SERVICE_UNAVAILABLE', details: { checks } });
  return { ...r, checks };
});

defineRoute(router, { method: 'get', path: '/admin/system/health', tags: ['Admin · Dashboard'], summary: 'System health panel (ADM-DSH-02)', auth: 'admin', permission: 'dashboard.view' }, () => healthService.systemHealth());
