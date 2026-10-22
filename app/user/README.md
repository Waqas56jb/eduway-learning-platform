# EDUWAY — Student Mobile App (iOS + Android)

Premium bilingual (English + Arabic RTL) e-learning app for Iraqi 6th Scientific Grade students —
Mathematics, Physics, Chemistry, Biology and English.

> **Connected to the EDUWAY API** (`server/`, contract in `docs/API_CONTRACT.md`). All data is server state
> fetched through `src/api` (axios + @tanstack/react-query); zustand only keeps client prefs (theme, language,
> onboarding) and the auth session. Tokens live in expo-secure-store.

## Pointing the app at the API

1. Start the server (`cd server && npm run migrate && npm run seed && npm run dev`, port 4000).
2. `cp .env.example .env` and set `EXPO_PUBLIC_API_URL`:
   - simulator on the same computer: `http://localhost:4000/api/v1`
   - Android emulator: `http://10.0.2.2:4000/api/v1`
   - **real phone (Expo Go)**: `localhost` is the phone itself — use your computer's LAN IP
     (`http://192.168.x.x:4000/api/v1`, same Wi-Fi, port 4000 allowed through the firewall) or an HTTPS
     tunnel URL (ngrok / cloudflared / a deployed server) ending in `/api/v1`.
3. Restart Expo with a cleared cache so the env var is inlined: `npx expo start -c`.

Every request sends `Accept-Language`, `Authorization`, `X-Request-Id`, `X-Client-Platform` (`ios`/`android`),
`X-Device-Id` (per install, secure-store) and `X-App-Version` (from app.json). Maintenance mode and
"force update" (app version below the configured minimum) come from `/public/app-config` and block the UI.

## Demo credentials

| Step | Value |
| --- | --- |
| Mobile | the seeded demo student (`770 123 4567`, +964 prefix is fixed) |
| OTP | in non-production the server accepts its `otp.devBypassCode` (`123456`) for the seeded demo student; other codes are logged by the server's MockSmsProvider |
| Checkout | non-production uses the MockGateway (PAY-07 confirm); promo codes are managed in the admin portal |

## Stack

| Concern | Library |
| --- | --- |
| Runtime | Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript (strict) |
| Navigation | Expo Router (file-based, `app/`) |
| Styling | Theme tokens (`src/theme`) + `StyleSheet`, light & dark themes |
| Animation | react-native-reanimated 4 · react-native-gesture-handler 3 · expo-haptics |
| Video | expo-video (custom controls, speed, captions, fullscreen landscape, PiP-ready) |
| Images | expo-image with blurhash placeholders + memory/disk cache |
| i18n | i18next + react-i18next, root-view RTL (`@/utils/rtl`), expo-localization detection |
| State | @tanstack/react-query (server state) + Zustand (client prefs, auth session), expo-secure-store for tokens |
| Forms | react-hook-form + zod (localized messages) |
| Charts | Custom `react-native-svg` charts (area, line, bar list, progress rings) |
| Math | KaTeX rendered in an auto-sized WebView (`MathText`, `Formula`) |
| Fonts | Playfair Display (display), Inter (UI), Tajawal (Arabic) via `@expo-google-fonts/*` |

## Run it

```bash
cd app/user
npm install            # .npmrc sets legacy-peer-deps
npx expo start         # press i (iOS simulator) / a (Android emulator), or scan with a dev build
```

Several modules (expo-video PiP, screen orientation, secure store, notifications) are best experienced in a
**development build**:

```bash
npx expo run:ios       # or: npx expo run:android
```

### Quality checks

```bash
npx tsc --noEmit                                       # type-check
npx expo export --platform ios --platform android      # production bundle
```

## EAS builds

Profiles live in `eas.json`:

| Profile | Purpose |
| --- | --- |
| `development` | Dev client, internal distribution |
| `preview` | Internal testing (Android APK) |
| `production` | Store builds, auto-incrementing build numbers |

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --platform ios
```

Bundle identifiers: `com.eduway.student` (iOS and Android). Each profile sets `EXPO_PUBLIC_API_URL` (development/preview →
staging API, production → `https://api.eduway.iq/api/v1`). Full EAS setup, build and submit steps: `docs/DEPLOYMENT.md` §5.

## Language & RTL

- First launch picks the device language (Arabic for anything other than English); **Arabic is the default**.
- Switch from **Welcome** (EN | ع toggle) or **Profile → Settings → Language**.
- Switching is instant, with no restart: the root view sets Yoga's `direction` (`rtl`/`ltr`) from the language,
  so the whole app flips immediately and identically in Expo Go and store builds (`src/utils/rtl.ts`).
  Native `I18nManager` RTL is deliberately kept off; use `isRTL()` from `@/utils/rtl` for any geometry.
- All styles use `start`/`end`; directional icons (back, chevrons, arrows) mirror automatically; charts,
  progress bars and pagers follow the reading direction.
- Strings live in `src/i18n/locales/{en,ar}/<namespace>.json`; mock content carries `{ en, ar }` fields.

## Project layout

```
app/                       Expo Router routes
  (splash)/                3-slide onboarding pager
  (auth)/                  welcome, login, register, verify-otp
  (tabs)/                  home, subjects, practice, tutor, profile (custom floating tab bar)
  subject/[id]             subject detail (Lessons / Question Bank / Exams)
  lesson/[id]              video lesson
  quiz/[lessonId]          post-video quiz
  question-bank/           bank, practice session, result
  mistakes/                My Mistakes + retry
  exams/                   simulator list, exam room, result
  progress, notifications, subscription/, settings/, legal/
src/
  components/ui            design-system primitives (Button, Card, BottomSheet, Toast, charts, MathText…)
  components/icons         custom SVG icon set, subject icons, EDUWAY logo
  components/layout        Screen, Header, TabBar
  components/student       feature components shared across screens
  data/                    bilingual mock JSON + helpers
  store/                   Zustand stores (auth, lang, prefs, progress, mistakes, tutor, notifications)
  i18n/                    i18next setup + locale namespaces
  theme/                   colors (light/dark), typography, spacing, shadows
assets/                    app icon, adaptive icon, splash, brand SVG sources
```

## Resetting the demo

Log out from **Profile → Log out**. To replay onboarding as well, clear app storage
(uninstall, or "Clear data" on Android).
