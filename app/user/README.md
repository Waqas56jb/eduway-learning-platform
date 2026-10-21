# EDUWAY — Student Mobile App (iOS + Android)

Premium bilingual (English + Arabic RTL) e-learning app for Iraqi 6th Scientific Grade students —
Mathematics, Physics, Chemistry, Biology and English.

> **Mock frontend.** There is no backend. All data comes from static bilingual JSON in `src/data`, and every
> action (login, progress, quizzes, mistakes, exams, AI tutor, checkout) is handled by local Zustand stores
> persisted to AsyncStorage / SecureStore.

## Demo credentials

| Step | Value |
| --- | --- |
| Mobile | any valid Iraqi number, e.g. `770 123 4567` (+964 prefix is fixed) |
| OTP | `123456` (any other code shows the error/shake state) |
| Promo code (checkout) | `EDU20` → 20% off |

The demo student is **Ahmed Al-Baghdadi** (Baghdad, Full Access package, 23 days left, 7-day streak, 73/100 AI questions left).

## Stack

| Concern | Library |
| --- | --- |
| Runtime | Expo SDK 58 · React Native 0.88 · React 19 · TypeScript (strict) |
| Navigation | Expo Router (file-based, `app/`) |
| Styling | Theme tokens (`src/theme`) + `StyleSheet`, light & dark themes |
| Animation | react-native-reanimated 4 · react-native-gesture-handler 3 · expo-haptics |
| Video | expo-video (custom controls, speed, captions, fullscreen landscape, PiP-ready) |
| Images | expo-image with blurhash placeholders + memory/disk cache |
| i18n | i18next + react-i18next, `I18nManager` RTL, expo-localization detection |
| State | Zustand (+ `persist` → AsyncStorage), expo-secure-store for the mock token |
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

Bundle identifiers: `com.eduway.student` (iOS and Android).

## Language & RTL

- First launch picks the device language (Arabic for anything other than English); **Arabic is the default**.
- Switch from **Welcome** (EN | ع toggle) or **Profile → Settings → Language**.
- On change the app persists the choice, calls `I18nManager.allowRTL(true)` + `forceRTL(isArabic)` and reloads
  (`expo-updates` `reloadAsync`, or a dev reload in development) so the native layout direction flips.
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
