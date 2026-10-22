# EDUWAY browser E2E (Playwright)

Real-browser tests for the student site (`website/user`) and the admin portal (`website/admin`) against a
**running** EDUWAY API. Isolated tools package — Playwright is not a dependency of the apps.

See `docs/E2E.md` for the coverage matrix, bugs found and results.

## Setup

```bash
cd e2e
npm install
npm run install:browsers          # Playwright Chromium
```

The student flows run in installed **Microsoft Edge** (`channel: msedge`) because the lesson videos are
H.264 MP4 and Playwright's bundled Chromium has no proprietary codecs. Override with
`E2E_FLOW_CHANNEL=chrome` (or `chromium` to accept that the heartbeat step cannot play video).

## Prerequisites

- API running at `http://localhost:4100/api/v1` (override `E2E_API_URL`). The suite never starts or stops it.
- Seeded demo student `+9647701234567` (OTP dev bypass `123456`) and super admin from `server/.env`
  (`SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`, read at runtime, never printed;
  or set `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`).

## Run

```bash
npm run test:full     # build both apps into e2e/.dist, then the whole suite (preview mode)
npm test              # whole suite against the existing e2e/.dist builds
npm run test:routes   # route sweeps only (all apps, EN/AR, desktop + phone)
npm run test:flows    # interaction flows only
npm run test:dev      # same suite against the Vite dev servers (E2E_MODE=dev)
npm run report        # open the HTML report
```

Playwright starts and stops its own web servers on dedicated ports — preview `4273` (user) / `4274`
(admin), dev `5373` / `5374` — so it never collides with a developer's servers. `scripts/teardown.ts`
kills anything left listening on those ports (Windows leaves orphaned `vite` children).

Outputs: `screenshots/<app>/<lang>/<route>.png` (`user`, `user-mobile`, `admin`, `admin-mobile`,
`flows-user`, `flows-admin`), `playwright-report/`, `test-results/` (traces of failures).

## Projects

| project | what |
| --- | --- |
| `setup-user` / `setup-admin` | UI sign-in, saves `.auth/*.json`, resolves real ids for `:id` routes |
| `user-routes-desktop` / `user-routes-mobile` | every student route × EN/AR at 1440×900 and 390×844 |
| `admin-routes` | every admin route (parsed from `website/admin/src/routes/index.tsx`) × EN/AR |
| `admin-routes-mobile` | admin shell + newest pages (teachers, support, marketer detail, delivery log) at 390×844 |
| `user-flows` | OTP login → lesson video/heartbeat → quiz → practice → mistake retry → exam → AI tutor → checkout → notifications → profile/language → contact form → logout |
| `admin-flows` | login → dashboard → students/note → lesson draft on workflow board → question → package price → maintenance mode → export → teacher with avatar → support ticket → marketer detail → delivery log → audit log → logout |

Every page check asserts: no `pageerror`, no `console.error`, no failing API call (4xx/5xx, except the
explicitly allowed ones), no raw i18n keys / `undefined` / `NaN` / `[object Object]` / `{{var}}` in visible
text, content rendered within 10 s (no skeleton left), `html[dir]`/`html[lang]` match the language.

## Rate limits & test data

- OTP sends are limited (3 codes / 30 min per phone): the setup reuses a still-valid saved session and
  only `user-flows` performs a fresh OTP login per run. Debug the student flows without OTP with
  `E2E_REUSE_SESSION=1 npx playwright test --project=user-flows --no-deps`.
- The public contact form (5/hour/IP) is submitted exactly once per run (`user-flows`); its ticket is the
  one `admin-flows` replies to and resolves.
- Created data is removed: lesson draft, question, teacher, package price, maintenance mode. The fresh
  exam paper the student sits is archived afterwards (attempted papers cannot be deleted). The student
  support note is append-only by design and is tagged `[E2E …]`. A checkout with the mock gateway adds a
  (mock) payment to the demo student's history.
- Runs serially (`workers: 1`): refresh tokens rotate on every use, and maintenance mode affects the student site.
