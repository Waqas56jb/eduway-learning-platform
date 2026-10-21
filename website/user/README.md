# EDUWAY — Student Website (mock frontend)

Bilingual (Arabic RTL / English) e-learning website for Iraqi **6th Scientific Grade** students:
Mathematics, Physics, Chemistry, Biology and English.

This is a **frontend-only mock**. There's no backend and no network API. All content comes from static
JSON in `src/data`, and student state (progress, mistakes, bookmarks, exam attempts, notes) is kept in
`localStorage`.

## Quick start

```bash
cd website/user
npm install
npm run dev        # http://localhost:5173
```

| Script            | What it does                              |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Vite dev server with HMR                  |
| `npm run build`   | Type-check (`tsc -b`) + production build  |
| `npm run preview` | Serve the production build locally        |
| `npm run lint`    | ESLint (flat config, TypeScript + hooks)  |
| `npm run format`  | Prettier (with Tailwind class sorting)    |

### Demo login

1. Go to **/login** (or **/register**) and enter any valid Iraqi mobile number, e.g. `0770 123 4567`.
2. On the OTP screen enter **`123456`**. Any other code fails.
3. You land on **/student/dashboard** as *Ahmed Al-Baghdadi* (Baghdad, Full Access, 23 days remaining).

To start over, use **Profile → Reset demo data**, or clear the site's localStorage (`eduway.*` keys).

## Stack

React 18 · Vite 5 · TypeScript (strict) · React Router 6 · Tailwind CSS 3 · Framer Motion ·
lucide-react · i18next / react-i18next · react-hook-form · Recharts · KaTeX · canvas-confetti ·
react-helmet-async.

## Project structure

```
src/
  assets/            logo mark
  components/
    layout/          Navbar, Footer, PublicLayout, StudentLayout, Sidebar, TopBar, BottomTabs, LanguageSwitcher
    ui/              Button, Card, Badge, Modal, Input/Select/Textarea, Tabs, ProgressBar/Ring, Skeleton,
                     Toast, SmartImage, Accordion, Switch, MathText (KaTeX), Seo, Reveal, …
    landing/         Hero, TrustStrip, Subjects, Features, HowItWorks, Stats, AiTutorShowcase,
                     Testimonials, Pricing, FAQ, CTA
    auth/            AuthLayout, OtpInput
    student/         QuizCard, CourseCard, LessonList, VideoPlayer, LessonQuiz, MistakeItem, ExamTimer,
                     PracticeSession, TutorChat, …
  pages/
    public/          Landing, Login, Register, VerifyOtp, Pricing, About, Contact, Terms, Privacy, NotFound
    student/         Dashboard, Subjects, SubjectDetail, Lesson, QuestionBank, MyMistakes, ExamSimulator,
                     ExamRoom, ExamResult, AiTutor, Progress, Subscription, Profile, Notifications
  data/              Mock JSON (bilingual) + typed accessors in index.ts
  i18n/              en.json / ar.json (shared strings) + locales/<lang>/<area>.json (per feature area)
  hooks/             useAuth, useLang, useProgress (useStudent)
  context/           AuthContext, LangContext, StudentContext
  routes/            AppRoutes (code-split, lazy pages), ProtectedRoute
  styles/            globals.css (design tokens, component classes), fonts.css
  lib/               utils, storage, image registry
  types/             Domain types
```

## Internationalisation and RTL

- Arabic is the default language. The choice is saved in `localStorage` (`eduway.lang`), and an inline
  script in `index.html` sets `dir`/`lang` before first paint so the layout doesn't flip after load.
- Every visible string comes from translation files. Shared strings live in `src/i18n/en.json` and
  `src/i18n/ar.json`. Each feature area has its own file, e.g. `src/i18n/locales/en/landing.json`.
  These files are merged under their file name, so you call `t('landing.hero.title')`.
- Mock data holds both languages (`{ "en": "…", "ar": "…" }`). Pick the active one with `useLang().l(value)`.
- The layout uses Tailwind logical utilities (`ms-*`, `pe-*`, `start-*`, `text-start`). Directional icons
  are mirrored with `rtl:-scale-x-100`.
- Fonts: Playfair Display (headings) and Inter (body) in English, Tajawal in Arabic. They switch through
  CSS variables in `styles/fonts.css`.
- Numbers use Latin digits in both languages (`ar-IQ-u-nu-latn`).

## Design system

The tokens are defined once as CSS variables in `styles/globals.css` and exposed as Tailwind colours in
`tailwind.config.js`:

| Token           | Value     |
| --------------- | --------- |
| `primary`       | `#0B1F3A` |
| `primary-light` | `#15325C` |
| `accent`        | `#C9A24A` |
| `accent-light`  | `#E6C77A` |
| `cream`         | `#FAF7F2` |
| `ink` / `muted` | `#111827` / `#6B7280` |
| `success` / `warning` / `danger` | `#16A34A` / `#F59E0B` / `#DC2626` |
| Subject colours | Math `#2563EB`, Physics `#7C3AED`, Chemistry `#059669`, Biology `#DB2777`, English `#EA580C` |

Component classes include `.card`, `.glass`, `.glass-navy`, `.text-gold-grad`, `.eyebrow`, `.section`
and `.field`. The theme also adds the shadows `shadow-soft`, `shadow-lift` and `shadow-glow`.

## Mock data

| File                 | Contents |
| -------------------- | -------- |
| `subjects.json`      | 5 subjects → 3 units each → chapters |
| `lessons.json`       | 69 lessons (4–6 per unit), thumbnails, sample videos, PDF resources |
| `questions.json`     | 52 MCQs (easy/medium/hard) with explanations and optional LaTeX |
| `mistakes.json`      | 10 seeded mistakes |
| `exams.json`         | 3 exam blueprints |
| `packages.json`      | 3 packages. Prices are placeholders; edit them here |
| `notifications.json` | 8 notifications |
| `user.json`          | Demo student |
| `testimonials.json`, `faq.json`, `governorates.json` | Landing and registration content |

Images are Unsplash URLs (see `src/lib/images.ts`). Every image falls back to a branded placeholder if it
fails to load. Lesson videos are public sample MP4s.

## Environment

Copy `.env.example` to `.env` if you need it. No variables are required for the mock build. They are
placeholders for wiring a real API later.
