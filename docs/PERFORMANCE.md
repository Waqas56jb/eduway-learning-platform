# EDUWAY API — Load test, fixes & production sizing

Date: 2026-10-23 · Tool: `scripts/load-test.mjs` (autocannon devDependency in `scripts/package.json` + a fetch-based
virtual-user runner) · Target: the dev server on `http://localhost:4100/api/v1` (`npm run dev`, watch mode) against the
shared Supabase project.

## 1. How to run

```bash
cd scripts && npm install                              # once
node scripts/load-test.mjs --out before.json           # all phases (≈ 8–10 min against the remote dev DB)
node scripts/load-test.mjs --phase endpoints --only lessons --connections 10 --requests 30
node scripts/load-test.mjs --phase mixed --ramp 5,15,25 --stage 15 [--engine autocannon]
```

| Phase | What it measures |
|---|---|
| `probe` | 5 sequential requests per endpoint, 1 VU — the pure per-request cost (no queueing) |
| `endpoints` | each endpoint alone, 10 VUs, 30 requests, every request awaited (p50/p95/p99, RPS, errors) |
| `mixed` | weighted mix (13 student reads ×2, 6 admin lists ×1) ramped 5 → 15 → 25 VUs, 15 s per stage, per-endpoint breakdown |
| `refresh` | `POST /auth/refresh` rotation chain (tokens are single-use, so one sequential chain) |

Covered: `/auth/me`, `/public/app-config`, `/progress/dashboard` (home), `/progress/summary`, `/progress/today-plan`,
`/subjects`, `/subjects/:id`, `/lessons/:id`, `/progress/subjects`, `/progress/lessons`, `/notifications`,
`/notifications/unread-count`, `/me/entitlements`, `/auth/refresh`; admin `/admin/dashboard`, `/admin/students`,
`/admin/lessons`, `/admin/payments`, `/admin/subscriptions`, `/admin/audit-logs`.

Notes:
- Logs in the demo student (OTP dev bypass `123456`, non-production only) and the seeded super admin (password read from
  `server/.env`, never printed); both sessions are logged out at the end. The test is read-only. Revoked session rows
  can be purged with `DELETE FROM eduway_platform_sessions WHERE device_id = 'load-test-device-0001'` (done after this run).
- The API's global limiter is 600 req/min **per IP** and all load comes from one host, so each request carries a
  synthetic `X-Forwarded-For` (10.250.x.y) — the server trusts loopback proxies — to model many clients. `--no-spoof`
  measures with the limiter in effect.
- Capped at 30 VUs (shared Supabase session pooler ≈ 15 connections; server `DB_POOL_MAX=4`).
- Watch-mode restarts (other people saving files) are detected via `/health` uptime; an affected run is repeated.
  Between runs the script waits until a cheap DB read is fast again so no run inherits a backlog.

## 2. Test environment — read this before the numbers

| | |
|---|---|
| API | 1 Node process (`tsx watch`), dev machine |
| DB | Supabase Postgres via the **session pooler** in `ap-northeast-2` (Seoul), `DB_POOL_MAX=4` |
| Network | dev machine → pooler round trip ≈ **170 ms** per query (measured: any 1-query endpoint ≈ 175 ms) |
| Data | seed volume (≈ 140 users, 76 lessons, 57 questions, 1.5 k audit rows) |

With 170 ms per round trip, **latency = number of sequential DB round trips × 170 ms**, and throughput is capped at
≈ `pool (4) / 0.17 s` ≈ **23 queries/s** for the whole server. Query execution time itself is negligible at this data
size (EXPLAIN: sub-millisecond plans). So the dev numbers are dominated by round trips — exactly what the fixes reduce —
and are **not** representative of absolute production latency (see §6). Other agents were running e2e tests against the
same server during the measurement, so expect ±20 % noise on the concurrent numbers.

## 3. Results — before vs after (same harness, same server, back-to-back)

Per endpoint (ms; RPS at 10 VUs):

