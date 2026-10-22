# EDUWAY — Verification

Final verification per `docs/BACKEND_SPEC.md` PART 3. Each section is owned by the agent/engineer verifying that app.

## Server

Run on 2026-10-22 from `server/` against the shared Supabase project. API under test: `http://localhost:4100/api/v1`
(`npm run dev`). `npm run verify` chains the first seven commands. Smoke and `test:integration` need DB access, and
smoke also needs a running server.

| # | Command | Result | Details |
|---|---|---|---|
| 1 | `npm run check-prefix` | ✅ exit 0 | 15 SQL files, 281 TS files, 106 tables. Every object is prefixed `eduway_platform_` |
| 2 | `npm run typecheck` | ✅ exit 0 | `tsc --noEmit`, 0 errors |
| 3 | `npm run lint` | ✅ exit 0 | ESLint (incl. `eduway/no-unprefixed-sql`), 0 problems |
| 4 | `npm run test` | ✅ exit 0 | 19 files, **208/208** unit tests passed |
| 5 | `npm run migrate` | ✅ exit 0 | 0 applied, 14 unchanged, 1 skipped (`012_embeddings`: pgvector extension not enabled. It is retried automatically once `vector` is enabled) |
| 6 | `npm run seed` | ✅ exit 0 | Idempotent: reference data, catalogue, demo population, demo student `+9647701234567` |
| 7 | `npm run db:objects` | ✅ exit 0 | 1,089 `eduway_platform_*` objects, 0 unprefixed (see below) |
| 8 | `npm run test:integration` | ✅ exit 0 | 4 files, **33/33** passed (real DB, `eduway_platform_test_*` prefix, `DB_POOL_MAX=3`), 373 s |
| 9 | `npm run smoke` | ✅ exit 0 | **23/23** steps PASS (table below) |

### Smoke acceptance walk (23/23 PASS)

| Step | Result |
|---|---|
| health · public app-config | PASS |
| student OTP login (dev code 123456) · GET /auth/me (student) | PASS |
| Arabic error messages (`Accept-Language: ar`) | PASS |
| admin login · RBAC: student token rejected on admin route | PASS |
| admin: settings change audited | PASS |
| pay via mock gateway → webhook → paid + entitlements | PASS |
| duplicate webhook does not duplicate access (+ bad signature → 401) | PASS |
| admin price change takes effect without deploy (public price + quote) | PASS |
| attribution reports reconcile (schools / marketers / progress) | PASS |
| full refund revokes access (entitlement logs) | PASS |
| catalog → entitled lesson → signed stream URL | PASS |
| watch heartbeat → resume position | PASS |
| quiz → wrong answer creates a mistake → submit | PASS |
| exam start (server timer) → autosave → idempotent submit → result | PASS |
| admin content & question bank reachable (RBAC) | PASS |
| AI tutor message (JSON/polling path) → allowance `used` +1, `remaining` −1 | PASS |
| admin changes AI allowance settings (monthlyAllowance, resetCycle) → student allowance reflects it → restored | PASS |
| admin changes OTP thresholds (resendCooldownSeconds, maxAttempts) → `/public/app-config` reflects it → restored | PASS |
| fresh student OTP register (random `+96479…`) → `/me` profile; temp student locked afterwards | PASS |
| audit logs exist for the smoke admin mutations (`settings.update`, `package.update`, `ai_settings.update`, `refund.*`, `student.lock`) | PASS |

Notes: the demo student is limited to 2 devices. When the limit is reached, smoke frees the least recently active
session (`revokeSessionId`), the same way the apps' "log out another device" prompt does. The fresh-registration step
writes a known OTP hash for its random phone straight to the DB, because the mock SMS provider only logs codes.

### Prefix-object summary (`npm run db:objects`)

