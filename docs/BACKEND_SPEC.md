# EDUWAY — Backend + Integration Specification (client brief, verbatim requirements)

Complete the EDUWAY platform end-to-end. Three mock frontends exist: `website/user` (React + Vite + TS, student
site + landing), `website/admin` (React + Vite + TS — single admin for BOTH website and mobile app), `app/user`
(Expo + TS, student app). Each currently runs on static mock JSON + local Zustand state.

JOB (in order, nothing skipped):
1) Build the COMPLETE production backend in `server/` (Node.js + Express + TypeScript + Supabase) — modular, validated, tested.
2) Replace ALL mock data in website/user, website/admin and app/user with real API integration. Every page, button and action must hit the real backend. No mock JSON may remain.
3) Verify everything: CLI tests, API tests, build checks, manual flow checklist.

Do NOT remove or simplify any existing feature, page, screen, translation, animation or design — only wire them to real data. If a UI feature has no backend yet, build it; never delete the feature.

Credentials live in `server/.env` (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL). Read from env only. Never hardcode secrets.

## CRITICAL — SHARED SUPABASE PROJECT, STRICT TABLE PREFIX
The Supabase project is SHARED with 4–5 other projects. ZERO overlap with their tables, views, functions, triggers, enums, buckets or policies.
- EVERY table name starts with `eduway_platform_`.
- EVERY view, materialized view, function, trigger, sequence, enum type, index and RLS policy also starts with `eduway_platform_` (e.g. `eduway_platform_fn_set_updated_at`, `eduway_platform_trg_lessons_updated_at`, `eduway_platform_enum_content_status`, `eduway_platform_idx_lessons_subject`).
- EVERY Storage bucket prefixed: `eduway-platform-thumbnails`, `eduway-platform-resources`, `eduway-platform-question-images`, `eduway-platform-videos`.
- pg-boss queue schema named `eduway_platform_pgboss` (schema option). Never the default "pgboss" schema.
- Do NOT create, alter, drop or query any object without the prefix. No DROP SCHEMA / reset commands. Do NOT touch auth.users of other projects — use our own `eduway_platform_users` table with Supabase Auth user ids stored in `auth_user_id`, and set `app_metadata.app = "eduway_platform"` on every auth user we create.
- Migrations idempotent (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION), only referencing prefixed objects.
- Single constant `TABLE_PREFIX = 'eduway_platform_'` in `server/src/config/constants.ts` and helper `t('users') → 'eduway_platform_users'`. ALL queries (pg + supabase-js .from()) use the helper. ESLint rule / custom lint script fails the build if `.from('` or `FROM `/`JOIN `/`INSERT INTO `/`UPDATE ` is followed by a name not starting with `eduway_platform_`.
- `scripts/check-prefix.ts` scans all migrations + src for unprefixed object names and fails CI. `tests/unit/prefix.test.ts` queries information_schema after migration and asserts every object we created starts with `eduway_platform_`.

## PART 1 — SERVER (`server/`)
STACK: Node.js 20 + Express 5 + TypeScript (strict), tsx dev, tsc build. Supabase: Postgres (SQL migrations), Supabase Auth (phone OTP students / email+password admins, all with app_metadata.app = "eduway_platform"), Supabase Storage (prefixed buckets), pgvector for AI retrieval.
Libraries: @supabase/supabase-js, pg, zod, express-async-errors, helmet, cors, compression, express-rate-limit, pino + pino-http, jsonwebtoken, bcryptjs, otplib (admin MFA), multer, pg-boss (schema eduway_platform_pgboss), node-cron, swagger-ui-express + zod-to-openapi, dayjs, uuid, dotenv, nodemailer, axios. Testing: vitest + supertest, seed script, CLI smoke test.

