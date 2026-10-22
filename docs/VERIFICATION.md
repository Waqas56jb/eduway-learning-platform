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

### AI tutor — live OpenAI + knowledge base (RAG), 2026-10-23
Provider `AI_PROVIDER=openai`, chat model **`gpt-6-luna`** (admin AI settings: provider `openai`, model `gpt-6-luna`, cost per 1k
in/out `0.0001` / `0.0005` USD), embeddings `text-embedding-3-small`. pgvector `vector` 0.8.2 lives in schema `extensions`.

| Check | Result |
|---|---|
| `npm run migrate -- --only=012,405` | ✅ `012_embeddings` re-applied (was `skipped`; type/opclass qualified as `"extensions".vector`), `405_knowledge_base` applied. (`--only` added so other agents' pending 404/406 were not applied.) |
| `npm run kb:index` (initial full index) | ✅ 176 sources → **352 chunks** (lessons 69, units 17, chapters 32, question explanations 52, FAQs 6; × en/ar), **39,954 tokens ≈ $0.0008**, 34 s. Re-run with no changes: 0 embedded, 352 unchanged, 2.9 s, $0. |
| Admin ADM-AI-16/17 (super admin, live API) | ✅ status 200; reindex 202 → `queued` → `running` (progress 0→70→99 %) → `completed` in 8.4 s; unauthenticated 401. |
| Retrieval latency (demo student, cached question embedding) | ~175 ms (one SQL round-trip to the Seoul pooler); first ask of a new question +0.5–1 s for the embedding call. Off-curriculum question (Newton's 2nd law) → no context injected (similarity cut). |
| Live tutor, SSE, demo student `+9647701234567` | ✅ 3 questions: AR math "مشتقة حاصل ضرب دالتين" (cited: المشتقات العليا, المشتقات, الفصل: المشتقات; 1,014 in / 123 out tokens, $0.000163), EN physics "Lenz's law" (cited: Lenz's Law question + lesson; 642 / 45, $0.000087), AR chemistry "ثابت الاتزان Kc" (cited: ثابت الاتزان Kc و Kp; 898 / 270, $0.000225). Arabic answers, `$…$`/`$$…$$` LaTeX, first delta 2.9–5.1 s, total 5.6–8.3 s. Allowance 56 → 55 → 54 → 53 remaining. Test conversations hard-deleted and the demo student's usage counters restored afterwards. |
| Unit tests | ✅ `tests/unit/ai-knowledge-base.test.ts` (11) + existing AI tests (mock providers, no network). |

Note: a process running an older build (not the :4100 dev server) also consumes the shared pg-boss queue; it picked up one
reindex job and wrote legacy `lesson_transcript` rows. Runs now use their own queue `eduway.kb-index` (old builds don't
know it), legacy rows are purged by every full sync and are never retrieved. Restart/stop stale API instances to avoid the
nightly `eduway.embeddings-generate` being taken by old code.

### Transactional email — live Gmail SMTP, 2026-10-23
`EMAIL_PROVIDER=smtp` (smtp.gmail.com:465, app password), `MAIL_FROM="EDUWAY <account@gmail.com>"`. Migration
`406_transactional_email` (users.email_verified_at, `eduway_platform_email_verifications`, dedupe index) — applied, prefixed.

| Check | Result |
|---|---|
| Every template sent once to the owner's inbox (`sendTemplateNow`, Arabic first) | ✅ 15/15 accepted by Gmail with a `messageId`: admin_password_reset, admin_invite, admin_password_changed, admin_mfa_enabled, admin_mfa_disabled, admin_new_device_login, admin_alert, admin_export_ready, email_verification, payment_receipt (+ receipt PDF of a real paid payment), subscription_activated, subscription_expiring, subscription_expired, support_reply, notification. |
| Queue path (`queueEmail` → delivery row → `eduway.notification-dispatch`) | ✅ row `sent`, provider `smtp`, `provider_message_id` recorded. |
| Admin reset E2E against the running API (:4100) | ✅ forgot-password 200 → reset email delivery `sent` (dev guard redirected the seed address to the owner inbox) → link token from the delivery row (development keeps it) → reset-password 200 → same token again 422 `RESET_TOKEN_INVALID` (single use) → "password changed" alert `sent` → admin login with the new password 200; new-device sign-in alert `sent`. Super-admin password then restored to `SEED_SUPER_ADMIN_PASSWORD` through the same flow and login re-checked (200). |
| Student email confirmation + receipt (demo payer, email temporarily set to an owner `+alias`) | ✅ unconfirmed email → no student email; ME-12 link `sent` → `POST /auth/email/verify` 200 (`verified: true`), replay 422; receipt email with PDF attachment `sent` with messageId. Student email restored afterwards. |
| Unit tests | ✅ `tests/unit/email.test.ts` (31: every template bilingual/RTL/escaping, Gmail From alignment, dev recipient guard, mocked transport incl. receipt attachment, permanent vs retryable SMTP errors, throttle). Server `typecheck` ✅ · `lint` ✅ · `npm test` ✅ · `check-prefix` ✅. Admin + student web `typecheck` / `lint` / `build` ✅. |

Note: as in the AI section, an older build outside the :4100 dev server also consumes the shared pg-boss queue. Three of
the E2E deliveries were taken by it (status `sent`, no `provider_message_id`; old code sends text-only with an empty body).
Stop stale API instances so every email goes through the new renderer.

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

### Mobile app — integration hardening update (2026-10-23)

**Live app-flow walk: `node scripts/verify-app-flows.mjs` → 62/62 PASS** (142 requests, 2 token refreshes, against the
running API). The script sends the app's own headers on every call (`Accept-Language` ar/en, `X-Request-Id`,
`X-Client-Platform: ios`, `X-Device-Id`, `X-App-Version` from `app.json`, Bearer). It uses the same bodies as
`app/user/src/api/*` and follows the app's screen order: boot (`/health`, PUB-01) → register pickers and legal →
OTP login (AUTH-01, wrong code → `OTP_INVALID`, bypass `123456`) → `/auth/me` → refresh rotation and 401 → refresh →
replay → home → subjects and subject → locked lessons → lesson, stream and `PUT /progress/watch` → resources, note
and quiz rule → quiz → practice, bank and bookmarks → mistakes → exams → AI tutor (SSE `meta/delta/done` plus the
JSON polling fallback) → notifications and push token → progress → packages, quote, promo, mock checkout → support
ticket (PUB-10) → profile and notification preferences → sessions → language switch → logout (both refresh tokens
rejected). Every payload is checked against `app/user/src/api/types.ts`.

It signs in as the demo student `+9647701234567`, which is shared with other devices and tools, so it is careful:
- It never revokes a session it did not create. When the device limit is full of other sessions, it waits for a free
  slot (`--wait-slot` minutes).
- ME-05 "sign out other devices" runs only when every other session belongs to the script.
- Every setting it changes is restored: daily goal, language, notification preferences, lesson note, today-plan
  item, mistake status, bookmark and video position.
- It deletes what it creates: the AI conversation, the push token and the support ticket (admin ADM-SUP-05).
- The checkout uses the mock gateway with outcome `cancel`, so no entitlement is granted.

Some history has no delete API, and the summary prints what was kept: one quiz attempt, one practice session, one
mistake retry, 2 AI questions and one cancelled mock payment.

Not exercised on the demo account in this run:
- Paywall 402: the demo student is entitled to every subject. verify-student-flows covers 402 on a fresh account.
- Exam submit: every exam had fewer than 2 attempts left, and the script does not use the demo student's last
  attempt.
- ME-04 / ME-05 success paths: these would sign out other devices. verify-student-flows covers both.

**App fixes in this pass:**
- **Error and retry states.** These screens no longer render blank or zero values when their query fails:
  - home (dashboard)
  - progress (also gets skeletons)
  - practice tab (facets; also gets skeletons)
  - tutor conversation (also gets bubble skeletons)
  - settings/sessions and notifications (before, an error looked like an empty list)
  - mistakes list
  - question bank (also gets an empty state for the "all" tab)
  - subscription packages
  - exams (a skeleton for past attempts)

  lesson, subject, quiz, exam room and the result screens now show retry for 5xx as well as network errors.
  lesson and subject show the paywall state ("Not in your package" → View plans) on 402/403. All of these use the
  existing `EmptyState` + `common:states.*` pattern.
- **Order-locked lessons (runtime bug).** A sequential or prerequisite-locked lesson opened the lesson screen with
  "Not in your package" and sent a subscribed student to the paywall. It now shows "Finish the previous lesson to
  unlock this one" with a "Previous lesson" action. A new key, `lesson:player.orderLocked`, is added in both en and ar.
- **Offline.** A new global offline pill, `src/components/system/OfflineBanner.tsx`, is mounted in `app/_layout.tsx`.
  It is driven by the existing connectivity tracker and uses `common:states.offline`.
- **Support ticket.** Contact support (from Profile or Settings) now has a "Send us a message" form: topic chips, a
  message of at least 20 characters, and Send. It calls PUB-10 `/public/contact` with the student's name and mobile.
  New `settings:support.*` keys are added in both en and ar, and `submitSupportMessage` is added to `src/api/public.ts`.
- **Already correct, no change needed:**
  - single-flight refresh with replay, and sign-out with a toast when the refresh token is rejected
  - the exam offline queue
  - 402/403 → subscription for actions
  - no mock data or `src/data` imports

**Checks:** `tsc --noEmit` ✅ (0 errors). `npx expo export -p ios` ✅ (Hermes bundle 6.5 MB). en/ar keys are
identical; the only differences are the Arabic plural forms in common. No lint is configured for app/user.

**Not run: web mode with Playwright.** `react-dom` and `react-native-web` are not installed in app/user, and
installing them would change `package.json`, so no web screenshots were taken.

## Admin portal

Verified 2026-10-22: full runs against the shared API on `http://localhost:4100/api/v1` (91/91) and against a
DB_POOL_MAX=3 instance with every server fix below on `:4155` (92/92 including purge). Signed in as super admin
`admin@eduway.iq` (MFA is off on the seed; the script handles `mfaRequired` through `ADMIN_TOTP`).

**Tools** (repo root):
- `node scripts/verify-endpoints.mjs website/admin` (shared tool) and `node scripts/verify-admin-endpoints.mjs [dir]`.
  The admin variant scans all of `src/` (pages too), including `download()`, `useExport()` and `*_EXPORT` path constants.
- `node scripts/verify-admin-flows.mjs` (`API_URL=…`, `SERVER_LOG=<api stdout>` for the dev-mailer invite link,
  `--only=<modules>`, `--json`, `--purge-only=<runId|ALL>`, `--legal-publish`) is the live walk. The password is read from `server/.env`
  at runtime. It covers:
  - every list endpoint with the UI's real filters, sort keys and pagination, and every detail endpoint on a seeded row;
  - mutations with cleanup, and response fields checked against `website/admin/src/api/*.ts` DTO interfaces;
  - a final SQL purge, scoped by run id, of anything the API only soft-deletes.

**Static check (re-run after the support / teachers / marketer additions):** 295 unique method+path calls (shared tool: 253 call sites, 249 unique, in `src/api`), **0 unmatched**. `verify-admin-endpoints.mjs --unused` lists admin operations without a UI call: 25, all variable-built student/question detail paths or endpoints listed in contract §34.4 as script-only. The 5
variable-built paths (`q(id)`, `base(id)`) resolve to `/admin/questions/{id}` GET/PATCH/DELETE and
`/admin/students/{id}` GET/PATCH. A query-param audit (names, enum values, sort keys sent by every list page against
the server zod schemas and sort allow-lists) found 3 UI sort mismatches; all are fixed (see below).
**No mock data:** `grep -r "data/" src` finds no imports, and `src/data` no longer exists.
**Builds:** `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅ (0 errors).
**Live run:** **92/92 steps PASS**, every created row removed. Re-run after the additions below: **98/98 PASS** on the shared API (new steps: support tickets ×5, teachers CRUD, marketer students, receipt PDF AR/EN, learning subject filter, delivery-stats filters), plus the opt-in `--only=legal-publish` walk **3/3 PASS** (run once).

| Page / tab | Endpoints (live-verified) | Status |
|---|---|---|
| Login / 2FA / accept invite / forgot / reset | AUTH-10 (MFA-aware), AUTH-11 path, AUTH-17 invite info, AUTH-18 accept-invite (temp admin), AUTH-04 refresh, AUTH-09 `/auth/me` | ✅ |
| Layout (Topbar, CommandPalette, inbox) | ADM-LKP-01 lookups, SRC-01 (`q` ≥ 2, `scopes`), `/admin/roles?pageSize=100`, ADM-ME inbox list | ✅ |
| Profile | `/admin/me`, `/admin/me/sessions`, `/admin/me/notifications` | ✅ |
| Dashboard | **ADM-DSH-01** `?from&to` (KPIs, 12-month chart, package donut, DAU, governorates, weakest topics, top schools/marketers, pending review, recent payments), ADM-DSH-02, ADM-ANL-03 | ✅ |
| Users list | ADM-STU-01 (status incl. `locked`, `__none` package/school/marketer, governorate, source, platform, created range, `q`, 4 sort keys), ADM-STU-02, ADM-STU-03 export, ADM-STU-04/05 bulk lock/unlock | ✅ |
| User detail: Overview / Sessions / Notes / Payments / Activity / Actions | ADM-STU-06, -09, -12, -13 add note, -20, -19, -16; lock→unlock -07/-08; manual grant -14 with `Idempotency-Key` (replay returns same entitlements) → revoke -15 `?reason=`; force logout all -11 `?reason=`; OTP reset -18; ADM-SUP-01 | ✅ |
| **Support tickets** (`/support`, new; People nav, `users.*` permissions) | **PUB-10** public contact form → ticket `EW-T-NNNNN` (source `contact_form`, `billing` → `payment`) found via ADM-SUP-01 `q`; list filters (status/category/priority/source/`assigneeId=__none`), sorts (`priority`, `-updatedAt`, `status`, `number`), `meta.counts`; ADM-SUP-03 detail + thread; ADM-SUP-02 assign to me + priority (non-admin assignee → 400); ADM-SUP-04 reply → `pending`, reply + resolve → `resolved` (`resolvedAt`), reopen clears it; ADM-SUP-06 CSV export contains the ticket; ADM-SUP-05 delete → 404. Test ticket and its inbox item removed. | ✅ |
| Subjects / Units | ADM-SUB-01/02/03/05 (create → edit → delete), units + topics create/edit/delete, lesson reorder in topic | ✅ |
| **Teachers** (`/content/teachers`, new) | ADM-TCH-01 (+`lessonsCount`), STO-01 `teacher_avatar` signed upload → PUT → ADM-TCH-02 create with avatar → ADM-TCH-03 edit (rating, null years, deactivate) → clear avatar → ADM-TCH-04 delete; 409 `HAS_DEPENDENTS` on a teacher with lessons | ✅ |
| Lessons / Content workflow / Lesson editor | ADM-LSN-01 (table, `view=board` pageSize 1000, `view=options`, filters, `-views`), detail, create → edit → `in_review` → approve → publish/schedule blocked with `VIDEO_NOT_READY` → archive, versions (≥2), delete, export xlsx | ✅ |
| Lesson resources / Videos | STO-01 signed URL → PUT bytes to Supabase Storage → register PDF resource → edit → signed download → delete; STO-01 `lesson_video` → ADM-VID-04 register → detail → remove; ADM-VID-01/02/03 list/stats/detail | ✅ |
| Question bank / editor / review queue | ADM-QST-01 (status/difficulty/type/subject/q), stats, detail, create → similar (duplicate check) → submit → approve → duplicate → edit → delete, review queue, tags, export | ✅ |
| Bulk import | template CSV → STO-01 `question_import` upload → ADM-IMP-02 preview (`totals`, rows) → errors CSV → commit with `Idempotency-Key` → created questions deleted | ✅ |
| Quiz rules | ADM-QZR-01 (`scope=subject|lesson`), subject upsert round-trip (changed + restored), lesson override create → patch → delete, export | ✅ |
| Exam blueprints / editor | list/stats/detail, availability, create → publish (`force`) → duplicate → archive → delete, export | ✅ |
| Attempts | list (`-date`), stats, detail, export | ✅ |
| Packages / editor | ADM-PKG-01 `pageSize=100`, detail, create → edit → duplicate → archive → restore → delete, export | ✅ |
| Promotions | list (`-validFrom`), stats, check-code, generate-code, redemptions + redemption export (ADM-PRM-10, new button in the redemptions modal), create → edit → delete, export | ✅ |
| Subscriptions | list (`endsAt`, `-startedAt`, status/package filters), grant (`Idempotency-Key`) → extend → cancel, export (ADM-SBS-06, now wired to the table's Export button) | ✅ |
| Transactions / detail | list (status/gateway/date/q), summary, detail (timeline, webhooks, canRefund), receipt json + pdf (Arabic PDF with `Accept-Language: ar` embeds Noto Sans Arabic, `-ar.pdf`; `?lang=en` overrides), partial refund with `Idempotency-Key` (replay returns same refund, missing key → 400) → reject, export | ✅ |
| Refunds | list (`requestedAt`, `amount`, `-status`), summary, reject, export | ✅ |
| Reconciliation | overview (summary/chart/daily), comparison (`-day`, gateway, difference, systemAmount), resolve a mismatch (row restored afterwards), export `table=comparison` | ✅ |
| Schools / detail / settlements | list (sorts, status, governorate), stats, detail, attributed students, incentive progress, notes; create → note → assign marketer → **409 DOUBLE_ATTRIBUTION** (`details.currentMarketer`) → override → unassign → delete; settlements list/generate/approve; exports | ✅ |
| Incentive rules | list, detail, preview, clone draft → edit → delete | ✅ |
| Marketers / detail / milestones / settlements | list (`-paidStudents`, status), stats, detail, performance, incentive progress (now a MarketerDetail card), **attributed students** ADM-MKT-11 (new MarketerDetail section: sorts `-createdAt`/`name`/`-lastActive`, `q`), milestone sets, create → edit → delete, export xlsx | ✅ |
| AI usage / settings / abuse controls | ADM-AI-01, models, settings PATCH round-trip, kill switch disable → enable (original state restored), per-student disable → enable, flags (sorts) + detail transcript, flagged users, exports | ✅ |
| Business / Learning analytics | ADM-ANL-01 (day/week/month, compare, web/ios/android), ADM-ANL-02 (+`prevWau/prevMau`; with `subjectId` every subject-scoped chart is narrowed: scoreBySubject/weakTopics only that subject, accuracy bands ≤ unfiltered), ADM-ANL-04 topics with `subjectId`, ADM-ANL-05 platform split (web/ios/android) | ✅ |
| Exports | preview → generate csv + xlsx (`Idempotency-Key`) → history → download both → history export | ✅ |
| Templates / editor | list (`meta.matrix`, sorts), variables, detail, create → edit → duplicate → bulk deactivate → delete, export | ✅ |
| Send campaign | list, audience preview (`matched/reachable/excluded`), send in-app to a filtered audience, scheduled campaign → cancel (back to `draft`), export; campaign, deliveries and in-app rows removed | ✅ |
| **Effective quiz rule** (`/assessments/effective-rule`, new) | ADM-LSN-01 `view=options` → ADM-QZR-06 (`source`, all rule fields) checked against the ADM-QZR-01 subject default; unknown lesson → 404 | ✅ (live, 2026-10-23) |
| **Incentive-rule / settlement detail** (`/{schools,marketers}/incentive-rules/:id`, `/{schools,marketers}/settlements/:id`, new) | ADM-INC-02 for school + marketer (tier fields), ADM-SET-02 with `items` (item fields), unknown ids → 404 | step added; live run pending (see note) |
| **Campaign detail** (`/notifications/campaigns/:id`, new) | ADM-CMP-02 (stats, filters, template), ADM-DLV-01 `?campaignId` (+`status`), unknown id → 404 | step added; live run pending (see note) |
| **Daily metrics** (`/analytics/daily`, new) | ADM-ANL-03 with all 15 fields + `aiBySubject`, platform all/web/ios/android, ≥ 28 rows for a 30-day range, numeric values | step added; live run pending (see note) |
| Delivery log | list (channel/status filters), stats with the page filters (channel + from narrow the KPIs; `q` with no match → 0; provider cards keep all providers), export | ✅ |
| Settings: General / OTP / App / Support / Payments / Learning / Marketing / Security | GET → PUT round-trip for all 8 sections; App maintenance ON (iOS) → PUB-01 shows maintenance → restored OFF | ✅ |
| Feature flags | list, create → toggle → delete | ✅ |
| Legal documents | versions + stats for terms/privacy, acceptances, draft clone → edit → delete. **Publish** (`--only=legal-publish`, run once): temp student registers accepting terms 3.0 → identical clone 3.1 published with re-acceptance → student `pendingLegal` = terms 3.1, `/progress/dashboard` 403 `LEGAL_ACCEPTANCE_REQUIRED` → AUTH-08 accept → 200, acceptance listed in ADM-LGL-07 → identical clone **3.2** published without re-acceptance (seconds later, in a `finally`) → PUB-11 serves 3.2 with text identical to 3.0, no prompt for anyone, stats current 3.2. Temp student deleted. Privacy untouched (its existing 2.1 draft was left as is). | ✅ |
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
- Fixed since: the Delivery log KPIs now use the page's filters (all except `status`, per ADM-DLV-02), and Learning analytics
  sends `subjectId` to `/analytics/learning` as well; the server narrows every subject-scoped chart (see the fixes below).
- PUB-10 is rate limited to 5 tickets/hour/IP; each admin run sends one.

### Additions and fixes (second pass, 2026-10-22)

- **New admin pages:** Content › Teachers (ADM-TCH-01..04), People › Support tickets (ADM-SUP-01..06, deep link `/support?ticket=…` from the
  admin inbox and the dashboard open-issues card), MarketerDetail attributed-students section (ADM-MKT-11) and incentive-progress card (ADM-MKT-13);
  export buttons for subscriptions (ADM-SBS-06), promotion redemptions (ADM-PRM-10) and export history (ADM-EXP-05, was a client CSV of one page).
- **Server, support tickets:** added ADM-SUP-03 detail + thread, -04 reply (notifies registered students in-app/push), -05 delete, -06 export;
  list gained `source`/`assigneeId`/`studentId` filters, more sort keys and `meta.counts`; DTO gained `locale`, `replies`, `resolvedAt`.
  Ticket numbers now continue from the highest number (they were `count + 1`, so a deleted ticket's number could be reused).
- **Server, teachers:** admin responses carry `lessonsCount`.
- **Server, learning analytics:** `subjectId` now filters scoreBySubject, questionAccuracy, examScores and mistakeRecurrence (was topics only).
- **Server, receipt PDF:** rewritten on pdfkit with embedded Noto Sans Arabic (`server/assets/fonts`, OFL.txt included), bidi-js run ordering,
  fontkit Arabic shaping, RTL layout; language = `?lang` → Accept-Language → payer's account language. Checked visually (EN and AR PDFs rendered)
  and by unit tests (`tests/unit/receipt-pdf.test.ts`, 5 tests).
- Checks after the changes: server typecheck ✅, lint ✅, **213/213** unit tests ✅, check-prefix ✅, OpenAPI regenerated (358 paths);
  admin typecheck ✅, lint ✅, build ✅.

### Drill-down screens (third pass, 2026-10-23)

- **New admin pages, no server changes:** Assessments › Effective Rule (ADM-QZR-06), Analytics › Daily Metrics (ADM-ANL-03), campaign detail (ADM-CMP-02 + its
  deliveries), incentive-rule detail (ADM-INC-02) and settlement detail (ADM-SET-02 with counted payments, approve / mark paid). Reads live in
  `website/admin/src/api/drilldown.ts`; EN + AR strings are in `i18n/modules/drilldown.*.json` (+ `nav.effectiveRule`, `nav.dailyMetrics`). Entry points: the new nav items,
  campaign names in Send-campaign history, the period cell of every settlements table, and "View details" on the incentive-rule versions page. See contract §34.4.
- **Static:** `verify-endpoints.mjs website/admin`: all calls match, 0 unmatched (5 unresolved variable paths, unchanged). `verify-admin-endpoints.mjs --unused`: 300/300 calls matched;
  admin operations without a UI call went from 25 to 20. The five §34.4 endpoints are now used, and the 20 left are the variable-built student/question detail paths.
- **Builds:** admin `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅.
- **Live:** `verify-admin-flows.mjs` has 4 new read steps (listed in the table above). Neither run of 2026-10-23 completed, because the shared API on `:4100` was
  restarted or stopped partway through, outside this verification. Run 1 lost it during `support`, and the server came back with 6 s uptime. Run 2 lost it at
  `packages`, after 47 steps had passed, including the new effective-rule step. Every later step failed with `fetch failed`, not an assertion. The run's
  artefacts were removed by the SQL purge in both runs. Re-run the full script once the API is stable.


### Browser E2E (Playwright, 2026-10-23)

- Real headless-browser run of both web apps against the live API (`e2e/`, see `docs/E2E.md`): every student route and every admin route × EN/AR
  (desktop + 390×844 phone for the student site and the newest admin pages) plus 26 click-through flows. Final preview run **322/322 passed**
  (0 flaky), dev-server pass **228/228**. 9 bugs fixed (double quiz start, AI-tutor new-chat race, admin logout not revoking, refresh rate limit
  per IP + sign-out on transient refresh failures in both apps, blueprint availability 400, export re-download 422, duplicate formula).

### Payment gateways in sandbox / test mode (2026-10-23)

- **Config (`server/.env`)** uses only credentials the gateways publish for testing:
  - **ZainCash:** v2 UAT (`ZAINCASH_API_VERSION=v2`, `ZAINCASH_ENV=test`, Client ID/Secret from docs.zaincash.iq → Test Credentials).
  - **Qi Card:** UAT (`QICARD_ENV=uat`, terminal/user from developers-gate.qi.iq → Sandbox Environment).
  - **FastPay:** stays **mock**. It has no public PGW sandbox store, and its portal's test store is QR-only and rejected by staging PGW.
  - **Callbacks:** `PUBLIC_API_URL=http://localhost:4100`. Gateway server-to-server notifications need the deployed URL.
  - **Admin settings:** ZainCash and Qi Card were already enabled. Prices still come from the DB.
- **Adapter fixes against the real sandbox APIs:**
  - **ZainCash v2 (new; v1 kept):** OAuth2 token, `transaction/init`, HS256 redirect/webhook token verified with the client secret, then a mandatory
    `transaction/inquiry` re-check whose status and amount are the only things applied, plus an orderId cross-check and `partial-reverse` refunds.
  - **FastPay:** `cart` must be a JSON *string* (the staging API rejects an array), `success_url`/`cancel_url`/`callback_url` are now sent, and refunds send
    `refund_secret_key` + the payer `msisdn` (`FASTPAY_REFUND_SECRET`).
  - **Qi:** the webhook signature is verified over the documented `paymentId|amount.000|currency|creationDate|status` (it used to be over the raw body),
    `canceled: true` maps to cancelled, and `CREATED` means pending.
  - **Unchanged security checks:** IQD only, amount/currency match, signature/JWT verification, gateway re-check, idempotent `<gw>:<tx>:<status>` events.
- **Badge:**
  - `GET /public/payment-methods` items carry `mode` and `sandbox`, and `GET /admin/settings/payments` carries the read-only `gatewayModes`.
  - The admin Settings › Payments page, the web checkout (method list + details header) and the app checkout cards show **Sandbox / test mode** (EN/AR).
- **Live run against the shared API on :4100** used a fresh OTP-registered test student and the DB price (15,000 IQD):
  - **Qi Card ✅ end to end.** `POST /payments/initiate` returned a real Qi UAT `formUrl`. Playwright (real Chrome) paid with test card 5213…8582, and Qi
    redirected to `/payments/callback/qicard`. The status re-check returned SUCCESS, so the payment became **paid**, receipt R-MXMC-VD7K was issued, and the
    subscription and math entitlement were activated. Replaying the finish callback left the payment paid with entitlements unchanged (1→1).
  - **ZainCash: real UAT transaction + pay page ✅. Success ✗ (sandbox side).**
    - Initiation returned a real `pg-uat.zaincash.iq/transaction/pay?id=…` and transactionId. The pay page needs real Chrome (Cloudflare blocks headless).
    - All four public test wallets were refused by UAT on 2026-10-23: `ZC-7354 Locked balance on T24`, `E4853` monthly wallet limit exceeded, or "invalid OTP".
      This also happened directly against UAT with 1,000 IQD.
    - A real ZainCash-signed failure callback was **verified** (HS256 with the client secret). The inquiry confirmed FAILED, `payment.failed` was applied once
      with ZainCash's reason, and replaying it as a v2 webhook `{webhook_token}` returned `duplicate: true`.
    - Signed-token checks against the live API: wrong secret → 401; correctly signed **SUCCESS** token for a FAILED tx → not granted; correctly signed SUCCESS
      for a PENDING tx → stays pending; signed token with a mismatched orderId → 401.
  - **Cleanup:** the test student, 6 payments, subscription/entitlement, OTP rows, the (marker-checked) Supabase auth mirror user and 5 orphan test events
    were deleted. Transactions on the gateways' own sandboxes remain there.
- **Checks:**
  - server: typecheck ✅ · lint ✅ · `npm test` **29/29 files** ✅ (payments-gateways 29 tests, incl. 12 new ZainCash v2) · check-prefix ✅;
  - admin + user web: typecheck ✅ · lint ✅ · build ✅;
  - app: typecheck ✅.
- **Still to obtain:**
  - FastPay staging PGW credentials + payer wallet;
  - a funded ZainCash UAT wallet (or ZainCash confirming the public wallets reset monthly);
  - Qi's webhook public key;
  - live credentials for all three.

## International phone numbers (2026-10-23)

Login/signup were locked to Iraqi `+964` numbers. Every client now has a country picker (flag, name, dial code, searchable in
EN/AR), and the server validates any country's number with `libphonenumber-js` (max metadata), normalizing it to E.164. Iraqi
local input (`07…`, `7…`, `964…`) still normalizes to `+964…`, so existing accounts and the demo student `+9647701234567` keep
working. Rules: `docs/API_CONTRACT.md` §4.1.

| Area | Check | Result |
|---|---|---|
| server | `npm run typecheck` (`NODE_OPTIONS=--max-old-space-size=4096`) | ✅ 0 errors |
| server | `npm run lint` · `npm run check-prefix` | ✅ 0 problems · 21 SQL / 312 TS files, all prefixed |
| server | `npm test` | ✅ 29 files, **419/419**. `tests/unit/phone.test.ts` has 50 cases: Iraqi local formats, +1, +44, +92, +971, +966, +90, invalid input, mobile-only, test ranges, masking |
| server live | `POST /auth/send-otp {"phone":"+44 7700 900123","purpose":"register","channel":"sms"}` on :4100 | ✅ 200, `phone:"+447700900123"`, `maskedPhone:"+44 770• ••••23"`; the `eduway_platform_otp_codes` row stored `+447700900123` (E.164). Row deleted afterwards; no user was created |
| server live | `send-otp` with the London landline `+44 20 7946 0958` (`Accept-Language: ar`) | ✅ 400 `PHONE_INVALID`, Arabic message |
| website/user | `tsc -b --noEmit` · `npm run lint` · `npm run build` | ✅ clean · clean · built. libphonenumber is in its own `phone` chunk (231 kB / 58 kB gzip) |
| website/admin | `tsc -b --noEmit` · `npm run lint` · `npm run build` | ✅ clean · clean · built (own `phone` chunk) |
| app/user | `npx tsc --noEmit` · `npx expo export -p ios` | ✅ 0 errors · bundle exported. The only dependency added is pure-JS `libphonenumber-js`, so it runs in Expo Go |

Notes:
- `+44 7700 900xxx` is Ofcom's fictional "drama" range. libphonenumber rejects it as invalid, so the server and the dev builds of
  the clients accept it, and NANP `555-01XX`, **outside production only**. QA can test international sign-up this way without
  messaging a real person.
- `/auth/*` rejects numbers that can't receive an OTP: fixed-line, toll-free and premium. Contact, admin and marketer phones accept
  any valid number.
- There is no country allowlist setting, so all countries are accepted.
- Not verified in a browser or on a device: the visual pass of the picker in RTL and on phone widths.
