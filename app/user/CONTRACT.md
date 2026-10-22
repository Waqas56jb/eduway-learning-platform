# EDUWAY Student App — Build Contract (internal, for parallel builders)

Expo SDK **57** (React Native **0.86**, React 19.2, TypeScript 6, Reanimated 4.5 + react-native-worklets 0.10, Gesture Handler **2.32** (use the `Gesture.Pan()/Gesture.Tap()` builder API + `GestureDetector`; there are NO `usePanGesture`/`useTapGesture` hooks), expo-router 57 (`Tabs` tab bar props are `{ state, descriptors, navigation, insets }`), expo-video (expo-av no longer exists), expo-image, zustand 5, i18next 26, zod 4). The app is tested in **Expo Go SDK 57 on a real iPhone** — only Expo Go–bundled native modules work. `ScrollViewInstance`/`TextInputInstance` types do NOT exist: use `useRef<ScrollView>(null)` / `useRef<TextInput>(null)`.
**APIs changed vs. your training data.** Before using an unfamiliar API, check the type definitions in `node_modules/<pkg>/` (e.g. `node_modules/react-native-gesture-handler/lib/typescript/...`, `node_modules/expo-video/build/*.d.ts`, `node_modules/expo-router/build/*.d.ts`). Never guess.

## Golden rules
1. **Path alias**: `@/` → `src/`. Routes live in `app/` (project root), everything else in `src/`.
2. **No hardcoded user-facing strings.** All text via `useI18n('<ns>')` → `t('key')`. Mock data is `{ en, ar }` → render with `L(value)`.
   - You own ONLY your namespace files: `src/i18n/locales/en/<ns>.json` and `src/i18n/locales/ar/<ns>.json` (both must have identical keys; Arabic must be natural, high quality MSA with Iraqi-friendly wording). They already exist as `{}`.
   - Do NOT edit `common.json`, `src/i18n/index.ts` or another feature's namespace. Read `common.json` for shared keys (`t('common:actions.continue')`, `t('common:subjects.math')`, `t('common:units.min', { count })`...).
   - Namespaces: common, onboarding, auth, home, subjects, lesson, quiz, practice, mistakes, exams, tutor, progress, subscription, notifications, settings, legal, validation.
3. **RTL**: never use `left/right`, `marginLeft`, `paddingRight`, `borderLeftWidth` etc. Use `start/end` (`marginStart`, `paddingEnd`, `start: 0`, `borderStartWidth`). `flexDirection: 'row'` auto-mirrors under native RTL — do not flip it manually. Directional icons (back, chevron, arrow, play-next) must be mirrored: `<Icon name="chevron" ... />` handles this automatically (see Icons). Horizontal progress fills from the start edge automatically if you use flex/width (not `left`). Animated translateX for directional motion must be multiplied by `isAr ? -1 : 1` (use `I18nManager.isRTL` for native layout direction).
4. **Theme**: always `const { colors, isDark } = useTheme()` from `@/theme`; never hardcode light-only colors (brand gold/navy from `palette` are OK on gradients/hero areas). Tokens: `space`, `radius`, `shadows`, `SCREEN_PADDING` (20), `BUTTON_HEIGHT` (52), `TAB_BAR_SPACE` (bottom padding on tab screens), `gradients.gold|navy|imageOverlay`, `subjectColors[subjectId]`.
5. **Text**: always use `Text` from `@/components/ui` (never RN `Text` directly):
   `<Text variant="display|h1|h2|h3|body|bodyMedium|bodyBold|label|caption|overline" color="ink|muted|accent|onPrimary|<any theme key or hex>" align="start|center|end" tabular display>`. It picks Inter/Playfair (EN) vs Tajawal (AR).
