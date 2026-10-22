# Browser E2E (Playwright)

Real headless-browser tests of the **student site** (`website/user`) and the **admin portal**
(`website/admin`), driven against the live API (`http://localhost:4100/api/v1`). Until this pass the
frontends were only verified by builds and API scripts; this suite renders every page and clicks
through the main journeys.

Code: `e2e/` (own `package.json`, `@playwright/test` 1.64.1 — not a dependency of the apps).
Operational details: `e2e/README.md`.

## How to run

```bash
cd e2e
npm install && npm run install:browsers
npm run test:full        # vite build both apps → e2e/.dist, then the whole suite on `vite preview`
npm run test:dev         # the same suite on the Vite dev servers
npm run report           # HTML report
```

- Needs the API already running; the suite never starts/stops it (no extra DB connections).
- Web servers are started/stopped by Playwright on dedicated ports: preview 4273 (user) / 4274 (admin),
  dev 5373 / 5374. Production bundles go to `e2e/.dist/` — the apps' own `dist/` folders are untouched.
- Credentials: demo student `+9647701234567` / OTP `123456`; super admin read at runtime from
  `server/.env` (never printed or copied).
- Student flows run in installed Microsoft Edge (`channel: msedge`): lesson videos are H.264 MP4, which
  Playwright's bundled Chromium cannot decode, so the playback heartbeat could not be exercised there.

## What every page check asserts

For each route × language × viewport (`e2e/tests/support/guards.ts`, `sweep.ts`):

1. no uncaught page error (`pageerror`);
2. no `console.error` — the only allow-listed message is the browser's own "Failed to load resource"
   echo, because the failing request itself is judged by check 3;
