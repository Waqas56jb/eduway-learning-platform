# EDUWAY: Backend Security Review

Review date: 2026-10-23. Scope: `server/` (Express 5 + TS + Supabase). The dependency audit also covers `website/user` and `website/admin`.

How the review was done: source review of every module, a route manifest check, a live read-only inspection of the shared database's grants and RLS on `eduway_platform_*` objects only, and light probes of the running API on :4100.

Regression tests are in `server/tests/unit/security.test.ts` (SEC-01..20) and `server/tests/unit/security-followups.test.ts` (SEC-21..32). They read the route manifest that is now recorded by `defineRoute` (`server/src/common/http/route.ts`, `routeManifest`). The tests fail when a future route:
- under `/admin` is missing a permission gate, or
- takes a `:param` without zod validation, or
- is a public write without a rate limit.

Status values: **Fixed** (code changed, verified), **Open** (documented, not changed), **Accepted** (by design).

## Summary

| ID | Severity | Area | Status |
|----|----------|------|--------|
| SEC-01 | Critical | Admin MFA bypass via the challenge token (re-enrol TOTP with the password only) | Fixed |
| SEC-02 | High | Admin TOTP step-up had no enforced lockout | Fixed |
| SEC-03 | High | Payment views readable with the public anon key (PostgREST); functions callable by anon | Fixed (migration 402) |
| SEC-10 | High | Mock payment webhook live in production; webhooks not bound to the payment's gateway | Fixed |
| SEC-11 | High | In-progress exam/quiz answers retrievable via `GET /bank/questions/:id` | Fixed |
| SEC-12 | Medium | `GET /quizzes/attempts/:id` returned the answer key before submission | Fixed |
| SEC-13 | Medium | Unvalidated `avatarPreset` stored in `avatar_url` → signed URL to any private object | Fixed |
| SEC-14 | Medium | Students could upload SVG; stored size/MIME never checked against the purpose rule | Fixed |
| SEC-04 | Medium | OTP consume not atomic (one code, two sessions under concurrency) | Fixed |
| SEC-05 | Medium | Refresh rotation not compare-and-swap (one token → two token chains) | Fixed |
| SEC-09 | Medium | Swagger UI and the OpenAPI document public in production | Fixed |
| SEC-15 | Medium | CSV export formula injection | Fixed |
| SEC-06 | Medium | Production could run with identical student/admin/refresh JWT secrets | Fixed |
| SEC-07 | Medium | Single-use reset and invite tokens not atomic | Fixed |
| SEC-16 | Low | Sort whitelist accepted `Object.prototype` keys (500s) | Fixed |
| SEC-17 | Low | Push-token rebinding to another account | Fixed |
| SEC-18 | Low | Bulk endpoints echoed raw pg error messages | Fixed |
| SEC-19 | Low | Bookmarks exposed draft/rejected question text | Fixed |
| SEC-20 | Medium | Dependency vulnerabilities | Fixed for server; website majors open (see below) |
| SEC-21 | Medium | Dev-only behaviours keyed on a defaulted `NODE_ENV`; production could start without its settings | Fixed |
| SEC-22 | Medium | `trust proxy` hard-coded to 1 | Fixed (`TRUST_PROXY`) |
| SEC-23 | Medium | Per-process rate-limit store | Fixed (`RATE_LIMIT_STORE=postgres`, migration 403) |
| SEC-24 | Medium | Payment adapters: no currency check, success without amount, no replay window | Fixed |
| SEC-25 | Low | Unsigned notification receipts outside production; provider not bound | Fixed |
| SEC-26 | Low | TOTP replay inside its window; recovery codes unusable | Fixed (migration 403) |
| SEC-27 | Low | Refresh reuse detection only one rotation back | Fixed (migration 403) |
| SEC-28 | Low | Mock confirm could settle a real-gateway checkout | Fixed |
| SEC-29 | Low | LIKE/ILIKE wildcards not escaped | Fixed |
| SEC-30 | Low | Export `filters` cast, not validated | Fixed |
| SEC-31 | Low | Readiness messages and constraint names public | Fixed |
| SEC-32 | Low | SVG allowed for `logo` / `question_image` | Fixed |
| SEC-33 | Low | Practice result before finish; sample password in the admin README | Fixed |
| SEC-34 | Low | Quiz answer/submit race | Fixed |

