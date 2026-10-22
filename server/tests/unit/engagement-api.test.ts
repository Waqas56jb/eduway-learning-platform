/** HTTP surface of the AI tutor + notifications modules that needs no database (auth guards, OpenAPI). */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb } from '../../src/config/db.js';
import { duplicateOperations, generateOpenApiDocument } from '../../src/docs/openapi.js';

const app = createApp();
afterAll(() => closeDb());

describe('AI tutor + notifications HTTP surface', () => {
  it('student and admin endpoints require a token', async () => {
    const calls: [string, string][] = [
      ['get', '/api/v1/ai-tutor/allowance'],
      ['post', '/api/v1/ai-tutor/conversations/00000000-0000-4000-8000-000000000000/messages'],
      ['get', '/api/v1/notifications'],
      ['get', '/api/v1/admin/ai/usage'],
      ['get', '/api/v1/admin/notification-templates'],
      ['post', '/api/v1/admin/campaigns'],
      ['get', '/api/v1/admin/deliveries/stats'],
    ];
    for (const [m, p] of calls) {
      const r = await (request(app) as unknown as Record<string, (path: string) => request.Test>)[m]!(p);
      expect(r.status, `${m} ${p}`).toBe(401);
      expect(r.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('OpenAPI documents every AI tutor / notification endpoint incl. the SSE stream', () => {
    const doc = generateOpenApiDocument();
    const paths = doc.paths ?? {};
    const expected = [
      '/api/v1/ai-tutor/allowance',
      '/api/v1/ai-tutor/suggestions',
      '/api/v1/ai-tutor/conversations',
      '/api/v1/ai-tutor/conversations/{id}',
      '/api/v1/ai-tutor/conversations/{id}/messages',
      '/api/v1/ai-tutor/messages/{messageId}',
      '/api/v1/ai-tutor/messages/{messageId}/feedback',
      '/api/v1/admin/ai/usage',
      '/api/v1/admin/ai/settings',
      '/api/v1/admin/ai/settings/enable',
      '/api/v1/admin/ai/settings/disable',
      '/api/v1/admin/ai/disabled-users/{studentId}',
      '/api/v1/admin/ai/flags',
      '/api/v1/admin/ai/flags/{id}',
      '/api/v1/admin/ai/flags/export',
      '/api/v1/admin/ai/flagged-users',
      '/api/v1/admin/ai/flagged-users/{studentId}/warn',
      '/api/v1/admin/ai/flagged-users/export',
      '/api/v1/admin/ai/models',
      '/api/v1/notifications',
      '/api/v1/notifications/unread-count',
      '/api/v1/notifications/{id}/read',
      '/api/v1/notifications/read-all',
      '/api/v1/notifications/{id}',
      '/api/v1/admin/notification-templates',
      '/api/v1/admin/notification-templates/{id}',
      '/api/v1/admin/notification-templates/{id}/duplicate',
      '/api/v1/admin/notification-templates/bulk',
      '/api/v1/admin/notification-templates/variables',
      '/api/v1/admin/notification-templates/preview',
      '/api/v1/admin/notification-templates/export',
      '/api/v1/admin/campaigns',
      '/api/v1/admin/campaigns/{id}',
      '/api/v1/admin/campaigns/audience-preview',
      '/api/v1/admin/campaigns/{id}/cancel',
      '/api/v1/admin/campaigns/export',
      '/api/v1/admin/deliveries',
      '/api/v1/admin/deliveries/stats',
      '/api/v1/admin/deliveries/retry',
      '/api/v1/admin/deliveries/export',
      '/api/v1/webhooks/notifications/{provider}',
    ];
    for (const p of expected) expect(Object.keys(paths), p).toContain(p);
    const send = paths['/api/v1/ai-tutor/conversations/{id}/messages']?.post;
    expect(send?.description).toContain('text/event-stream');
    expect(paths['/api/v1/admin/campaigns']?.post?.description).toContain('Idempotency-Key');
  });

  it('WHK-03 validates the receipt body before touching the DB', async () => {
    const r = await request(app).post('/api/v1/webhooks/notifications/mock').send({ status: 'bogus' }).set('Accept-Language', 'en');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('final OpenAPI assembly: no endpoint registered twice, every operation tagged + summarized, SSE documented, tag groups', () => {
    expect(duplicateOperations()).toEqual([]);
    const doc = generateOpenApiDocument() as ReturnType<typeof generateOpenApiDocument> & { 'x-tagGroups': { name: string; tags: string[] }[] };
    for (const [p, item] of Object.entries(doc.paths ?? {})) {
      for (const [m, op] of Object.entries(item as Record<string, { tags?: string[]; summary?: string }>)) {
        expect(op.tags?.length, `${m} ${p}`).toBeGreaterThan(0);
        expect(op.summary, `${m} ${p}`).toBeTruthy();
      }
    }
    const content = (doc.paths?.['/api/v1/ai-tutor/conversations/{id}/messages'] as Record<string, { responses: Record<string, { content: Record<string, unknown> }> }>).post?.responses['200']?.content ?? {};
    expect(Object.keys(content)).toEqual(expect.arrayContaining(['application/json', 'text/event-stream']));
    expect(doc['x-tagGroups'].map((g) => g.name)).toContain('Admin portal');
    expect(doc.tags?.length).toBeGreaterThan(10);
  });
});