3. no failed API request (4xx/5xx or network failure) unless the test expects it. Allowed by design:
   `401 TOKEN_EXPIRED` (the clients' reactive refresh handshake, replayed transparently), the OTP
   cool-down / device-limit answers inside the login flow, and `422 QUIZ_COOLDOWN` while looking for an
   available quiz;
4. no raw i18n keys in visible text or in placeholder/aria-label/title/alt (`<namespace>.<key>` for every
   namespace of the app, plus a generic `word.word` pattern with domain/abbreviation exclusions), and no
   `undefined`, `NaN`, `[object Object]`, `Invalid Date`, `{{var}}`. Technical identifiers that are
   deliberately rendered verbatim in `code`/`.font-mono` (audit action codes, webhook event types) and the
   unselected options of closed `<select>`s are ignored;
5. content rendered within 10 s: no visible skeleton / `aria-busy` and real text in `<main>`;
6. `html[dir]` = `rtl` for Arabic / `ltr` for English and `html[lang]` matches; the URL stays on the
   route (or the documented redirect);
7. full-page screenshot → `e2e/screenshots/<app>/<lang>/<route>.png`.

## Coverage matrix

| App | Routes | Languages | Viewports | Tests |
| --- | --- | --- | --- | --- |
| Student site | 25 (every route in `AppRoutes.tsx`: 7 public, login/register/verify-otp as guest, landing signed-in, `/student` redirect + 13 student pages incl. subject, lesson and exam-result detail) | EN, AR | 1440×900 and 390×844 | 100 |
| Admin portal | 88 (parsed at run time from `routes/index.tsx`: 74 module pages incl. `:id` details and `new` editors, 7 section redirects, 5 auth/token pages, profile, 404 — includes the new `/content/teachers`, `/support`, incentive-rule / settlement / campaign detail pages) | EN, AR | 1440×900 | 176 |
| Admin portal (phone) | dashboard, students list + detail, teachers, support, marketers list + detail, delivery log, login | EN, AR | 390×844 | 18 |
| Student flows | 12 serial steps | EN (+ AR switch) | 1440×900 | 12 |
| Admin flows | 14 serial steps | EN | 1440×900 | 14 |

The exam room (`/student/exams/:examId/room`) is not part of the sweep because opening it starts an
attempt; it is covered by the exam flow. `:id` routes use real ids resolved by the setup project.

### Interaction flows

**Student** (`user-flows.spec.ts`): OTP login through the UI (incl. the 2-device limit dialog) →
subject → lesson: `GET /lessons/:id/stream-url` returns a signed URL, the `<video>` gets a `src`, pressing
play fires the `PUT /progress/watch` heartbeat → lesson quiz answered to the result screen (and exactly
one `QUZ-01` per opening) → question-bank practice session to "Session complete" → My Mistakes: retry an
unresolved mistake (`POST /mistakes/:id/retry` + feedback) → exam: start a fresh paper, answer, autosave
`PUT …/autosave`, submit, confirm, result page → AI tutor: new chat, send, streamed answer rendered, monthly
allowance counter changes → subscription: Renew → summary → method → card details → mock gateway confirm →
"Payment successful" with receipt number → notifications: open an unread one (marks read) + "Mark all as
read" → profile: edit school and save (then restore), language EN→AR (RTL, persists across reload)→EN →
contact form (one ticket per run) → logout (session revoked, `/student` bounces to `/login`).

**Admin** (`admin-flows.spec.ts`): login → dashboard → students: search filter, open detail, add a support
note → content: create a lesson draft, drag it on the workflow board from Draft to In Review, delete it →
questions: create (MCQ, both languages, explanation) and bulk-delete → packages: change the monthly price
and put it back → settings: maintenance mode on (type-to-confirm) → the student site shows the maintenance
screen → off → analytics: generate an export (file downloaded) and re-download from history → teachers:
create with avatar upload, delete → support: status tabs, open the contact-form ticket, reply & resolve,
`?ticket=<id>` deep link → marketer detail: attributed-students table + incentive card → delivery log: stat
cards change with the channel filter → audit log lists this run's actions → logout.

Cleanup: everything created is deleted again; the exam paper copied for the student is archived
(attempted papers cannot be deleted); the student support note is append-only by design (tagged `[E2E …]`);
the mock checkout leaves a mock payment in the demo student's history.

## Bugs found and fixed

| # | Where | Bug | Fix |
| --- | --- | --- | --- |
| 1 | `website/user/src/components/student/LessonQuiz.tsx` | Opening a lesson quiz sent **QUZ-01 twice**: the round counter was bumped in an effect, so `QuizRun` first mounted with the stale key, started an attempt, then remounted and started another. Every opening created an extra (abandoned) attempt, consuming attempts / triggering the retake cool-down early. | Bump the round during render when `open` flips (React "adjust state on prop change" pattern); one mount, one attempt. Regression assertion in the quiz flow. |
| 2 | `website/user/src/pages/student/AiTutor.tsx` | Typing a question right after **New chat** sent it to the *previous* conversation while the new one was still being created; the view then switched to the new empty chat and the question/answer vanished (allowance still charged). | A pending conversation creation counts as `busy` (send disabled for that ~1 s). |
| 3 | `website/user/src/components/student/MistakeItem.tsx` | Retrying a mistake showed the question's formula twice (panel header + inside the quiz card). | Panel formula hidden while the retry card is shown. |
| 4 | `website/admin/src/pages/assessments/BlueprintEditor.tsx` | Opening `/assessments/blueprints/new` or an existing blueprint fired `POST /admin/exam-blueprints/availability` with an empty `subjectId` → 400 VALIDATION_ERROR on every load: the query was gated on the live rows but sent the debounced (stale) rows. | Gate the query on the debounced rows that are actually sent. |
| 5 | `website/admin/src/pages/analytics/Exports.tsx` | Export history showed a **Download** button for exports made from table toolbars, which are only logged (no stored file) → `422 EXPORT_NOT_READY`, nothing downloaded. | Button shown only when the record has a `downloadUrl`. |
| 6 | `website/admin/src/store/auth.ts`, `src/api/auth.ts` | **Admin logout never revoked the server session**: the store fired `POST /auth/logout` and cleared the tokens synchronously; axios runs request interceptors asynchronously, so the call went out without `Authorization` → 401, and the refresh token stayed valid for 7 days. | The access token is captured and passed explicitly with the logout call. |

| 7 | `server/src/common/middleware/rateLimit.ts`, `server/src/modules/auth/routes.ts` | `POST /auth/refresh` shared the per-IP `auth` limiter (60 / 15 min). Both web apps keep the access token in memory, so **every page load / new tab rotates the session**: one user reloading a few dozen times — or one school NAT with a handful of students — exhausted it and got 429 on refresh (found when the route sweep was signed out mid-run). | New `refresh` limiter keyed by the (hashed) refresh token, 20 / 15 min — a rotated token is single-use, so repeats are only retries/replays; the per-IP `global` limiter still bounds guessing. Other auth endpoints keep the `auth` limiter. |
| 8 | `website/user/src/api/client.ts` | When the refresh failed transiently (429 / offline / 5xx) the request interceptor sent the call **without** a token → `/auth/me` 401 → the student was bounced to `/login` although the session (and refresh token) were valid; the existing "connection problem — retry" screen was never reached. | The transient refresh error now fails the request itself, so `/auth/me` errors with 429/network and `ProtectedRoute` shows the retry screen; the session survives. |
| 9 | `website/admin/src/api/client.ts` | Same class in the admin portal, worse: any refresh failure (incl. 429/offline) returned `null` → tokens wiped and admin signed out. | Only 400/401/403 from `/auth/refresh` end the session; transient failures propagate as errors and keep the tokens. |

Checks after the fixes: user `typecheck` ✅ `lint` ✅ `build` ✅; admin `typecheck` ✅ `lint` ✅ `build` ✅;
server `typecheck` ✅ `lint` ✅ `npm test` 213/213 ✅.

### Observations (not changed)

- **Slow quiz start**: `POST /quizzes/:lessonId/start` takes 4–11 s against the remote dev database
  (≈25 sequential queries: rule resolution twice, per-set upserts, attempt insert + update). The quiz shows a
  skeleton for that long; the test allows 30 s. Worth batching on the server.
- **Slow admin dashboard**: `GET /admin/dashboard` took 5 s idle and >20 s under load (the skeleton stayed
  past 10 s in two runs); the dashboard route gets a documented 30 s render budget, every other page 10 s.
- The shared dev API runs under `tsx watch` and restarts whenever server code changes (other agents were
  editing it during this pass; once two dev servers ran at the same time). Each page check therefore first
  waits for two consecutive `/health` answers, and Playwright retries a failed test once (reported as flaky).
- The admin client relies on the reactive `401 TOKEN_EXPIRED` → refresh → replay path after a reload with a
  stale access token (one 401 per page load in the network tab); harmless, a proactive expiry check would
  avoid it.
- A few admin form controls have no accessible name (question editor explanation editors, some
  `/settings/app` inputs); not a runtime error, noted for an a11y pass.
- Product limits shape the suite: 3 OTP codes / 30 min, 2 devices per student, quiz retake cool-down,
  exam attempt limits, 5 contact tickets / hour / IP.

## Results

Final runs (2026-10-23, API on :4100, after all fixes):

| Run | Mode | Projects | Result |
| --- | --- | --- | --- |
| Full suite | `vite preview` of fresh production builds (`npm run test:full`) | all 8 (setup ×2, user-routes desktop + mobile, admin-routes, admin-routes-mobile, user-flows, admin-flows) | **322 passed, 0 failed, 0 flaky** (32.8 min) |
| Dev pass | Vite dev servers (`E2E_MODE=dev`) | setup ×2, user-routes-desktop, admin-routes | **228 passed, 0 failed** (21.9 min) |

Per project (preview run): user-routes-desktop 50, user-routes-mobile 50, admin-routes 176, admin-routes-mobile 18,
user-flows 12, admin-flows 14, setup 2. Screenshots: `e2e/screenshots/{user,user-mobile,admin,admin-mobile}/{en,ar}/`
(344 page shots) plus `flows-user/` and `flows-admin/` (incl. the student maintenance screen). Logs of the two
runs: `e2e/final-preview-run.log`, `e2e/dev-run.log` (git-ignored).

No page is left failing. Earlier runs were disturbed by the shared environment (API restarts while other agents
edited the server, the refresh rate limit before fix #7, the OTP resend window) — which is what led to fixes
#7–#9 and to the API-readiness wait; with those in place the final runs were clean without retries.