## Fixed

### SEC-01 · Critical · Admin MFA bypass through the enrolment challenge
**Before:** `POST /auth/admin/login` with a correct password and MFA enabled returned an `mfaToken`. The same token type was accepted by `/auth/admin/mfa/setup` and `/auth/admin/mfa/enable`, and those endpoints did not check whether MFA was already enrolled. Anyone holding only the password could:
1. Generate a new secret.
2. Confirm it with their own authenticator.
3. Receive a full admin session (`mfaEnable(..., viaChallenge = true)` issues tokens).

This replaced the victim's second factor.

**Fix:**
- Challenge tokens carry a purpose claim `pur`, set by `signMfaChallengeToken(userId, 'login' | 'enroll')`.
- `/mfa/verify` accepts only `login` tokens.
- `/mfa/setup` and `/mfa/enable` accept only `enroll` tokens.
- `mfaSetup`/`mfaEnable` refuse the challenge path when `mfa_enabled` is already true or the account is not active.
- Tokens issued before this change have no `pur` and are rejected; they live at most 5 minutes.

**Where:** `server/src/common/auth/tokens.ts:66`, `server/src/modules/auth/admin-auth.service.ts:155`, `server/src/modules/auth/controller.ts:26`.

**Tests:** `security.test.ts` › "MFA challenge tokens".

### SEC-02 · High · TOTP brute force at `/auth/admin/mfa/verify`
**Before:** failures were counted (`registerFailure('admin_mfa', …)`) but the lock was never checked. The only bound was the per-IP limiter, which an attacker defeats by rotating IPs and re-logging in for new challenge tokens.

**Fix:**
- `assertMfaNotLocked` runs before verifying.
- After 5 bad codes (`MFA_LOCKOUT_ATTEMPTS`), the step-up locks for `auth.adminLockoutMinutes`. A security event is recorded and the counter clears on success.
- The same lock covers `/mfa/enable`.

**Where:** `server/src/modules/auth/admin-auth.service.ts:120-140`.

### SEC-03 · High · Supabase exposure of payment views and functions
**Live finding:** all 106 `eduway_platform_` tables already had RLS with deny-all policies (`…_deny`, `USING false`, for anon and authenticated). However:
- `eduway_platform_v_paid_transactions` and `eduway_platform_v_verified_payments` are plain views, which run with the owner's rights and therefore bypass RLS. Both were `SELECT`-able by `anon`, so they were readable through `https://<project>.supabase.co/rest/v1/…` with the public anon key.
- Four `eduway_platform_fn_*` functions were executable by `anon`.

**Fix:** migration `server/src/db/migrations/402_security_hardening.sql`:
- sets `security_invoker = true` on our views;
- revokes all privileges for `anon`/`authenticated`/`PUBLIC` on our views and tables, and `EXECUTE` on our functions;
- touches only prefixed objects.

**Applied and verified live:**
- the PostgREST probe now returns `401 permission denied for view`;
- 0 anon-selectable relations, 0 anon-executable functions;
- the `eduway_platform_pgboss` schema is not usable by anon.

**Ongoing check:** re-run this after any migration that creates views or functions. 402 is a one-off and does not cover objects created later.

### SEC-04 · Medium · OTP single use under concurrency
**Fix:**
- `consumeOtp` is a conditional `UPDATE … WHERE consumed_at IS NULL AND invalidated_at IS NULL AND attempts < max_attempts AND expires_at > now()`. Verification fails if it consumed nothing.
- `checkCode` also rejects codes whose attempt budget is spent.

**Where:** `server/src/modules/auth/repository.ts` (`consumeOtp`), `server/src/modules/auth/student-auth.service.ts:150,314`.

