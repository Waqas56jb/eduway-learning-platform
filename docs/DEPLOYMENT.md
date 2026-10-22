# EDUWAY — Production Deployment Guide

Nothing in this repository deploys itself or creates cloud resources. These files are ready to use when you are:

| What | File | Target |
|---|---|---|
| API image | `server/Dockerfile`, `server/.dockerignore` | any Docker host |
| API on Render (primary) + both static sites | `render.yaml` (repo root, Render Blueprint) | Render |
| API alternatives | `server/fly.toml`, `server/railway.json` | Fly.io / Railway |
| Student website | `website/user/vercel.json` (or `public/_redirects` + `public/_headers` for Netlify) | Vercel / Netlify |
| Admin portal | `website/admin/vercel.json` (or `public/_redirects` + `public/_headers`) | Vercel / Netlify |
| Mobile app | `app/user/eas.json`, `app/user/app.json` | EAS Build / Submit |
| CI | `.github/workflows/ci.yml` | GitHub Actions (no secrets needed) |

Suggested domains (replace everywhere if yours differ): `api.eduway.iq` (API), `eduway.iq` + `www.eduway.iq`
(student site), `admin.eduway.iq` (admin portal), `api-staging.eduway.iq` (staging API for preview app builds).

---

## 1. Launch checklist (in order)

### A. Secrets and accounts
- [ ] **Rotate every development secret.** The dev values were shared with the team and tooling:
      Supabase anon key, service-role key (or new-style secret key), **database password**, and all three JWT
      secrets. Supabase: Project Settings → API (keys) and Database → Reset database password. Rotating the DB
      password changes `SUPABASE_DB_URL`.
- [ ] Generate new JWT secrets (≥ 32 chars, all three different):
      `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
      Render can generate them for you (`generateValue: true` in `render.yaml`).
- [ ] Store secrets only in the hosting provider's secret/env settings. Never in git, never in `VITE_*` /
      `EXPO_PUBLIC_*` variables (those are bundled into public client code).
- [ ] Real providers configured: SMS (`SMS_PROVIDER` + credentials), SMTP, payment gateways, Expo push token,
      AI provider key. With `NODE_ENV=production` the mock gateway, the dev OTP bypass and demo data are disabled,
      and a gateway without credentials is rejected (`PAYMENT_GATEWAY_DISABLED`).

### B. Database (Supabase): capacity first
- [ ] **Upgrade the Supabase compute tier and pooler before launch.** The development project uses the shared
      session pooler on the Nano tier, which allows only **~15 client connections across every process of every
      product sharing the project**. That is enough for one dev server, not for production. See §3.
- [ ] Extensions enabled in the dashboard (Database → Extensions): `pgcrypto` (required), `vector` (optional,
      enables AI-tutor retrieval). Migrations never create extensions.
- [ ] Point-in-time recovery / daily backups enabled for the tier you choose.

### C. First deploy of the API
1. Create the API service from `render.yaml` (or Fly/Railway, see §4) and fill in every env var from §2.
2. One-off tasks, run from the service's shell / one-off job (all idempotent, prefixed objects only):
   ```bash
   node dist/scripts/check-env.js         # npm run check-env:prod — prints variable NAMES only
   node dist/scripts/storage-buckets.js   # creates the 4 private eduway-platform-* buckets
   node dist/scripts/migrate.js           # npm run migrate:prod (also runs automatically pre-deploy)
   node dist/scripts/seed.js              # npm run seed:prod — reference data; demo data skipped in production
   ```
3. **Seed the super admin.** Set `SEED_SUPER_ADMIN_EMAIL` and a strong `SEED_SUPER_ADMIN_PASSWORD` (≥ 10 chars,
   upper/lower/digit/symbol) *before* running the seed. If the password is empty the seed generates one and
   prints it to stdout, which on a hosted platform means **your log drain**. Alternatively run
   `node dist/scripts/create-admin.js --email you@eduway.iq --name "Your Name" --role super_admin` from an
   interactive shell. Afterwards **remove `SEED_SUPER_ADMIN_PASSWORD`** from the env, log in to the admin portal,
   change the password and **enable MFA (TOTP)**.
4. Check `GET https://api.eduway.iq/api/v1/health` (liveness) and `/api/v1/health/ready` (db, storage, queue,
   providers: 503 when the DB is down).