6. **Images**: `expo-image` `<Image source={{ uri }} placeholder={{ blurhash: BLURHASH }} transition={300} contentFit="cover" cachePolicy="memory-disk" />` — `BLURHASH` from `@/constants/images`. Unsplash URLs only, `?auto=format&fit=crop&w=1200&q=80`. Text over images gets a `LinearGradient` with `gradients.imageOverlay`.
7. **Motion**: Reanimated 4 (`useSharedValue`, `useAnimatedStyle`, `withTiming`, `withSpring`, entering/exiting layout animations like `FadeInDown.duration(250).delay(i*40)`). Pressables use `PressableScale` (scale 0.97 + light haptic). Use `haptic` from `@/utils/haptics`.
8. **Lists**: `FlatList`/`FlashList` (`@shopify/flash-list` v2) with memoized rows for long lists; ScrollView OK for short screens.
9. **Accessibility**: `accessibilityRole`, `accessibilityLabel` (localized), min 44pt touch targets, `hitSlop={HIT_SLOP}` on small icons.
10. **TypeScript strict, zero errors.** No `any` unless unavoidable. No `console.log`. No lorem ipsum. Every screen populated with mock data.
11. **Don't install packages** and don't edit `package.json`, `app.json`, `tsconfig.json`. Available: everything in package.json (expo-router, reanimated, gesture-handler, expo-video, expo-image, expo-linear-gradient, expo-blur, expo-haptics, expo-notifications, expo-screen-orientation, expo-clipboard, expo-sharing, react-native-view-shot, react-native-svg, react-native-webview, lottie-react-native, @shopify/flash-list, react-hook-form, @hookform/resolvers, zod, zustand, @expo/vector-icons). There is NO victory-native, NO nativewind, NO confetti-cannon, NO katex package: charts are custom `react-native-svg` components (`src/components/ui/charts`), confetti is our own `Confetti` component, math is `MathText` (KaTeX in WebView via CDN with a plain-text fallback).
12. Verify your own files with `npx tsc --noEmit` from `app/user` (ignore errors that are only in files owned by other builders / missing modules that others are building in parallel — but your files must be clean against this contract).

## Existing foundation (already written — read before coding)
- `src/theme/*` — colors (light/dark), typography (`fonts`, `textStyle`, `fontFor`), spacing, shadows, `useTheme()`.
- `src/types/index.ts` — Subject, Lesson, Question, Mistake, ExamBlueprint, Package, AppNotification, User, Session, Localized, Lang, SubjectId, Difficulty, LessonStatus.
- `src/api/*` — real API integration (docs/API_CONTRACT.md): axios client (`client.ts`: tokens, single-flight refresh, headers, error normalizer → localized toast), react-query keys (`keys.ts`), DTOs (`types.ts`), DTO→app adapters (`adapters.ts`: `toSubject` (id = slug), `toLesson`, `toQuestion` (`optionIds`, `correctIndex` −1 until revealed), `toExam`, `toPackage`, `toUser`…), one module per domain with typed functions + hooks, `examQueue.ts` (offline exam autosave/submit queue), `tutor.ts` (SSE via `expo/fetch` + polling fallback), `boot.ts` (app-config maintenance/force-update, push token). There is no mock data; `src/data` was deleted.
- `src/store/*` (import from `@/store`) — client state only:
  - `useAuthStore`: `user, me (MeStudentDto), isAuthenticated, pendingMobile, pendingRegistration, otp, lastError, deviceLimitSessions, bootstrap(), requestOtp(mobile)→bool, startRegistration(payload)→bool, resendOtp(), verifyOtp(code, revokeSessionId?)→bool, refreshMe(), logout(), hasSubject(slug|uuid)`.
  - `useLangStore`: `lang, isAr, ready, init(), setLanguage(lang)`. `usePrefsStore`: `themeMode, setThemeMode, onboardingSeen, setOnboardingSeen, hydrated`.
  - Everything else (progress, attempts, bookmarks, mistakes, exams, tutor, notifications, notification prefs) is server state via `@/api` hooks.
- `src/hooks/useI18n.ts`: `const { t, L, lang, isAr } = useI18n('home')`.
- `src/utils/format.ts`: `formatNumber, formatDuration(sec)→"04:32", formatMinutes, formatPrice(amount, lang), formatDate(iso, lang, opts), timeAgo(iso, lang), formatIraqiMobile, isValidIraqiMobile, shuffle`.
- `src/utils/haptics.ts`: `haptic.light|medium|selection|success|error|warning()`.
- `src/components/ui/Text.tsx` — the `Text` component.