**Already in place (verified):**
- OTPs are HMAC-hashed and compared timing-safe.
- A per-phone lockout comes from settings, and the per-attempt counter invalidates the code.
- Resend cooldown and window come from settings.
- Rate limits are per phone+IP (send 6/10 min, verify 15/10 min).
- The dev bypass code is disabled when `NODE_ENV=production`.

### SEC-05 · Medium · Refresh rotation race
**Fix:** `sessions.rotate` is a compare-and-swap on the presented token hash (`AND refresh_token_hash = $6`). A concurrent second use of the same token gets `401 REFRESH_TOKEN_INVALID` instead of a second valid chain.

**Where:** `server/src/modules/auth/sessions.ts:160`, `server/src/modules/auth/service.ts:41`.

**Verified:**
- Refresh tokens are 384-bit random values, stored HMAC-hashed.
- Reuse of the previous token revokes the family and records a security event.
- Revoked/expired sessions and locked users are rejected.
- Access tokens last 15 minutes. HS256 is pinned and `alg:none` is rejected (tested).
- Issuer and audience are verified, and student/admin tokens use separate secrets and audiences.
- Sessions are re-checked from the database (15 s cache) so force-logout takes effect.

### SEC-06 · Medium · JWT secret separation
`envProblems()` in `server/src/config/env.ts:171` makes startup fail in production if:
- `JWT_ACCESS_SECRET`, `JWT_ADMIN_SECRET` and `JWT_REFRESH_SECRET` are not all different, or
- `CORS_ORIGINS` contains `*`.

Secrets must be at least 32 characters (zod), are read only in `env.ts`, and are redacted by the logger.

### SEC-07 · Medium · Reset and invite tokens single use
`useReset` and `acceptInvite` are now conditional updates. A replayed or concurrent token gets `RESET_TOKEN_INVALID` / `INVITE_INVALID`.

**Where:** `server/src/modules/auth/repository.ts`, `server/src/modules/auth/admin-auth.service.ts:218,234`.

### SEC-09 · Medium · API docs in production
`/api/docs` and `/api/docs/openapi.json` are now served only when `NODE_ENV !== 'production'` or `API_DOCS_PUBLIC=1`. Superseded by SEC-21: the docs are never served in production, and outside production only with `API_DOCS_PUBLIC` (on by default for an explicit `NODE_ENV=development`/`test`).

**Where:** `server/src/app.ts:77`, `server/.env.example`.

### SEC-10 · High · Payment webhook trust
**Fix:**
- `processWebhook` returns 404 for the `mock` provider in production. Its HMAC key can be derived from `JWT_REFRESH_SECRET`.
- `findPaymentForUpdate` only locks a payment whose `provider` matches the webhook's gateway. The mock gateway is exempt outside production, because dev/staging confirm unconfigured gateways through it.
- A non-numeric or NaN amount now counts as an amount mismatch instead of skipping the check.

**Where:** `server/src/modules/payments/webhook.service.ts:25,52,122`.

**Verified:**
- HMAC is computed over the raw body with a timing-safe compare.
- Real gateways fail closed without secrets.
- Events are idempotent on `(provider, provider_event_id)`.
- The payment row is locked `FOR UPDATE`, and only `initiated`/`pending` can transition.
- A live probe of an unsigned zaincash webhook returns `401 SIGNATURE_INVALID`.

### SEC-11 · High · Exam answer key via the question bank
**Before:** exam state returns question ids, and `GET /bank/questions/:id` returns `toReview` (correct option and explanation) for published questions.

**Fix:** `bankService.question` returns 409 `QUESTION_IN_ACTIVE_ATTEMPT` while the question is in one of the student's `in_progress` exam or quiz attempts.

**Where:** `server/src/modules/questions/bank.service.ts:159`. The contract (BNK-03) is updated.

### SEC-12 · Medium · Quiz result before submit
`GET /quizzes/attempts/:id` returns 409 `ATTEMPT_IN_PROGRESS` for open attempts.

**Where:** `server/src/modules/quizzes/service.ts:271`. The contract (QUZ-05) is updated. The app only calls this endpoint after submitting.