| Kind | Count |
|---|---|
| table | 106 |
| view | 2 |
| index | 287 |
| constraint | 505 |
| trigger | 73 |
| policy (RLS) | 106 |
| function | 4 |
| enum type | 5 |
| schema (`eduway_platform_pgboss`) | 1 |
| **total** | **1,089** |

- **0** objects attached to our tables (indexes, constraints, triggers, policies, owned sequences) lack the prefix.
- **0** unprefixed names are defined in the 15 migrations (743 names checked), and **0** unprefixed catalog objects
  share a name with a migration definition.
- 8 names are defined but not yet present, all from `012_embeddings.sql`, which is skipped until pgvector is enabled.
- The only `eduway_platform_test_*` leftover is the integration-test pg-boss schema. It is isolated and the app never uses it.
- The Supabase session pooler allows about 15 clients across all processes. Each API process uses `DB_POOL_MAX` + 3
  (pg-boss), so `server/.env` uses `DB_POOL_MAX=4`.

## Student website

Verified 2026-10-22 against `http://localhost:4100/api/v1` (single API, `DB_POOL_MAX=4`).

**Tools** (repo root):
- `node scripts/verify-endpoints.mjs <frontendDir>` — static check. It pulls every HTTP call (method + path template) out of
  `<frontendDir>/src/api/**` and matches it against `server/docs/openapi.json` (355 paths after `npm run docs`).
  `:id`, `${id}` and `{id}` are normalised. It exits 1 on any unmatched call. Shared with the admin verifier.
- `node scripts/verify-student-flows.mjs [--base URL] [--json out.json]` — live walk. It sends the same request shapes as
  `website/user/src/api` and `app/user/src/api`. Every response `data` is checked against **both** frontends'
  TypeScript interfaces: all required fields must be present, and known nested DTOs are checked one level deep.
  - **Fresh student:** a random `+96477…` is registered with the `registration` object. Its dev OTP is recovered from
    `otp_codes.code_hash` (HMAC with the server secret). That student then signs in on a second (iOS) device, buys a
    package through the mock gateway, and walks the full journey.
  - **Demo student:** signs in with one web session and gets a read-only pass over the seeded data, then logs out.
    The script never evicts a session that it did not create.