## Component contracts (import from the barrel `@/components/ui`, `@/components/icons`, `@/components/layout`, `@/components/student`)

### `@/components/icons` (owner: ICONS builder)
`<Icon name={IconName} size={24} color={string} strokeWidth={1.75} filled={false} mirrorInRTL? />`
`IconName` = 'home' | 'subjects' | 'practice' | 'tutor' | 'profile' | 'play' | 'pause' | 'lesson' | 'quiz' | 'question-bank' | 'mistakes' | 'exam' | 'timer' | 'flag' | 'bookmark' | 'star' | 'bell' | 'search' | 'filter' | 'lock' | 'check-circle' | 'check' | 'x-circle' | 'chevron' | 'chevron-down' | 'settings' | 'language' | 'logout' | 'crown' | 'shield' | 'flame' | 'chart' | 'wallet' | 'card' | 'receipt' | 'calendar' | 'globe' | 'moon' | 'sun' | 'phone' | 'otp' | 'back' | 'close' | 'plus' | 'minus' | 'send' | 'image' | 'paperclip' | 'sparkles' | 'file-pdf' | 'download' | 'note' | 'share' | 'trash' | 'refresh' | 'info' | 'alert' | 'wifi-off' | 'devices' | 'mail' | 'headset' | 'skip-forward' | 'skip-back' | 'rewind-10' | 'forward-10' | 'fullscreen' | 'captions' | 'speed' | 'gear-quality' | 'target' | 'trophy' | 'grid' | 'user' | 'edit' | 'eye' | 'arrow' | 'map-pin' | 'school' | 'gift' | 'clock' | 'history' | 'medal' | 'book' | 'video' | 'heart' | 'cap'.
`chevron`, `back`, `arrow`, `skip-forward`, `skip-back` point to the reading-forward direction (→ in EN) and auto-mirror in RTL. `chevron` points "forward" (EN: right). `back` points backward.
`SubjectIcon`: `<SubjectIcon subjectId size color />` (sigma for math, atom physics, flask chemistry, dna biology, letters english).
`Logo`: `<Logo size={64} variant="gold|navy|light" withWordmark? />` — EDUWAY gold monogram (graduation cap + E).