| Endpoint | serial p50 | 10 VU p50 | 10 VU p95 | 10 VU RPS | DB queries / request (traced) |
|---|---|---|---|---|---|
| `/auth/me` (student) | 1861 → **522** | 10123 → 4804 | 11374 → **5713** | 1.0 → 2.1 | 22 → 10 |
| `/progress/dashboard` (home) | 4338 → **1353** | 18202 → 11946 | 19320 → **12747** | 0.6 → 0.8 | 36 → 24 |
| `/progress/summary` | 1509 → **488** | 4152 → 3162 | 5324 → 3417 | 2.2 → 3.0 | 9 → 7 |
| `/progress/subjects` | 1512 → **506** | 4370 → 2526 | 5020 → 2991 | 2.2 → 3.7 | 8 → 6 |
| `/subjects` | 677 → **189** | 2024 → 1196 | 2401 → 1652 | 4.6 → 6.9 | 4 → 2 (catalog cached) |
| `/subjects/:id` | 1017 → **335** | 2974 → 826 | 3820 → **1179** | 3.0 → 10.1 | 7 → 2 |
| `/lessons/:id` | 1888 → **673** | 6947 → 4408 | 7146 → 4608 | 1.4 → 2.3 | 15 → 9 |
| `/admin/dashboard` | 5040 → **16** (cached) | 14252 → 46 | 14748 → 6504¹ | 0.7 → 4.6 | ~25 → 0 (hit) |
| `/progress/today-plan` | 187 → 188 | 358 → 501 | 501 → 655 | 22.4 → 17.3 | — |
| `/progress/lessons` | 178 → 179 | 493 → 343 | 707 → 506 | 17.2 → 22.5 | — |
| `/notifications` | 353 → 350 | 827 → 1160 | 857 → 1331 | 11.9 → 8.6 | — |
| `/notifications/unread-count` | 174 → 177 | 500 → 353 | 659 → 501 | 17.6 → 22.5 | — |
| `/me/entitlements` | 185 → 178 | 474 → 348 | 608 → 509 | 19.3 → 22.5 | — |
| `/public/app-config` | 15 → 15 | 17 → 18 | 2659 → 2670² | 10 → 10 | 0 (cached) |
| `/admin/students` | 351 → 345 | 1160 → 970 | 1689 → 1098 | 7.4 → 9.6 | — |
| `/admin/lessons` | 530 → 514 | 1352 → 1485 | 1845 → 1768 | 6.5 → 6.5 | — |
| `/admin/payments` | 354 → 358 | 1010 → 887 | 1226 → 1207 | 9.2 → 8.4 | — |
| `/admin/subscriptions` | 342 → 342 | 825 → 1150 | 850 → 1293 | 11.9 → 8.7 | — |
| `/admin/audit-logs` | 183 → 195 | 1818 → 1293 | 1990 → 1583 | 5.9 → 7.1 | — |
| `POST /auth/refresh` (sequential) | p50 683 → 676, p95 1323 → 823 | | | | — |

¹ the single cold miss of the run; every other request is a cache hit. ² first requests after a cold start load the
public config concurrently (no single-flight in `public/service.ts`); afterwards it is served from memory in ~3 ms.
Single-query endpoints are unchanged (± noise): at 10 VUs they only queue behind the 4-connection pool.

Mixed ramp (all 19 endpoints, weighted), 0 % errors before and after:

| VUs | RPS before → after | p50 | p95 | p99 | completed requests |
|---|---|---|---|---|---|
| 5 | 2.2 → **3.6** | 1074 → 813 | 9863 → **3772** | 10798 → 3968 | 34 → 65 |
| 15 | 1.9 → **3.5** | 3346 → 2806 | 22005 → **9026** | 22231 → 14266 | 47 → 63 |
| 25 | 2.2 → **3.1** | 6583 → 5124 | 25816 → **14315** | 26011 → 16217 | 62 → 73 |

Slowest at 25 VUs (after): home dashboard (p95 16 s), lesson detail (15 s), `/auth/me` (15 s) — all queueing for the
4 pool connections; the server is saturated from ~5 VUs in this environment (≈ 23 queries/s ceiling, §2).

## 4. What was slow and why (query tracing + EXPLAIN)

Every hot service was traced by wrapping the pg pool (query count + timing per request):

