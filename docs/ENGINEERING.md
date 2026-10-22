# EDUWAY Platform — Engineering Conventions (binding for every builder)

Monorepo: `server/` (Express 5 + TS + Supabase), `website/user` (Vite React), `website/admin` (Vite React),
`app/user` (Expo SDK 57). One backend serves all three. The admin portal is the single control centre for web
and app users.

## 1. Shared database — strict prefix policy (non-negotiable)
The Supabase project is SHARED with other products.
- Every table, view, materialized view, function, trigger, sequence, enum/type, index, constraint and RLS policy
  we create starts with `eduway_platform_` (e.g. `eduway_platform_users`, `eduway_platform_fn_set_updated_at`,
  `eduway_platform_trg_users_updated_at`, `eduway_platform_enum_content_status`, `eduway_platform_idx_lessons_subject`,
  `eduway_platform_pol_users_deny_anon`). Constraints: `eduway_platform_<table>_<col>_fkey`, `_pkey`, `_key`, `_check`
  — always name them explicitly.
- Storage buckets: `eduway-platform-thumbnails`, `eduway-platform-resources`, `eduway-platform-question-images`,
  `eduway-platform-videos`.
- pg-boss schema: `eduway_platform_pgboss`.
- Tables live in schema `public`. Never create, alter, drop or query an unprefixed object. No `DROP SCHEMA`,
  no resets, no `TRUNCATE` outside our prefix. Never touch other projects' auth users; every Supabase Auth user we
  create gets `app_metadata.app = "eduway_platform"`; our own `eduway_platform_users.auth_user_id` links them.
- Extensions are shared objects: do NOT `CREATE EXTENSION`. Migrations check `pg_extension` and fail with a clear
  message if `vector` / `pgcrypto` are missing (the owner enables them in the dashboard). Use `gen_random_uuid()`.
- Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DO $$ … IF NOT EXISTS …`).
- Code: `TABLE_PREFIX = 'eduway_platform_'` and `t('users')` in `server/src/config/constants.ts`. Every SQL string
  and every supabase-js `.from()` uses `t()` / `${T.users}` — never a raw table name. `TEST=1` switches the prefix
  to `eduway_platform_test_` (integration tests only; cleaned after).
- `npm run check-prefix` (scripts/check-prefix.ts) scans migrations + src and fails on any unprefixed object.

## 2. API conventions
- Base: `/api/v1`. Docs: `/api/docs` (OpenAPI from zod via zod-to-openapi).
- Success envelope: `{ "success": true, "data": <payload>, "meta"?: { "page", "pageSize", "total", "nextCursor" } }`.
- Error envelope: `{ "success": false, "error": { "code": "SNAKE_CODE", "message": "<localized>", "details"?: any } }`.
  HTTP: 400 VALIDATION_ERROR, 401 UNAUTHORIZED / TOKEN_EXPIRED, 402 SUBSCRIPTION_REQUIRED (payload
  `details.locked = { reason, subjectId?, packageIds? }`), 403 FORBIDDEN / NOT_ENTITLED, 404 NOT_FOUND,
  409 CONFLICT, 422 BUSINESS_RULE, 429 RATE_LIMITED, 500 INTERNAL. Messages localized by `Accept-Language` (en|ar).
- Pagination: list endpoints accept `page` (1-based) + `pageSize` (default 20, max 100) OR `cursor`; return `meta`.
  Filters are query params; search param is `q`; sorting `sort=field` / `sort=-field`.
- JSON fields are camelCase in the API; snake_case in SQL. Repositories map rows → DTOs.
- Bilingual content fields are returned as `{ "en": "...", "ar": "..." }` objects (the frontends' `Localized` type),
  stored as `<field>_en` / `<field>_ar` columns.
- IDs are UUIDs except where a stable slug is part of the domain (subjects keep `slug` like `math`; the API returns
  `id` (uuid) and `slug`). Frontends must not assume numeric ids.
- Dates: ISO-8601 UTC strings. Money: integer minor units are NOT used; IQD amounts are integers in IQD.
- Headers: `Authorization: Bearer <access>`, `Accept-Language`, `X-Request-Id` (echoed), `X-Client-Platform`
  (`web` | `ios` | `android` | `admin`), `X-Device-Id` (stable per install/browser), `Idempotency-Key` on payments
  and critical mutations.

## 3. Auth
- Students: `POST /auth/send-otp { phone }` → `POST /auth/verify-otp { phone, code, deviceId, platform }` returns
  `{ accessToken, refreshToken, expiresIn, user, isNewUser }`. Registration details via `POST /auth/register`
  (with a verified OTP ticket) or profile completion. Access JWT 15 min, refresh 30 days, rotated on
  `POST /auth/refresh { refreshToken }`. Refresh tokens hashed in `eduway_platform_sessions`.
- Dev OTP: `MockSmsProvider` logs the code; in non-production the code `123456` is also accepted for the seeded demo
  student (setting-controlled, `otp.dev_bypass_code`).
- Admins: `POST /auth/admin/login { email, password, totp? }` → admin tokens (separate audience `eduway-admin`).
  `GET /auth/me` returns `{ user, permissions: string[], roles: string[] }` for admins and the student profile +
  entitlements for students.
- RBAC permission keys: `<module>.<action>` (`view|create|edit|delete|approve|export`), e.g. `content.edit`,
  `payments.export`. Super Admin bypasses.

## 4. Server module layout
`server/src/modules/<name>/{routes,controller,service,repository,schemas,types,index}.ts`. Routes register zod
schemas with the OpenAPI registry. Controllers are thin; services hold rules; repositories hold SQL (pg pool,
parameterized). All commercial values (prices, thresholds, tiers, allowances, validity, limits) come from tables /
settings, never constants in code.

## 5. Frontend integration conventions
- `src/api/client.ts`: axios instance, baseURL `import.meta.env.VITE_API_URL` (web) / `process.env.EXPO_PUBLIC_API_URL`
  (app), interceptors for access token, single-flight refresh + retry, logout on refresh failure, Accept-Language,
  X-Request-Id, X-Client-Platform, X-Device-Id, error normalizer → localized toast.
- `@tanstack/react-query` for reads (query keys per module in `src/api/keys.ts`), mutations invalidate/optimistic.
- One file per domain under `src/api/` (`auth.ts`, `subjects.ts`, …) exporting typed functions + hooks.
- Existing UI, animations, translations and states stay; loading → existing skeletons, errors → existing error UI.
- When finished, no imports from `src/data` may remain and the mock data folder is deleted.
- Dev URLs: server `http://localhost:4100` (port 4000 is used by another app on the dev machine), website/user `http://localhost:5173`, website/admin `http://localhost:5174`,
  Expo dev server `8081`. The phone reaches the API via `EXPO_PUBLIC_API_URL` (LAN IP or tunnel).

## 6. Contract
`docs/API_CONTRACT.md` is the single source of truth for endpoints and DTO shapes. Server builders implement it
exactly; frontend builders integrate against it. Any change → update the contract in the same change.