FOLDER STRUCTURE (modular, feature-based):
```
server/
  src/
    app.ts, server.ts
    config/   (env.ts zod-validated, supabase.ts anon+service clients, db.ts pg pool, logger.ts, constants.ts with TABLE_PREFIX + t() + BUCKETS)
    common/
      middleware/ (auth, rbac, validate, rateLimit, errorHandler, requestId, audit, idempotency, upload, locale)
      errors/     (AppError, NotFound, Forbidden, Validation, Conflict, Payment)
      utils/      (pagination cursor+offset, response envelope, crypto, phone +964 normalize, dates, i18n)
      types/
    modules/
      auth/ users/ admins/ roles/
      content/ (subjects, units, topics, lessons, videos, resources, workflow)
      questions/ quizzes/ practice/ mistakes/ exams/
      packages/ subscriptions/ payments/ schools/ marketers/
      ai-tutor/ progress/ analytics/ notifications/ settings/ security/ search/ storage/ health/
      (each module: routes.ts, controller.ts, service.ts, repository.ts, schemas.ts, types.ts, index.ts)
    jobs/      (pg-boss setup + workers)
    db/ migrations/ (001_init.sql … numbered, idempotent, ALL objects prefixed), seed/ (seed.ts), sql/ (prefixed views + functions for analytics)
    docs/      (openapi)
  tests/ (unit, integration, smoke)
  scripts/ (migrate.ts, seed.ts, smoke.ts, create-admin.ts, check-env.ts, check-prefix.ts, storage-buckets.ts)
  .env.example, package.json, tsconfig.json, vitest.config.ts, README.md
```