5. `/api/docs` is disabled in production unless `API_DOCS_PUBLIC=true`. Keep it off publicly.

### D. Websites
- [ ] Vercel: create two projects from the repo with **Root Directory** `website/user` and `website/admin`. The
      framework preset, build command and output directory come from each `vercel.json`.
- [ ] Set `VITE_API_URL=https://api.eduway.iq/api/v1` in each project (Production **and** Preview), plus for the
      admin portal `VITE_APP_NAME`, `VITE_DEFAULT_LANG`. **Do not set `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD`
      or `VITE_SHOW_DEMO_HINTS=true` in production.** `VITE_*` values are baked in at build time: change → redeploy.
- [ ] Netlify instead: base directory `website/<app>`, build `npm run build`, publish `dist`. The `_redirects`
      (SPA fallback) and `_headers` files in `public/` are copied into `dist/` by Vite.

### E. Domains, TLS, CORS
- [ ] DNS: `api` → API host (CNAME), apex/`www` → student site, `admin` → admin portal. TLS is automatic on
      Render/Fly/Railway/Vercel/Netlify.
- [ ] API env: `CORS_ORIGINS=https://eduway.iq,https://www.eduway.iq,https://admin.eduway.iq`,
      `USER_APP_URL=https://eduway.iq`, `ADMIN_APP_URL=https://admin.eduway.iq`,
      `PUBLIC_API_URL=https://api.eduway.iq`. Exact origins (scheme + host, no trailing slash). In production
      only these are allowed (the localhost dev wildcard is off). The native app sends no `Origin` and is
      unaffected.
- [ ] Payment gateway dashboards: callback/webhook URLs point at `https://api.eduway.iq/api/v1/...`; redirect
      URLs at `https://eduway.iq/...`.
- [ ] HSTS `preload` is set in the website headers: submit to hstspreload.org only once every subdomain serves
      HTTPS.

### F. Mobile app
See §5. Production builds use `EXPO_PUBLIC_API_URL=https://api.eduway.iq/api/v1` from `eas.json`.

### G. Monitoring and operations
- [ ] Uptime monitor (Better Stack, UptimeRobot, …) on `/api/v1/health` (1 min) and `/api/v1/health/ready`
      (5 min; alert on 503).
- [ ] Log drain from the API host (JSON pino logs; secrets are redacted by the logger). Alert on `level >= 50`.
- [ ] Supabase: Reports → Database (connections, CPU), and enable email alerts for connection saturation. The
      first symptom of pool exhaustion is `EMAXCONNSESSION` / `too many clients` in the API logs.
- [ ] Admin portal → System health panel (`/admin/system/health`) shows queue, providers and DB status.
- [ ] Optional error tracking (Sentry) for API, websites and app: not wired in yet.
- [ ] Before launch: run `npm run smoke` from `server/` with `SMOKE_BASE_URL=https://api.eduway.iq` against
      **staging**, never production data.

---

## 2. Environment variables

### API (`server/`): set in the host's env settings
| Variable | Production value / note |
|---|---|
| `NODE_ENV` | `production` (disables dev OTP bypass, mock gateway, demo data, public API docs) |
| `PORT` | `4100` (image default; Render/Fly route to it) |
| `API_PREFIX` | `/api/v1` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | rotated values |
| `SUPABASE_DB_URL` | pooler URI with the **new** DB password (see §3) |
| `DB_POOL_MAX`, `DB_SSL=true`, `DB_STATEMENT_TIMEOUT_MS`, `DB_CONNECT_TIMEOUT_MS` | see §3 |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ADMIN_SECRET` | new random ≥ 32 chars each |
| `CORS_ORIGINS`, `USER_APP_URL`, `ADMIN_APP_URL`, `PUBLIC_API_URL` | §1.E |
| `SMS_PROVIDER`, `SMS_HTTP_URL`, `SMS_HTTP_TOKEN` | real SMS provider (not `mock`) |
| `SMTP_URL`, `MAIL_FROM` | transactional mail |
| `PUSH_PROVIDER`, `EXPO_ACCESS_TOKEN`, `NOTIFICATION_WEBHOOK_SECRET` | push notifications |
| `ZAINCASH_*`, `FASTPAY_*`, `QICARD_*`, `ASIAHAWALA_*`, `VISA_*` | only for gateways you enable |
| `OPENAI_*` / `ANTHROPIC_*` / `AZURE_OPENAI_*`, `AI_EMBEDDING_MODEL` | AI tutor (mock model without a key) |
| `JOBS_ENABLED` | `true` on exactly the instances that should run pg-boss workers |
| `SUPABASE_AUTH_MIRROR` | `true` |
| `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD` | first deploy only, then remove the password |
| `LOG_LEVEL` | optional (`info` default in production) |

The full annotated list is `server/.env.example`.

### Websites (build-time, public)
| App | Variable | Value |
|---|---|---|
| `website/user` | `VITE_API_URL` | `https://api.eduway.iq/api/v1` |
| `website/user` | `VITE_SHOW_DEMO_HINTS` | unset / `false` |
| `website/admin` | `VITE_API_URL` | `https://api.eduway.iq/api/v1` |
| `website/admin` | `VITE_APP_NAME`, `VITE_DEFAULT_LANG` | `EDUWAY Admin`, `en` |
| `website/admin` | `VITE_DEMO_EMAIL`, `VITE_DEMO_PASSWORD` | **unset in production** |