**Static check:** website/user has 96 call sites (93 unique method+path), and **0 unmatched**. `grep -r "data/" src` finds
nothing, so there are no mock imports.
**Builds:** `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅ (0 errors).
**Live run:** **75/75 steps PASS** on two consecutive runs, with no transient 5xx (latest fresh student `+9647762553792`).

| Route / page | Endpoints (live-verified) | Status |
|---|---|---|
| `/` Landing (Hero, Stats, Subjects, Testimonials, Pricing, FAQ) | PUB-05, CAT-01, PUB-06 `landing`, PAY-01, PUB-07 `landing` | ✅ |
| Layout (Navbar/Footer) | CAT-01, PUB-01 | ✅ |
| `/pricing` | PAY-01 (+comparison), PUB-09, PUB-07 `pricing` | ✅ |
| `/about` | PUB-05, PUB-08, PUB-02 | ✅ |
| `/contact` | PUB-01 ✅ · PUB-10 matched statically only (not sent live, because it would create a real support ticket) | ✅ / ⚪ |
| `/terms`, `/privacy` | PUB-11 | ✅ |
| `/login` | AUTH-01 `login` | ✅ |
| `/register` | PUB-02, PUB-03, PUB-04 (invalid code), PUB-11, AUTH-01 `register` | ✅ |
| `/verify-otp` | AUTH-02 with `registration` (isNewUser, profileComplete, no pendingLegal), AUTH-02 login, AUTH-03 → 409 on complete profile | ✅ |
| AuthLayout side panel | PUB-06 `auth`, PUB-05 | ✅ |
| Student layout (Sidebar, TopBar, search, notifications menu) | AUTH-07, NTF-02, NTF-01, NTF-03, SRC-01 `scopes=lessons`, AUTH-05 | ✅ |
| `/student/dashboard` | PRG-04 `tzOffsetMinutes`, PRG-11 | ✅ |
| `/student/subjects` | CAT-01 (locked before purchase, unlocked after) | ✅ |
| `/student/subjects/:subjectId` | CAT-02 (slug and uuid), CAT-03, CAT-04 | ✅ |
| `/student/lesson/:lessonId` | CAT-05, CAT-06, PRG-01 (heartbeat/pause), PRG-02, CAT-07, CAT-08/09, CAT-10, QUZ-01/02/03, BMK-03/04 | ✅ |
| `/student/question-bank` | BNK-02 (repeated `difficulty`), BNK-01 (paged), BMK-01/02/03/04, PRA-01 (filters / bookmarks / mistakes → `NO_QUESTIONS`), PRA-02, PRA-03 | ✅ |
| `/student/mistakes` | MST-01 (+meta counts), MST-02, MST-03, MST-04, MST-05 | ✅ |
| `/student/exams` | EXM-01, EXM-02, EXM-09 | ✅ |
| `/student/exams/:examId/room` | EXM-03, EXM-04, EXM-05 autosave, EXM-06 flag, EXM-07 submit with `Idempotency-Key` (replay returns same attempt) | ✅ |
| `/student/exams/result/:attemptId` | EXM-08 | ✅ |
| `/student/ai-tutor` | AIT-01, AIT-02, AIT-03, AIT-04, AIT-05, AIT-06 rename, AIT-08 SSE (`meta → delta → done` with full text; allowance 100→99), AIT-08 JSON + AIT-09 polling, AIT-10, AIT-07 delete, STO-01 `ai_attachment` | ✅ |
| `/student/progress` | PRG-06, PRG-05, PRG-07 `weeks=8`, PRG-08, PRG-09 `weeks=16` | ✅ |
| `/student/subscription` | PAY-03 (none → active), PAY-01, PAY-09, PAY-10 `format=pdf` (application/pdf) | ✅ |
| PaymentModal | PUB-09, PAY-05 (unknown code → invalid), PAY-04, PAY-06 + `Idempotency-Key` (replay → same paymentId, `__ID__` returnUrl), PAY-07 mock confirm, PAY-08 → `paid`, PAY-10 json, ME-11 entitlements granted | ✅ |
| `/student/profile` | ME-01, ME-02 (name/language/goal/avatarPreset), STO-01 `student_avatar`, ME-09/10, ME-03, ME-04, ME-05 `scope=others`, AUTH-06, AUTH-05 | ✅ |
| `/student/notifications` | NTF-01 (all/unread + meta), NTF-03, NTF-04, NTF-05 | ✅ |
| Legal re-acceptance | AUTH-08 | ✅ |
| Session plumbing | AUTH-04 refresh rotation; refresh rejected after logout; DEVICE_LIMIT_REACHED → retry with the same code + `revokeSessionId` (the revoked session gets 401) | ✅ |

## Mobile app

Same tools and the same live run. App requests use `X-Client-Platform: ios` + `X-App-Version` and an iOS session.
App DTO names (`*Dto`) are checked against `app/user/src/api/types.ts`.

**Static check:** app/user has 103 call sites (102 unique method+path), and **0 unmatched**. This includes the SSE
`expo/fetch` call and `/health`. `grep -r "data/" src` finds nothing, so there are no mock imports.
**Builds:** `tsc --noEmit` ✅ (0 errors). `npx expo export --platform ios --max-workers 2` ✅ (Hermes bundle 6.5 MB, exit 0).
No app source was changed, so the app on Expo Go looks the same as before.

| Route / screen | Endpoints (live-verified) | Status |
|---|---|---|
| `_layout` / gate | PUB-01 (with `X-App-Version`, no maintenance or update block), AUTH-07, ME-07 push token | ✅ |
| `(auth)/welcome` | PUB-05, PUB-01 | ✅ |
| `(auth)/login` | AUTH-01 `login` | ✅ |
| `(auth)/register` | PUB-02, PUB-03 `governorateId` (boost), PUB-04, PUB-11, AUTH-01 `register` | ✅ |
| `(auth)/verify-otp` | AUTH-02 (+`registration`), AUTH-01 resend after cooldown, DEVICE_LIMIT_REACHED + `revokeSessionId` | ✅ |
| `(tabs)/home` | PRG-04, CAT-01, PRG-11, PRG-12, NTF-02 | ✅ |
| `(tabs)/subjects` | CAT-01, PRG-06 | ✅ |
| `subject/[id]` | CAT-02, CAT-03, CAT-04 | ✅ |
| `lesson/[id]` | CAT-05, CAT-06, PRG-01 (`pause`, platform ios), PRG-02, CAT-07, CAT-08/09, PUB-08, ME-03 | ✅ |
| `quiz/[lessonId]` | CAT-10, QUZ-01/02/03, QUZ-04/05 (attempt list + detail), BMK-03/04 | ✅ |
| `(tabs)/practice` | BNK-02, PRA-05, MST-02, BMK-02, PRG-07, PUB-01 | ✅ |
| `question-bank/index` | BNK-01 (`reveal=true` → QuestionReview), BNK-03, BMK-01/03/04 | ✅ |
| `question-bank/practice-session` | PRA-01 (filters/bookmarks/mistakes), PRA-02, PRA-03 | ✅ |
| `question-bank/result` | PRA-04 | ✅ |
| `mistakes/index`, `mistakes/[id]` | MST-01, MST-02, MST-04, MST-03, MST-05 | ✅ |
| `exams/index` | EXM-01, EXM-09 | ✅ |
| `exams/room/[id]` | EXM-03, EXM-04, EXM-05 (`seq`), EXM-06, EXM-07 (`Idempotency-Key`, replay from the second device) | ✅ |
| `exams/result/[id]` | EXM-08 | ✅ |
| `(tabs)/tutor` | AIT-01/02/03/04/05/06/07, AIT-08 SSE + JSON fallback → AIT-09 polling, AIT-10, STO-01 | ✅ |
| `progress` | PRG-06, PRG-05, PRG-07, PRG-08, PRG-09, PRG-13 achievements, PRG-10 activity, PRG-03 lessons | ✅ |
| `notifications` | NTF-01, NTF-03, NTF-04, NTF-05 | ✅ |
| `(tabs)/profile` | ME-01, PRG-06, MST-02, NTF-02, PUB-01, AUTH-05 + ME-08 | ✅ |
| `subscription/index` | PAY-03, PAY-01, PUB-07 `subscription_app` | ✅ |
| `subscription/checkout` | PAY-02, PAY-11, PAY-05, PAY-04, PAY-06, PAY-07, PAY-08 | ✅ |
| `subscription/success` | PAY-08, PAY-10 json | ✅ |
| `settings/index`, `settings/sessions` | ME-09, ME-10, ME-03, ME-04, ME-05 | ✅ |
| `settings/edit-profile`, `settings/language` | ME-01, PUB-02, PUB-03, PUB-01 `avatarPresets`, STO-01, ME-02 | ✅ |
| `legal/terms`, `legal/privacy`, re-acceptance | PUB-11, AUTH-08 | ✅ |

### Server fixes made during this verification

- `server/src/config/db.ts`: the Supabase session pooler sometimes refuses a new connection (EMAXCONNSESSION / 53300)
  before any statement runs. Standalone queries and `tx()` connection checkout now retry these refusals with a short
  backoff (150 ms → 2 s, at most 4 retries) instead of returning 500. Statements inside a transaction are never retried.
  Before this change, `verify-otp` for new students failed 500 on fan-out queries in `usersService.me`.
- Frontend fallback API URL changed from `localhost:4000` to `localhost:4100` in `app/user/src/api/config.ts`, `website/user/src/api/client.ts` and `website/user/src/vite-env.d.ts`.
- `server/src/db/seed/demo.ts`: the demo `daily_activity` insert now uses a plain `ON CONFLICT DO NOTHING`. Seed row
  ids are rebased per day, so re-running the seed on a later day hit the primary key and failed (`npm run seed` broke).
  The seed is idempotent again.
- Server checks after these changes: typecheck ✅, lint ✅, 208/208 unit tests ✅.

### Known caveat (not changed)

AUTH-02 commits OTP consumption and account creation in one transaction. Session issuance and the `me` payload run
after that commit. If the request fails after the commit (for example on a DB outage), the OTP is already used. The
client must request a new code and sign in with `purpose: login`, and a session row may be left behind. This is rare,
and the retry above mitigates the main cause.

## Admin portal

Verified 2026-10-22: full runs against the shared API on `http://localhost:4100/api/v1` (91/91) and against a
DB_POOL_MAX=3 instance with every server fix below on `:4155` (92/92 including purge). Signed in as super admin
`admin@eduway.iq` (MFA is off on the seed; the script handles `mfaRequired` through `ADMIN_TOTP`).