### SEC-13 · Medium · `avatarPreset`
`avatarPreset` must be one of the configured `learning.avatarPresets` (contract ME-02). An empty list now rejects every value.

**Where:** `server/src/modules/users/service.ts:135`.

### SEC-14 · Medium · Upload type and size
- Student purposes (`student_avatar`, `ai_attachment`) accept raster images only, no `image/svg+xml`.
- `attachUpload` reads the stored object's metadata. It rejects:
  - objects over the purpose's `maxBytes`, for all purposes;
  - a MIME type outside the purpose rule, for student purposes.

**Where:** `server/src/common/services/storage.ts:40,181`.

**Verified:**
- Buckets are a fixed whitelist and all four are private, with size and MIME limits at bucket level.
- Object paths are generated by the server, so there is no path traversal.
- Per-purpose permission checks are enforced.
- Students can only sign downloads for their own uploads.

### SEC-15 · Medium · CSV formula injection
`csvCell` prefixes `'` to strings starting with `= + - @ TAB CR`. Plain signed numbers are left alone.

**Where:** `server/src/common/services/exporter.ts:34`.

### SEC-16 · Low · Sort whitelist
`orderBy` uses `Object.hasOwn`.

**Where:** `server/src/common/utils/pagination.ts:91`.

### SEC-17 · Low · Push token takeover
`upsertPushToken` only moves a live token to another user when it comes from the same device id, or when it was revoked.

**Where:** `server/src/modules/users/repository.ts:69`.

### SEC-18 · Low · Bulk error leakage
`bulkItemError()` returns `INTERNAL` without the raw message for anything that is not an `AppError`.

**Where:** `server/src/common/errors/index.ts:144`, used in lessons, questions, payments, notifications and settlements.

### SEC-19 · Low · Bookmarks of unpublished questions
Bookmarking and listing are restricted to `status = 'published'`.

**Where:** `server/src/modules/questions/bank.service.ts` (`bookmark`, `bookmarks`).

### SEC-20 · Dependency audit (`npm audit --omit=dev`)

| Project | Change | Remaining |
|---------|--------|-----------|
| server | `overrides.uuid = $uuid` (11.1.1) for exceljs and node-cron; both were smoke-tested and the unit suite passes. **nodemailer 6.10 → 10.0.16** (patched; a release more than two weeks old was picked over the day-old 10.2.x). The adapter only uses `createTransport` (SMTP URL / options, `jsonTransport`) and `sendMail`, which are unchanged; `tests/unit/providers-messaging.test.ts` (SMTP via a stream transport) passes. `npm audit --omit=dev`: 0 vulnerabilities. | Dev-only: vitest 3 / tinypool advisories (fix needs vitest 5, a major upgrade of the test runner). |
| website/user | axios 1.7.9 → 1.20.0, katex 0.16.11 → 0.16.47, react-router-dom 6.28.0 → 6.30.6 (exact pins kept) | katex < 0.19 and react-router < 7.18 (moderate). The fixes need major upgrades. |
| website/admin | katex → 0.16.47, react-router-dom → 6.30.6 | Same as website/user. |

### SEC-21 · Medium · Dev-only behaviours and production startup checks
**Before:** `NODE_ENV` defaulted to `development`, and every dev convenience was keyed on `!isProd`. A deploy that forgot `NODE_ENV` got the OTP bypass code, LAN CORS, the MockGateway with mock confirm, and public API docs.

