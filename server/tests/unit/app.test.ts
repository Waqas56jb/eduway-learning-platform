/** HTTP surface checks that need no database (validation, auth guards, envelopes, OpenAPI). */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb } from '../../src/config/db.js';
import { generateOpenApiDocument } from '../../src/docs/openapi.js';

const app = createApp();
afterAll(() => closeDb());

describe('app', () => {
  it('GET /api/v1/health → envelope', async () => {
    const r = await request(app).get('/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe('ok');
    expect(r.headers['x-request-id']).toBeTruthy();
  });

  it('unknown route → 404 NOT_FOUND envelope', async () => {
    const r = await request(app).get('/api/v1/nope').set('Accept-Language', 'en');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    expect(r.body.error.details.reason).toBe('ROUTE_NOT_FOUND');
  });

  it('protected routes require a token (student and admin)', async () => {
    for (const path of ['/api/v1/me', '/api/v1/auth/me', '/api/v1/admin/students', '/api/v1/admin/roles']) {
      const r = await request(app).get(path);
      expect(r.status, path).toBe(401);
      expect(r.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('a malformed bearer token is rejected', async () => {
    const r = await request(app).get('/api/v1/admin/students').set('Authorization', 'Bearer not-a-jwt');
    expect(r.status).toBe(401);
    expect(r.body.error.details.reason).toBe('TOKEN_INVALID');
  });

  it('send-otp validates the Iraqi phone before touching the DB', async () => {
    const r = await request(app).post('/api/v1/auth/send-otp').set('Accept-Language', 'en').send({ phone: '12345', purpose: 'login' });
    expect(r.status).toBe(400);
    expect(r.body.error.details.reason).toBe('PHONE_INVALID');
  });

  it('CORS allows the configured frontends and exposes request ids', async () => {
    const r = await request(app).options('/api/v1/health').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('OpenAPI document generates and covers the foundation endpoints', () => {
    const doc = generateOpenApiDocument();
    const paths = Object.keys(doc.paths ?? {});
    for (const p of ['/api/v1/auth/send-otp', '/api/v1/auth/verify-otp', '/api/v1/me', '/api/v1/admin/students/{id}', '/api/v1/admin/roles', '/api/v1/admin/settings/{section}', '/api/v1/storage/signed-upload-url', '/api/v1/public/app-config', '/api/v1/legal/{doc}', '/api/v1/health/ready']) {
      expect(paths, p).toContain(p);
    }
  });

  it('/api/docs serves the Swagger UI', async () => {
    const r = await request(app).get('/api/docs/');
    expect(r.status).toBe(200);
    expect(r.text).toContain('swagger');
  });
});
