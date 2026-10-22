# EDUWAY Server

Express 5 + TypeScript (strict, ESM) + Supabase (Postgres, Storage, Auth mirror). One API serves the student
website, the student app and the admin portal. Contract: [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md).
Conventions: [`../docs/ENGINEERING.md`](../docs/ENGINEERING.md). How to add a module: [`docs/PATTERNS.md`](docs/PATTERNS.md).

## Shared-database prefix policy (non-negotiable)

The Supabase project is shared with other products.

- Every table, view, function, trigger, enum, index, constraint and RLS policy starts with `eduway_platform_`
  (identifiers ≤ 58 chars so the `eduway_platform_test_` variant still fits in 63).
- Storage buckets: `eduway-platform-thumbnails`, `-resources`, `-question-images`, `-videos`. pg-boss schema: `eduway_platform_pgboss`.
- Code never writes a raw table name: `T.users` / `t('users')` from `src/config/constants.ts`.
- No `DROP SCHEMA`, no `TRUNCATE`, no `CREATE EXTENSION`, no DROP of unprefixed objects (the migrator refuses them).
- Supabase Auth users we create carry `app_metadata.app = "eduway_platform"`; we never touch other users.
- Enforced by: ESLint rule `eduway/no-unprefixed-sql` (local plugin in `eslint-rules/`), `npm run check-prefix`,
  unit tests on the migrations, and the integration test that migrates under the test prefix and inspects the catalogs.
- Every table has RLS enabled + a RESTRICTIVE deny-all policy for `anon`/`authenticated` and their privileges revoked
  (helper `eduway_platform_fn_secure_table`). The server connects as the DB owner (direct pg) and is unaffected.

## Setup

```bash
cd server
cp .env.example .env          # fill in Supabase URL/keys/DB URL and JWT secrets
npm install
npm run check-env             # validates variables (names only) + DB/Storage reachability
npm run buckets               # creates the 4 prefixed private buckets (idempotent)
npm run migrate               # applies src/db/migrations (idempotent, ledger eduway_platform_schema_migrations)
npm run seed                  # idempotent reference + demo data
npm run dev                   # http://localhost:4100/api/v1 · docs http://localhost:4100/api/docs
```

- **pgvector**: enable the `vector` extension in Supabase (Dashboard → Database → Extensions), then `npm run migrate`
  again — `012_embeddings` is recorded as `skipped` until the extension exists and is retried automatically.
- **Seeded credentials**: super admin `admin@eduway.iq` with `SEED_SUPER_ADMIN_PASSWORD` from `.env` (if unset the seed
  generates one and prints it once). Demo student `+9647701234567`, OTP `123456` in non-production
  (`settings.otp.devBypassCode`, only for phones listed in `devBypassPhones`). Other demo admins (Huda, Sami, …) have
  unusable random passwords — use "forgot password" or `npm run create-admin`.

## Scripts

| Script | Purpose |
|---|---|
| `dev` / `build` / `start` | tsx watch · tsc + copy SQL/seed assets · run `dist/` |
| `migrate` (`-- --dry-run`, `-- --reapply-changed`, `-- --list-objects`) / `migrate:list` | SQL migrations; list every `eduway_platform_*` object |
| `seed` (`-- --no-demo`) | Reference data + demo population (skipped in production) |
| `test` / `test:integration` | Vitest unit (no DB) / integration (real DB, `TEST=1` → `eduway_platform_test_*`, cleaned after) |
| `smoke` | CLI acceptance walk against a **running** API (`SMOKE_BASE_URL`, default `http://localhost:$PORT/api/v1`) printing a PASS/FAIL table: health, OTP login, RBAC, payment → webhook → entitlement, refund, stream URL, quiz/mistakes, exam, AI allowance decrement, admin AI/OTP settings without deploy, fresh OTP registration, audit-log coverage. Needs `SEED_SUPER_ADMIN_PASSWORD` in `.env` and DB access (it plants a known OTP for a random phone) |
| `db:objects` | Lists every `eduway_platform_*` object from the Postgres catalogs and fails if any object created by this project (attached to our tables or named in a migration) lacks the prefix |
| `verify` | `check-prefix → typecheck → lint → test → migrate → seed → db:objects`. Then start the server (`npm run dev`) and run `npm run smoke` |
| `lint` / `typecheck` / `check-prefix` | ESLint (incl. prefix rule) · tsc · prefix scanner |
| `docs` | Writes `docs/openapi.json` (also served live at `/api/docs`) |
| `buckets` / `create-admin` / `check-env` | Storage buckets · create/reset an admin · env + connectivity check |

## Architecture

```
src/
  app.ts / server.ts          express app (helmet, cors, compression, pino-http, envelopes) / listener + jobs + graceful shutdown
  config/                     env (zod), constants (prefix, T, BUCKETS, RBAC), db (pg pool, tx), supabase, logger
  common/
    http/route.ts             defineRoute(): auth → RBAC → rate limit → zod → idempotency → audit → handler → envelope + OpenAPI
    middleware/               requestContext, auth, rbac, validate, rateLimit, errorHandler, audit, idempotency, upload
    errors/ i18n/             closed error codes + `details.reason`, EN/AR catalogue
    entitlements.ts           entitlement engine (subject + time based, manual grants) — used by every paid surface
    services/                 settings-store, audit, security-events, storage (signed URLs, upload registry), exporter (CSV/XLSX),
                              admin-inbox, referrals, student-summary (AI allowance, MySubscription), auth-mirror
    dto/ utils/ providers/    shared DTO mappers · pagination, crypto, phone, dates, semver, UA · SMS (mock/http), mail
  modules/<name>/             routes, controller, service, repository, schemas, types, index (registered in modules/index.ts)
  jobs/                       pg-boss (schema eduway_platform_pgboss) + registry
  db/migrations/ seed/ sql/   numbered idempotent SQL · seed (deterministic ids) · analytics SQL
```

Foundation modules: `health`, `public`, `auth`, `users` (/me), `students` (+ support tickets), `admins` (+ /admin/me,
lookups), `roles`, `security`, `settings` (+ feature flags, legal, CMS), `storage`.

## Deploy

`npm ci && npm run build && npm run migrate && npm start` with `NODE_ENV=production` (dev OTP bypass, mock gateway and
the demo population are disabled automatically). Run behind a TLS proxy (`trust proxy` is on). Rate limits use an
in-memory store — use a shared store when scaling horizontally.