**Fix:**
- Each behaviour has its own flag: `API_DOCS_PUBLIC`, `DEV_OTP_BYPASS`, `DEV_LAN_CORS`, `DEV_MOCK_PAYMENTS`, `DEV_UNSIGNED_NOTIFICATION_WEBHOOKS`. The code reads the resolved `devFlags` from `config/env.ts`, never `!isProd`.
- Outside production, an unset flag is on only when `NODE_ENV` was set **explicitly** to `development` or `test`. With `NODE_ENV` unset, all of them are off. `DEV_UNSIGNED_NOTIFICATION_WEBHOOKS` is never on by default. Local dev (`server/.env` has `NODE_ENV=development`) keeps working unchanged.
- In production every flag is forced off. Setting one to `true` there is a startup error.
- `envProblems()` now refuses to start in production unless: `PUBLIC_API_URL`, `ADMIN_APP_URL` and `USER_APP_URL` are public `https://` URLs; `CORS_ORIGINS` has only `https://` non-localhost origins; `TRUST_PROXY` is set (and not `true`); `DB_SSL=true`; the JWT secrets differ (SEC-06). The check runs for the server and every script that loads the env.
- The provider status log reports `payments.<gateway>: disabled` / `mock-confirm` from the same flags.

**Where:** `server/src/config/env.ts` (`resolveDevFlags`, `envProblems`, `devFlags`), `server/src/app.ts`, `server/src/modules/auth/student-auth.service.ts` (`isDevBypass`), `server/src/modules/settings/service.ts`, `server/src/modules/payments/{providers,student.service,webhook.service}.ts`, `server/src/modules/payments/gateways/common.ts`, `server/src/modules/public/service.ts`, `server/src/common/providers/status.ts`, `server/.env.example`, `docs/DEPLOYMENT.md`.

### SEC-22 · Medium · `trust proxy`
`TRUST_PROXY` sets Express `trust proxy`: a hop count (`1` on Render / Fly / Railway), `false`, or a list of proxy addresses / CIDRs / presets. Unset means `loopback` (only a local dev proxy is trusted). Production requires it and rejects `true`, which would trust every client-supplied `X-Forwarded-For` hop. `render.yaml` and `fly.toml` set `TRUST_PROXY=1`.

**Where:** `server/src/config/env.ts` (`trustProxySetting`), `server/src/app.ts`.

### SEC-23 · Medium · Shared rate-limit store
`RATE_LIMIT_STORE=postgres` swaps the in-memory counters for `PostgresRateLimitStore`. It keeps one fixed-window row per limiter key in `eduway_platform_rate_limits`, an UNLOGGED table from migration 403, using a single atomic upsert per request. Expired windows are swept at most once a minute per process. A store failure lets the request through and is logged (`passOnStoreError`). `memory` stays the default.

**Where:** `server/src/common/middleware/rateLimit.ts`, `server/src/db/migrations/403_security_followups.sql`.

### SEC-24 · Medium · Payment settlement checks
**Fix:**
- `settlementProblem()` in the webhook core checks every success event.
  - Without an amount, the event is rejected. It is recorded (`payment_events`, `rejected: amount_missing`), the payment stays pending and the event id is **not** consumed, so a later delivery with the amount can still settle it.
  - A wrong amount or a currency different from `payments.currency` fails the payment (`amount_mismatch` / `currency_mismatch`).
- ZainCash, FastPay and Qi Card refuse a non-IQD checkout before calling the gateway.
- Events carry the gateway's currency: ZainCash is always IQD; FastPay `validate` and Qi `status` report it. An empty amount is now `null`, not `0`.
- Replay windows:
  - ZainCash callback tokens whose `iat` is more than 1 h from server time are refused.
  - Signed generic webhooks (MockGateway, the hosted AsiaHawala / Visa adapters) check `created` within ±5 min. It is required for the hosted adapters and checked when present for the mock.
  - FastPay and Qi publish no signed timestamp. Their notifications are re-validated with the gateway API, and event ids are idempotent, so a replay cannot change state.

**Where:** `server/src/modules/payments/webhook-core.ts`, `webhook.service.ts`, `providers.ts` (`parseGeneric`), `gateways/{common,zaincash,fastpay,qicard}.ts`.

### SEC-25 · Low · Notification receipts
`/webhooks/notifications/:provider` needs a valid `X-Signature` in every environment. Without `NOTIFICATION_WEBHOOK_SECRET`, receipts are rejected unless `DEV_UNSIGNED_NOTIFICATION_WEBHOOKS=true`, which is never allowed in production. A receipt only updates deliveries sent through that provider; `twilio` also matches `twilio-whatsapp`.

