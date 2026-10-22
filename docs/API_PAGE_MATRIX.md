# EDUWAY — Page → Endpoint Matrix

Companion to `docs/API_CONTRACT.md` (endpoint IDs refer to its headings, e.g. `CAT-05`). This file seeds `docs/VERIFICATION.md`:
each row will get a ✅/❌ status once integrated. "Mock source today" names what must be deleted/replaced.

Legend: **R** = read on load, **A** = user action, **P** = polling / background. Cross-cutting calls are listed once per app in §0.

---

## 0. Cross-cutting (every client)

| Concern | website/user | app/user | website/admin |
|---|---|---|---|
| Boot / session | `PUB-01` app-config, `AUTH-07` me, `AUTH-04` refresh (interceptor) | `PUB-01` (+`X-App-Version` → force-update / maintenance screens), `AUTH-07`, `AUTH-04` | `AUTH-07`/`ADM-ME-01`, `AUTH-04`, `ADM-ME-09` lookups |
| Logout | `AUTH-05` | `AUTH-05` + `ME-08` | `AUTH-05` |
| Badges | `NTF-02` (P 60 s) | `NTF-02` (P on focus) | `ADM-ME-06` (P 60 s) |
| Push | — | `ME-07` after permission; tap → `AppNotification.link` | — |
| Errors | 402/403 `locked` → `/student/subscription`; `MAINTENANCE` → maintenance screen | same → `/subscription`; `UPDATE_REQUIRED` → force-update screen | 403 → Forbidden page |
| Uploads | `STO-01` (avatar) | `STO-01` (avatar, tutor image) | `STO-01` (all media), `STO-02` |

---

## 1. website/user (student site + landing)