### `@/components/ui` (owners: UI-A and UI-B builders) — exported from `src/components/ui/index.ts`
UI-A:
- `PressableScale` — `PressableProps & { scaleTo?: number=0.97; haptics?: boolean=true; style?: StyleProp<ViewStyle> }` Animated pressable.
- `Button` — `{ title: string; onPress?; variant?: 'primary'(gold gradient, navy text)|'secondary'(navy)|'outline'|'ghost'|'danger'; size?: 'lg'(52)|'md'(44)|'sm'(36); icon?: IconName; iconPosition?: 'start'|'end'; loading?; disabled?; fullWidth?; style?; accessibilityLabel? }`.
- `IconButton` — `{ icon: IconName; onPress?; size?: number=44; variant?: 'surface'|'ghost'|'glass'|'accent'; color?; badge?: number|boolean; accessibilityLabel: string }`.
- `Card` — `ViewProps & { padded?: boolean=true; elevated?: boolean=true; onPress?; variant?: 'surface'|'muted'|'navy'|'gold' }` radius 20, hairline border.
- `Badge` — `{ label: string; tone?: 'neutral'|'gold'|'navy'|'success'|'warning'|'danger'|'info'|'subject'; color?: string (for tone=subject); icon?: IconName; size?: 'sm'|'md' }`.
- `Chip` — `{ label: string; selected?; onPress?; icon?: IconName; color?: string; count?: number }`.
- `Avatar` — `{ uri?: string; name?: string; size?: number=44; ring?: boolean (gold ring) }`.
- `SectionHeader` — `{ title: string; subtitle?: string; actionLabel?: string; onAction?; style? }`.
- `Input` — `TextInputProps & { label?: string; error?: string; hint?: string; icon?: IconName; prefix?: string (e.g. "+964", rendered LTR); rightElement?: ReactNode }` (forwardRef). Focus ring gold.
- `OtpInput` — `{ length?: 6; value: string; onChange(v: string); onComplete?(v: string); error?: boolean (triggers shake + red); autoFocus? }` auto-advance, paste support, backspace to previous, LTR boxes always.
- `Checkbox` — `{ checked: boolean; onChange(v: boolean); label?: ReactNode }`. `Switch` — `{ value; onValueChange; accessibilityLabel }` (gold track).
- `SegmentedControl` — `{ options: { key: string; label: string; count?: number }[]; value: string; onChange(key); style? }` animated sliding indicator (RTL aware). Also exported as `Tabs`.
- `Skeleton` — `{ width?: DimensionValue; height?: number; radius?: number; style? }` shimmer. `SkeletonCard` preset.
- `EmptyState` — `{ icon?: IconName; title: string; message?: string; actionLabel?: string; onAction? }` (animated illustration circle).
- `Divider`, `ListRow` — `ListRow { icon?: IconName; iconColor?: string; title: string; subtitle?: string; value?: string; onPress?; right?: ReactNode; destructive?; showChevron?: boolean=true }`.
UI-B:
- `BottomSheet` — `{ visible: boolean; onClose(); title?: string; children; snap?: 'auto'|'half'|'full'; footer?: ReactNode }` Modal-based, backdrop fade, sheet slide-up spring, drag-to-dismiss, safe-area, keyboard aware.
- `Modal` (export name `Dialog`) — `{ visible; onClose(); title: string; message?: string; icon?: IconName; tone?: 'default'|'danger'|'success'; primaryLabel: string; onPrimary(); secondaryLabel?: string; onSecondary?(); children? }` centered, scale-in.
- `Toast` system — `<ToastHost />` (mounted once in root layout) + imperative `toast.show({ message: string; tone?: 'default'|'success'|'error'|'info'; icon?: IconName; duration?: number })`, `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`.
- `ProgressRing` — `{ progress: number (0–100); size?: number=64; strokeWidth?: number=6; color?: string; trackColor?: string; label?: string (center text; defaults to `${progress}%`); sublabel?: string; animated?: boolean=true; children? }`.
- `ProgressBar` — `{ progress: number (0–100); height?: number=6; color?: string; gradient?: boolean (gold); trackColor?: string; animated? }` fills from start edge.
- `MathText` — `{ text: string; color?: string; size?: number; block?: boolean }` renders markdown-lite (`**bold**`, `*italic*`, `- bullets`, `1. lists`, newlines) with `$inline$` and `$$block$$` LaTeX. Renders KaTeX via auto-sized `react-native-webview` (KaTeX CSS/JS from cdn.jsdelivr.net) only if the text contains `$`; otherwise native `Text`. Also `Formula` — `{ latex: string; color?; size? ; displayMode? }` for a single formula (e.g. `question.formula`).
- `Confetti` — `{ fire: boolean; count?: number=80 }` overlay burst (Reanimated, gold/navy/subject colors, pointerEvents none).
- `SuccessCheck` — `{ size?: number=120 }` animated drawn check in gold circle (Reanimated + SVG); `LottieSuccess` may wrap a Lottie JSON from `assets/lottie/` if provided.
- Charts in `src/components/ui/charts/` re-exported: `AreaChart { data: { label: string; value: number }[]; height?: number=160; color?: string; showDots?; formatValue?(n) }`, `LineChart { series: { key: string; color: string; values: number[] }[]; labels: string[]; height?; yMax? }`, `BarList { items: { label: string; value: number (0–100); color?: string }[] }` (horizontal bars). All RTL-aware (x axis reversed in RTL), animated draw-in.