DATABASE — full SQL migrations with FKs, indexes, updated_at triggers, RLS (service role used by server; RLS enabled with prefixed policies so other projects' anon keys cannot read our data). Tables (ALL prefixed; minimum set):
users, student_profiles, admin_users, roles, permissions, role_permissions, admin_roles, sessions, devices, otp_codes, legal_documents, legal_acceptances,
subjects, units, topics, lessons, lesson_versions, video_assets, lesson_resources, content_workflow_log,
questions, question_options, tags, question_tags, question_imports, question_reviews,
quiz_rules, quiz_sets, quiz_attempts, quiz_attempt_answers, practice_sessions, practice_answers, bookmarks,
mistake_records, mistake_history,
exam_blueprints, exam_blueprint_sections, exam_attempts, exam_attempt_answers,
packages, package_subjects, promotions, promotion_redemptions, subscriptions, entitlements, entitlement_logs,
payments, payment_events, refunds, receipts, idempotency_keys,
schools, school_students, marketers, marketer_schools, incentive_rules, incentive_rule_tiers, settlements, settlement_items,
ai_conversations, ai_messages, ai_usage, ai_settings, ai_flags, embeddings,
watch_progress, lesson_completions, streaks, daily_activity,
notification_templates, notifications, notification_deliveries, campaigns, push_tokens,
settings, feature_flags, app_settings, audit_logs, suspicious_events, exports_log, analytics_daily_rollups.
All commercial values (prices, thresholds, tiers, allowances, validity, renewal rules, taxes) live in tables/settings — never in code.

AUTH & SECURITY
- Students: mobile OTP (own `eduway_platform_otp_codes` table; expiry, resend limit, max attempts, lockout read from settings; MockSmsProvider logs the code in dev; provider abstraction for real SMS/WhatsApp). Access JWT 15m + refresh 30d rotated, hashed in `eduway_platform_sessions` with device id, platform (web/ios/android), ip, user agent. Device limit from settings. Logout device / logout all / admin force-logout.
- Admins: email + bcrypt password + optional TOTP MFA. Separate JWT audience. Invite flow.
- RBAC middleware `requirePermission('module.action')`; permissions seeded for every module (view/create/edit/delete/approve/export); Super Admin bypass.
- Server-side entitlement check (subject-based + time-based) on lesson stream, quiz, question bank, exam, AI tutor → 402/403 with locked payload.
- Rate limits on auth/OTP, AI tutor, search, webhooks. Idempotency-Key header on payments + critical mutations (stored in `eduway_platform_idempotency_keys`).
- Audit middleware: every admin mutation → `eduway_platform_audit_logs` (actor, action, entity, before/after JSON, ip, device).
- helmet, cors (website/user, website/admin origins + app), compression, request ids, pino logs, centralized error handler → `{ success:false, error:{ code, message, details } }` localized en/ar via Accept-Language.
- Signed expiring URLs for all media; raw storage paths never exposed.

API — REST /api/v1, every endpoint zod-validated (body/params/query), envelope `{ success, data, meta }`, pagination meta, OpenAPI at /api/docs. Implement every endpoint the three frontends need (audit each page and add missing ones). Minimum groups:
- /auth: send-otp, verify-otp, register, refresh, logout, logout-all, me, accept-legal, admin/login, admin/mfa/setup, admin/mfa/verify, admin/forgot-password, admin/reset-password
- /students (admin): list w/ filters (status, package, governorate, school, source, dates, search, platform), get, lock/unlock, sessions, force-logout, notes, manual-access-grant (reason + duration → entitlement_logs), update-school/referral, activity
- /me: profile get/update, sessions, devices, push-token, notification prefs
- /subjects /units /topics /lessons (CRUD, reorder, workflow draft→review→approved→scheduled→published→archived, versions, prerequisites, completion threshold), /lessons/:id/stream-url (signed), /resources, /videos (register asset, processing status, views)
- /questions (CRUD, filters, tags, LaTeX, images, duplicate-check, review queue approve/reject, bulk-import template/upload/preview/commit), /questions/:id/preview
- /quiz-rules (defaults + per lesson), /quizzes/:lessonId/start (randomized pool, randomized options, up to 5 alternative sets), /quizzes/attempts/:id/answer, /submit, /attempts
- /practice/start, /:id/answer, /:id/finish, /bookmarks
- /mistakes (filters unresolved/reviewed/mastered/repeated; group by subject/unit/topic/date; repeat count; lesson link), /mistakes/:id/retry (mastery update keeps history)
- /exam-blueprints (CRUD, sections, difficulty distribution), /exams/available, /exams/:blueprintId/start, /exams/attempts/:id/autosave, /flag, /submit, auto-submit job, /exams/attempts/:id/result (score, topic breakdown, time, recommendations → mistakes)
- /packages (CRUD, subjects, validity, renewal, access start), /promotions (CRUD, validate)
- /subscriptions: my, admin list, manual grant, upgrade/downgrade, cancel, expiry + reminders job
- /payments: initiate, webhook/:provider (signature verify + idempotent), list/filter, detail timeline, receipt, refund full/partial, reconciliation summary + export. Gateway abstraction: PaymentProvider interface + MockGateway (dev) + stub for a real provider.
- /schools (CRUD, referral code/link, attributed students, incentive progress), /incentive-rules (versioned, threshold + tiers, effective dates, preview calculator), /settlements (schools + marketers: generate for period, approve, mark paid, export)
- /marketers (CRUD, assign/unassign schools with double-attribution guard + admin override reason → audit, milestones, performance)
- /ai-tutor: conversations, messages (SSE streaming), allowance status, admin usage dashboard + cost metrics, settings (allowance per period, reset cycle, provider/model, retrieval toggles, safety rules, global disable), per-user disable, flags/abuse controls. Retrieval from lesson transcripts + question explanations via `eduway_platform_embeddings` (pgvector).
- /progress: watch upsert, completion, dashboard summary, subject progress, weak topics, streak calendar
- /analytics: business + learning (all metrics), split by platform, /exports csv/xlsx (permission-controlled + logged)
- /notifications: my list, mark read, admin templates CRUD (EN/AR, variables), campaigns (audience builder preview, send now/schedule), delivery log; Expo push + in-app + provider abstraction SMS/WhatsApp/email
- /settings: general, otp, feature-flags, legal documents (versions, publish, acceptance stats), app-settings (min version, force update, maintenance + message EN/AR, device limit, session timeout), support contacts
- /security: roles + permission matrix, admin users, audit logs (filters, diff), sessions revoke, suspicious activity resolve/block
- /search: global scoped by role
- /storage: signed-upload-url, signed-download-url (prefixed buckets only)
- /health, /health/ready

JOBS (pg-boss, schema `eduway_platform_pgboss`): notification dispatch, subscription expiry + reminders, AI allowance reset per cycle, exam auto-submit, daily analytics rollups, settlement calculation, question import processing, video processing callback, embeddings generation.

TESTING & VERIFICATION
- Unit: entitlement engine, quiz randomization, exam timer/auto-submit, incentive calculator, AI allowance, webhook idempotency, RBAC, prefix test.
- Integration (supertest) for every route group against the real prefixed schema (test prefix `eduway_platform_test_` when TEST=1 so prod tables are untouched, cleaned after run).
- `scripts/smoke.ts`: CLI walking the full acceptance flow (OTP register → profile → pay via mock gateway → entitlement → stream URL → watch/resume → quiz → mistake created → exam start/autosave/submit → AI allowance decrements → admin changes allowance/prices/thresholds without deploy → duplicate webhook does not duplicate access → attribution reports reconcile → RBAC blocks unauthorized → audit logs exist → Arabic messages returned with Accept-Language: ar) printing a PASS/FAIL table.
- `scripts/storage-buckets.ts` creates the 4 prefixed buckets if missing.
- npm scripts: dev, build, start, migrate, seed, test, test:integration, smoke, lint, typecheck, check-prefix, docs.
- README: Supabase setup (enable pgvector, run storage-buckets, migrate, seed), run, test, deploy.

## PART 2 — FRONTEND INTEGRATION (replace ALL mock data)
In each frontend create `src/api`: axios instance (baseURL from VITE_API_URL / EXPO_PUBLIC_API_URL, Accept-Language from i18n, access-token interceptor, refresh-token interceptor with retry + logout, request id, error normalizer → localized toasts), @tanstack/react-query for reads (cache/invalidate/optimistic) and mutations for writes; existing skeletons/empty/error states driven by real states. Delete src/data mocks after migration; grep "mock" and "data/" — zero imports may remain.

- website/user: landing (subjects/packages from API), real OTP auth, dashboard, subjects, lessons (signed stream URL, watch progress every 10s + on pause/leave, resume), quizzes, question bank, bookmarks, my mistakes, exam simulator (server timer sync, autosave 15s, flag, submit, results), AI tutor (SSE + allowance), progress, subscription + checkout (mock gateway → webhook → entitlement), notifications, profile/sessions/legal acceptance, maintenance screen from app-settings.
- website/admin: wire EVERY module exactly as built — dashboard, users (all actions, sessions show platform web/ios/android), content (CRUD, reorder, workflow, video upload via signed URL with progress, resources), questions (CRUD, LaTeX, images, bulk import, review queue, duplicates), assessments, packages/promotions, payments (list, timeline, receipts, refunds, reconciliation), schools (incentive rules versioned + preview, settlements), marketers (assignment guard/override, milestones, settlements), AI tutor (usage, settings, abuse), analytics (all charts + exports, platform split), notifications (templates EN/AR, campaigns incl. push to app users, delivery log), settings (all tabs, legal versioning, feature flags, app-settings controlling the mobile app: min version/force update/maintenance), security (roles matrix, admin users, MFA, audit diff, sessions, suspicious), profile. Menu/actions gated by real permissions from /auth/me.
- app/user: same as website/user with Expo specifics — secure-store tokens, Expo push token → /me/push-token, video plays the signed URL (expo-video; expo-av no longer exists in SDK 57), background-safe watch sync, offline-tolerant exam autosave queue, SSE fallback to polling for AI tutor, force-update + maintenance screens from app-settings, deep link to subscription when locked.
Keep all EN/AR translations (add keys for backend errors), all animations and designs intact.

## PART 3 — FINAL VERIFICATION (must all pass)
- server: `npm run check-prefix && npm run typecheck && npm run lint && npm run test && npm run migrate && npm run seed && npm run smoke` → all green; print the list of all eduway_platform_* objects from information_schema to confirm no unprefixed object was created.
- website/user & website/admin: typecheck + lint + build → zero errors.
- app/user: `npx tsc --noEmit && npx expo export` → zero errors.
- docs/VERIFICATION.md: every page of each frontend with the endpoints it calls and ✅ status; fix every ❌.
- Root README: run order server → website/admin → website/user → app/user, env files, seeded credentials (super admin email/password, demo student mobile + dev OTP), prefix policy.