| Route / page | Component(s) | Endpoints | Mock source today |
|---|---|---|---|
| `/` Landing | Hero, Stats | R `PUB-05`, R `CAT-01` (hero lesson card: first subject sample), R `PUB-06` (avatars) | hardcoded numbers, `getLesson('physics-l6')` |
| | TrustStrip, Features, HowItWorks, AiTutorShowcase, CTA | static i18n (no API) | i18n |
| | Subjects | R `CAT-01` | `subjects.json` |
| | Testimonials | R `PUB-06?placement=landing` | `testimonials.json` |
| | PricingSection | R `PAY-01` | `packages.json` |
| | FAQ | R `PUB-07?placement=landing` | `faq.json` |
| Layout (public) | Navbar, Footer (subjects, social, app links, year) | R `CAT-01`, R `PUB-01` (social, appLinks, support) | `subjects`, dead `#` links |
| `/pricing` | PricingSection, PricingCompare, PaymentMethods, FAQ | R `PAY-01` (incl. `comparison`), R `PUB-09`, R `PUB-07?placement=pricing` | `packages.json`, `ROWS`, hardcoded methods |
| `/about` | impact counters, teachers | R `PUB-05`, R `PUB-08`, R `PUB-02` (count) | hardcoded `TEACHER_META`, numbers |
| `/contact` | Contact form, channels | A `PUB-10`, R `PUB-01` (support contacts) | fake ticket id, `CHANNELS` |
| `/terms`, `/privacy` | LegalDocument | R `PUB-11` | i18n sections, hardcoded date |
| `/login` | Login | A `AUTH-01 (purpose login)` | `requestOtp` mock |
| `/register` | Register | R `PUB-02`, R `PUB-03` (school suggestions), A `PUB-04` (referral check), R `PUB-11` (versions to accept), A `AUTH-01 (purpose register)` | `governorates.json` |
| `/verify-otp` | VerifyOtp, OtpInput | A `AUTH-02` (with `registration` in register mode), A `AUTH-01` (resend), R `PUB-01` (resend seconds / code length) | `DEMO_OTP` |
| AuthLayout side panel | quotes, stats | R `PUB-06?placement=auth`, R `PUB-05` | i18n |
| Student layout | Sidebar (package, days left, unread), BottomTabs, TopBar (search, notifications menu, user menu) | R `AUTH-07`, R `NTF-02`, R `NTF-01?limit=5`, A `NTF-03`, A `SRC-01?scopes=lessons&limit=6`, A `AUTH-05` | `demoUser`, `notifications.json`, client search |
| `/student/dashboard` | WelcomeHero, ContinueCard, StatTiles, SubjectProgressGrid, WeeklyStudyChart, UpcomingExams, RecentActivity, TodayGoal | R `PRG-04` (single composite), optional R `PRG-11` (TodayGoal shortcuts) | `weeklyStudy`, `quizTrend`, `recentActivity`, `upcomingExams`, `useProgress` |
| `/student/subjects` | Subjects, CourseCard | R `CAT-01` (locked + progress) | `subjects`, `useSubjectAccess` |
| `/student/subjects/:subjectId` | SubjectDetail, LessonList, QuestionBankPanel, ExamsPanel | R `CAT-02`, R `CAT-03`, R `CAT-04` | `lessonsBySubject`, Laplace projection, `exams` |
| `/student/lesson/:lessonId` | Lesson page | R `CAT-05`, A `PRG-02` (mark complete / video ended) | `lessons.json`, `quizScores` |
| | VideoPlayer | R `CAT-06` (+ re-sign near expiry), P `PRG-01` every `heartbeatSeconds` + pause/ended/unmount | sample MP4, localStorage position |
| | ResourcesPanel | A `CAT-07` | toast only |
| | NotesPanel | R `CAT-08`, A `CAT-09` (debounced) | `localStorage eduway.notes.*` |
| | LessonQuiz / QuizCard | R `CAT-10`, A `QUZ-01`, A `QUZ-02` per answer, A `QUZ-03`, A `BMK-03/04` | client question picking, `addMistake`, `recordQuizScore` |
| `/student/question-bank` | QuestionBank, BankFilters, QuestionPreviewCard | R `BNK-02` (facets/counts), R `BNK-01` (paged "show more"), R `BMK-02`, A `BMK-03/04` | `questions.json`, `bookmarks` |
| | PracticeSession | A `PRA-01`, A `PRA-02` per answer, A `PRA-03` | client shuffle, `addMistake` |
| `/student/mistakes` | MyMistakes, MistakeItem | R `MST-01` (counts/bySubject in meta), A `MST-04` (status radio, mark mastered), A `MST-05` (retry), A `BMK-03/04` | `mistakes.json` |
| `/student/exams` | ExamSimulator | R `EXM-01`, R `EXM-09` (history), R `PUB-01` (`examDefaultPassMark` hero) | `exams`, localStorage session, demo history |
| `/student/exams/:examId/room` | ExamRoom, ExamTimer, QuestionNavigator | A `EXM-03` (start/resume), R `EXM-04` (resume), P `EXM-05` (15 s + on change), A `EXM-06` (flag), A `EXM-07` (submit / time-up, `Idempotency-Key`) | `ExamSession` in localStorage |
| `/student/exams/result/:attemptId` | ExamResult, TopicBreakdown | R `EXM-08`, A `BMK-03/04`, A `EXM-03` (retake) | `getAttempt`, `buildDemoAttempt` |
| `/student/ai-tutor` | AiTutor, TutorChat, Composer, StreamingAnswer | R `AIT-01`, R `AIT-02`, R `AIT-03` (+`AIT-05` thread), A `AIT-04` (new chat), A `AIT-08` (SSE), A `AIT-10` (rating), A `STO-01` (image attach, when enabled) | `tutorAnswers`, localStorage `eduway.tutor.v1` |
| `/student/progress` | Progress, QuizTrendChart, ActivityHeatmap | R `PRG-06`, R `PRG-05`, R `PRG-07?weeks=8`, R `PRG-08`, R `PRG-09?weeks=16` | `quizTrend`, `weakTopics`, `activityHeatmap` |
| `/student/subscription` | Subscription | R `PAY-03`, R `PAY-01`, R `PAY-09` (billing history), A `PAY-10?format=pdf` (receipt) | `seedBilling`, localStorage billing |
| | PaymentModal | R `PUB-09`, A `PAY-05` (promo), A `PAY-04` (quote), A `PAY-06` (`Idempotency-Key`), A `PAY-07` (dev mock), P `PAY-08`, R `PAY-10` | `PROMO_CODE`, `newReceipt`, `updateUser` |
| `/student/profile` | Profile | R `ME-01`, A `ME-02` (name/governorate/school/language), A `STO-01`+`ME-02` (photo), R `PUB-02`, R/A `ME-09`/`ME-10` (prefs), R `ME-03`, A `ME-04`, A `ME-05` (log out others), A `AUTH-05` | `demoUser`, `MEMBER_SINCE`, localStorage prefs |
| `/student/notifications` | Notifications | R `NTF-01` (filter + counts), A `NTF-03`, A `NTF-04` | `notifications.json` |
| Legal re-acceptance (new prompt) | — | A `AUTH-08` when `user.pendingLegal` non-empty | — |
| `*` NotFound | — | none | — |