**Tools** (repo root):
- `node scripts/verify-endpoints.mjs website/admin` (shared tool) and `node scripts/verify-admin-endpoints.mjs [dir]`.
  The admin variant scans all of `src/` (pages too), including `download()`, `useExport()` and `*_EXPORT` path constants.
- `node scripts/verify-admin-flows.mjs` (`API_URL=…`, `SERVER_LOG=<api stdout>` for the dev-mailer invite link,
  `--only=<modules>`, `--json`, `--purge-only=<runId|ALL>`) is the live walk. The password is read from `server/.env`
  at runtime. It covers:
  - every list endpoint with the UI's real filters, sort keys and pagination, and every detail endpoint on a seeded row;
  - mutations with cleanup, and response fields checked against `website/admin/src/api/*.ts` DTO interfaces;
  - a final SQL purge, scoped by run id, of anything the API only soft-deletes.

**Static check:** 281 unique method+path calls (shared tool: 242 call sites in `src/api`), **0 unmatched**. The 5
variable-built paths (`q(id)`, `base(id)`) resolve to `/admin/questions/{id}` GET/PATCH/DELETE and
`/admin/students/{id}` GET/PATCH. A query-param audit (names, enum values, sort keys sent by every list page against
the server zod schemas and sort allow-lists) found 3 UI sort mismatches; all are fixed (see below).
**No mock data:** `grep -r "data/" src` finds no imports, and `src/data` no longer exists.
**Builds:** `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅ (0 errors).
**Live run:** **92/92 steps PASS**, every created row removed.

| Page / tab | Endpoints (live-verified) | Status |
|---|---|---|
| Login / 2FA / accept invite / forgot / reset | AUTH-10 (MFA-aware), AUTH-11 path, AUTH-17 invite info, AUTH-18 accept-invite (temp admin), AUTH-04 refresh, AUTH-09 `/auth/me` | ✅ |
| Layout (Topbar, CommandPalette, inbox) | ADM-LKP-01 lookups, SRC-01 (`q` ≥ 2, `scopes`), `/admin/roles?pageSize=100`, ADM-ME inbox list | ✅ |
| Profile | `/admin/me`, `/admin/me/sessions`, `/admin/me/notifications` | ✅ |
| Dashboard | **ADM-DSH-01** `?from&to` (KPIs, 12-month chart, package donut, DAU, governorates, weakest topics, top schools/marketers, pending review, recent payments), ADM-DSH-02, ADM-ANL-03 | ✅ |
| Users list | ADM-STU-01 (status incl. `locked`, `__none` package/school/marketer, governorate, source, platform, created range, `q`, 4 sort keys), ADM-STU-02, ADM-STU-03 export, ADM-STU-04/05 bulk lock/unlock | ✅ |
| User detail: Overview / Sessions / Notes / Payments / Activity / Actions | ADM-STU-06, -09, -12, -13 add note, -20, -19, -16; lock→unlock -07/-08; manual grant -14 with `Idempotency-Key` (replay returns same entitlements) → revoke -15 `?reason=`; force logout all -11 `?reason=`; OTP reset -18; ADM-SUP-01 | ✅ |
| Subjects / Units | ADM-SUB-01/02/03/05 (create → edit → delete), units + topics create/edit/delete, lesson reorder in topic | ✅ |
| Lessons / Content workflow / Lesson editor | ADM-LSN-01 (table, `view=board` pageSize 1000, `view=options`, filters, `-views`), detail, create → edit → `in_review` → approve → publish/schedule blocked with `VIDEO_NOT_READY` → archive, versions (≥2), delete, export xlsx | ✅ |
| Lesson resources / Videos | STO-01 signed URL → PUT bytes to Supabase Storage → register PDF resource → edit → signed download → delete; STO-01 `lesson_video` → ADM-VID-04 register → detail → remove; ADM-VID-01/02/03 list/stats/detail | ✅ |
| Question bank / editor / review queue | ADM-QST-01 (status/difficulty/type/subject/q), stats, detail, create → similar (duplicate check) → submit → approve → duplicate → edit → delete, review queue, tags, export | ✅ |
| Bulk import | template CSV → STO-01 `question_import` upload → ADM-IMP-02 preview (`totals`, rows) → errors CSV → commit with `Idempotency-Key` → created questions deleted | ✅ |
| Quiz rules | ADM-QZR-01 (`scope=subject|lesson`), subject upsert round-trip (changed + restored), lesson override create → patch → delete, export | ✅ |
| Exam blueprints / editor | list/stats/detail, availability, create → publish (`force`) → duplicate → archive → delete, export | ✅ |
| Attempts | list (`-date`), stats, detail, export | ✅ |
| Packages / editor | ADM-PKG-01 `pageSize=100`, detail, create → edit → duplicate → archive → restore → delete, export | ✅ |
| Promotions | list (`-validFrom`), stats, check-code, generate-code, redemptions, create → edit → delete, export | ✅ |
| Subscriptions | list (`endsAt`, `-startedAt`, status/package filters), grant (`Idempotency-Key`) → extend → cancel, export | ✅ |
| Transactions / detail | list (status/gateway/date/q), summary, detail (timeline, webhooks, canRefund), receipt json + pdf, partial refund with `Idempotency-Key` (replay returns same refund, missing key → 400) → reject, export | ✅ |
| Refunds | list (`requestedAt`, `amount`, `-status`), summary, reject, export | ✅ |
| Reconciliation | overview (summary/chart/daily), comparison (`-day`, gateway, difference, systemAmount), resolve a mismatch (row restored afterwards), export `table=comparison` | ✅ |
| Schools / detail / settlements | list (sorts, status, governorate), stats, detail, attributed students, incentive progress, notes; create → note → assign marketer → **409 DOUBLE_ATTRIBUTION** (`details.currentMarketer`) → override → unassign → delete; settlements list/generate/approve; exports | ✅ |
| Incentive rules | list, detail, preview, clone draft → edit → delete | ✅ |
| Marketers / detail / milestones / settlements | list (`-paidStudents`, status), stats, detail, performance, incentive progress, milestone sets, create → edit → delete, export xlsx | ✅ |
| AI usage / settings / abuse controls | ADM-AI-01, models, settings PATCH round-trip, kill switch disable → enable (original state restored), per-student disable → enable, flags (sorts) + detail transcript, flagged users, exports | ✅ |
| Business / Learning analytics | ADM-ANL-01 (day/week/month, compare, web/ios/android), ADM-ANL-02 (+`prevWau/prevMau`, subject), ADM-ANL-04 topics, ADM-ANL-05 platform split (web/ios/android) | ✅ |
| Exports | preview → generate csv + xlsx (`Idempotency-Key`) → history → download both → history export | ✅ |
| Templates / editor | list (`meta.matrix`, sorts), variables, detail, create → edit → duplicate → bulk deactivate → delete, export | ✅ |
| Send campaign | list, audience preview (`matched/reachable/excluded`), send in-app to a filtered audience, scheduled campaign → cancel (back to `draft`), export; campaign, deliveries and in-app rows removed | ✅ |
| Delivery log | list (channel/status filters), stats, export | ✅ |
| Settings: General / OTP / App / Support / Payments / Learning / Marketing / Security | GET → PUT round-trip for all 8 sections; App maintenance ON (iOS) → PUB-01 shows maintenance → restored OFF | ✅ |
| Feature flags | list, create → toggle → delete | ✅ |
| Legal documents | versions + stats for terms/privacy, acceptances, draft clone → edit → delete. Publishing was deliberately not exercised because it would retire the live version for every student. | ✅ / ⚪ |
| CMS (testimonials, FAQ) | lists, FAQ create → edit → reorder → delete, testimonials reorder | ✅ |
| Roles / role editor / permissions | `/admin/roles?pageSize=100`, detail, permission catalog, temp role create → update → delete (`confirmKey`) | ✅ |
| Admin users | list (sorts), export, invite (temp admin) → deactivate | ✅ |
| Audit logs | list (entity, action sort, date range), facets, detail with before/after diff, export | ✅ |
| Sessions | admin sessions list (`AdminSessionDto` fields), export | ✅ |
| Suspicious activity | security alerts list, resolve → reopen | ✅ |
| **RBAC** | Temp role (`dashboard.view`, `content.view`) and temp admin created via invite + accept-invite. `/auth/me` has no `payments.view`. 200 on `/admin/subjects` and `/admin/system/health`; **403** on `/admin/payments`, `/admin/students`, `/admin/roles`, `/admin/settings/general` and on POST `/admin/subjects`. The dashboard returns `null` for payments, schools and other forbidden sections. After deactivation the token gets 401. Admin and role are deleted. | ✅ |

### Fixes made during this verification

- **Server, ADM-DSH-01 `GET /admin/dashboard` was missing (404)** although the contract and the dashboard page use it.
  Added `server/src/modules/analytics/dashboard.ts` and the route in `analytics/routes.ts` (`dashboard.view`).
  Sections the admin lacks module permission for return `null`, per the contract.
- **Server, reconciliation `range()` timezone shift.** It parsed date-only days in the host timezone, so on hosts east
  of Baghdad (this dev box is UTC+5) the day moved back by one. `POST /admin/reconciliation/resolve` then returned
  `null` instead of the `ReconciliationRow`. Date-only input is now read as a business day. The same fix was applied to
  analytics `resolveRange()` (exports preview/generate, analytics ranges).
- **Admin UI sort keys** found by the query-param audit:
  - Refunds "requested by" column id is now `requestedAt` (it sent `requestedBy`, which the server ignores).
  - Templates `active` column is no longer sortable (it is not a server sort key).
  - Quiz-rule override columns are no longer sortable (ADM-QZR-01 has no sort).
- Admin fallback API URL changed from 4000 to 4100 (`src/api/client.ts`, `vite-env.d.ts`).
- Server checks after the changes: typecheck ✅, lint ✅, 208/208 unit tests ✅, check-prefix ✅. OpenAPI regenerated
  (356 paths).

### Notes

- Exports share a rate limit, so a full run hits one 429 on the third export in a burst. The script waits for
  `Retry-After` and continues. This is expected behaviour, not a failure.
- These are minor and were left as is: the Delivery log KPIs (`/admin/deliveries/stats`) are requested without the
  page's filters, and Learning analytics sends `subjectId` only to `/analytics/topics`.