**Where:** `server/src/modules/notifications/routes.ts` (`verifyReceiptSignature`), `server/src/modules/notifications/service.ts` (`receipt`).

### SEC-26 · Low · TOTP replay and recovery codes
- The accepted TOTP time step is stored in `admin_users.mfa_last_used_step` (migration 403) with a compare-and-set update. The same or an older step is refused, including two parallel logins with one code. This covers `/auth/admin/login` (`totp`), `/auth/admin/mfa/verify` and the TOTP path of `/mfa/disable`.
- Recovery codes (10, `XXXXX-XXXXX`, stored as HMAC hashes at enrolment) are accepted at login and step-up. The format is case- and dash-insensitive. A code is consumed by `array_remove` in the same statement that checks it, so it works once. Failed codes count toward the existing MFA lockout. The audit summary says "Signed in with a 2FA recovery code".
- The admin portal's 2FA screen has a "Use a recovery code instead" option.

**Where:** `server/src/modules/auth/admin-auth.service.ts` (`totpStep`, `consumeTotp`, `consumeRecoveryCode`), `server/src/modules/auth/schemas.ts`, `website/admin/src/pages/auth/Verify2FA.tsx`.

### SEC-27 · Low · Refresh-token reuse history
Each rotation pushes the old hash onto `sessions.previous_token_hashes` (migration 403, GIN-indexed). The list keeps the last 5. A token from any of them is detected as reuse, which revokes the session family as before.

**Where:** `server/src/modules/auth/sessions.ts` (`REFRESH_HASH_HISTORY`, `findByRefreshToken`, `rotate`).

### SEC-28 · Low · Mock confirm scope
`POST /payments/mock/:id/confirm` needs `DEV_MOCK_PAYMENTS`. It works only for MockGateway payments and for gateways running as a dev stub (no credentials). The mock webhook can only lock payments of those providers (`mockSettleableProviders`), never a checkout that went to a configured gateway.

**Where:** `server/src/modules/payments/student.service.ts` (`mockConfirmAllowed`), `server/src/modules/payments/webhook.service.ts`.

