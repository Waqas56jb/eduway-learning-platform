import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from '../../src/config/constants.js';
import { errorHandler } from '../../src/common/middleware/errorHandler.js';
import { hasAllPermissions, hasAnyPermission, hasPermission, requirePermission } from '../../src/common/middleware/rbac.js';
import type { AdminPrincipal } from '../../src/common/types/index.js';
import { normalizeMatrix, toMatrix } from '../../src/modules/roles/service.js';

const admin = (perms: string[], isSuperAdmin = false): AdminPrincipal => ({
  kind: 'admin',
  userId: 'u1',
  sessionId: 's1',
  email: 'a@eduway.iq',
  name: 'A',
  roles: [isSuperAdmin ? 'super_admin' : 'support'],
  roleName: 'Support',
  permissions: new Set(perms),
  isSuperAdmin,
  mfaEnabled: false,
});

describe('RBAC helpers', () => {
  it('checks single, all and any permissions', () => {
    const a = admin(['users.view', 'users.edit']);
    expect(hasPermission(a, 'users.view')).toBe(true);
    expect(hasPermission(a, 'payments.view')).toBe(false);
    expect(hasAllPermissions(a, ['users.view', 'users.edit'])).toBe(true);
    expect(hasAllPermissions(a, ['users.view', 'payments.view'])).toBe(false);
    expect(hasAnyPermission(a, ['payments.view', 'users.edit'])).toBe(true);
    expect(hasPermission(undefined, 'users.view')).toBe(false);
  });

  it('super admin bypasses every permission', () => {
    const s = admin([], true);
    for (const p of ALL_PERMISSIONS) expect(hasPermission(s, p)).toBe(true);
  });

  it('there are 14 modules × 6 actions', () => {
    expect(ALL_PERMISSIONS).toHaveLength(84);
  });
});

describe('requirePermission middleware', () => {
  const app = (who?: AdminPrincipal) => {
    const a = express();
    a.use((req, _res, next) => {
      req.locale = 'en';
      if (who) req.admin = who;
      next();
    });
    a.get('/x', requirePermission('payments.approve'), (_req, res) => {
      res.json({ success: true, data: 'ok' });
    });
    a.use(errorHandler);
    return a;
  };

  it('401 without an admin', async () => {
    const r = await request(app()).get('/x');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('UNAUTHORIZED');
  });

  it('403 FORBIDDEN with details.permission when missing', async () => {
    const r = await request(app(admin(['payments.view']))).get('/x');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    expect(r.body.error.details.permission).toBe('payments.approve');
  });

  it('passes with the permission or as super admin', async () => {
    expect((await request(app(admin(['payments.approve']))).get('/x')).status).toBe(200);
    expect((await request(app(admin([], true))).get('/x')).status).toBe(200);
  });
});

describe('permission matrix normalization', () => {
  it('any action implies view; no actions → module omitted', () => {
    const keys = normalizeMatrix({ content: { edit: true }, payments: {}, users: { view: false } });
    expect(keys.sort()).toEqual(['content.edit', 'content.view']);
  });

  it('round-trips keys ⇄ matrix', () => {
    const m = toMatrix(['questions.view', 'questions.approve']);
    expect(m.questions.approve).toBe(true);
    expect(m.questions.delete).toBe(false);
    expect(normalizeMatrix(m).sort()).toEqual(['questions.approve', 'questions.view']);
  });
});