1. **Duplicate reads in composites (N+1-style).** `/auth/me` and `/progress/dashboard` called `aiAllowance()` and
   `mySubscription()` independently from several sections: the same subscription row was read 4×, `ai_settings` 4×,
   `student_profiles.ai_disabled` 3×, `ai_usage` 3× per request.
2. **Sequential awaits of independent work.** The home dashboard awaited ~15 sections one after another
   (`quizAverage` ×2, `subjects()` with 5 serial queries, weekly study, upcoming exams, activity…);
   `mySubscription()` did 6 serial reads; lesson detail 5 serial reads before its parallel batch.
3. **Uncached shared catalog.** Every student screen re-read the published subject list (with 4 correlated count
   sub-selects per subject) and the full lesson sequence (6-table join), identical for all students.
4. **Over-fetching.** Lesson detail loaded up to 5 000 question rows (`lessonPool()`) only to display the pool size.
5. **Admin dashboard** runs ~25 aggregate queries sequentially (deliberately, to spare the pooler) → 5 s per view.
6. **Missing indexes (EXPLAIN on `eduway_platform_` tables only):**
   - `entitlements.list()` / grants filter `WHERE user_id = $1` (revoked rows included) but the only user index
     `eduway_platform_idx_entitlements_user` is partial (`WHERE revoked_at IS NULL`) → `Seq Scan on
     eduway_platform_entitlements` (512 rows today, grows with every subscription × subject).
   - Admin subscriptions list sorts by `ends_at` / `created_at` with LIMIT/OFFSET; the only `ends_at` index is partial
     (active only) and there was none on `created_at` → full sort.
   - `exams_count` sub-select on every `/subjects` call and `/exams/available` filter blueprints by subject/status and
     sections by subject — unindexed.
   All other hot predicates (watch progress, completions, notifications incl. the unread partial index, mistakes,
   quiz attempts, daily activity, sessions, payments, audit logs, lessons/units/topics) are already covered.

## 5. Fixes