### SEC-29 · Low · LIKE wildcards
`escapeLike` / `likeContains` / `likePrefix` escape `\`, `%` and `_`. Postgres' default LIKE escape is `\`. They are used by every search that built a pattern from input: admins, AI flags / flagged users, AI retrieval, notification templates / campaigns / deliveries, payments, refunds, public schools, question codes, audit log, security alerts, admin sessions, legal acceptances, feature flags, settlements, students, support tickets and subscriptions. `learning-core/text.ts` already strips the wildcard characters.

**Where:** `server/src/common/utils/like.ts`.

### SEC-30 · Low · Export filters
`ExportRequest.filters` is now validated to what a query string can produce: flat strings, numbers, booleans, null, or arrays of strings and numbers. Nested objects are rejected (400) and the limit is 50 keys. Single-string keys (`q`, `search`, `sort`, `report`, `from`, `to`, `partnerType`, `period`) are coerced to one string, and prototype keys are dropped. A wrong type is a 400, or harmless, instead of a 500. The SQL was already parameterized.

**Where:** `server/src/common/services/exporter.ts` (`normalizeExportFilters`).

### SEC-31 · Low · Internals in public errors
In production, `/health/ready` returns only `status` and `latencyMs` per check; the admin system-health panel keeps the messages. Postgres constraint names (`details.constraint` on 409/400) are only sent outside production.

**Where:** `server/src/modules/health/routes.ts` (`publicChecks`), `server/src/common/middleware/errorHandler.ts`.

### SEC-32 · Low · SVG uploads
No upload purpose accepts `image/svg+xml` any more: `logo` is PNG/JPEG/WebP and `question_image` is raster only. At attach time an object stored as SVG is refused for every purpose, admin uploads included. The admin logo picker no longer offers SVG. `npm run buckets` now also syncs the MIME allowlists of our existing buckets, which drops SVG; run it once per environment.

**Where:** `server/src/common/services/storage.ts`, `server/src/common/middleware/upload.ts`, `server/scripts/storage-buckets.ts`, `website/admin/src/pages/settings/General.tsx`.

### SEC-33 · Low · Practice result and README credential
`GET /practice/:id/result` answers 409 `ATTEMPT_IN_PROGRESS` while the session is in progress. `finish` still returns the result. `website/admin/README.md` no longer documents a password; it points to `SEED_SUPER_ADMIN_PASSWORD`.

**Where:** `server/src/modules/practice/service.ts`, `website/admin/README.md`.

### SEC-34 · Low · Quiz answer/submit race
`answer()` locks the attempt row (`FOR UPDATE`) inside its transaction and re-checks `in_progress` before it writes the answer, mistake and activity rows. `submit()` takes the same lock.

**Where:** `server/src/modules/quizzes/service.ts`.

## Verified, no change needed
- **RBAC:** all 432 routes go through `defineRoute`; there are no raw `router.get` calls. Every one of the 307 admin routes uses `auth: 'admin'`. Every `/admin` route has a `permission`/`anyPermission`, except the self-service routes `/admin/me*` and `/admin/lookups` (now enforced by a test). Super Admin bypasses. Mandatory-MFA admins are confined to their profile and MFA endpoints until they enrol.
- **IDOR:** every student `:id` route was traced to SQL and is scoped by `user_id`. This covers sessions, mistakes, quiz/practice/exam attempts, the today-plan, AI conversations and messages, notifications, payments, receipts, lesson notes, bookmarks, push tokens and storage downloads. The `any` receipt route requires `payments.view` for admins and ownership for students.
- **Validation:** every `:param` route has a zod params schema (tested). Bodies and queries are parsed and replaced with zod output, so unknown keys are stripped. There is no `z.any()` and no passthrough on mutating admin bodies; `settings/:section` re-parses per section.
- **SQL:** all queries are parameterized. `ORDER BY` columns come from whitelists, dynamic `SET` lists are built from server-side literals, and no supabase-js string filters take user input.
- **Headers and CORS:** helmet is enabled (CSP, HSTS, nosniff, frame-ancestors, no `x-powered-by`). CORS uses an allowlist of configured origins plus LAN/localhost origins in non-production only; a live probe from `https://evil.example` gets no `Access-Control-Allow-Origin`.
- **Errors:** 5xx responses return only `requestId`. Stacks are logged, never sent.
- **Secrets:** `.env` is ignored in every app, only `.env.example` files are tracked, and a scan of the git history (all commits) and the working tree found no keys, JWTs or credentials. The one database URL found is a placeholder.

## Open (not changed)

None of SEC-21..34 remain open. Residual notes:
- SEC-24: FastPay and Qi Card publish no signed timestamp. Replay safety for them comes from the gateway re-check and idempotent event ids, not a time window. Confirm the field names with each gateway before go-live (TODOs in the adapters).
- SEC-30: filters are validated generically (shape and types), not with each list endpoint's own query schema.
- SEC-32: existing buckets keep `image/svg+xml` in their Supabase allowlist until `npm run buckets` is run. The API already refuses SVG at attach time.
- SEC-33/34 change SQL paths that need a database. They are covered by review and the integration suite, not by the unit suite.
- Dependency audit: website majors (katex, react-router) and the dev-only vitest/tinypool advisories, as listed under SEC-20.

## Verification
In `server/` (after SEC-21..34):
- `NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 25 files, 308 tests, all pass (new: `security-followups.test.ts`, SEC-24 cases in `commerce-webhook.test.ts`).
- `npm run check-prefix`: pass (18 SQL files, every object prefixed `eduway_platform_`).
- `npm run migrate`: `403_security_followups.sql` recorded as applied (additive, idempotent, no DROP/TRUNCATE).
- `npm audit --omit=dev`: 0 vulnerabilities.
- `website/admin`: type-check and ESLint pass for the 2FA recovery-code screen.
