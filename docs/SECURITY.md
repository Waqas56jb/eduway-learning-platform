# EDUWAY: Backend Security Review

Review date: 2026-10-23. Scope: `server/` (Express 5 + TS + Supabase). The dependency audit also covers `website/user` and `website/admin`.

How the review was done: source review of every module, a route manifest check, a live read-only inspection of the shared database's grants and RLS on `eduway_platform_*` objects only, and light probes of the running API on :4100.

Regression tests are in `server/tests/unit/security.test.ts`. They read the route manifest that is now recorded by `defineRoute` (`server/src/common/http/route.ts`, `routeManifest`). The tests fail when a future route:
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
| SEC-20 | Medium | Dependency vulnerabilities | Partly fixed (see below) |
| SEC-21..33 | Low to Medium | Remaining items | Open (see below) |

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
`/api/docs` and `/api/docs/openapi.json` are now served only when `NODE_ENV !== 'production'` or `API_DOCS_PUBLIC=1`.

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
| server | `overrides.uuid = $uuid` (11.1.1) for exceljs and node-cron; both were smoke-tested and the unit suite passes | **nodemailer ≤10.0.9 (high)**: the fix is a major upgrade (6 → 10). This is the email adapter area, owned by the provider agent. Upgrade and retest SMTP. |
| website/user | axios 1.7.9 → 1.20.0, katex 0.16.11 → 0.16.47, react-router-dom 6.28.0 → 6.30.6 (exact pins kept) | katex < 0.19 and react-router < 7.18 (moderate). The fixes need major upgrades. |
| website/admin | katex → 0.16.47, react-router-dom → 6.30.6 | Same as website/user. |

## Verified, no change needed
- **RBAC:** all 432 routes go through `defineRoute`; there are no raw `router.get` calls. Every one of the 307 admin routes uses `auth: 'admin'`. Every `/admin` route has a `permission`/`anyPermission`, except the self-service routes `/admin/me*` and `/admin/lookups` (now enforced by a test). Super Admin bypasses. Mandatory-MFA admins are confined to their profile and MFA endpoints until they enrol.
- **IDOR:** every student `:id` route was traced to SQL and is scoped by `user_id`. This covers sessions, mistakes, quiz/practice/exam attempts, the today-plan, AI conversations and messages, notifications, payments, receipts, lesson notes, bookmarks, push tokens and storage downloads. The `any` receipt route requires `payments.view` for admins and ownership for students.
- **Validation:** every `:param` route has a zod params schema (tested). Bodies and queries are parsed and replaced with zod output, so unknown keys are stripped. There is no `z.any()` and no passthrough on mutating admin bodies; `settings/:section` re-parses per section.
- **SQL:** all queries are parameterized. `ORDER BY` columns come from whitelists, dynamic `SET` lists are built from server-side literals, and no supabase-js string filters take user input.
- **Headers and CORS:** helmet is enabled (CSP, HSTS, nosniff, frame-ancestors, no `x-powered-by`). CORS uses an allowlist of configured origins plus LAN/localhost origins in non-production only; a live probe from `https://evil.example` gets no `Access-Control-Allow-Origin`.
- **Errors:** 5xx responses return only `requestId`. Stacks are logged, never sent.
- **Secrets:** `.env` is ignored in every app, only `.env.example` files are tracked, and a scan of the git history (all commits) and the working tree found no keys, JWTs or credentials. The one database URL found is a placeholder.

## Open (not changed)

| ID | Severity | Item | Recommendation |
|----|----------|------|----------------|
| SEC-21 | Medium | `NODE_ENV` defaults to `development`. A production deploy that forgets it gets the OTP dev bypass, LAN CORS, the mock gateway, mock confirm and public API docs. | Set `NODE_ENV=production` in every deployed environment, including staging if it holds real data. Consider a startup assertion keyed on `PUBLIC_API_URL`. |
| SEC-22 | Medium | `trust proxy = 1` (`server/src/app.ts`). Without exactly one reverse proxy, `X-Forwarded-For` is spoofable and the per-IP rate limits and lockout IPs can be bypassed. | Match the setting to the real proxy topology. |
| SEC-23 | Medium | Rate-limit store is in memory (per process). | Use a shared store (Redis or Postgres) before scaling horizontally. |
| SEC-24 | Medium | Payment adapters (`server/src/modules/payments/providers.ts`, `gateways/*`, owned by the provider agent): no signed-timestamp or replay window; currency is not compared; `payment.succeeded` without an amount is accepted. | Require amount == `payment.total` and currency == `payment.currency`, and verify a timestamp within about 5 minutes in each adapter's `parseWebhook`/`verifyWebhook`. |
| SEC-25 | Low | `/webhooks/notifications/:provider` accepts unsigned receipts when `NOTIFICATION_WEBHOOK_SECRET` is unset outside production. The provider param is not bound to the delivery row. | Fail closed whenever the secret is unset, and filter by provider. |
| SEC-26 | Low | TOTP codes can be replayed within their 90 s window (no last-used-step tracking). Recovery codes are generated but not accepted at login. | Store the last accepted step per admin, and add a recovery-code login path. |
| SEC-27 | Low | Reuse detection covers only one rotation back (`previous_token_hash`). | Keep a short history of hashes per family if needed. |
| SEC-28 | Low | `POST /payments/mock/:id/confirm` (non-production only) can mark a real-gateway checkout as paid. This is intended for dev/staging. | Make sure staging uses `NODE_ENV=production` or disables mock confirm. |
| SEC-29 | Low | ILIKE searches don't escape `%`/`_` (wildcard abuse and slow scans, not injection). | Add a shared `escapeLike()`. |
| SEC-30 | Low | Export `filters` (`z.record(z.unknown())`) are cast, not parsed. Wrong types cause 500s; the SQL stays parameterized. | Parse with each list query schema `.partial()`. |
| SEC-31 | Low | `/health/ready` is public and shows the error text from failed checks. pg constraint names appear in 409 details. | Hide check messages in production. |
| SEC-32 | Low | SVG is still allowed for the admin-only `logo` and `question_image` purposes, and the thumbnails and question-images buckets allow `image/svg+xml`. | Sanitize SVGs or drop the type. Serve user files from a separate origin (already the case: supabase.co). |
| SEC-33 | Low | Practice result returns answers for an unfinished session (the student is already entitled to them via the bank). `website/admin/README.md` documents an `Admin@123` sample password. | Require `status = 'finished'`, and remove the sample credential from the README. |
| SEC-34 | Low | Quiz answer/submit race: `quizzes/service.ts` `answer()` reads the attempt without `FOR UPDATE`, so a late answer can add mistake/activity rows after submit (score unaffected). | Lock the attempt row inside the transaction. |

## Verification
In `server/`:
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 24 files, 272 tests, all pass, including 18 new security tests.
- `npm run check-prefix`: pass.
- `npm run migrate`: 402 recorded as applied.