---

## 2. app/user (Expo)

| Route / screen | Component(s) | Endpoints | Mock source today |
|---|---|---|---|
| `_layout` / `index` gate | root | R `PUB-01` (force update, maintenance), R `AUTH-07`, A `ME-07` (push token), deep links from push `link` | none (no checks today) |
| `(splash)/splash-1..3` | OnboardingPager | none (local `onboardingSeen`) | — |
| `(auth)/welcome` | Welcome, LangToggle | R `PUB-05` (rating, students), R `PUB-01` | i18n numbers |
| `(auth)/login` | login, DemoHint | A `AUTH-01 (login)` | `MOCK_OTP` |
| `(auth)/register` | register, GovernoratePicker, SchoolPicker | R `PUB-02`, R `PUB-03?governorateId&q`, A `PUB-04`, R `PUB-11` (versions), A `AUTH-01 (register)` | `governorates`, `schools.ts` |
| `(auth)/verify-otp` | verify-otp | A `AUTH-02` (+`registration`), A `AUTH-01` (resend), R `PUB-01` (resend s) | `MOCK_OTP` |
| `(tabs)/home` | HomeHeader, ContinueCard, StreakPlanCard, SubjectCarousel, StatsGrid, TodayPlan, ExamReminder, WeeklyChart, QuickActions | R `PRG-04` (composite incl. upcomingExams, weeklyStudy, streak last7), R `CAT-01`, R `PRG-11`, A `PRG-12`, R `NTF-02`; pull-to-refresh refetches | `todayPlan`, `weeklyStudy`, `lastWeekStudyMinutes`, `upcomingExams`, seed quiz avg 82 |
| `(tabs)/subjects` | SubjectsSummary, SubjectCard | R `CAT-01`, R `PRG-06` | `subjects`, `subjectCompletion` |
| `subject/[id]` | header, LessonsTab/UnitAccordion/LessonRow, QuestionBankTab, ExamsTab | R `CAT-02`, R `CAT-03`, R `CAT-04`; locked → `/subscription` | `lessonsBySubject`, `questionsBySubject`, `exams` |
| `lesson/[id]` | lesson, VideoPlayer, ResourceList, LessonNotes, TeacherCard, DeviceGuardBanner | R `CAT-05`, R `CAT-06`, P `PRG-01` (background-safe), A `PRG-02`, A `CAT-07`, R/A `CAT-08`/`CAT-09`, R `PUB-08` (teacher stats), R `ME-03` (device guard) | `lessons`, `captions.ts`, `TEACHER_STATS` |
| `quiz/[lessonId]` | quiz, QuizHeader, QuizResultSummary, QuizReviewList | R `CAT-10`, A `QUZ-01`, A `QUZ-02`, A `QUZ-03`, A `BMK-03/04` | `pickQuizQuestions`, `QUIZ_PASS_MARK` |
| `(tabs)/practice` | PracticeHero, FiltersSheet, QuickStartCard, entry cards, recent practice | R `BNK-02` (facets, live match count, mastery), R `PRA-05`, R `MST-02`, R `BMK-02` (count), R `PRG-07` (fallback mastery), R `PUB-01` (session sizes) | `filterQuestions`, `quizTrend` |
| `question-bank/index` | list, QuestionPreviewCard, QuestionDetailSheet, BookmarkStar | R `BNK-01` (`reveal=true` for detail), R `BMK-01`, A `BMK-03/04` | `questions` |
| `question-bank/practice-session` | session | A `PRA-01` (filters / bookmarks / include), A `PRA-02`, A `PRA-03` | `buildSession`, `addAttempt` |
| `question-bank/result` | result, BarList, AnswerReviewItem | R `PRA-04` | local attempt |
| `mistakes/index` | MistakesHero, MistakeCard | R `MST-01`, R `MST-02`, A `MST-04` (mark reviewed) | `mistakesStore` |
| `mistakes/[id]` | retry, RetryHistory | R `MST-03`, A `MST-05` | `recordRetry` |
| `exams/index` | ExamCard, rules sheet, previous attempts | R `EXM-01`, R `EXM-09` | `exams`, `examDrafts`, `examAttemptsUsed` |
| `exams/room/[id]` | room, ExamTimer, navigator, submit sheet, OfflineBanner | A `EXM-03` (start/resume), R `EXM-04`, P `EXM-05` (offline queue, `seq`), A `EXM-06`, A `EXM-07` (`Idempotency-Key`) | `ExamDraft`, `useMockConnection` |
| `exams/result/[id]` | result, ShareScoreCard, AnswerReviewList | R `EXM-08` (share card data: `student.name`, score) | local attempt |
| `(tabs)/tutor` | tutor, Composer, SuggestedPrompts, HistorySheet, TutorBubble, LimitReached, AllowancePill | R `AIT-01`, R `AIT-02`, R `AIT-03`, R `AIT-05`, A `AIT-04`, A `AIT-06` (subject chip), A `AIT-07`, A `AIT-08` (SSE → fallback polling `AIT-09`), A `AIT-10`, A `STO-01` (image) | `tutorStore`, `SAMPLE_IMAGES`, canned replies |
| `progress` | HeroSummary, SubjectRings, ScoreTrend, WeakTopics, StreakCalendar, BadgesGrid, ActivityTimeline | R `PRG-06`, R `PRG-05`, R `PRG-07`, R `PRG-08`, R `PRG-09`, R `PRG-13`, R `PRG-10` | `achievements`, `activityHeatmap`, `recentActivity`, `minutesPerLevel` |
| `notifications` | NotificationRow | R `NTF-01`, A `NTF-03`, A `NTF-04`, A `NTF-05` (swipe delete) | `notificationsStore` |
| `(tabs)/profile` | ProfileHeader, ProfileStats, SupportSheet, LogoutDialog | R `ME-01`, R `PRG-06`, R `MST-02`, R `NTF-02`, R `PUB-01` (support contacts), A `AUTH-05` + `ME-08` | `demoUser`, i18n contacts |
| `subscription/index` | CurrentPlanCard, PlanCard, ComparisonTable, FAQ | R `PAY-03`, R `PAY-01` (comparison), R `PUB-07?placement=subscription_app` | `packages`, derived ROWS, i18n FAQ |
| `subscription/checkout` | checkout, PaymentMethodCard, GatewaySheet | R `PAY-02`, R `PUB-09`/`PAY-11`, A `PAY-05`, A `PAY-04`, A `PAY-06` (`Idempotency-Key`), A `PAY-07` (dev mock), P `PAY-08` | `PAYMENT_METHODS`, `PROMO_CODES`, `subscribe()` |
| `subscription/success` | success | R `PAY-08` (paidAt, receipt), R `PAY-10` (json) | params only |
| `settings/index` | settings | R `ME-09`, A `ME-10`, R `ME-03` (count) | `prefsStore` |
| `settings/edit-profile` | edit-profile | R `ME-01`, R `PUB-02`, R `PUB-03`, R `PUB-01` (avatarPresets), A `STO-01` (optional upload), A `ME-02` | `AVATAR_OPTIONS` |
| `settings/language` | language | A `ME-02 {language}` | local only |
| `settings/sessions` | sessions, SessionRow | R `ME-03`, A `ME-04`, A `ME-05` | `user.sessions` |
| `legal/terms`, `legal/privacy` | LegalDocument | R `PUB-11` | i18n |
| Legal re-acceptance (new prompt) | — | A `AUTH-08` | — |
| Force-update / maintenance (new screens) | — | R `PUB-01` | — |