### `@/components/layout` (owner: LAYOUT builder)
- `Screen` — `{ children; scroll?: boolean=false; padded?: boolean=true; edges?: Edge[] (default ['top']); tabBarSpace?: boolean (adds TAB_BAR_SPACE bottom padding); refreshing?: boolean; onRefresh?(); background?: string; contentContainerStyle?; keyboard?: boolean (KeyboardAvoidingView); statusBar?: 'light'|'dark'|'auto'; scrollRef? }` safe-area aware, fade+slide enter animation 250ms.
- `Header` — `{ title?: string; subtitle?: string; back?: boolean=true; onBack?(); right?: ReactNode; transparent?: boolean; large?: boolean; tint?: string }` back button mirrored for RTL, uses `router.back()` (falls back to `/(tabs)/home` if cannot go back).
- `TabBar` — custom bottom tab bar (expo-router `Tabs` `tabBar` prop): floating blurred pill, gold active indicator dot, icon fill on active, haptics, safe-area.
- `KeyboardAvoiding` — `{ children; offset? }`.

### `@/components/student` — exported from `src/components/student/index.ts` (each builder adds their own exports to the barrel by creating their component file; the barrel file is written by the LAYOUT builder up front with all names below, so DO create your files with exactly these names/paths):
- `SubjectCard.tsx` (SUBJECTS builder) `{ subject: Subject; index?: number; variant?: 'large'|'compact'; onPress? }`
- `LessonRow.tsx` (SUBJECTS) `{ lesson: Lesson; locked?: boolean; onPress?; showTeacher?: boolean }`
- `ContinueCard.tsx` (HOME) `{ lessonId: string }`
- `StatTile.tsx` (HOME) `{ icon: IconName; label: string; value: string; sublabel?: string; color?: string; onPress? }`
- `StreakCalendar.tsx` (PROGRESS — built by HOME builder) `{ data: { date: string; level: number }[]; weeks?: number=16 }`
- `VideoPlayer.tsx` (LESSON) `{ uri: string; poster?: string; initialPositionSec?: number; onProgress?(sec: number, duration: number); onEnd?(); title?: string }`
- `QuizOption.tsx` (QUIZ) `{ index: number; label: string; state: 'idle'|'selected'|'correct'|'incorrect'|'disabled'; onPress?() }` (A/B/C/D letter badge; Arabic letters أ ب ج د in AR).
- `QuestionView.tsx` (QUIZ) `{ question: Question; selectedIndex: number|null; revealed: boolean; onSelect(i: number); showExplanation?: boolean; headerRight?: ReactNode; optionOrder?: number[] }` — question text + Formula + options + explanation reveal card. Used by quiz, practice, mistakes retry and exam room (exam uses revealed=false).
- `QuizResultSummary.tsx` (QUIZ) `{ score: number; correct: number; total: number; timeSpentSec?: number; passed: boolean; title?: string }` score ring + stats + confetti on pass.
- `MistakeCard.tsx` (MISTAKES) `{ entry: MistakeEntry; onRetry?(); onPress?() }`
- `ExamTimer.tsx` (EXAMS) `{ endsAt: number; onExpire(); compact? }`
- `QuestionNavigator.tsx` (EXAMS) `{ total: number; current: number; answered: Set<number>|boolean[]; flagged: Set<number>|boolean[]; onJump(i: number) }`
- `TutorBubble.tsx` (TUTOR) `{ message: TutorMessage }` and `TypingIndicator.tsx`.

## Routes (expo-router, files under `app/`)
`/(splash)/splash-1|splash-2|splash-3`, `/(auth)/welcome|login|register|verify-otp`, `/(tabs)/home|subjects|practice|tutor|profile`, `/subject/[id]`, `/lesson/[id]`, `/quiz/[lessonId]`, `/question-bank` (index), `/question-bank/practice-session?subjectId&unitId&difficulty&count&mode=bookmarks`, `/question-bank/result?attemptId`, `/mistakes`, `/mistakes/[id]` (retry), `/exams`, `/exams/room/[id]`, `/exams/result/[id]` (id = attemptId), `/progress`, `/subscription`, `/subscription/checkout?packageId&cycle`, `/subscription/success?receipt`, `/notifications`, `/settings`, `/settings/edit-profile`, `/settings/sessions`, `/settings/language`, `/legal/terms`, `/legal/privacy`.
Navigate with `router.push({ pathname: '/lesson/[id]', params: { id } })` or string hrefs `router.push('/exams')`. Each screen file default-exports a component and sets its own header via the `Header` component (root Stack has `headerShown: false`).
Locked content → `router.push('/subscription')`.
