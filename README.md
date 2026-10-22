# EDUWAY Learning Platform

Bilingual (Arabic/English, RTL) e-learning platform for Iraqi sixth-scientific-grade students: video lessons,
lesson quizzes, a question bank, a timed exam simulator, a mistakes notebook, progress tracking and an AI tutor,
sold as subject packages paid through local gateways. One backend serves three clients:

| App | Path | Stack | Dev URL |
|---|---|---|---|
| API server | `server/` | Express 5 + TypeScript + Supabase (Postgres, Storage) | http://localhost:4100/api/v1 (docs: `/api/docs`) |
| Admin portal | `website/admin/` | Vite + React + TypeScript | http://localhost:5174 |
| Student website | `website/user/` | Vite + React + TypeScript | http://localhost:5173 |
| Student mobile app | `app/user/` | Expo (React Native) | Expo dev server on 8081 (Expo Go / emulator) |

The admin portal is the single control centre: content, question bank, exams, packages and prices, payments and
refunds, schools and marketers, AI tutor settings, OTP and app settings, roles and audit logs. Every commercial
value (prices, allowances, thresholds, limits) is stored in the database and changes without a deploy.

## Repository layout

```
server/            API (src/modules/<name>/…, src/db/migrations, scripts/, tests/)  → server/README.md
website/admin/     admin portal (React)
website/user/      student website (React)
app/user/          student mobile app (Expo)
docs/
  API_CONTRACT.md    endpoint + DTO contract (single source of truth)
  ENGINEERING.md     binding conventions (prefix policy, envelopes, auth, module layout)
  BACKEND_SPEC.md    backend scope + acceptance checklist
  VERIFICATION.md    verification results per app
scripts/           cross-app verification scripts (endpoint / flow checks against a running API)
```

## Prerequisites

- Node.js **20.11+** and npm 10+
- A Supabase project (Postgres + Storage). The `pgcrypto` extension must be enabled; `vector` (pgvector) is optional
  and enables the AI-tutor retrieval migration. Extensions are shared objects, so enable them in the Supabase
  dashboard (Database → Extensions); migrations never create them.
- For the mobile app: Expo Go on a phone (same SDK as `app/user/package.json`) or an Android emulator / iOS simulator.

## Environment files

Each app reads its own `.env`. Copy the template, then fill in values. **`.env` files are git-ignored; never commit
them** — only the `.env.example` templates (placeholders only) are tracked.

| App | Create from | Key variables |
|---|---|---|
| server | `cp server/.env.example server/.env` | `PORT=4100`, `DB_POOL_MAX=4` (the Supabase session pooler allows ~15 clients across all processes; each API process uses DB_POOL_MAX + 3), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` (session pooler URI), `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_ADMIN_SECRET` (≥ 32 chars each), `CORS_ORIGINS`, `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD` |
| admin portal | `cp website/admin/.env.example website/admin/.env` | `VITE_API_URL=http://localhost:4100/api/v1` |
| student website | `cp website/user/.env.example website/user/.env` | `VITE_API_URL=http://localhost:4100/api/v1` |
| mobile app | `cp app/user/.env.example app/user/.env` | `EXPO_PUBLIC_API_URL` (see below) |

Generate JWT secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
`npm run check-env` (in `server/`) validates the variables (prints names only, never values) and checks DB/Storage
reachability. If you serve the websites from other ports, add those origins to `CORS_ORIGINS`.

### Reaching the API from the mobile app

`EXPO_PUBLIC_API_URL` must be the full base URL including `/api/v1`, and Expo must be restarted with a cleared cache
(`npx expo start -c`) after changing it.

- iOS simulator / Expo web on the same computer: `http://localhost:4100/api/v1`
- Android emulator: `http://10.0.2.2:4100/api/v1`
- **Real phone (Expo Go):** `localhost` on the phone is the phone itself. Either
  - use the computer's **LAN IP** (`ipconfig` on Windows / `ipconfig getifaddr en0` on macOS), e.g.
    `http://192.168.1.20:4100/api/v1`, keep phone and computer on the same Wi-Fi, and **allow inbound TCP 4100** in the
    firewall (Windows: `netsh advfirewall firewall add rule name="EDUWAY API 4100" dir=in action=allow protocol=TCP localport=4100`,
    run as administrator); or
  - expose the API through an HTTPS **tunnel** (e.g. `ngrok http 4100` or `cloudflared tunnel --url http://localhost:4100`)
    and set `EXPO_PUBLIC_API_URL=https://<tunnel-host>/api/v1`. `npx expo start --tunnel` tunnels only the Metro
    bundler, not the API.

## Run order