---

## 3. website/admin

| Route / page (permission) | Tabs / modals / actions | Endpoints | Mock source today |
|---|---|---|---|
| `/login` (guest) | form, demo helper | A `AUTH-10` | `DEMO_PASSWORD` |
| `/verify-2fa` | 6-digit code | A `AUTH-11` | `123456` |
| `/forgot-password` | email | A `AUTH-15` | none |
| `/reset-password` **(new page)** | token + password | A `AUTH-16` | — |
| `/accept-invite` **(new page)** | token, set password | R `AUTH-17`, A `AUTH-18` | — |
| Layout: Sidebar / guards | permission gating | R `ADM-ME-01` (`role.permissions`) | `store/auth.ts` roles |
| Layout: Topbar | bell, user menu, "Preview as", language/theme | R `ADM-ME-06` (P), A `ADM-ME-07`, A `ADM-ME-08`, R `ADM-ROL-01`, A `ADM-ME-04`, A `AUTH-05` | `store/notifications.ts` |
| Layout: CommandPalette | pages, students, lessons, commands | A `SRC-01?scopes=students,lessons&limit=5` | client search over stores |
| `/` Dashboard (dashboard.view) | KPIs, revenue/subs chart, package donut, DAU, governorates, weakest topics, top schools, top marketers, pending review (Approve), recent payments, system health | R `ADM-DSH-01?from&to`, R `ADM-DSH-02`, A `ADM-LSN-07` | `data/analytics.ts`, `support.ts`, `systemHealth` |
| `/users` (users.view) | stat cards, filters, search, sort, paging, export, bulk lock/unlock/export selected | R `ADM-STU-01`, R `ADM-STU-02`, R `ADM-ME-09` (filters), A `ADM-STU-03`, A `ADM-STU-04`, A `ADM-STU-05` | `data/students.ts` |
| `/users/:id` header | lock/unlock (reason), metrics | R `ADM-STU-06`, A `ADM-STU-07`, A `ADM-STU-08` | `UserDetail` (AI allowance 100 hardcoded) |
| ↳ Overview tab | profile, subscription card, entitlements, revoke manual | R `ADM-STU-06`, R `ADM-STU-16`, A `ADM-STU-15` | entitlements by index |
| ↳ Activity tab | watch, quizzes, exams, AI chart/recent | R `ADM-STU-19` | `generateActivity` |
| ↳ Payments tab | transactions table | R `ADM-STU-20` | transactions store |
| ↳ Sessions tab | force logout one / all | R `ADM-STU-09`, A `ADM-STU-10`, A `ADM-STU-11` | `student.sessions` |
| ↳ Notes tab | list, add | R `ADM-STU-12`, A `ADM-STU-13` | `student.notes` |
| ↳ Actions tab | lock/unlock, reset OTP, manual grant, attribution | A `ADM-STU-07/08`, A `ADM-STU-18`, A `ADM-STU-14`, A `ADM-STU-17`, R `ADM-ME-09` (subjects, schools) | audit-only mocks |
| `/content/subjects` (content.view) | cards+stats, drawer create/edit (image upload), toggle sequential, delete | R `ADM-SUB-01`, A `STO-01`, A `ADM-SUB-02`, A `ADM-SUB-04`, A `ADM-SUB-05` | `data/curriculum.ts` |
| `/content/units` | subject tabs, units/topics CRUD, drag reorder | R `ADM-SUB-01`, R `ADM-UNT-01`, A `ADM-UNT-02..05`, A `ADM-TOP-01..04` | curriculum store |
| `/content/lessons` | filters, search, export, bulk submit/archive/delete | R `ADM-LSN-01`, R `ADM-TCH-01`, A `ADM-LSN-08`, A `ADM-LSN-09`, A `ADM-LSN-10` | lessons store |
| `/content/lessons/new`, `/:id` | LessonForm (placement, thumbnail, video upload + processing, captions, PDFs, rules, prerequisite), workflow buttons, schedule modal, versions, delete | R `ADM-LSN-03`, R `ADM-UNT-01`, R `ADM-TCH-01`, R `ADM-LSN-01?view=options&subjectId&excludeArchived`, A `STO-01`, A `ADM-VID-01`, P `ADM-VID-03`, A `ADM-VID-08`, A `ADM-LSN-13/14/15`, A `ADM-LSN-02`, A `ADM-LSN-04`, A `ADM-LSN-06`, R `ADM-LSN-11`, A `ADM-LSN-05` | simulated upload timers |
| `/content/videos` | stats, filters, re-sync, re-process, bulk re-sync, export | R `ADM-VID-02`, R `ADM-VID-04`, A `ADM-VID-05`, A `ADM-VID-06`, A `ADM-VID-07`, A `ADM-VID-09` | `data/videos.ts` |
| `/content/workflow` | kanban board, drag between columns, schedule | R `ADM-LSN-01?view=board`, A `ADM-LSN-06` | lessons store |
| `/questions` (questions.view) | KPIs, filters, export, bulk submit/approve/publish/archive/duplicate/delete | R `ADM-QST-01`, R `ADM-QST-02`, A `ADM-QST-08`, A `ADM-QST-10`, A `ADM-QST-09`, A `ADM-QST-15` | `data/questions.ts` |
| `/questions/new`, `/:id` | QuestionForm (LaTeX, image, options), similarity warning, preview, workflow, delete | R `ADM-QST-03`, R `ADM-QST-14`, A `STO-01`, A `ADM-QST-11`, R `ADM-QST-13`, A `ADM-QST-04`, A `ADM-QST-05`, A `ADM-QST-07`, A `ADM-QST-06` | client code generation, `findSimilar` |
| `/questions/review` | queue, similar, approve/reject | R `ADM-QST-12`, A `ADM-QST-07` (approve/reject) | in_review filter |
| `/questions/import` | template, upload, preview (filters), commit, error report | R `ADM-IMP-01`, A `STO-01`+`ADM-IMP-02`, R `ADM-IMP-03`, A `ADM-IMP-04`, R `ADM-IMP-05` | browser CSV parse, mocked XLSX |
| `/assessments/quiz-rules` (assessments.view) | defaults cards, overrides table, drawer, delete, export | R `ADM-QZR-01`, R `ADM-LSN-01?withoutQuizOverride=true&view=options`, A `ADM-QZR-02`, A `ADM-QZR-03`, A `ADM-QZR-04`, A `ADM-QZR-05`, A `ADM-QZR-07` | `data/assessments.ts` |
| `/assessments/blueprints` | KPIs, filter, duplicate/publish/archive/delete, export | R `ADM-EBP-01`, R `ADM-EBP-02`, A `ADM-EBP-07/08/09`, A `ADM-EBP-06`, A `ADM-EBP-11` | blueprints store |
| `/assessments/blueprints/new`, `/:id` | editor, rows, availability, summary, save/publish | R `ADM-EBP-03`, A `ADM-EBP-10`, A `ADM-EBP-04`, A `ADM-EBP-05`, A `ADM-EBP-07` | usable pool from store |
| `/assessments/attempts` | KPIs, filters, detail modal, export | R `ADM-ATT-01`, R `ADM-ATT-02`, R `ADM-ATT-03`, A `ADM-ATT-04` | attempts store |
| `/packages` (packages.view) | cards/table, editor drawer, duplicate/archive/restore/delete, export | R `ADM-PKG-01`, A `ADM-PKG-03`, A `ADM-PKG-04`, A `ADM-PKG-05/06/07`, A `ADM-PKG-08`, A `ADM-PKG-10` | packages store, live subscribers |
| `/packages/promotions` | KPIs, filters, enable switch, form (generate/check code), delete, export | R `ADM-PRM-01`, R `ADM-PRM-02`, A `ADM-PRM-07`, R `ADM-PRM-06`, A `ADM-PRM-03`, A `ADM-PRM-04`, A `ADM-PRM-05`, A `ADM-PRM-09` | `data/promotions.ts` |
| `/payments/transactions` (payments.view) | date range, filters, KPIs, export | R `ADM-PAY-01`, R `ADM-PAY-02`, A `ADM-PAY-06` | `data/transactions.ts` |
| `/payments/transactions/:id` | student/package cards, summary, webhooks, timeline, receipt modal, refund modal | R `ADM-PAY-03`, R `ADM-PAY-04`, A `ADM-PAY-05` (`Idempotency-Key`) | transaction store |
| `/payments/refunds` | tabs, KPIs, approve/reject/bulk approve, export | R `ADM-REF-01`, R `ADM-REF-02`, A `ADM-REF-03`, A `ADM-REF-04`, A `ADM-REF-05`, A `ADM-REF-06` | refunds store |
| `/payments/reconciliation` | KPIs, chart, daily table, gateway comparison, mark reconciled, exports | R `ADM-REC-01`, R `ADM-REC-02`, A `ADM-REC-03`, A `ADM-REC-05`; (new) `ADM-REC-04` import | hash-mocked "reported" amounts, `GATEWAY_FEE` |
| `/schools` (schools.view) | KPIs, filters, form, delete, bulk activate/suspend, export | R `ADM-SCH-01`, R `ADM-SCH-02`, A `ADM-SCH-04`, A `ADM-SCH-05`, A `ADM-SCH-06`, A `ADM-SCH-07`, A `ADM-SCH-13` | `data/partners.ts` |
| `/schools/:id` | incentive card, attributed students, settlements (compact), profile, marketer select (override), referral card, notes | R `ADM-SCH-03`, R `ADM-SCH-10`, R `ADM-SCH-08`, R `ADM-SET-01?partnerType=school&partnerId`, A `ADM-SCH-09`, R/A `ADM-SCH-11/12`, A `ADM-SET-04/05` | derived tiers, `reassignSchool` |
| `/schools/incentive-rules` | partner switch, versions, new version, edit draft, delete, activate, calculator | R `ADM-INC-01`, R `ADM-INC-02`, A `ADM-INC-03`, A `ADM-INC-04`, A `ADM-INC-05`, A `ADM-INC-06`, A `ADM-INC-07` | `data/incentives.ts` |
| `/schools/settlements` | totals, filters, approve, mark paid, bulk, export, (new) generate | R `ADM-SET-01?partnerType=school`, A `ADM-SET-04`, A `ADM-SET-05`, A `ADM-SET-06/07`, A `ADM-SET-08`, A `ADM-SET-03` | seeded settlements |
| `/marketers` (marketers.view) | KPIs, filters, form, delete, bulk status, export | R `ADM-MKT-01`, R `ADM-MKT-02`, A `ADM-MKT-05`, A `ADM-MKT-06`, A `ADM-MKT-07`, A `ADM-MKT-08`, A `ADM-MKT-12` | partners store |
| `/marketers/:id` | KPIs, performance chart, schools assign/unassign (override), settlements, milestones card | R `ADM-MKT-03`, R `ADM-MKT-04`, A `ADM-MKT-09`, A `ADM-MKT-10`, R `ADM-SET-01?partnerType=marketer&partnerId`, R `ADM-SCH-01` (assign select) | `attribution.ts` |
| `/marketers/milestones` | active set, reachedBy, new version, draft editor, delete, activate, history | R `ADM-MIL-01`, A `ADM-MIL-02`, A `ADM-MIL-03`, A `ADM-MIL-04`, A `ADM-MIL-05` | milestone rules store |
| `/marketers/settlements` | same as school settlements | R `ADM-SET-01?partnerType=marketer`, A `ADM-SET-03..08` | seeded settlements |
| `/ai-tutor` (aitutor.view) | KPIs, by-day chart, by-subject donut, top users, flagged panel review/dismiss | R `ADM-AI-01?from&to`, A `ADM-AI-10` | `dailyActivity`, `aiQuestionsUsed` |
| `/ai-tutor/settings` | kill switch (reason), allowance, cycle, provider/model, temp, tokens, retrieval, safety rules, per-user disable | R `ADM-AI-02`, R `ADM-AI-15`, A `ADM-AI-04/05`, A `ADM-AI-03`, A `ADM-AI-06/07`, R `SRC-01?scopes=students` (user search) | `data/ai.ts` |
| `/ai-tutor/abuse` | rate limits, blocked keywords, flagged users (warn, AI toggle, block), flagged conversations + detail modal, exports | R `ADM-AI-02`, A `ADM-AI-03`, R `ADM-AI-11`, A `ADM-AI-12`, A `ADM-AI-06/07`, A `ADM-STU-07/08`, R `ADM-AI-08`, R `ADM-AI-09`, A `ADM-AI-10`, A `ADM-AI-13/14` | flags store, canned replies |
| `/analytics/business` (analytics.view) | KPIs, revenue, funnel, packages, sources, schools, marketers, compare | R `ADM-ANL-01?from&to&compare&grain` (+ `ADM-ANL-05` platform split) | client aggregation over stores |
| `/analytics/learning` | KPIs, active users, engagement, completion, score by subject, weak-topic heatmap, accuracy/exam distributions, recurrence, AI | R `ADM-ANL-02?…&subjectId`, R `ADM-ANL-04` | `dailyActivity`, `topicSignals`, random histogram |
| `/analytics/exports` | report picker, range, format, preview count, generate, history (filter, export) | R `ADM-EXP-04`, A `ADM-EXP-01`, R `ADM-EXP-02`, A `ADM-EXP-03` | client CSV, `useExports` |
| `/notifications/templates` (notifications.view) | matrix, filters, toggle active, duplicate, delete, bulk, export | R `ADM-NTT-01`, A `ADM-NTT-04`, A `ADM-NTT-06`, A `ADM-NTT-05`, A `ADM-NTT-07`, A `ADM-NTT-10` | `data/messaging.ts` |
| `/notifications/templates/new`, `/:id` | editor, variables palette, preview, SMS counter | R `ADM-NTT-02`, R `ADM-NTT-08`, A `ADM-NTT-03`, A `ADM-NTT-04`, A `ADM-NTT-05`, (opt) `ADM-NTT-09` | `TEMPLATE_VARIABLES` |
| `/notifications/campaigns` | audience builder (live count), channel/template, schedule, send, history, cancel | R `ADM-ME-09`, R `ADM-NTT-01?channel`, A `ADM-CMP-03`, A `ADM-CMP-04` (`Idempotency-Key`), R `ADM-CMP-01`, A `ADM-CMP-05`, A `ADM-CMP-06` | client audience filter |
| `/notifications/delivery-log` | KPIs, provider health, filters, retry (row/all/selected), export | R `ADM-DLV-01`, R `ADM-DLV-02`, A `ADM-DLV-03`, A `ADM-DLV-04` | simulated callbacks |
| `/settings/general` (settings.view) | fields, logo upload, support summary | R `ADM-CFG-01 general` + `support`, A `STO-01`, A `ADM-CFG-02 general` | `data/settings.ts` |
| `/settings/otp` | policy fields | R/A `ADM-CFG-01/02 otp` | settings store |
| `/settings/feature-flags` | KPIs, env filter, toggle | R `ADM-FLG-01`, A `ADM-FLG-02` | flags store |
| `/settings/legal` | tabs, KPIs, chart, versions, new/edit draft, publish, discard | R `ADM-LGL-01`, R `ADM-LGL-06`, A `ADM-LGL-02`, A `ADM-LGL-03`, A `ADM-LGL-04`, A `ADM-LGL-05` | legal store |
| `/settings/support` | contacts form + preview | R/A `ADM-CFG-01/02 support` | settings store |
| `/settings/app` | versions, force update, device limit, session timeout, maintenance | R/A `ADM-CFG-01/02 app` | settings store |
| (new settings pages) payments / learning / marketing / security / CMS testimonials & FAQ / teachers | — | `ADM-CFG-01/02 payments|learning|marketing|security`, `ADM-CMS-01..09`, `ADM-TCH-01..04` | hardcoded in student apps |
| `/security/roles` (security.view) | cards, clone, delete (type key) | R `ADM-ROL-01`, A `ADM-ROL-05`, A `ADM-ROL-06` | `data/security.ts` |
| `/security/roles/new`, `/:id` | RoleForm + matrix | R `ADM-ROL-02`, R `ADM-ROL-07`, A `ADM-ROL-03`, A `ADM-ROL-04` | roles store |
| `/security/permissions` | roles × modules grid | R `ADM-ROL-01`, R `ADM-ROL-07` | roles store |
| `/security/admins` | KPIs, filters, invite, resend, change role, reset MFA, deactivate/activate, export | R `ADM-ADM-01`, A `ADM-ADM-02..07`, A `ADM-ADM-08` | admin users store |
| `/security/audit-logs` | range, actor/entity filters, KPIs, live, detail diff, export | R `ADM-AUD-01` (P `since`), R `ADM-AUD-03`, R `ADM-AUD-02`, A `ADM-AUD-04` | `store/audit.ts` |
| `/security/sessions` | KPIs, revoke one / all others, export | R `ADM-SES-01`, A `ADM-SES-02`, A `ADM-SES-03`, A `ADM-SES-04` | `data/securityExtra.ts` |
| `/security/alerts` | KPIs, filters, resolve/block/reopen | R `ADM-ALR-01`, A `ADM-ALR-02`, A `ADM-ALR-03`, A `ADM-ALR-04` | alerts store |
| `/profile` (auth) | details, password, MFA setup/enable/disable, preferences | R `ADM-ME-01`, A `ADM-ME-02`, A `ADM-ME-03`, A `AUTH-12`, A `AUTH-13`, A `AUTH-14`, A `ADM-ME-04`, (opt) R `ADM-ME-05` | `DEMO_PASSWORD`, mock QR |
| `*` NotFound | — | none | — |

---

## 4. Server-only / external consumers

| Consumer | Endpoints |
|---|---|
| Payment gateways / MockGateway | `WHK-01` |
| Video pipeline | `WHK-02` |
| SMS / WhatsApp / email / Expo receipts | `WHK-03` |
| Load balancer / uptime | `HLT-01`, `HLT-02` |
| `scripts/smoke.ts` acceptance flow | `AUTH-01` → `AUTH-02` → `ME-02` → `PAY-06` → `PAY-07`/`WHK-01` → `ME-11` → `CAT-06` → `PRG-01` → `QUZ-01..03` → `MST-01` → `EXM-03`/`EXM-05`/`EXM-07`/`EXM-08` → `AIT-08` (+`AIT-01` decrement) → `ADM-AI-03`, `ADM-PKG-04`, `ADM-INC-*` (admin changes without deploy) → duplicate `WHK-01` (no duplicate access) → `ADM-ANL-01` vs `ADM-SCH-01` (attribution reconcile) → 403 on unauthorized admin route → `ADM-AUD-01` → `Accept-Language: ar` error message |