| Change | Where |
|---|---|
| Migration `401_performance.sql` (idempotent, `IF NOT EXISTS`): `eduway_platform_idx_entitlements_user_all (user_id)`, `eduway_platform_idx_subscriptions_ends_all (ends_at, id)`, `eduway_platform_idx_subscriptions_created (created_at DESC)`, `eduway_platform_idx_exam_blueprints_subject_live (subject_id, status) WHERE deleted_at IS NULL`, `eduway_platform_idx_exam_bp_sections_subject (subject_id)` | `server/src/db/migrations/401_performance.sql` (applied) |
| `aiAllowance()` reads global AI settings through the existing ai-tutor cache (`loadAiSettings`, 10 s TTL, invalidated by every admin AI-settings write) and merges the profile flag + period usage into one query; `mySubscription()` runs its reads in parallel and accepts a pre-loaded subscription row / allowance | `common/services/student-summary.ts` |
| `/auth/me`: one subscription row + one allowance shared by all sections (22 → 10 queries) | `modules/users/service.ts` |
| Home dashboard: all sections in one `Promise.all`, shared subscription/allowance, both quiz averages in one query, last-watched lesson folded into the profile query, subject chip taken from the already-loaded subject list (36 → 24 queries, ~15 → ~4 sequential steps); `/progress/subjects` and `/progress/summary` reads parallelised | `modules/progress/service.ts` |
| Shared catalog read cache (subjects, subject, lesson sequence, units, topics, quiz-pool size): 15 s TTL, single-flight on miss, cleared after **every successful mutating `/admin/*` or `/webhooks/*` request** in this process; disabled under `NODE_ENV=test` | `common/services/catalog-cache.ts`, `app.ts` (1 middleware line), `modules/content/catalog.service.ts` |
| Lesson detail: viewer started before the lesson lookup, lesson row taken from the cached subject sequence (no second catalog query), remaining reads in one batch, quiz pool **counted** (`contentRepo.quizPoolSize`, capped at 200 like before) instead of loading ≤ 5 000 rows | `modules/content/catalog.service.ts`, `modules/content/repository.ts` |
| Admin dashboard composite served from the same cache (key: range rounded to the minute + the caller's visible sections; ≤ 15 s old; cleared by any admin mutation) | `modules/analytics/dashboard.ts` |
| Unit tests for the cache (single-flight, invalidation race, test-mode pass-through, middleware) | `server/tests/unit/catalog-cache.test.ts` |

Consistency trade-offs: catalog data and the admin dashboard may be ≤ 15 s stale on *other* instances after an admin
edit (immediate on the instance that served the edit), and time-based visibility (lesson `publish_at`, exam windows)
may lag by ≤ 15 s. Per-student data (progress, entitlements, notes, notifications) is never cached by this layer
(entitlements keep their existing 10 s cache with explicit invalidation).

Not changed (out of scope / owned elsewhere), recommended next:
- `effectiveQuizRuleDto()` (quizzes engine) does rules → system default → attempt stats sequentially (3 round trips on
  every lesson view); fold into one query or cache the rule part in the catalog cache.
- `public/service.ts` cache has no single-flight: concurrent cold misses all hit the DB (the 2.7 s app-config p95).
- `storage.resolveMany()` signs `storage://` thumbnails on every catalog read (no seeded rows use it today); cache
  signed URLs for ~TTL/2 once real uploads exist.
- The admin dashboard and analytics aggregates should eventually read from a materialized summary refreshed by a job.

## 6. Production sizing advice

**Put the API next to the database.** The single biggest factor in every number above is the 170 ms round trip from
the dev machine to the Seoul pooler. Deploy the API in the same region as the Supabase project (or move the project to
the users' region, e.g. `eu-central-1`/`me-central-1` for Iraq, and deploy the API there): round trips drop to
~0.5–2 ms and the after-fix endpoints become ~10–40 ms server time (home dashboard: ~24 queries in ~4 parallel steps).

**Pooler mode.** Use Supabase's **transaction pooler (port 6543)** for the API pool: requests are many short queries
and the code keeps no session state outside `tx()` (BEGIN…COMMIT on one checked-out client, which transaction mode
supports). node-postgres uses unnamed statements, so no prepared-statement issues. Keep **pg-boss** (job queue,
`eduway_platform_pgboss`) and migrations on the session pooler (5432) or a direct connection — they rely on
session features (advisory locks / long transactions). Verify `statement_timeout`: startup parameters may not be
honoured through the transaction pooler; if not, set it per role (`ALTER ROLE … SET statement_timeout`) or per
transaction.

**Pool size.** Throughput per instance ≈ `DB_POOL_MAX / average query time`. Co-located (~2 ms/query) a pool of 10
sustains ~5 000 queries/s ≈ 500–1 000 student requests/s — far more than one Node process can serialize JSON for.
Recommended: `DB_POOL_MAX=10` per API instance with the transaction pooler; keep
`instances × DB_POOL_MAX ≤ pooler client limit` of the compute tier (Micro ≈ 200 clients), and set the pooler's
backend pool size to ~2–4 × the DB's vCPUs (e.g. 15–20 on Small/Medium). With the session pooler (current dev setup)
the ~15-connection cap is shared by every instance **and** pg-boss — keep `DB_POOL_MAX` at 4–5 and ≤ 2 instances there.

**Instances.** Node is single-threaded; run **2 instances × 1 vCPU / 512 MB–1 GB** behind the load balancer for HA,
scale horizontally on CPU > 60 % or p95 > 300 ms. Rough planning number: an active student generates ~1 request every
3–5 s (page loads + 10 s watch heartbeats), i.e. 1 000 concurrently active students ≈ 200–330 req/s ≈ 1 500–2 500
queries/s → 2 instances co-located with the DB, DB on at least the Small/Medium compute tier. With more than one
instance set `RATE_LIMIT_STORE=postgres` (shared limiter) and `TRUST_PROXY` to the real hop count; in-process caches
(principal 15 s, entitlements 10 s, settings 30 s, catalog 15 s) converge within their TTLs across instances.

**Re-test** after deployment with the same script pointed at staging: `node scripts/load-test.mjs --base https://staging…/api/v1`
(student OTP bypass must be enabled there, or log in a test student and pass its tokens).