Start the API first; the three clients only talk to it.

```bash
# 1) API server (terminal 1)
cd server
npm install
cp .env.example .env            # then fill in Supabase + JWT values
npm run check-env
npm run buckets                 # creates the 4 private eduway-platform-* storage buckets (idempotent)
npm run migrate                 # idempotent SQL migrations (eduway_platform_* objects only)
npm run seed                    # reference + demo data (idempotent; demo data skipped in production)
npm run dev                     # http://localhost:4100/api/v1 · OpenAPI UI http://localhost:4100/api/docs

# 2) Admin portal (terminal 2)
cd website/admin
npm install
cp .env.example .env
npm run dev                     # http://localhost:5174

# 3) Student website (terminal 3)
cd website/user
npm install
cp .env.example .env
npm run dev                     # http://localhost:5173

# 4) Student mobile app (terminal 4)
cd app/user
npm install
cp .env.example .env            # set EXPO_PUBLIC_API_URL (LAN IP or tunnel for a real phone)
npx expo start -c               # scan the QR code with Expo Go, or press a / i for an emulator / simulator
```

## Seeded credentials (development only)

| Who | Login | Secret |
|---|---|---|
| Super admin (admin portal) | `admin@eduway.iq` (`SEED_SUPER_ADMIN_EMAIL`) | the value of `SEED_SUPER_ADMIN_PASSWORD` in **your** `server/.env`. If it was empty, `npm run seed` generated one and printed it once; reset any admin with `npm run create-admin`. |
| Demo student (website + app) | mobile `+9647701234567` (enter `07701234567`) | OTP **`123456`** — the dev bypass code, accepted only outside production and only for the phones listed in the OTP settings. Any other number receives a real code from the configured SMS provider (the mock provider logs it in the server console). |

The demo student is limited to the configured number of simultaneous devices (default 2); log out on another device
(or accept the "log out another device" prompt) if login reports the device limit. Other seeded admins have unusable
random passwords — use "forgot password" or `npm run create-admin`. Passwords are never stored in tracked files.

## Shared-database prefix policy

The Supabase project is **shared with other products**, so EDUWAY owns only what carries its prefix:

- Every table, view, function, trigger, sequence, enum/type, index, constraint and RLS policy is named
  `eduway_platform_*` (constraints named explicitly). Tables live in `public`; pg-boss uses schema `eduway_platform_pgboss`.
- Storage buckets: `eduway-platform-thumbnails`, `eduway-platform-resources`, `eduway-platform-question-images`,
  `eduway-platform-videos`.
- No `DROP SCHEMA`, `TRUNCATE`, `CREATE EXTENSION`, or any change to unprefixed objects; Supabase Auth users we create
  carry `app_metadata.app = "eduway_platform"` and no other users are touched.
- Code never writes raw table names (`T.users` / `t('users')`); integration tests run under `eduway_platform_test_*`.
- Every table has RLS enabled with a deny-all policy for `anon` / `authenticated`; only the server (DB owner) reads data.
- Enforced by `npm run check-prefix` (source + migrations), the ESLint rule `eduway/no-unprefixed-sql`, unit and
  integration tests, and `npm run db:objects` (live catalog check). Details: `docs/ENGINEERING.md` §1.

## Verification

```bash
# server — static + database checks (no running server needed)
cd server
npm run verify                  # check-prefix → typecheck → lint → test → migrate → seed → db:objects
npm run test:integration        # real DB under the eduway_platform_test_ prefix
# server — end-to-end acceptance (needs the API running: npm run dev in another terminal)
npm run smoke                   # PASS/FAIL table; SMOKE_BASE_URL overrides the target

# web apps
cd website/admin && npm run typecheck && npm run lint && npm run build
cd website/user  && npm run typecheck && npm run lint && npm run build

# mobile app
cd app/user && npx tsc --noEmit && npx expo export
```

Results are recorded in [`docs/VERIFICATION.md`](docs/VERIFICATION.md).

## Security notes

- **Rotate the Supabase keys (anon, service-role, DB password) and the JWT secrets before production** — the
  development values have been shared with the development team and tooling.
- Never commit `.env` files; they are ignored by the root and per-app `.gitignore` files. Only `.env.example`
  templates with placeholders are tracked.
- The service-role key and DB URL belong only in `server/.env`; the web and mobile apps only ever receive the API URL
  (`VITE_*` / `EXPO_PUBLIC_*` values are bundled into the client and are public).
- `NODE_ENV=production` disables the dev OTP bypass, the mock payment gateway and the demo population. Enable admin
  MFA, configure the real SMS / payment providers, and run the API behind TLS.