### Mobile app (build-time, public)
| Profile (`eas.json`) | `EXPO_PUBLIC_API_URL` |
|---|---|
| `development` | `https://api-staging.eduway.iq/api/v1` (Metro also reads `app/user/.env` locally) |
| `preview` | `https://api-staging.eduway.iq/api/v1` |
| `production` | `https://api.eduway.iq/api/v1` |

---

## 3. Database connections: Supabase pooler sizing (read before scaling)

Each API process opens up to **`DB_POOL_MAX` + 3** connections (the app pool plus pg-boss's own pool of 3).
One-off scripts (migrate, seed, create-admin) open a few more while they run. The Supabase project is
**shared with other products**, so their connections count against the same limit.

```
instances × (DB_POOL_MAX + 3) + ~3 (one-off scripts / migrations) + other products' usage  ≤  pooler client limit
```

- **Development (Nano, session pooler, ~15 clients):** `DB_POOL_MAX=4`, a single process. Do not run a second
  API instance (or a hosted staging API) against it alongside the dev server.
- **Production:** upgrade the compute tier. The pooler's max client connections and the Postgres
  `max_connections` grow with compute size. Check the exact numbers for your tier under Database → Settings →
  Connection pooling. Then size it like this:
  - 1 instance on Small/Medium: `DB_POOL_MAX=10`. That is 13 connections, leaving headroom for deploy overlap.
  - Remember **zero-downtime deploys briefly run old + new instances together**: budget 2× during rollout.
  - Only one instance needs `JOBS_ENABLED=true` if you scale horizontally. Workers on extra instances also cost
    3 connections each.
- **Which pooler endpoint:**
  - **Session pooler (port 5432)** or the direct connection: required for `migrate.js` (it holds a session-level
    `pg_advisory_lock`) and the safest choice for pg-boss. This is what the code is tested with.
  - **Transaction pooler (port 6543)** multiplexes many clients over few server connections and is the way to
    scale the *API request pool* further. The app pool does not use named prepared statements or session state,
    but it sends `statement_timeout` as a connection startup parameter. **Verify on staging** before switching
    the API's `SUPABASE_DB_URL` to 6543, and keep migrations on 5432 (run them with a different
    `SUPABASE_DB_URL` in the one-off job).
- Symptoms of exhaustion: `EMAXCONNSESSION`, `too many clients`, `/health/ready` → 503. The pool already retries
  transient saturation; persistent errors mean the budget above is exceeded.

---

## 4. API hosting

### Docker image (all platforms)
```bash
docker build -t eduway-api ./server        # multi-stage, Node 22, runs as the non-root `node` user
docker run --rm -p 4100:4100 --env-file server/.env.production eduway-api   # (never commit that file)
```
- `CMD node dist/src/server.js` runs as PID 1, so the platform's `SIGTERM` reaches `server.ts`. That stops
  accepting HTTP, finishes in-flight requests, stops pg-boss gracefully (5 s) and ends the pg pool. It force-exits
  after 10 s, so set the platform's stop/kill timeout ≥ 15 s.
