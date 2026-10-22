/**
 * OpenAPI registry. Routes register themselves through the route builder (src/common/http/route.ts);
 * `generateOpenApiDocument()` is served at /api/docs (UI) and /api/docs/openapi.json, and written to
 * docs/openapi.json by `npm run docs`.
 */
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import '../common/validation/zod.js';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'studentBearer', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Student access token (aud eduway-student) from /auth/verify-otp or /auth/refresh',
});
registry.registerComponent('securitySchemes', 'adminBearer', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Admin access token (aud eduway-admin) from /auth/admin/login',
});

/** Method+path pairs registered more than once (two modules claiming the same endpoint). */
export function duplicateOperations(): string[] {
  const seen = new Map<string, number>();
  for (const d of registry.definitions) {
    if (d.type !== 'route') continue;
    const key = `${d.route.method.toUpperCase()} ${d.route.path}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}

type Doc = ReturnType<OpenApiGeneratorV3['generateDocument']>;

/** Tag list (ordered: platform → student → admin → webhooks) + `x-tagGroups` for ReDoc-style viewers. */
function tagMeta(doc: Doc) {
  const used = new Set<string>();
  for (const item of Object.values(doc.paths ?? {})) {
    for (const op of Object.values(item as Record<string, { tags?: string[] }>)) for (const t of op?.tags ?? []) used.add(t);
  }
  const group = (t: string) => (t === 'Health' || t === 'Public' || t.startsWith('Auth') || t === 'Storage' ? 'Platform & auth' : t.startsWith('Admin') ? 'Admin portal' : t === 'Webhooks' ? 'Webhooks' : 'Student (website + app)');
  const order = ['Platform & auth', 'Student (website + app)', 'Admin portal', 'Webhooks'];
  const tags = [...used].sort((a, b) => order.indexOf(group(a)) - order.indexOf(group(b)) || a.localeCompare(b));
  return {
    tags: tags.map((name) => ({ name })),
    groups: order.map((name) => ({ name, tags: tags.filter((t) => group(t) === name) })).filter((g) => g.tags.length),
  };
}

const NL2 = String.fromCharCode(10, 10);

const SSE_DESCRIPTION =
  'Server-Sent Events (`Accept: text/event-stream`): `event: meta` {studentMessage, tutorMessageId, allowance} → ' +
  '`event: delta` {text} (append) … → `event: done` {message (FULL text), allowance} or `event: error` {code, reason, message, allowance}. ' +
  'A `: ping` comment is sent every 15 s.';

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  const doc = generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'EDUWAY Platform API',
      version: '1.0.0',
      description:
        'REST API for the EDUWAY student website, student app and admin portal (contract: docs/API_CONTRACT.md v1.0.0).' + NL2 +
        'Envelope: `{ success, data, meta }` / `{ success:false, error:{ code, message, details } }`. ' +
        'Messages are localized via `Accept-Language: en|ar`. Headers: `X-Client-Platform`, `X-Device-Id`, ' +
        '`Idempotency-Key` (payments & critical mutations).' + NL2 +
        'Real-time: the AI tutor streams answers with Server-Sent Events (POST /ai-tutor/conversations/{id}/messages with ' +
        '`Accept: text/event-stream`), falling back to JSON + polling GET /ai-tutor/messages/{messageId}.',
    },
    servers: [{ url: '/' }],
  });

  // AIT-08 answers either JSON (polling fallback) or an SSE stream.
  const send = (doc.paths?.['/api/v1/ai-tutor/conversations/{id}/messages'] as Record<string, { responses?: Record<string, { content?: Record<string, unknown>; description?: string }> }> | undefined)?.post;
  const ok = send?.responses?.['200'];
  if (ok) {
    ok.content = { ...(ok.content ?? {}), 'text/event-stream': { schema: { type: 'string', description: SSE_DESCRIPTION } } };
    ok.description = 'JSON polling payload, or an SSE stream when `Accept: text/event-stream`';
  }

  const meta = tagMeta(doc);
  return { ...doc, tags: meta.tags, 'x-tagGroups': meta.groups };
}
