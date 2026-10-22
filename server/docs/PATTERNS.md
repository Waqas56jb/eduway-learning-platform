# How to build on the EDUWAY foundation (for agents B/C/D)

Read `docs/API_CONTRACT.md` (paths/DTOs are binding) and `docs/ENGINEERING.md` first. Copy the style of
`src/modules/roles` (small, complete) or `src/modules/students` (lists, exports, audit, bulk).

## 1. Add a module

```
src/modules/<name>/
  schemas.ts     zod request/response schemas (import { z } from '../../common/validation/zod.js')
  types.ts       DTO interfaces (contract shapes) + row types
  repository.ts  SQL only — parameterized, tables via T.<name>, optional `ex?: Executor` for transactions
  service.ts     business rules; throws AppError subclasses; returns DTOs
  controller.ts  thin: maps ctx → service, sets req.audit for admin mutations
  routes.ts      defineRoute(...) per endpoint
  index.ts       export const <name>Module: ModuleDefinition = { name: '<name>', router }
```

Then append `<name>Module` to `src/modules/index.ts`. Minimal example:

```ts
// routes.ts
import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { idParam } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { teachersService } from './service.js';

export const router = Router();
defineRoute(router, {
  method: 'patch', path: '/admin/teachers/:id', tags: ['Admin · Teachers'], summary: 'Update teacher (ADM-TCH-03)',
  auth: 'admin', permission: 'content.edit',               // RBAC — Super Admin bypasses
  params: idParam, body: z.object({ name: z.object({ en: z.string().min(2), ar: z.string().min(2) }) }),
}, async ({ req, params, body }) => {
  const { before, after } = await teachersService.update(params.id, body);
  req.audit = { action: 'teacher.update', entity: 'teacher', entityId: params.id, summary: 'Updated teacher', before, after };
  return after;                                            // → { success: true, data: after }
});

// repository.ts
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
export const teachersRepo = {
  get: (id: string, ex?: Executor) => db.maybeOne<TeacherRow>(`SELECT * FROM ${T.teachers} WHERE id = $1`, [id], ex),
};
```

`defineRoute` options: `auth` = `public | student | student* | admin | any | optional`, `permission` / `anyPermission`,
`query`/`params`/`body` (zod, parsed values replace raw ones), `rateLimit: rateLimits.ai`, `idempotency: 'required'`,
`audit: { action, entity, before }`, `middleware: [uploadSingle(...), requireEntitlement(...)]`, `status: 201`,
`raw: true` (SSE / file downloads — write to `res` yourself). Return a value, or `paged(items, meta)` for lists.

## 2. Rules that are easy to get wrong

- **Paths**: student endpoints use the spec names (`/subjects`, `/lessons/:lessonId`, `/quizzes`, …); every admin endpoint
  lives under `/admin/*`. `:subjectId` on student paths accepts uuid **or** slug.
- **Errors** (closed codes): `NotFoundError('lesson')`, `BusinessRuleError('INVALID_TRANSITION', { from, to })` (422),
  `ConflictError('HAS_DEPENDENTS', { count })`, `ForbiddenError('AI_DISABLED')`, `RateLimitError(sec, 'AI_RATE_LIMITED')`.
  New domain reasons go into `REASON_MESSAGES` in `src/common/i18n/messages.ts` (EN + AR) — the compiler enforces it.
- **Entitlements**: every paid surface calls `entitlements.assertAccess(userId, subjectId, { feature })` or uses
  `requireEntitlement(resolveSubjectId, feature)`. Payments/subscriptions call `entitlements.grantForSubscription(subId, tx)`;
  refunds/cancellations call `entitlements.revoke({ userId, subscriptionId }, reason, actor, tx)`.
- **Settings, never constants**: `settingsStore.get('learning' | 'payments' | 'otp' | …)`, `settingsStore.app()`,
  `settingsStore.flag('ai_tutor')`. Add a new group by extending `SETTINGS_SCHEMAS` (with defaults).
- **AI allowance / subscription read models**: `aiAllowance(userId)` and `mySubscription(userId)` in
  `src/common/services/student-summary.ts`; `toPackagePublic()` in `src/common/dto/package.ts`.
- **Files**: clients upload via `POST /storage/signed-upload-url` → you receive a `fileKey`; call
  `storage.attachUpload(fileKey, { purpose, entityType, entityId })` and store `storage.ref(bucket, path)` in the `*_url`
  column. Read with `storage.resolveUrl(ref)` / `storage.resolveMany(refs)` (external URLs pass through unchanged — the
  seed uses archive.org videos and Unsplash images). Raw paths are never returned.
- **Audit**: admin mutations are audited automatically; set `req.audit = { action, entity, entityId, summary, before, after }`
  (changed keys only) for a meaningful entry, or call `auditService.fromRequest(req, …)` inside a service.
- **Exports**: `sendExport(req, res, { report, format, columns, selected, rows, filters })` with `raw: true` (logs `exports_log`
  + `export.create` audit). **Admin inbox**: `adminInbox.notify({ permission, title, body, href, dedupeKey })`.
- **Idempotency**: `idempotency: 'required'` on money-moving / critical mutations (payments, refunds, exam submit, …).
- **Transactions**: `await tx(async (c) => { await repo.x(…, c); await entitlements.grant(…, c); })`.
- **Shared tables already exist** (106 tables) — check `src/config/constants.ts` `TABLES` and the migrations before
  adding columns. DTO-only fields can usually be computed.
- **Jobs**: create `src/jobs/<name>.ts` with `registerJob({ name: 'eduway.<x>', cron?, handler })`, import it in
  `src/jobs/registry.ts`; enqueue with `enqueue(name, data)`.
- **Tests**: unit tests in `tests/unit` (no DB); integration in `tests/integration` (runs with `TEST=1` → test prefix).
  Add smoke steps to `STEPS` in `scripts/smoke.ts`.

## 3. Add a migration

1. Create `src/db/migrations/0NN_<what>.sql` (next number; never edit an applied file — the runner checks checksums).
2. Idempotent DDL only: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`,
   `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '…') THEN ALTER TABLE … ADD CONSTRAINT … END IF; $$`,
   `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`.
3. Name **every** object explicitly with the prefix: `eduway_platform_<table>_<col>_fkey`, `_pkey`, `_key`, `_check`,
   `eduway_platform_idx_<table>_<cols>`, `eduway_platform_uq_<…>` (≤ 58 chars).
4. After each new table: `SELECT eduway_platform_fn_secure_table('eduway_platform_<table>');` (RLS + deny policy +
   revoke + `updated_at` trigger when the column exists).
5. Add the logical table name to `TABLES` in `src/config/constants.ts` (check-prefix verifies both directions).
6. `npm run check-prefix && npm run migrate && npm test`.