- `HEALTHCHECK` calls `GET /api/v1/health` (no DB access, so DB hiccups don't restart the container). Point the
  platform's *readiness* check at the same path. `/health/ready` is better suited to external alerting.
- Node 22 is required: `@supabase/supabase-js` 2.118+ declares `engines.node >= 22`.
- Without Docker: `cd server && npm ci && npm run build && npm start` (then `npm prune --omit=dev`).

### Render (primary)
Dashboard → New → **Blueprint** → select the repo. `render.yaml` defines `eduway-api` (Docker, health check,
`preDeployCommand: node dist/scripts/migrate.js`), `eduway-web` and `eduway-admin` (static sites with SPA rewrite
and headers). Fill every `sync: false` variable when prompted. Use a paid, always-on instance: free instances
sleep, and pg-boss jobs (notifications, maintenance, AI) stop with them.

### Fly.io (alternative)
```bash
cd server
fly launch --no-deploy --copy-config      # keeps fly.toml; choose the app name
fly secrets set SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_DB_URL=… \
  JWT_ACCESS_SECRET=… JWT_REFRESH_SECRET=… JWT_ADMIN_SECRET=… CORS_ORIGINS=… USER_APP_URL=… ADMIN_APP_URL=… …
fly deploy                                # release_command runs migrations first
fly certs add api.eduway.iq
```
`fly.toml` keeps one machine always running (`auto_stop_machines = "off"`) for the job workers.

### Railway (alternative)
New project → Deploy from repo → set the service **Root Directory** to `server`. `railway.json` selects the
Dockerfile, the health check and the pre-deploy migration. Add variables in the service's Variables tab.

---

## 5. Mobile app (EAS)

`app.json`: name `EDUWAY`, iOS `bundleIdentifier` / Android `package` `com.eduway.student`, version `1.0.0`,
`runtimeVersion.policy = appVersion` (for `expo-updates`), icons (`assets/icon.png`, adaptive icon foreground +
monochrome), splash (`assets/splash-icon.png`), `ITSAppUsesNonExemptEncryption=false`. Build numbers are managed
remotely by EAS (`appVersionSource: remote` + `autoIncrement`).

One-time setup:
```bash
cd app/user
npx eas-cli@latest login
npx eas-cli@latest init                 # links the project; writes extra.eas.projectId (needed for push tokens)
npx eas-cli@latest update:configure     # optional: OTA updates (adds updates.url; channels already in eas.json)
npx eas-cli@latest credentials          # let EAS create/manage the Android keystore and iOS certificates
```
Store accounts: an Apple Developer account with an App Store Connect app for `com.eduway.student`, and a Google
Play Console app with package `com.eduway.student`. Upload the Google service-account JSON with
`eas credentials` (Android → Google Service Account), never into the repo.

> **Icon check:** `assets/icon.png` is RGBA. App Store Connect rejects app icons with an alpha channel, so export
> a fully opaque 1024×1024 PNG before the first iOS submission.

Builds:
```bash
npx eas-cli@latest build --profile development --platform android   # dev client (internal)
npx eas-cli@latest build --profile preview --platform android       # APK for testers → staging API
npx eas-cli@latest build --profile production --platform all        # AAB + IPA → production API
```
Submit:
```bash
npx eas-cli@latest submit --profile production --platform android   # Play internal track, as draft
npx eas-cli@latest submit --profile production --platform ios       # prompts for the App Store Connect app id
```
Add `"ios": { "ascAppId": "<id>" }` under `submit.production` in `eas.json` once known, to skip the prompt.
Changing `EXPO_PUBLIC_API_URL` requires a new build (or an OTA update on the same runtime version).

---

## 6. CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request, with no secrets:
- **server:** `check-prefix`, `typecheck`, `lint`, unit tests (dummy env, no DB), `build`, plus a Docker build
  (not pushed).
- **website/user, website/admin:** `typecheck`, `lint`, `build` (placeholder `VITE_API_URL`).
- **app/user:** `tsc --noEmit` and `expo config` validation.
- **Integration tests** run only when the repository secrets `CI_SUPABASE_URL`, `CI_SUPABASE_ANON_KEY`,
  `CI_SUPABASE_SERVICE_ROLE_KEY` and `CI_SUPABASE_DB_URL` are configured. Use a **separate, non-production
  Supabase project** (they create/clean `eduway_platform_test_*` objects). Runs are serialized and use
  `DB_POOL_MAX=2`.

Deployment itself is left to the platforms' Git integrations (Render/Vercel auto-deploy on `main`). CI is the
gate: enable branch protection requiring the CI checks.
