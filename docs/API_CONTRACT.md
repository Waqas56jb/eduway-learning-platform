# EDUWAY Platform — API Contract v1

> **Single source of truth** for every HTTP endpoint and DTO shared by `server/`, `website/user`, `website/admin`
> and `app/user`. Binding companions: `docs/BACKEND_SPEC.md`, `docs/ENGINEERING.md`. Page → endpoint mapping:
> `docs/API_PAGE_MATRIX.md`. Server builders implement this **literally**; frontend builders integrate against it.
> Any change to an endpoint or DTO must update this file in the same change (ENGINEERING §6).

Contract version: `1.0.0` · Base URL: `/api/v1` · OpenAPI (generated from the zod schemas): `/api/docs`.

---

## Table of contents

0. [Conventions](#0-conventions)
1. [Shared types](#1-shared-types)
2. [Health](#2-health--health)
3. [Public / CMS (no auth)](#3-public--cms-no-auth--public)
4. [Auth](#4-auth--auth)
5. [Me — student account](#5-me--student-account--me)
6. [Catalog & lessons — student](#6-catalog--lessons-student--subjects--lessons)
7. [Progress & dashboard — student](#7-progress--dashboard-student--progress)
8. [Quizzes — student](#8-quizzes-student--quizzes)
9. [Question bank, practice & bookmarks — student](#9-question-bank-practice--bookmarks-student)
10. [Mistakes — student](#10-mistakes-student--mistakes)
11. [Exams — student](#11-exams-student--exams)
12. [AI tutor — student](#12-ai-tutor-student--ai-tutor)
13. [Notifications — student](#13-notifications-student--notifications)
14. [Packages, subscriptions & payments — student](#14-packages-subscriptions--payments-student)
15. [Webhooks](#15-webhooks)
16. [Storage (signed URLs)](#16-storage--storage)
17. [Search](#17-search--search)
18. [Admin — me, profile & inbox](#18-admin--me-profile--inbox--adminme)
19. [Admin — dashboard & support tickets](#19-admin--dashboard--support-tickets)
20. [Admin — students (users module)](#20-admin--students-users-module--adminstudents)
21. [Admin — content](#21-admin--content-content-module)
22. [Admin — questions](#22-admin--questions-questions-module--adminquestions)
23. [Admin — assessments](#23-admin--assessments-assessments-module)
24. [Admin — packages, promotions, subscriptions](#24-admin--packages-promotions-subscriptions-packages-module)
25. [Admin — payments, refunds, reconciliation](#25-admin--payments-refunds-reconciliation-payments-module)
26. [Admin — schools, incentive rules, settlements](#26-admin--schools-incentive-rules-settlements-schools--marketers-modules)
27. [Admin — marketers & milestones](#27-admin--marketers--milestones-marketers-module)
28. [Admin — AI tutor](#28-admin--ai-tutor-aitutor-module--adminai)
29. [Admin — analytics & exports](#29-admin--analytics--exports-analytics-module)
30. [Admin — notifications (templates, campaigns, deliveries)](#30-admin--notifications-notifications-module)
31. [Admin — settings, feature flags, legal, CMS](#31-admin--settings-feature-flags-legal-cms-settings-module)
32. [Admin — security](#32-admin--security-security-module)
33. [Real-time, uploads & jobs summary](#33-real-time-uploads--jobs-summary)
34. [Spec deltas, resolved conflicts & implied features](#34-spec-deltas-resolved-conflicts--implied-features)
35. [Endpoint index](#35-endpoint-index)

---

## 0. Conventions

### 0.1 Envelope (ENGINEERING §2 — exact)

```jsonc
// success
{ "success": true, "data": <payload>, "meta": { "page": 1, "pageSize": 20, "total": 134, "nextCursor": null } }
// error
{ "success": false, "error": { "code": "SNAKE_CODE", "message": "<localized en|ar>", "details": { /* optional */ } } }
```

* `meta` is present only on list endpoints (and on endpoints that document extra `meta` fields, e.g. `unreadCount`).
* Responses in this document show **only the `data` payload** (`→ data: T`). `T[]` + `meta` means a paginated list.
* `204` is never used; mutations that have nothing to return respond `200` with `data: { ok: true }` (`OkDto`).
* File downloads (CSV/XLSX/PDF) are the only non-envelope responses: raw bytes with `Content-Type` and
  `Content-Disposition: attachment; filename="<name>-YYYY-MM-DD.<ext>"`. On error they still return the JSON error envelope.
* Server-Sent Events (AI tutor) are documented in §12 / §33.

### 0.2 Errors (ENGINEERING §2 — exact codes)

| HTTP | `error.code` | Notes |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `details.fields: Record<fieldPath, string /*localized message*/>` (zod issues flattened, dotted paths e.g. `options.2.text.ar`) |
| 401 | `UNAUTHORIZED` | missing/invalid token, wrong credentials, bad OTP |
| 401 | `TOKEN_EXPIRED` | access token expired → client runs single-flight refresh then retries once |
| 402 | `SUBSCRIPTION_REQUIRED` | `details.locked: LockedPayload` (§1.4) |
| 403 | `FORBIDDEN` | RBAC denial (`details.permission: PermissionKey`), account locked, AI disabled |
| 403 | `NOT_ENTITLED` | authenticated & subscribed but this resource is outside entitlement (`details.locked`) |
| 404 | `NOT_FOUND` | `details.entity` |
| 409 | `CONFLICT` | uniqueness / state conflicts, idempotency replay mismatch |
| 422 | `BUSINESS_RULE` | domain rule violation; **always** carries `details.reason` (table §0.3) |
| 429 | `RATE_LIMITED` | `details.retryAfterSeconds`; `Retry-After` header also set |
| 500 | `INTERNAL` | `details.requestId` |

**Codes are closed.** Domain-specific causes are expressed through `details.reason` (SNAKE_CASE) so clients can branch
without new codes. Every `message` is localized by `Accept-Language` (`en` | `ar`, default `ar`).

### 0.3 `details.reason` catalogue (422 unless stated)

| reason | Where |
|---|---|
| `ACCOUNT_NOT_FOUND` | send-otp/verify-otp with `purpose:'login'` for an unregistered phone |
| `ACCOUNT_EXISTS` | `purpose:'register'` for a registered phone (409 `CONFLICT`) |
| `ACCOUNT_LOCKED` | (403 `FORBIDDEN`) student/admin locked/deactivated |
| `OTP_INVALID` | (401) wrong code; `details.attemptsLeft` |
| `OTP_EXPIRED` | (401) |
| `OTP_LOCKED` | (429) too many attempts; `details.retryAfterSeconds` |
| `OTP_RESEND_COOLDOWN` | (429) `details.retryAfterSeconds` |
| `OTP_RESEND_LIMIT` | (429) `details.retryAfterSeconds` |
| `DEVICE_LIMIT_REACHED` | verify-otp/register: active sessions ≥ `app.deviceLimit`; `details.sessions: SessionDto[]` so the UI can offer revoke (client then retries with `revokeSessionId`) |
| `PROFILE_INCOMPLETE` | (403) student endpoints before `/auth/register` completed |
| `LEGAL_ACCEPTANCE_REQUIRED` | (403) a newer published legal version must be accepted; `details.documents: {doc, version}[]` |
| `REFERRAL_CODE_INVALID` | register / attribution change |
| `PREREQUISITE_NOT_MET` | lesson/quiz; `details.prerequisiteLessonId` |
| `SEQUENTIAL_LOCK` | subject has `sequentialUnlock` and previous lesson incomplete; `details.previousLessonId` |
| `QUIZ_RETRY_EXHAUSTED` / `QUIZ_COOLDOWN` | quiz start; `details.retryAt` for cooldown |
| `EXAM_NOT_AVAILABLE` | outside `availableFrom/To` or not published |
| `EXAM_ATTEMPTS_EXHAUSTED` | exam start |
| `EXAM_ALREADY_SUBMITTED` | autosave/flag/submit after submission (409 `CONFLICT`) |
| `EXAM_TIME_OVER` | autosave after `endsAt + graceSeconds` (attempt is auto-submitted) |
| `AI_ALLOWANCE_EXHAUSTED` | AI message; `details.allowance: AiAllowance` |
| `AI_DISABLED` | (403) AI disabled for this student; `AI_GLOBALLY_DISABLED` (403) kill switch |
| `AI_RATE_LIMITED` | (429) per-minute/per-hour limit |
| `AI_BLOCKED_CONTENT` | message contains a blocked keyword |
| `AI_PROVIDER_ERROR` | (500 `INTERNAL`, SSE `error` event) the model provider failed mid-answer; allowance NOT consumed |
| `AI_MODEL_INVALID` | ADM-AI-03: `model` not in the catalogue of `provider` (ADM-AI-15) |
| `AI_SUBJECT_LOCKED` | AIT-06: subject change after the first student message |
| `AI_MESSAGE_EMPTY` | (400) AIT-08 without `text` and without `attachmentFileKey` |
| `FEATURE_DISABLED` | feature flag off (e.g. `ai_tutor_attachments` for AIT-08 attachments) |
| `NO_RECIPIENTS` | ADM-CMP-04: no reachable student for the audience (`details.audience` = ADM-CMP-03 counts) |
| `NO_ROWS` | ADM-EXP-01 and every `…/export`: nothing to export for the filters |
| `CAMPAIGN_NOT_SCHEDULED` | ADM-CMP-05: only `scheduled` campaigns can be cancelled |
| `SEND_AT_IN_PAST` | ADM-CMP-04: `sendAt` must be in the future |
| `TEMPLATE_INACTIVE` / `TEMPLATE_CHANNEL_MISMATCH` | ADM-CMP-04 template must be active and of the campaign channel (push ⇄ in_app interchangeable) |
| `SIGNATURE_INVALID` | (401) webhook signature check failed (WHK-03) |
| `ALREADY_EXISTS` | (409 `CONFLICT`) unique violation. `details.constraint` (the database constraint name) is sent outside production only (SEC-31) |
| `PROMO_INVALID` / `PROMO_EXPIRED` / `PROMO_EXHAUSTED` / `PROMO_NOT_APPLICABLE` / `PROMO_NOT_ELIGIBLE` | promotions |
| `PACKAGE_UNAVAILABLE` | inactive/draft/archived package or cycle not offered |
| `PAYMENT_GATEWAY_DISABLED` | gateway disabled in payment settings |
| `REFUND_EXCEEDS_REMAINING` / `REFUND_PENDING_EXISTS` / `NOT_REFUNDABLE` | refunds |
| `HAS_DEPENDENTS` | (409) delete blocked: subject with units/lessons, unit/topic with lessons, package with active subscribers, blueprint with attempts, role with admins; `details.count` |
| `INVALID_TRANSITION` | workflow transition not allowed from current status; `details.from`, `details.to` |
| `DOUBLE_ATTRIBUTION` | (409) school already attributed to another marketer and no `overrideReason` |
| `DRAFT_EXISTS` | (409) new incentive/milestone/legal version while a draft exists |
| `TIERS_INVALID` | incentive tier validator failure; `details.issues: string[]` |
| `SELF_ACTION` | admin tries to deactivate/revoke own current session/account |
| `SYSTEM_ROLE` | (403) edit/delete of protected system role |
| `MFA_REQUIRED` / `MFA_INVALID` | admin login |
| `PASSWORD_POLICY` | admin password does not meet policy |
| `INVITE_INVALID` / `RESET_TOKEN_INVALID` | admin invite / reset tokens |
| `IMPORT_NOT_READY` / `IMPORT_EXPIRED` | question import commit |
| `NO_QUESTIONS` | PRA-01 when the filters/bookmarks/mistakes match no (entitled) question |
| `QUIZ_NO_QUESTIONS` | QUZ-01 when the lesson's pool (topic → unit → subject) is empty |
| `ALREADY_ANSWERED` / `ATTEMPT_CLOSED` | (409) QUZ-02 / PRA-02 second answer for a question; answer/submit on a finished attempt |
| `QUESTION_NOT_IN_ATTEMPT` / `ANSWER_REQUIRED` | answer endpoints: question not served in this attempt / no option or text given |
| `EXAM_IN_PROGRESS` | (409) EXM-08 while the attempt is still running (before `endsAt + graceSeconds`) |
| `VIDEO_NOT_READY` | ADM-LSN-06 publish/schedule without a ready video (`code` INVALID_TRANSITION, `details.reason='VIDEO_NOT_READY'`) |
| `POOL_SHORT` | ADM-EBP-07 publish without `force` when a row's pool is insufficient; `details.shortRows: number[]` |
| `ROWS_INVALID` / `WINDOW_INVALID` | ADM-EBP-04/05 row mix ≠ 100 % / `availableTo ≤ availableFrom` |
| `QUESTION_INVALID` | ADM-QST-04/05 option rules (mcq 2..6 one correct, true_false 2, fill_blank 1..4, unique texts); quiz-rule `poolSize < questionCount` |
| `PLACEMENT_INVALID` / `REORDER_INVALID` | unit/topic not under the subject (lessons, questions) / reorder list ≠ current items |
| `SUBJECT_DEFAULT_RULE` / `RULE_EXISTS` | ADM-QZR-05 delete of a subject default / (409) ADM-QZR-03 lesson already has an override |
| `IMPORT_FILE_INVALID` | (400) ADM-IMP-02 empty file / > 4 template columns missing; a failed import keeps `failureReason` (`IMPORT_FILE_INVALID` \| `IMPORT_PARSE_FAILED`) |
| `MAINTENANCE` | (403) maintenance mode on — returned by every student endpoint except `/public/*`, `/auth/refresh`, `/health*`; `details.message: Localized` |
| `UPDATE_REQUIRED` | (403) `X-App-Version` below minimum while `forceUpdate` is on; `details.storeUrl` |

### 0.4 Headers

| Header | Direction | Rule |
|---|---|---|
| `Authorization: Bearer <accessToken>` | req | all non-public endpoints |
| `Accept-Language: en\|ar` | req | localizes `error.message`, generated texts (receipts PDFs, SMS); **bilingual DTO fields are always returned in both languages** regardless |
| `X-Request-Id` | req/resp | client sends a uuid; server echoes (generates if absent) |
| `X-Client-Platform: web\|ios\|android\|admin` | req | required on auth endpoints; recorded on sessions, analytics, audit |
| `X-Device-Id` | req | stable per install/browser (uuid); required on auth endpoints |
| `X-App-Version` | req (app only) | semver of the Expo app; used for `UPDATE_REQUIRED` and `/public/app-config` `update.required` (**addition to ENGINEERING §2**) |
| `Idempotency-Key` | req | **required** on endpoints marked `idem` (payments, refunds, exam submit, settlement mark-paid, campaign send, bulk money ops). Same key + same body → stored response replayed; same key + different body → 409 `CONFLICT`. Keys live 24 h (`eduway_platform_idempotency_keys`). |
| `Retry-After` | resp | on 429 |

### 0.5 Auth levels

| Label | Meaning |
|---|---|
| `public` | no token |
| `optional` | works without token; with a valid student token adds per-user fields |
| `student` | student access token (audience `eduway-student`) with completed profile |
| `student*` | student token; allowed before profile completion / legal acceptance |
| `admin` | admin access token (audience `eduway-admin`), any permission |
| `admin:<module>.<action>` | admin + permission (Super Admin bypasses). e.g. `admin:content.edit` |
| `ent:<scope>` | after auth, the server-side entitlement engine runs (§1.4) |
| `idem` | `Idempotency-Key` required |
| `rl:<bucket>` | rate-limited bucket (`auth`, `otp`, `ai`, `search`, `webhook`, `public`) |
| `audit:<action>` | the server writes an `eduway_platform_audit_logs` row with this action (admin mutations; before/after = changed keys only, ip, device from UA, actor from token) |

### 0.6 Lists, filters, sorting, pagination

* Query: `page` (1-based, default 1), `pageSize` (default 20, max 100) **or** `cursor` (opaque) where noted. `q` = free text
  (AND of whitespace-separated words, case-insensitive, Arabic-normalized: alef/yaa/taa-marbuta folding, diacritics stripped).
  `sort=field` ascending / `sort=-field` descending (single field; each list documents its sortable fields and default).
* Multi-value filters: repeat the param (`difficulty=easy&difficulty=hard`) **or** comma-separated (`difficulty=easy,hard`) — both accepted.
* Date ranges: `from`, `to` = ISO-8601 instants (UTC). `to` inclusive. Admin UI presets (`today|7d|30d|90d|12m|ytd|custom`) are
  resolved **client-side** into `from`/`to`.
* `meta = { page, pageSize, total, nextCursor }` (`nextCursor` null when page-based). Some lists add documented extra meta keys
  (e.g. `meta.counts`).
* Special filter value `__none` = "is null" for nullable foreign keys (`packageId=__none`, `schoolId=__none`, `marketerId=__none`).

### 0.7 Admin conventions

* **Exports** (every admin table with an export button): `POST /admin/<resource>/export`, body `ExportRequest` (§1.9) →
  file download. Requires `<module>.export`. Always writes an `eduway_platform_exports_log` row and `audit:export.create`.
  The same filters as the list endpoint are passed in `filters`; `ids` exports only selected rows; `columns` (optional) =
  ordered list of column keys (default = all documented columns). CSV is UTF-8 **with BOM**; XLSX via exceljs.
* **Bulk actions**: `POST /admin/<resource>/bulk/<action>` body `{ ids: ID[] (1..500), reason?: string }` → `BulkResult` (§1.9).
  Partial success is allowed (no 4xx for per-row failures).
* **Reason**: wherever the UI asks for a reason, the body field is `reason: string` (trimmed, min 3, max 500) unless a
  different minimum is documented (refund reason min 5, review reject comment min 5, manual-grant reason min 5).
* **Bilingual fields** — the API always uses `Localized` objects (ENGINEERING §2). The admin frontend's flat
  `x_en` / `x_ar` fields map 1:1 to `x: { en, ar }` (e.g. `name_en` → `name.en`, `title_ar` → `title.ar`,
  `body_en` → `body.en`, `maintenanceMessage_en` → `maintenanceMessage.en`). The admin `AdminUser.name` / `name_ar` pair maps
  to `name: Localized`. Request bodies use the same `Localized` objects.
* All admin mutations are audited server-side (the client never writes audit rows).

### 0.8 IDs, slugs, numbers, dates

* Entity ids are UUID v4 strings. Exceptions (stable domain slugs, still strings): `Governorate.id` (`baghdad`, `basra`, …),
  `Subject.slug` (`math`, `physics`, `chemistry`, `biology`, `english`) **in addition to** `Subject.id` (uuid),
  `FeatureFlag.key`, `Role.key`, notification `type`/`channel` enums, `Gateway` ids.
* Path params named `:subjectId` accept **either the uuid or the slug** on student endpoints.
* Human-readable codes: `Question.code` (`MATH-CA-0151`), `Transaction.ref` (`EDW-XXXX-XXXX`), receipt number
  (`R-XXXX-XXXX`), support ticket id (`EW-T-NNNNN`), school code (`SCH-BAG107`).
* Dates: ISO-8601 UTC strings (`2026-10-22T06:30:00.000Z`). Date-only values (`YYYY-MM-DD`) are typed `DateOnly` and are
  interpreted in the platform timezone (`settings.general.timezone`, default `Asia/Baghdad`). Weeks start **Saturday**.
* Money: integers in IQD (no minor units). `currency` is carried for display (`'IQD' | 'USD'`); USD amounts are integers in USD.
* Percentages: numbers 0–100 (may be fractional, 1 decimal).

### 0.9 Entitlement engine (server-side)

Runs on: lesson detail stream, `/lessons/:id/stream-url`, resource downloads, quiz start/answer, bank listing answers,
practice start, exam start, AI tutor messages. Student is entitled to subject S at time T when an `eduway_platform_entitlements`
row exists for S with `startsAt ≤ T < expiresAt` (sources: `package`, `manual`). Failures:
* no active subscription/entitlement at all → **402** `SUBSCRIPTION_REQUIRED`, `locked.reason='NO_SUBSCRIPTION'`;
* subscription active but subject not included → **403** `NOT_ENTITLED`, `locked.reason='SUBJECT_NOT_IN_PACKAGE'`;
* expired → 402 `locked.reason='EXPIRED'`; package without AI → 402 `locked.reason='AI_NOT_INCLUDED'`.
`locked.packageIds` lists active packages that would unlock the resource (deep link target: subscription screen).

---

## 1. Shared types

All DTOs are TypeScript-style. `?` = optional (absent), `| null` = present but nullable. Types defined here are referenced by
name everywhere else.

### 1.1 Primitives

```ts
type ID = string;              // uuid v4 unless stated
type ISODate = string;         // ISO-8601 UTC
type DateOnly = string;        // 'YYYY-MM-DD' (platform timezone)
type Lang = 'en' | 'ar';
type Localized = { en: string; ar: string };   // same as frontends' Localized / admin I18nText
type Platform = 'web' | 'ios' | 'android';
type ClientPlatform = Platform | 'admin';
type IQD = number;             // integer
type Currency = 'IQD' | 'USD';
type Difficulty = 'easy' | 'medium' | 'hard';
type SubjectSlug = string;     // 'math' | 'physics' | 'chemistry' | 'biology' | 'english' (seeded; admin may add more)
type Grain = 'day' | 'week' | 'month';
type ExportFormat = 'csv' | 'xlsx';
type OkDto = { ok: true };

interface PageMeta { page: number; pageSize: number; total: number; nextCursor: string | null }
```

### 1.2 RBAC

```ts
type ModuleKey = 'dashboard' | 'users' | 'content' | 'questions' | 'assessments' | 'packages' | 'payments'
  | 'schools' | 'marketers' | 'aitutor' | 'analytics' | 'notifications' | 'settings' | 'security';
type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';
type PermissionKey = `${ModuleKey}.${PermAction}`;           // e.g. 'content.approve'
type PermissionMatrix = Record<ModuleKey, Record<PermAction, boolean>>;   // admin UI shape, 14 × 6
```

### 1.3 References (embedded summaries)

```ts
interface SubjectRef  { id: ID; slug: SubjectSlug; name: Localized; color: string /*#RRGGBB*/ }
interface UnitRef     { id: ID; name: Localized; order: number }
interface TopicRef    { id: ID; name: Localized; order: number; unitId: ID }
interface LessonRef   { id: ID; title: Localized; order: number; subjectId: ID; subjectSlug: SubjectSlug }
interface PackageRef  { id: ID; name: Localized }
interface SchoolRef   { id: ID; name: Localized; code: string }
interface MarketerRef { id: ID; name: Localized; avatarUrl: string | null }
interface StudentRef  { id: ID; name: Localized; mobile: string; avatarUrl: string | null }
interface AdminRef    { id: ID; name: Localized; avatarUrl: string | null; roleName?: Localized }
interface Governorate { id: string /*slug*/; name: Localized }
interface TeacherRef  { id: ID; name: Localized; avatarUrl: string | null }
```

### 1.4 Entitlement / lock

```ts
type LockedReason = 'NO_SUBSCRIPTION' | 'SUBJECT_NOT_IN_PACKAGE' | 'EXPIRED' | 'AI_NOT_INCLUDED';
interface LockedPayload { reason: LockedReason; subjectId?: ID; subjectSlug?: SubjectSlug; packageIds?: ID[] }

interface Entitlement {
  id: ID;
  subjectId: ID; subjectSlug: SubjectSlug;
  source: 'package' | 'manual';
  startsAt: ISODate; expiresAt: ISODate;
  packageId: ID | null;           // when source = 'package'
  grantedBy: AdminRef | null;     // when source = 'manual'
  reason: string | null;          // manual grant reason
}
```

### 1.5 Student identity

```ts
interface SessionDto {
  id: ID;
  device: string;             // parsed UA, e.g. "Chrome · Windows 11", "iPhone 15 · iOS 18"
  platform: Platform | 'admin';
  browser: string | null;
  ip: string;
  location: Localized;        // IP geolocation "Baghdad, IQ" (same text in both langs when unknown)
  countryCode: string | null; // ISO-3166 alpha-2
  createdAt: ISODate;
  lastActive: ISODate;        // admin UI field `lastSeen` maps to this
  current: boolean;           // true for the calling session
}

interface AiAllowance {
  enabled: boolean;           // false when globally disabled, user-disabled or package excludes AI
  disabledReason: 'GLOBAL' | 'USER' | 'NOT_INCLUDED' | null;
  used: number; quota: number; remaining: number;
  cycle: 'calendar' | 'billing';
  resetsAt: ISODate;          // replaces the app's use of subscriptionEnd as "renews at"
}

interface StudentUser {              // superset of website/user & app/user `User`
  id: ID;
  name: Localized;                   // student enters one string → returned in both slots
  firstName: Localized;              // first word of name
  mobile: string;                    // E.164 "+9647701234567"; display formatting is client-side
  email: string | null;
  emailVerified: boolean;            // email confirmed via ME-12 / AUTH-30 link
  gender: 'male' | 'female' | null;
  governorate: string;               // Governorate.id slug (unchanged field name)
  governorateName: Localized;
  schoolId: ID | null;
  school: Localized | null;          // directory school name or free-text schoolName (both slots)
  avatar: string | null;             // signed URL / preset URL
  language: Lang;
  packageId: ID | null;              // current active package
  subscriptionStatus: 'active' | 'trial' | 'expired' | 'cancelled' | 'none';
  subscriptionStart: ISODate | null;
  subscriptionEnd: ISODate | null;
  daysRemaining: number;             // 0 when none/expired
  aiUsed: number; aiQuota: number;   // mirrors AiAllowance (kept for drop-in)
  streak: number;                    // current daily streak
  lastLessonId: ID | null;           // last watched lesson (for "Continue")
  dailyGoalMinutes: number;          // default from settings.learning.dailyGoalMinutes (120)
  memberSince: ISODate;              // = createdAt (replaces hardcoded MEMBER_SINCE)
  profileComplete: boolean;
  pendingLegal: { doc: LegalDoc; version: string }[];   // must be accepted (empty when fine)
  // NOTE: `sessions` is no longer embedded — use GET /me/sessions.
}

interface MeStudentDto {             // GET /auth/me (student) and GET /me
  user: StudentUser;
  entitlements: Entitlement[];        // active + future
  subscription: MySubscription | null;   // §14
  aiAllowance: AiAllowance;
  unreadNotifications: number;
  notificationPrefs: NotificationPrefs;
}

interface NotificationPrefs {        // union of web (6) + app (4) toggles
  lessons: boolean; exams: boolean; payments: boolean;
  progress: boolean;                 // app "progress"
  weekly: boolean;                   // web "weekly report"
  push: boolean; sms: boolean; whatsapp: boolean; email: boolean;
}

interface AuthTokens { accessToken: string; refreshToken: string; expiresIn: number /*seconds, 900*/; refreshExpiresAt: ISODate }
```

### 1.6 Catalog (student-facing)

```ts
type LessonStatus = 'completed' | 'in-progress' | 'not-started';   // student progress status (unchanged)

interface Chapter { id: ID /*topic id*/; title: Localized }          // student "chapter" == admin "topic"
interface StudentUnit { id: ID; title: Localized; order: number; chapters: Chapter[] }

interface SubjectSummary {           // website/user & app/user `Subject` (+ fields)
  id: ID; slug: SubjectSlug;
  name: Localized; tagline: Localized; description: Localized;
  color: string; image: string /*signed/CDN url*/; icon: string /*lucide icon name*/;
  lessonsCount: number;              // published lessons
  hours: number;                     // Σ published lesson duration / 3600, 1 decimal
  questionsCount: number;            // published questions
  examsCount: number;                // published, currently-available blueprints for this subject
  teacher: Localized;                // primary teacher name (kept for drop-in)
  teacherRef: TeacherRef | null;
  order: number;
  sequentialUnlock: boolean;
  // optional-auth / student-only fields (null when anonymous)
  locked: boolean | null;            // false = entitled
  progress: { completed: number; total: number; pct: number; avgPct: number } | null;
  // avgPct = mean lesson progress (completed = 100) — app formula; pct = completed/total*100 — web formula
}

interface SubjectDetail extends SubjectSummary {
  units: StudentUnit[];              // ordered; chapters ordered
  lessons: LessonSummary[];          // all published lessons, ordered by unit.order, topic.order, lesson.order
  nextLessonId: ID | null;           // first in-progress, else first not-started, else first
}

interface StudentResource {
  id: ID;
  title: Localized;
  size: string;                      // human label "1.2 MB" (kept for drop-in)
  sizeBytes: number;
  pages: number | null;
  mimeType: string;                  // application/pdf …
}

interface LessonSummary {            // `Lesson` minus heavy fields
  id: ID; subjectId: ID; subjectSlug: SubjectSlug;
  unitId: ID; chapterId: ID /*= topicId*/; topicId: ID;
  order: number;                     // order within subject sequence (1..n, unit/topic/lesson order flattened)
  title: Localized; description: Localized;
  duration: number;                  // seconds
  thumbnail: string;                 // signed url
  teacher: Localized; teacherRef: TeacherRef | null;
  locked: boolean;                   // entitlement/sequential/prerequisite lock for caller
  lockReason: LockedReason | 'PREREQUISITE' | 'SEQUENTIAL' | null;
  status: LessonStatus;              // caller's progress
  progress: number;                  // 0-100
  positionSec: number;               // resume position
}

interface LessonDetail extends LessonSummary {
  videoUrl: null;                    // never exposed — use GET /lessons/:id/stream-url (kept as null for type compat)
  hasVideo: boolean;
  resources: StudentResource[];      // download via GET /lessons/:id/resources/:resourceId/url
  completionThreshold: number;       // % watched to auto-complete
  prerequisiteId: ID | null;
  unitTitle: Localized; unitIndex: number;   // 1-based position of the unit in the subject
  prevLessonId: ID | null; nextLessonId: ID | null;
  unitProgress: { done: number; total: number };
  bestQuizScore: number | null;      // replaces client quizScores[lessonId]
  quiz: { available: boolean; questionCount: number; estimatedMinutes: number; passThreshold: number };
  note: string;                      // caller's lesson note ('' if none)
}

interface StreamUrlDto {
  url: string;                       // signed, expiring (HLS .m3u8 preferred, else mp4)
  type: 'hls' | 'mp4';
  expiresAt: ISODate;
  renditions: { quality: '1080p' | '720p' | '480p' | '360p'; url: string }[];  // mp4 fallbacks (may be empty for HLS)
  captions: { lang: Lang; label: Localized; url: string /*signed .vtt — fetchable without the Authorization header*/ }[];
  poster: string;
  durationSec: number;
  resumePositionSec: number;
  heartbeatSeconds: number;          // settings.learning.watchHeartbeatSeconds (default 10)
}

interface TeacherDto {
  id: ID; name: Localized; bio: Localized; avatarUrl: string | null;
  subjectId: ID; subjectSlug: SubjectSlug;
  yearsExperience: number | null; studentsCount: number | null; rating: number | null /*0-5*/;
  active: boolean;
}
```

### 1.7 Questions (student-facing)

```ts
type QuestionType = 'mcq' | 'true_false' | 'fill_blank';
interface QuestionOptionPublic { id: ID; text: Localized }

interface QuestionPublic {           // never contains the answer
  id: ID; code: string;
  subjectId: ID; subjectSlug: SubjectSlug;
  unitId: ID; topicId: ID; lessonId: ID | null;  // lessonId = first published lesson of the topic
  topic: Localized;
  difficulty: Difficulty;
  type: QuestionType;                // student UIs render true_false as 2 options; fill_blank answered by `textAnswer`
  tags: string[];                    // tag slugs; labels via /public/app-config tagLabels or i18n
  text: Localized;                   // markdown-lite; inline `$…$` and display `$$…$$` LaTeX
  formula: string | null;            // optional extra display LaTeX (null for most admin-authored questions)
  imageUrl: string | null;
  options: QuestionOptionPublic[];   // served order (shuffled when the rule says so); fill_blank → []
  bookmarked: boolean;
  locked: boolean;                   // subject not entitled (options still listed, answers never)
}

interface QuestionReview extends QuestionPublic {
  correctOptionId: ID | null;        // null for fill_blank
  correctIndex: number;              // index in `options` as served (−1 for fill_blank)
  acceptedAnswers: Localized[];      // fill_blank only, else []
  explanation: Localized;
}

interface AnswerFeedback {           // instant reveal (quiz & practice & mistake retry)
  questionId: ID;
  correct: boolean;
  correctOptionId: ID | null;
  correctIndex: number;
  explanation: Localized | null;     // null when quiz rule showExplanation = false
  mistake: MistakeEntry | null;      // created/updated mistake when wrong
}

interface Breakdown { key: string; label: Localized; correct: number; total: number; accuracy: number }  // app utils/practice
interface TopicStat {                // exam/quiz topic breakdown (union of web + app shapes)
  key: ID /*topicId*/; topic: Localized; correct: number; total: number;
  pct: number; accuracy: number /*= pct*/; missed: number; missedLessonIds: ID[];
}
interface RevisionItem { lessonId: ID; title: Localized; topic: Localized; missed: number; topicPct: number }

interface AnswerRecord {             // review rows
  questionId: ID;
  question: QuestionReview;
  chosenOptionId: ID | null;
  chosenIndex: number;               // −1 unanswered (app convention); web treats −1 as null
  textAnswer: string | null;
  correct: boolean;
  flagged: boolean;
  timeSec: number | null;
}
```

### 1.8 Misc student

```ts
interface ActivityItem {             // recent activity feed
  id: ID; kind: 'lesson' | 'quiz' | 'exam' | 'ai';
  title: Localized; meta: Localized; date: ISODate;
  link: string | null;               // canonical app route (see AppNotification.link)
}

type NotificationType = 'lesson' | 'exam' | 'payment' | 'subscription' | 'system';
interface AppNotification {          // student notification (unchanged shape + target)
  id: ID; type: NotificationType;
  title: Localized; body: Localized;
  date: ISODate; read: boolean;
  link: string | null;               // canonical app route: '/lesson/{id}', '/subject/{id}', '/exams', '/exams/result/{attemptId}',
                                     // '/mistakes', '/subscription', '/notifications', '/progress', '/tutor'
  target: { kind: 'lesson' | 'subject' | 'exams' | 'exam_result' | 'mistakes' | 'subscription' | 'notifications'
            | 'progress' | 'tutor' | 'none'; id: ID | null };   // web maps target → '/student/...' routes
}

type LegalDoc = 'terms' | 'privacy';
interface LegalDocumentDto {
  doc: LegalDoc; version: string; publishedAt: ISODate; updatedAt: ISODate;
  title: Localized; subtitle: Localized; intro: Localized;
  sections: { id: string; title: Localized; body: Localized }[];  // body: paragraphs split by blank line, "• " bullets
  contactEmail: string;
}
```

### 1.9 Admin generic

```ts
interface ExportRequest {
  format: ExportFormat;
  filters?: Record<string, unknown>;   // exactly the list endpoint's query params (q, sort, filters, from/to).
                                       // Values: string | number | boolean | null | (string | number)[]; no nested
                                       // objects (400 VALIDATION_ERROR), max 50 keys. `q`, `search`, `sort`, `report`,
                                       // `from`, `to`, `partnerType`, `period` are coerced to one string (SEC-30).
  ids?: ID[];                          // export only these rows (bulk "export selected")
  columns?: string[];                  // ordered column keys; default all documented
}
interface BulkResult { succeeded: ID[]; failed: { id: ID; code: string; reason?: string; message: string }[] }
interface ReasonBody { reason: string }                       // min 3
interface NoteDto { id: ID; author: AdminRef; body: string; createdAt: ISODate }   // admin SupportNote (author → AdminRef)
interface SeriesPoint { date: DateOnly | string /*bucket start*/; label: string; value: number }
interface Kpi { value: number; prev: number | null; deltaPct: number | null; spark: number[] }
// deltaPct = prev === 0 ? (value === 0 ? 0 : 100) : (value - prev) / prev * 100
```

### 1.10 Upload reference

```ts
type UploadPurpose =
  | 'lesson_video' | 'lesson_thumbnail' | 'lesson_resource' | 'lesson_captions'
  | 'subject_image' | 'question_image' | 'question_import' | 'teacher_avatar'
  | 'logo' | 'admin_avatar' | 'student_avatar' | 'ai_attachment' | 'reconciliation_import' | 'testimonial_avatar';
type FileKey = string;   // opaque server-issued token ("upl_<uuid>") identifying bucket+path; never a raw path
interface FileRefDto { fileKey: FileKey; url: string /*signed GET*/; name: string; sizeBytes: number; mimeType: string; expiresAt: ISODate }
```

---

Endpoint block format: **ID · METHOD path** — Auth · Query · Body · → data · Errors · Notes · Used by (U = website/user,
A = app/user, AD = website/admin). Page-level mapping lives in `docs/API_PAGE_MATRIX.md`.

## 2. Health — `/health`

#### HLT-01 · `GET /health`
Auth public. → data `{ status: 'ok'; uptimeSec: number; version: string; time: ISODate }`. Liveness only (no DB).

#### HLT-02 · `GET /health/ready`
Auth public. → data `{ status: 'ready' | 'degraded'; checks: { db: Check; storage: Check; queue: Check; sms: Check; ai: Check; payments: Check } }`
with `Check = { status: 'up' | 'down' | 'degraded'; latencyMs: number | null; message?: string }`. HTTP 503 with the
error envelope (`INTERNAL`, `details.checks`) when `db` is down. In production `message` is never included on this public
endpoint (SEC-31); the admin panel (ADM-DSH-02) keeps them. Used by: AD system-health panel (via ADM-DSH-02).

---

## 3. Public / CMS (no auth) — `/public`

All `public`, `rl:public`, cacheable (`Cache-Control: public, max-age=60`).

#### PUB-01 · `GET /public/app-config`
Query: `platform?: Platform` (default from `X-Client-Platform`). Reads `X-App-Version` when present.
→ data `AppConfigDto`:
```ts
interface AppConfigDto {
  platformName: Localized; logoUrl: string | null;
  defaultLanguage: Lang; currency: Currency; timezone: string; dateFormat: string; academicYear: string;
  maintenance: { enabled: boolean; message: Localized };
  update: {
    minVersion: { ios: string; android: string }; latestVersion: string;
    forceUpdate: boolean;
    required: boolean;        // X-App-Version < minVersion[platform] && forceUpdate
    recommended: boolean;     // X-App-Version < latestVersion
    storeUrls: { ios: string | null; android: string | null };
  };
  deviceLimit: number; sessionTimeoutMinutes: number;
  otp: { codeLength: 4 | 6; resendCooldownSeconds: number; expirySeconds: number };
  featureFlags: Record<string /*flag key*/, boolean>;     // production flags only
  support: SupportContactsDto;                             // §31
  social: { facebook: string; instagram: string; telegram: string; youtube: string; tiktok: string | null };
  appLinks: { appStore: string | null; googlePlay: string | null };
  learning: {
    quizQuestionCount: number;        // default rule fallback (5)
    quizPassMark: number;             // 60
    examDefaultPassMark: number;      // 50
    practiceSessionSizes: number[];   // [10, 20, 50]
    practiceMaxSize: number;          // 100
    dailyGoalMinutes: number;         // 120
    watchHeartbeatSeconds: number;    // 10
    examAutosaveSeconds: number;      // 15
    gradeBands: { key: 'excellent' | 'veryGood' | 'good' | 'pass' | 'needsWork'; min: number }[];
  };
  promoCodesEnabled: boolean;
  avatarPresets: string[];            // replaces app AVATAR_OPTIONS
  tagLabels: Record<string /*slug*/, Localized>;
  serverTime: ISODate;
}
```
Used by: U (root: maintenance screen, footer, contact), A (`_layout` force-update/maintenance, welcome, support sheet, OTP resend timer,
edit-profile avatars).

#### PUB-02 · `GET /public/governorates`
→ data `Governorate[]` (19, ordered by name in Accept-Language). Used by: U Register/Profile, A register/edit-profile, AD (lookups).

#### PUB-03 · `GET /public/schools`
Query: `governorateId?: string`, `q?: string`, `limit?: number (default 50, max 200)`.
→ data `PublicSchool[]` with `PublicSchool = { id: ID; name: Localized; governorate: string /*slug*/; code: null }` — only
`status='active'` schools; **referral code is never exposed here**. Ranking: matching governorate first. Used by: A SchoolPicker,
U Register/Profile (school field accepts directory or free text).

#### PUB-04 · `GET /public/referral-codes/:code`
rl:auth. Path `code` (case-insensitive, `^[A-Za-z0-9-]{4,20}$`). → data `{ valid: boolean; kind: 'school' | 'marketer' | 'referral' | 'campaign' | null; label: Localized | null }`.
Resolution order: school `code` → marketer `code` → promotion code with type `referral|campaign`. Used by: U Register, A register (inline validation).

#### PUB-05 · `GET /public/stats`
→ data `PublicStatsDto = { students: number; lessons: number; questions: number; subjects: number; governorates: number; satisfactionPct: number; passRatePct: number; rating: number; ratingCount: number; displayOverrides: Partial<Record<'students'|'lessons'|'questions', string>> }`.
Counts are live (`students` = registered students, rounded down to nearest 100 for display by the client unless an override such as
`"48K+"` is set in `settings.marketing`). Used by: U Landing Stats/Hero, About impact, AuthLayout side panel; A welcome ("4.9", "40,000+").

#### PUB-06 · `GET /public/testimonials`
Query: `placement?: 'landing' | 'auth' | 'app'`. → data `Testimonial[]` = `{ id: ID; name: Localized; city: Localized; role: Localized; quote: Localized; avatar: string | null; rating: number /*1-5*/; order: number }`
(active only, ordered). Used by: U Landing Testimonials, AuthLayout quotes.

#### PUB-07 · `GET /public/faq`
Query: `placement?: 'landing' | 'pricing' | 'subscription_app' | 'contact'` (default `landing`). → data `FaqItem[]` = `{ id: ID; q: Localized; a: Localized; order: number }`.
Used by: U Landing/Pricing FAQ, A subscription FAQ accordion.

#### PUB-08 · `GET /public/teachers`
→ data `TeacherDto[]` (active). Used by: U About (teachers grid: replaces `TEACHER_META` + i18n bios), A Lesson TeacherCard (rating/students).

#### PUB-09 · `GET /public/payment-methods`
→ data `PaymentMethodDto[]` (§14). Used by: U Pricing PaymentMethods, PaymentModal; A checkout.

#### PUB-10 · `POST /public/contact`
rl:public (5/hour/IP). Body `{ name: string /*3..80*/; contact: string /*email or Iraqi mobile*/; subject: 'general'|'support'|'billing'|'partnerships'|'schools'; message: string /*20..4000*/; locale?: Lang }`.
→ data `{ ticketId: string /*EW-T-NNNNN*/; createdAt: ISODate }`. Creates an `eduway_platform_support_tickets` row (`category` mapped:
billing→payment, support→access, others→account) + admin inbox notification. Used by: U Contact.

#### PUB-11 · `GET /legal/:doc`
Auth public. Path `doc: 'terms' | 'privacy'`. Query `version?: string` (default current published). → data `LegalDocumentDto`.
Errors 404. Used by: U Terms/Privacy, A legal/terms, legal/privacy, Register (version to accept).

#### PUB-12 · `GET /subjects` *(catalog, optional auth — documented in §6 as CAT-01)*
#### PUB-13 · `GET /packages` *(optional auth — documented in §14 as PAY-01)*

---

## 4. Auth — `/auth`

### 4.1 Students (phone OTP)

Phone format: request field `phone` accepts `07XXXXXXXXX`, `7XXXXXXXXX`, `+9647XXXXXXXXX`, `9647…`, spaces allowed; server
normalizes to E.164 `+9647XXXXXXXXX` (regex after normalization `^\+9647[3-9]\d{8}$`). DTOs return `mobile` in E.164.

#### AUTH-01 · `POST /auth/send-otp`
Auth public · rl:otp. Headers `X-Client-Platform`, `X-Device-Id`.
Body `{ phone: string; purpose: 'login' | 'register'; channel?: 'sms' | 'whatsapp' }`.
→ data `{ phone: string /*E.164*/; maskedPhone: string /*"+964 770 ••• ••67"*/; purpose; isRegistered: boolean; codeLength: 4 | 6; expiresInSeconds: number; resendInSeconds: number; resendsLeft: number; channel: 'sms' | 'whatsapp' }`.
`channel` omitted → `whatsapp` while the admin-linked WhatsApp number is connected (`WHATSAPP_PROVIDER=baileys`, §31a), else `sms`. The response
`channel` is the channel the code was **actually** sent on: a WhatsApp OTP falls back to SMS when the session is down or the number is not on
WhatsApp. Clients show "sent via WhatsApp" when `channel = 'whatsapp'`. The WhatsApp text is bilingual, in the student's language first
(account `locale`, else `Accept-Language`).
Errors: 400; 422 `ACCOUNT_NOT_FOUND` (login, unknown phone); 409 `ACCOUNT_EXISTS` (register, known phone); 429 `OTP_RESEND_COOLDOWN` /
`OTP_RESEND_LIMIT` / `OTP_LOCKED`; 403 `ACCOUNT_LOCKED`. Resend = call again (same purpose). Dev: `MockSmsProvider` logs the code;
non-prod accepts `settings.otp.devBypassCode` (`123456`) for the seeded demo student.
Used by: U Login/Register/VerifyOtp(resend), A login/register/verify-otp(resend).

#### AUTH-02 · `POST /auth/verify-otp`
Auth public · rl:otp. Body:
```ts
{ phone: string; code: string; purpose: 'login' | 'register';
  deviceId: string; platform: Platform;          // also accepted from headers
  deviceName?: string;                           // e.g. expo-device model; else UA parsing
  registration?: RegisterDto;                    // REQUIRED when purpose = 'register' (the forms collect it before OTP)
  revokeSessionId?: ID }                         // when retrying after DEVICE_LIMIT_REACHED
```
→ data `{ tokens: AuthTokens; accessToken: string; refreshToken: string; expiresIn: number; user: StudentUser; isNewUser: boolean; me: MeStudentDto }`
(`accessToken/refreshToken/expiresIn` duplicated top-level per ENGINEERING §3). For `register`, the account, profile, legal
acceptances and attribution (referral/school → `source`, `schoolId`, `marketerId`) are created atomically.
Errors: 401 `OTP_INVALID` (`attemptsLeft`) / `OTP_EXPIRED`; 429 `OTP_LOCKED`; 422 `ACCOUNT_NOT_FOUND`, `REFERRAL_CODE_INVALID`,
`DEVICE_LIMIT_REACHED` (`details.sessions`); 409 `ACCOUNT_EXISTS`; 400.
Used by: U VerifyOtp, A verify-otp.

```ts
interface RegisterDto {
  name: string;                    // 3..60, letters (Latin/Arabic), spaces ' . -
  governorateId: string;           // Governorate slug
  schoolId?: ID | null;            // directory pick, OR
  schoolName?: string | null;      // free text (max 80) → stored as unverified school name
  referralCode?: string | null;    // ^[A-Za-z0-9-]{4,20}$, upper-cased; validated (PUB-04 rules)
  acceptTerms: true;               // must be true
  acceptedLegal: { doc: LegalDoc; version: string }[];   // current published versions shown in the form
  language?: Lang;
  email?: string | null; gender?: 'male' | 'female' | null;
}
```

#### AUTH-03 · `POST /auth/register`
Auth `student*` (profile incomplete — legacy/profile-completion path when a session exists without profile, e.g. created by an admin
manual grant import). Body `RegisterDto`. → data `MeStudentDto`. Errors 400, 422 `REFERRAL_CODE_INVALID`, 409 when already complete.
Used by: (fallback) U/A when `user.profileComplete === false` after AUTH-02.

#### AUTH-04 · `POST /auth/refresh`
Auth public (refresh token in body) · rl:auth. Body `{ refreshToken: string }`. → data `AuthTokens` (rotated; old token revoked;
reuse of a revoked token revokes the whole session family → 401). Works for students and admins (audience inferred).
Errors 401 `UNAUTHORIZED`. Used by: all three clients' interceptor.

#### AUTH-05 · `POST /auth/logout`
Auth student|admin. Body `{ refreshToken?: string }`. Revokes the current session (+ deletes its push token). → `OkDto`.
Used by: U Sidebar/TopBar/BottomTabs/Profile logout, A profile/settings logout, AD Topbar/CommandPalette logout (`audit:auth.logout`).

#### AUTH-06 · `POST /auth/logout-all`
Auth student|admin. Body `{ keepCurrent?: boolean /*default false*/ }`. Revokes all sessions of the caller (optionally keeping
the current one). → data `{ revoked: number }`. Used by: U Profile "log out all other devices" (keepCurrent true), A sessions.

#### AUTH-07 · `GET /auth/me`
Auth student* | admin. → data `MeStudentDto` for student tokens; `MeAdminDto` (§18) for admin tokens.
Used by: all clients on boot / after refresh.

#### AUTH-08 · `POST /auth/accept-legal`
Auth student*. Body `{ documents: { doc: LegalDoc; version: string }[] }`. Records `eduway_platform_legal_acceptances`
(ip, platform, at). → data `{ pendingLegal: { doc: LegalDoc; version: string }[] }`. Errors 422 when version is not the
current published one. Used by: U/A re-acceptance prompt (new UI where `pendingLegal` non-empty; registration covers first acceptance).

### 4.2 Admins (email + password + optional TOTP)

#### AUTH-10 · `POST /auth/admin/login`
Auth public · rl:auth (5/min/IP + per-email lockout). Body `{ email: string; password: string; totp?: string; remember?: boolean }`.
`totp` = the current 6-digit TOTP code **or** a single-use recovery code `XXXXX-XXXXX` (dash optional, case-insensitive).
A TOTP code is accepted once: the same (or an older) 30-s step is refused after a successful use (SEC-26).
→ data, one of:
* `{ mfaRequired: true; mfaToken: string /*5 min*/; mfaEnrollmentRequired: false }` — admin has MFA and no `totp` sent;
* `{ mfaRequired: false; tokens: AuthTokens; me: MeAdminDto }` — MFA disabled, or valid `totp` supplied;
* `{ mfaRequired: true; mfaEnrollmentRequired: true; mfaToken: string }` — when `settings.security.adminMfaMandatory` and not enrolled
  (client goes to setup with AUTH-12 using the mfaToken as bearer).
`remember=false` → refresh token lifetime 12 h instead of 30 d. Errors 401 `UNAUTHORIZED` (generic), 403 `ACCOUNT_LOCKED`,
429. `audit:auth.login` on token issuance; failures feed `admin_login_failure` security alerts.
Used by: AD Login.

#### AUTH-11 · `POST /auth/admin/mfa/verify`
Auth public · rl:auth. Body `{ mfaToken: string; code: string /*6-digit TOTP, or recovery code XXXXX-XXXXX*/; remember?: boolean }`. → data `{ tokens: AuthTokens; me: MeAdminDto }`.
A recovery code works once (it is removed from the stored hashed list); a TOTP code cannot be replayed within its window (SEC-26).
Errors 401 `MFA_INVALID`, 401 expired token. `audit:auth.login` ("Signed in with 2FA" / "Signed in with a 2FA recovery code"). Used by: AD Verify2FA.

#### AUTH-12 · `POST /auth/admin/mfa/setup`
Auth admin (or `mfaToken` bearer during forced enrolment). → data `{ secret: string /*base32, 16+*/; otpauthUrl: string; qrDataUrl: string /*PNG data URL*/ }`.
Pending secret stored until enabled. Used by: AD Profile MFA enable flow.

#### AUTH-13 · `POST /auth/admin/mfa/enable`
Auth admin. Body `{ code: string }`. → data `{ mfaEnabled: true; recoveryCodes: string[] /*10, shown once*/ }`. `audit:admin.enable_mfa`.
Errors 401 `MFA_INVALID`. Used by: AD Profile.

#### AUTH-14 · `POST /auth/admin/mfa/disable`
Auth admin. Body `{ code?: string; password?: string }` (one required). → `{ mfaEnabled: false }`. `audit:admin.disable_mfa`.
Errors 401, 422 `MFA_REQUIRED` when MFA is mandatory. Used by: AD Profile.

#### AUTH-15 · `POST /auth/admin/forgot-password`
Auth public · rl:auth. Body `{ email: string }`. Always → `OkDto` (enumeration-safe); for an active admin emails a reset link
`${ADMIN_APP_URL}/reset-password?token=…` (valid `auth.passwordResetExpiryMinutes`, single use; issuing a new link retires
earlier unused ones). The email (template `admin_password_reset`, bilingual) is queued — the response never waits for SMTP.
Used by: AD ForgotPassword.

#### AUTH-16 · `POST /auth/admin/reset-password`
Auth public · rl:auth. Body `{ token: string; newPassword: string }`. Password policy: ≥10 chars, upper, lower, digit, symbol.
→ `OkDto`; revokes all admin sessions, retires the user's other reset links and emails a "password changed" security alert.
Errors 422 `RESET_TOKEN_INVALID`, `PASSWORD_POLICY`. Used by: AD reset-password page.

Admin security emails (no endpoint of their own): invite (ADM-ADM-02/03, set-password link), password changed (AUTH-16 and
ADM-ME-03), 2FA enabled (AUTH-13) / disabled (AUTH-14, ADM-ADM-05), sign-in from a new device or browser (AUTH-10/11/18) —
see docs/PROVIDERS.md §2.

#### AUTH-17 · `GET /auth/admin/invite/:token`
Auth public. → data `{ email: string; name: Localized; roleName: Localized; expiresAt: ISODate }`. Errors 422 `INVITE_INVALID`.
Used by: AD accept-invite page (**new page**).

#### AUTH-18 · `POST /auth/admin/accept-invite`
Auth public. Body `{ token: string; password: string; name?: Localized }`. → data `{ tokens: AuthTokens; me: MeAdminDto; mfaEnrollmentRequired: boolean }`.
Sets status `invited → active`. `audit:admin.accept_invite`. Used by: AD accept-invite page.

---

## 5. Me — student account — `/me`

All `student` unless noted.

#### ME-01 · `GET /me`
Auth student*. → data `MeStudentDto`. Used by: U Profile, Sidebar, TopBar; A profile tab, settings, home header.

#### ME-02 · `PATCH /me`
Body (all optional) `{ name?: string; governorateId?: string; schoolId?: ID | null; schoolName?: string | null; avatarFileKey?: FileKey | null; avatarPreset?: string /*one of app-config avatarPresets*/; language?: Lang; dailyGoalMinutes?: number /*15..600*/; email?: string | null; gender?: 'male' | 'female' | null }`.
`mobile` is not editable (support only). → data `StudentUser`. Errors 400. Used by: U Profile (personal info, language),
A edit-profile, settings/language (language sync).

#### ME-03 · `GET /me/sessions`
→ data `SessionDto[]` (active sessions, current first). Used by: U Profile devices, A settings/sessions, settings index (count).

#### ME-04 · `DELETE /me/sessions/:sessionId`
→ `OkDto`. Errors 404; 422 `SELF_ACTION` for the current session (use AUTH-05). Used by: U Profile, A sessions.

#### ME-05 · `DELETE /me/sessions`
Query `scope=others` (only value). Revokes all sessions except current. → data `{ revoked: number }`. Used by: U Profile, A sessions ("sign out all others").

#### ME-06 · `GET /me/devices`
→ data `{ id: ID; deviceId: string; platform: Platform; name: string; pushEnabled: boolean; lastSeenAt: ISODate }[]`. Used by: (spec) A settings.

#### ME-07 · `POST /me/push-token`
Body `{ token: string /*ExponentPushToken[...]*/; provider: 'expo'; platform: 'ios' | 'android'; deviceId: string }`. Upserts
(`eduway_platform_push_tokens`), bound to the current session. → `OkDto`. Used by: A root layout after permission grant.

#### ME-08 · `DELETE /me/push-token`
Body `{ token: string }`. → `OkDto`. Used by: A logout / permission revoked.

#### ME-09 · `GET /me/notification-preferences`
→ data `NotificationPrefs`. Used by: U Profile prefs, A settings.

#### ME-10 · `PATCH /me/notification-preferences`
Body `Partial<NotificationPrefs>`. → data `NotificationPrefs`. Used by: U Profile (each switch), A settings (each switch).

#### ME-11 · `GET /me/entitlements`
→ data `Entitlement[]`. Used by: U `useSubjectAccess`, A `hasSubject` (also embedded in `MeStudentDto`).

#### ME-12 · `POST /me/email/verification`
Auth student · rl 6/h per student (service: ≤ 5 links/h). No body. Emails a confirmation link
`${USER_APP_URL}/verify-email?token=…` (24 h, single use, one live link per student) to the profile email.
→ data `{ sent: boolean; email: string | null; alreadyVerified: boolean }`. Errors 422 `EMAIL_MISSING`,
`EMAIL_VERIFICATION_LIMIT`. Setting or changing `email` (ME-02, AUTH-02/03, ADM-STU edit) resets `emailVerified` and sends a
link automatically. Only a confirmed email receives receipts, subscription and support emails. Used by: U Profile.

#### AUTH-30 · `POST /auth/email/verify`
Auth public · rl:auth. Body `{ token: string }`. Confirms the email the link was sent to (must still be the account's email).
→ data `{ verified: true; email: string }`. Errors 422 `EMAIL_TOKEN_INVALID` (unknown, used, expired or email changed since).
Used by: U `/verify-email` page.

---

## 6. Catalog & lessons (student) — `/subjects`, `/lessons`

#### CAT-01 · `GET /subjects`
Auth optional. → data `SubjectSummary[]` (status `active` only, ordered by `order`). Anonymous callers get `locked=null`,
`progress=null`. Used by: U Landing Subjects, Footer, Subjects page, Dashboard subject grid, QuestionBank chips, AiTutor chips;
A subjects tab, home carousel, practice quick-start, tutor chips.

#### CAT-02 · `GET /subjects/:subjectId`
Auth optional (`:subjectId` uuid or slug). → data `SubjectDetail` (anonymous: lessons have `status='not-started'`, `locked=true`).
Errors 404. Used by: U SubjectDetail (+LessonList), A subject/[id] (LessonsTab/UnitAccordion).

#### CAT-03 · `GET /subjects/:subjectId/question-stats`
Auth student. → data `{ total: number; byDifficulty: Record<Difficulty, number>; byUnit: { unitId: ID; title: Localized; order: number; total: number; easy: number; medium: number; hard: number }[]; samples: QuestionPublic[] /*3*/ }`
(published questions only; real counts — replaces the Laplace projection). Used by: U SubjectPanels QuestionBankPanel, A QuestionBankTab.

#### CAT-04 · `GET /subjects/:subjectId/exams`
Auth student. → data `ExamCard[]` (§11) for that subject. Used by: U SubjectDetail ExamsPanel, A ExamsTab.

#### CAT-05 · `GET /lessons/:lessonId`
Auth student. → data `LessonDetail`. Locked lessons return 200 with `locked=true` and `resources=[]` (UI shows blurred upsell);
the stream endpoint enforces the lock. Errors 404 (also for unpublished). Used by: U Lesson, A lesson/[id].

#### CAT-06 · `GET /lessons/:lessonId/stream-url`
Auth student · ent:subject. → data `StreamUrlDto`. Increments `video_assets.views` (and `replays` when the lesson is already completed).
Errors 402/403 locked, 422 `PREREQUISITE_NOT_MET` / `SEQUENTIAL_LOCK`, 404 when no ready video.
Used by: U VideoPlayer, A VideoPlayer (expo-video). Re-request when `expiresAt` is near.

#### CAT-07 · `GET /lessons/:lessonId/resources/:resourceId/url`
Auth student · ent:subject. → data `{ url: string; expiresAt: ISODate; fileName: string; mimeType: string; sizeBytes: number }`.
Used by: U ResourcesPanel download, A ResourceList.

#### CAT-08 · `GET /lessons/:lessonId/note`
Auth student. → data `{ lessonId: ID; text: string; updatedAt: ISODate | null }`. Used by: U NotesPanel, A LessonNotes.

#### CAT-09 · `PUT /lessons/:lessonId/note`
Auth student. Body `{ text: string /*0..5000*/ }` (app UI caps 2000; server 5000). Empty text deletes. → data `{ lessonId; text; updatedAt }`.
Used by: U NotesPanel (debounced 700 ms), A LessonNotes.

#### CAT-10 · `GET /lessons/:lessonId/quiz-rule`
Auth student. → data `EffectiveQuizRule` (§8). Used by: U Lesson ("Take quiz" meta), A QuizPromptSheet ("5 questions · 4 min").

---

## 7. Progress & dashboard (student) — `/progress`

#### PRG-01 · `PUT /progress/watch`
Auth student · ent:subject. Body `{ lessonId: ID; positionSec: number; durationSec: number; event: 'heartbeat' | 'pause' | 'leave' | 'ended' | 'seek'; watchedSecDelta?: number /*seconds actually played since last call, ≤ 2×heartbeat*/; platform?: Platform }`.
Rules: `progress = max(prev, min(99, round(position/duration*100)))`; status → `in-progress` unless already `completed`;
when `progress ≥ completionThreshold` or `event='ended'` → completed (progress 100, `lesson_completions` row, streak/daily
activity updated, activity item, achievements re-evaluated); `watchedSecDelta` feeds `daily_activity.watch_minutes` and the
student's `lastLessonId`. → data `LessonProgressDto = { lessonId: ID; status: LessonStatus; progress: number; positionSec: number; completedAt: ISODate | null; justCompleted: boolean }`.
Client cadence: every `heartbeatSeconds` while playing (spec 10 s) + on pause/leave/background/unmount. Idempotent.
Used by: U VideoPlayer, A VideoPlayer/lesson (background-safe).

#### PRG-02 · `POST /progress/complete`
Auth student · ent:subject. Body `{ lessonId: ID }`. Marks complete (manual "Mark complete"). → data `LessonProgressDto`.
Used by: U Lesson mark complete / video ended, A lesson mark complete / video end.

#### PRG-03 · `GET /progress/lessons`
Auth student. Query `subjectId?` (uuid|slug). → data `LessonProgressDto[]`. Used by: U `getLessonProgress` map hydration, A progressStore hydration.

#### PRG-04 · `GET /progress/dashboard`
Auth student. Query `tzOffsetMinutes?: number` (default platform tz). → data:
```ts
interface StudentDashboardDto {
  greetingName: Localized;                       // firstName
  subscription: { packageName: Localized | null; daysRemaining: number; totalDays: number; status: StudentUser['subscriptionStatus']; endsAt: ISODate | null };
  streak: { current: number; longest: number; last7: { date: DateOnly; active: boolean }[] };
  continueLesson: (LessonSummary & { subject: SubjectRef }) | null;
  lessons: { completed: number; total: number; pct: number };
  quizAverage: number | null;                    // null when no attempts (UI may show "—"; no hardcoded 82)
  latestWeekQuizAverage: number | null;          // web StatTile
  unresolvedMistakes: number;
  aiAllowance: AiAllowance;
  subjects: SubjectProgressDto[];                // PRG-05 items
  weeklyStudy: WeeklyStudyDto;
  todayMinutes: number; dailyGoalMinutes: number;
  upcomingExams: UpcomingExamDto[];              // §11 EXM-02
  recentActivity: ActivityItem[];                // 5 newest
}
interface WeeklyStudyDto {
  weekStart: DateOnly;                           // Saturday
  days: { date: DateOnly; day: Localized /*"Sat"/"السبت"*/; minutes: number; questions: number }[];   // 7, Sat→Fri
  totalMinutes: number; dailyAverageMinutes: number;
  lastWeekTotalMinutes: number; changePct: number | null;
}
```
Used by: U Dashboard (all widgets), A home (header, ContinueCard, StreakPlanCard, StatsGrid, WeeklyChart, ExamReminder).

#### PRG-05 · `GET /progress/subjects`
Auth student. → data `SubjectProgressDto[]` = `{ subjectId: ID; slug: SubjectSlug; name: Localized; color: string; completed: number; total: number; pct: number; avgPct: number; quizAverage: number | null; mastery: number | null /*practice correct/answered %*/; studyMinutes: number; locked: boolean }`.
Used by: U Progress (per-subject), Dashboard SubjectProgressGrid, `useProgress`; A progress SubjectRings, practice quick-start mastery.

#### PRG-06 · `GET /progress/summary`
Auth student. → data `{ overallPct: number; overallAvgPct: number; completedLessons: number; totalLessons: number; studyHours: number; streak: number; longestStreak: number; activeDays: number /*last 16 weeks*/; activeDaysLast30: number; busiestWeekday: number /*0=Sat*/ | null; quizAverage: number | null; lessonsDoneThisWeek: number }`.
Used by: U Progress hero, A progress HeroSummary, profile tab stats.

#### PRG-07 · `GET /progress/score-trend`
Auth student. Query `weeks?: number (default 8, max 26)`. → data `{ weeks: { week: number /*1..n*/; weekStart: DateOnly; label: Localized; scores: Record<SubjectSlug, number | null> }[]; subjects: SubjectRef[] }`
(average quiz-attempt score per subject per week). Used by: U Progress QuizTrendChart, Dashboard quiz average; A progress ScoreTrend, practice fallback mastery.

#### PRG-08 · `GET /progress/weak-topics`
Auth student. Query `limit?: number (default 5)`, `subjectId?`. → data `{ subjectId: ID; subjectSlug: SubjectSlug; topicId: ID; topic: Localized; accuracy: number; attempts: number; lessonId: ID | null; lessonTitle: Localized | null }[]`
(lowest accuracy topics with ≥ 3 answered questions). Used by: U Progress weak topics, A progress WeakTopics.

#### PRG-09 · `GET /progress/streak-calendar`
Auth student. Query `weeks?: number (default 16, max 52)`. → data `{ days: { date: DateOnly; minutes: number; level: 0 | 1 | 2 | 3 | 4 }[]; current: number; longest: number; activeDays: number; activeDaysLast30: number; busiestWeekday: number | null }`
(level thresholds from `settings.learning.heatmapLevels`, default minutes `[0, 1, 25, 50, 80]`). Used by: U Progress ActivityHeatmap, A StreakCalendar, StreakPlanCard (last 7).

#### PRG-10 · `GET /progress/activity`
Auth student. Query `limit?: number (default 10, max 50)`, `cursor?`. → data `ActivityItem[]` + meta. Used by: U Dashboard RecentActivity, A progress ActivityTimeline.

#### PRG-11 · `GET /progress/today-plan`
Auth student. → data `PlanItem[]`:
```ts
interface PlanItem {
  id: ID; kind: 'lesson' | 'quiz' | 'mistakes' | 'exam';
  subjectId: ID | null; subjectSlug: SubjectSlug | null;
  title: Localized; meta: Localized; minutes: number;
  target: { pathname: string; params: Record<string, string> };   // canonical app route (web maps)
  done: boolean;
}
```
Generated once per day per student (continue lesson, quiz of last completed lesson, unresolved mistakes, upcoming exam). Used by: A home TodayPlan, U Dashboard TodayGoal shortcuts.

#### PRG-12 · `PATCH /progress/today-plan/:itemId`
Auth student. Body `{ done: boolean }`. → data `PlanItem`. Used by: A TodayPlan checkbox.

#### PRG-13 · `GET /progress/achievements`
Auth student. → data `Achievement[]` = `{ id: string /*slug e.g. 'streak-7'*/; icon: string; title: Localized; description: Localized; hint: Localized; earned: boolean; current: number; target: number; earnedAt: ISODate | null }`.
Used by: A progress BadgesGrid.

---

## 8. Quizzes (student) — `/quizzes`

```ts
interface EffectiveQuizRule {            // subject default merged with lesson override (override wins)
  lessonId: ID; source: 'subject' | 'lesson';
  questionCount: number; poolSize: number; randomize: boolean; alternativeSets: number;
  passThreshold: number; retryPolicy: 'unlimited' | 'limited' | 'cooldown'; maxRetries: number; cooldownMinutes: number;
  showExplanation: boolean; requireCompletionToUnlock: boolean;
  attemptsUsed: number; retriesLeft: number | null /*null = unlimited*/; retryAt: ISODate | null;
  estimatedMinutes: number; bestScore: number | null;
}
interface QuizStartDto {
  attemptId: ID; lessonId: ID; setNo: number /*1..alternativeSets*/; attemptNo: number;
  rule: EffectiveQuizRule;
  questions: QuestionPublic[];           // options shuffled when rule.randomize
  startedAt: ISODate;
}
interface QuizResultDto {
  attemptId: ID; lessonId: ID; attemptNo: number;
  score: number /*0-100*/; correct: number; total: number; passed: boolean; passThreshold: number;
  timeSpentSec: number; mistakesAdded: number; bestScore: number;
  nextLessonId: ID | null; unlockedNextLesson: boolean;
  answers: AnswerRecord[];
}
```

#### QUZ-01 · `POST /quizzes/:lessonId/start`
Auth student · ent:subject. Body `{}`. Draws `rule.questionCount` questions from the lesson's pool (lesson topic → unit → subject
fallback, published `mcq`/`true_false` only), picks one of up to 5 alternative sets, shuffles options. Any unfinished attempt for the
lesson is abandoned. → data `QuizStartDto`. Errors 402/403, 422 `QUIZ_RETRY_EXHAUSTED` / `QUIZ_COOLDOWN` / `PREREQUISITE_NOT_MET`.
Used by: U LessonQuiz (start/retry), A quiz/[lessonId].

#### QUZ-02 · `POST /quizzes/attempts/:attemptId/answer`
Auth student. Body `{ questionId: ID; optionId?: ID; textAnswer?: string; timeSec?: number }`. Answer is final (one per question).
Wrong → mistake upserted (source `quiz`). → data `AnswerFeedback`. Errors 409 already answered/submitted, 404.
Used by: U LessonQuiz/QuizCard instant mode, A quiz screen.

#### QUZ-03 · `POST /quizzes/attempts/:attemptId/submit`
Auth student. Body `{ timeSpentSec: number }`. Unanswered questions count as wrong (no mistake). Updates best score, unlock state,
achievements. → data `QuizResultDto`. Errors 409 already submitted. Used by: U LessonQuiz result, A quiz result.

#### QUZ-04 · `GET /quizzes/attempts`
Auth student. Query `lessonId?`, `page`, `pageSize`. → data `QuizAttemptSummary[]` = `{ id; lessonId; lessonTitle: Localized; subjectSlug; attemptNo; score; correct; total; passed; date: ISODate }`.
Used by: A progressStore quizAverage hydration (optional), U Lesson "best quiz score" (also in LessonDetail).

#### QUZ-05 · `GET /quizzes/attempts/:attemptId`
Auth student. → data `QuizResultDto`. Used by: A quiz result re-open. 409 `ATTEMPT_IN_PROGRESS` while the attempt is still open (the result carries the answer key — SECURITY.md SEC-12).

---

## 9. Question bank, practice & bookmarks (student)

#### BNK-01 · `GET /bank/questions`
Auth student. Query: `subjectId?` (uuid|slug), `unitId?`, `topicId?`, `topic?` (English label — app legacy; prefer topicId),
`difficulty?: Difficulty[]`, `type?`, `tags?: string[]`, `bookmarked?: boolean`, `q?` (text + topic, Arabic-normalized),
`reveal?: boolean` (default false; when true and entitled returns `QuestionReview` incl. answer/explanation — app detail sheet),
`page`, `pageSize` (default 12), `sort?: 'code' | '-createdAt' | 'difficulty'` (default random-stable per day).
→ data `(QuestionPublic | QuestionReview)[]` + meta `{ …PageMeta; bookmarkedCount: number }`. Locked subjects: items `locked=true`, never answers.
Used by: U QuestionBank list ("show more" = next page), A question-bank index (all & bookmarks tabs).

#### BNK-02 · `GET /bank/facets`
Auth student. Same filter query as BNK-01. → data:
```ts
interface BankFacetsDto {
  total: number;              // all published questions (all subjects)
  matchCount: number;         // count for the current filter
  subjects: { subjectId: ID; slug: SubjectSlug; name: Localized; count: number; locked: boolean; mastery: number | null }[];
  units: { unitId: ID; title: Localized; order: number; count: number }[];        // for selected subject
  topics: { topicId: ID; key: string /*topic.en*/; label: Localized; count: number }[];   // for selected subject/unit
  difficulties: Record<Difficulty, number>;
  tags: { slug: string; label: Localized | null; count: number }[];              // sorted by count desc
  bookmarkedCount: number;
}
```
Used by: U QuestionBank header/chips/BankFilters, A practice tab FiltersSheet (live match count), practice quick-start.

#### BNK-03 · `GET /bank/questions/:questionId`
Auth student · ent:subject. → data `QuestionReview`. Used by: A QuestionDetailSheet, U "try one" preview. 409 `QUESTION_IN_ACTIVE_ATTEMPT` while the question is part of one of the student's in-progress exam/quiz attempts (SECURITY.md SEC-11).

#### PRA-01 · `POST /practice/start`
Auth student · ent:subject (each selected subject). Body:
```ts
{ mode: 'filters' | 'bookmarks' | 'mistakes';
  filters?: { subjectId?: ID | SubjectSlug; unitId?: ID; topicId?: ID; topic?: string; difficulty?: Difficulty[] | Difficulty | 'all'; tags?: string[]; q?: string };
  count: number;                  // one of settings.learning.practiceSessionSizes or ≤ practiceMaxSize
  includeQuestionId?: ID;         // pinned first ("Practice this" / "Try one")
  questionIds?: ID[];             // explicit set (single-question session)
  seed?: string }
```
`mode:'bookmarks'` combines with every filter sent (bookmarked AND filters); `mode:'mistakes'` = unresolved/reviewed mistakes AND filters.
→ data `{ sessionId: ID; title: Localized; subtitle: Localized; startedAt: ISODate; questions: QuestionPublic[] }` (shuffled,
options shuffled, capped by matches). Errors 402/403, 422 when 0 matches (`details.reason='NO_QUESTIONS'`).
Used by: U QuestionBank "Start practice"/"Try one" → PracticeSession, A practice-session.

#### PRA-02 · `POST /practice/:sessionId/answer`
Auth student. Body `{ questionId: ID; optionId?: ID; textAnswer?: string; timeSec?: number }`. Wrong → mistake (source `bank`).
→ data `AnswerFeedback & { streak: number /*consecutive correct in session*/ }`. Used by: U PracticeSession, A practice-session.

#### PRA-03 · `POST /practice/:sessionId/finish`
Auth student. Body `{ timeSpentSec: number }`. → data `PracticeResultDto`:
```ts
interface PracticeResultDto {
  sessionId: ID; attemptNo: number; subjectId: ID | null; subjectSlug: SubjectSlug | null /*null = mixed*/;
  score: number; correct: number; incorrect: number; skipped: number; total: number; passed: boolean /*≥ quizPassMark*/;
  band: 'excellent' | 'good' | 'fair' | 'low';     // ≥85, ≥65, ≥50, else
  timeSpentSec: number; mistakesAdded: number;
  breakdownByTopic: Breakdown[]; breakdownByDifficulty: Breakdown[];
  answers: AnswerRecord[];
  date: ISODate;
}
```
Used by: U PracticeSession results, A practice-session finish.

#### PRA-04 · `GET /practice/:sessionId/result`
Auth student. → data `PracticeResultDto`. 409 `ATTEMPT_IN_PROGRESS` while the session is still in progress (the result
reveals every answer; PRA-03 finish returns it) (SEC-33). Used by: A question-bank/result (`attemptId` param = sessionId).

#### PRA-05 · `GET /practice/sessions`
Auth student. Query `limit?: number (default 5)`, `page`. → data `{ id: ID; subjectId: ID | null; subjectSlug: SubjectSlug | null; attemptNo: number; correct: number; total: number; score: number; date: ISODate }[]`.
Used by: A practice tab "Recent practice".

#### BMK-01 · `GET /bookmarks`
Auth student. Query `subjectId?`, `page`, `pageSize`. → data `QuestionPublic[]` (+ meta). Used by: A question-bank bookmarks tab, U QuestionBank bookmarkedOnly (alternatively BNK-01 `bookmarked=true`).

#### BMK-02 · `GET /bookmarks/ids`
Auth student. → data `ID[]`. Used by: U StudentContext `isBookmarked`, A progressStore bookmarks hydration.

#### BMK-03 · `PUT /bookmarks/:questionId`
Auth student. → data `{ questionId: ID; bookmarked: true }`. Idempotent. Used by: U QuizCard/QuestionPreviewCard/ExamResult bookmark, A BookmarkStar.

#### BMK-04 · `DELETE /bookmarks/:questionId`
Auth student. → data `{ questionId: ID; bookmarked: false }`. Used by: same as BMK-03.

---

## 10. Mistakes (student) — `/mistakes`

```ts
type MistakeStatus = 'unresolved' | 'reviewed' | 'mastered';
interface MistakeEntry {                   // web Mistake + app MistakeEntry
  id: ID; questionId: ID;
  chosenIndex: number;                     // index in question.options (served order = canonical order for mistakes)
  chosenOptionId: ID | null;
  status: MistakeStatus; repeatCount: number;
  date: ISODate;                           // last time missed
  firstMissedAt: ISODate;
  source: 'quiz' | 'bank' | 'exam';
  sourceRefId: ID | null;                  // quiz attempt / practice session / exam attempt
  question: QuestionReview;                // embedded, with correct answer + explanation
  subject: SubjectRef; unit: UnitRef; topic: TopicRef;
  lessonId: ID | null;
  history: { date: ISODate; chosenIndex: number; chosenOptionId: ID | null; correct: boolean; source: 'retry' | 'quiz' | 'bank' | 'exam' }[];
}
```

#### MST-01 · `GET /mistakes`
Auth student. Query: `status?: MistakeStatus | 'repeated'` (repeated = `repeatCount ≥ 2`, any status), `subjectId?`, `unitId?`, `topicId?`,
`source?`, `from?`, `to?`, `groupBy?: 'subject' | 'unit' | 'topic' | 'date'` (adds `meta.groups`), `sort?: '-date' | 'repeatCount' | '-repeatCount'` (default `-date`), `page`, `pageSize` (default 50, max 100).
→ data `MistakeEntry[]` + meta `{ …PageMeta; counts: { unresolved; reviewed; mastered; repeated; total }; bySubject: { subjectId; slug; count }[]; groups?: { key: string; label: Localized; count: number; ids: ID[] }[] }`.
Ordering for grouped UIs: subject order → unit order → date desc. Used by: U MyMistakes, A mistakes/index.

#### MST-02 · `GET /mistakes/summary`
Auth student. → data `{ unresolved: number; reviewed: number; mastered: number; repeated: number; total: number; masteryPct: number }`.
Used by: U Dashboard tile, A profile/practice entry cards, MistakesHero.

#### MST-03 · `GET /mistakes/:id`
Auth student. Query `reveal?: boolean` (default false). → data `MistakeEntry & { nextUnresolvedId: ID | null }`. Unless `reveal=true` or the mistake is
`mastered`, `question` is returned **without** the answer (`correctOptionId=null`, `correctIndex=-1`, `acceptedAnswers=[]`, empty `explanation`) —
the answer is revealed by MST-05. Used by: A mistakes/[id].

#### MST-04 · `PATCH /mistakes/:id`
Auth student. Body `{ status: MistakeStatus }`. Appends history-free status change (kept in `mistake_history` as `status_change`).
→ data `MistakeEntry`. Used by: U MistakeItem status radio + "Mark as mastered", A MistakeCard "Mark reviewed".

#### MST-05 · `POST /mistakes/:id/retry`
Auth student · ent:subject. Body `{ optionId?: ID; chosenIndex?: number; textAnswer?: string }` (`chosenIndex` refers to `question.options` order).
Correct → `status='mastered'`; wrong → `status='unresolved'`, `repeatCount+1`, chosen updated. History row appended in both cases.
→ data `AnswerFeedback & { mistake: MistakeEntry; nextUnresolvedId: ID | null }`. Used by: U MistakeItem inline retry, A mistakes/[id].

---

## 11. Exams (student) — `/exams`

```ts
interface ExamCard {                     // web/app ExamBlueprint + per-user stats
  id: ID; subjectId: ID; subjectSlug: SubjectSlug; subjectIds: ID[];
  title: Localized; description: Localized;
  questionCount: number; durationMin: number; passMark: number;
  attemptsTotal: number; attemptsUsed: number; attemptsLeft: number;
  bestScore: number | null; lastScore: number | null;
  scoring: 'standard' | 'negative' | 'weighted';
  reviewBeforeSubmit: boolean;
  availableFrom: ISODate; availableTo: ISODate; available: boolean;
  activeAttempt: { attemptId: ID; endsAt: ISODate; answeredCount: number } | null;
  locked: boolean;
  questionIds?: never;                   // removed: questions are served only via EXM-03
}
interface UpcomingExamDto { id: ID; examId: ID; title: Localized; date: ISODate; kind: 'opens' | 'closes'; subjectSlug: SubjectSlug }
interface ExamAttemptState {
  attemptId: ID; exam: ExamCard; attemptNo: number;
  status: 'in_progress' | 'submitted' | 'auto_submitted';
  questions: QuestionPublic[];           // paper order (randomized per attempt when blueprint.randomize); no answers
  order: ID[];                           // questionIds in served order
  answers: Record<ID /*questionId*/, ID /*optionId*/ | null>;
  flagged: ID[];
  currentIndex: number;
  startedAt: ISODate; endsAt: ISODate; serverNow: ISODate;   // client computes skew = serverNow − Date.now()
  autosaveSeconds: number; graceSeconds: number;
  lastSavedAt: ISODate | null;
}
interface ExamResultDto {
  attemptId: ID; attemptNo: number;
  exam: { id: ID; title: Localized; passMark: number; durationMin: number; subjectId: ID; subjectSlug: SubjectSlug; scoring: string };
  student: { name: Localized };          // share card
  score: { total: number; correct: number; incorrect: number; unanswered: number; pct: number; rawScore: number; maxScore: number };
  passed: boolean; grade: 'excellent' | 'veryGood' | 'good' | 'pass' | 'needsWork';
  accuracy: number;                      // correct / answered
  timeSpentSec: number; autoSubmitted: boolean; finishedAt: ISODate;
  attemptsLeft: number;
  topicBreakdown: TopicStat[];
  recommendations: RevisionItem[];       // ≤ 4, worst topics first
  answers: AnswerRecord[];               // review (all questions, flagged marked)
  mistakesAdded: number;
}
interface ExamAttemptSummary { id: ID; examId: ID; title: Localized; subjectSlug: SubjectSlug; attemptNo: number; score: number; passed: boolean; status: ExamAttemptState['status']; date: ISODate }
```

#### EXM-01 · `GET /exams/available`
Auth student. Query `subjectId?`. → data `ExamCard[]` (published blueprints whose window includes now, plus those opening within 30 days
with `available=false`). Used by: U ExamSimulator, A exams/index.

#### EXM-02 · `GET /exams/upcoming`
Auth student. Query `limit?: number (default 3)`. → data `UpcomingExamDto[]` (future `availableFrom` → `kind:'opens'`; open windows
closing within 14 days → `kind:'closes'`). Used by: U Dashboard UpcomingExams, A home ExamReminder.

#### EXM-03 · `POST /exams/:blueprintId/start`
Auth student · ent:subject · rl. Body `{}`. Idempotent: returns the active in-progress attempt if one exists (resume), otherwise creates
one (consumes an attempt), assembling questions per blueprint rows/difficulty mix. → data `ExamAttemptState`.
Errors 402/403, 422 `EXAM_NOT_AVAILABLE` / `EXAM_ATTEMPTS_EXHAUSTED`. Schedules the auto-submit job at `endsAt + graceSeconds`.
Used by: U ExamRoom (start & resume), A exams/room/[id].

#### EXM-04 · `GET /exams/attempts/:attemptId`
Auth student. → data `ExamAttemptState`. Used by: U ExamSimulator "Resume (mm:ss left)", A exam room resume after app restart.

#### EXM-05 · `PUT /exams/attempts/:attemptId/autosave`
Auth student. Body `{ answers: Record<ID, ID | null>; flagged: ID[]; currentIndex: number; clientSavedAt: ISODate; seq: number /*monotonic per attempt*/ }`.
Full-state upsert; server ignores payloads whose `seq` ≤ stored seq (offline queue replays are safe). Accepted until
`endsAt + graceSeconds`. → data `{ savedAt: ISODate; lastSavedAt: ISODate /*= savedAt, server time*/; serverNow: ISODate; endsAt: ISODate; seq: number }`
(a stale `seq` is ignored and the stored state's `lastSavedAt`/`seq` are returned).
Errors 409 `EXAM_ALREADY_SUBMITTED`, 422 `EXAM_TIME_OVER`. Cadence: every 15 s and on change (app: on change, debounced, queued offline).
Used by: U ExamRoom "Saving…/Saved", A exam room (offline queue).

#### EXM-06 · `POST /exams/attempts/:attemptId/flag`
Auth student. Body `{ questionId: ID; flagged: boolean }`. → data `{ flagged: ID[] }`. Used by: U ExamRoom (F key), A exam room flag toggle.

#### EXM-07 · `POST /exams/attempts/:attemptId/submit`
Auth student · idem. Body `{ reason: 'manual' | 'timeout'; answers?: Record<ID, ID | null>; flagged?: ID[]; seq?: number }` (final flush).
Scores (blueprint scoring), creates mistakes for answered-wrong questions (source `exam`), updates analytics. Idempotent (second call
returns the same summary). → data `{ attemptId: ID; status: 'submitted' | 'auto_submitted'; resultUrl: string /*canonical route*/ }`.
Used by: U ExamRoom submit/time-up, A exam room submit/timeout.

#### EXM-08 · `GET /exams/attempts/:attemptId/result`
Auth student. → data `ExamResultDto`. An attempt past `endsAt + graceSeconds` is auto-submitted first and its result returned (200) — so a queued
offline submit/result resolves. Errors 409 `EXAM_IN_PROGRESS` only while the attempt is genuinely still running. Used by: U ExamResult, A exams/result/[id] (+ ShareScoreCard data).

#### EXM-09 · `GET /exams/attempts`
Auth student. Query `examId?`, `status?`, `page`, `pageSize`. → data `ExamAttemptSummary[]`. Used by: U ExamSimulator history, A exams/index previous attempts.

---

## 12. AI tutor (student) — `/ai-tutor`

```ts
interface TutorMessage {                 // app TutorMessage ∪ web ChatMessage
  id: ID; conversationId: ID;
  role: 'student' | 'tutor';
  kind: 'message' | 'welcome';
  text: string;                          // markdown-lite with $…$ / $$…$$ (answers are in the language of the request)
  content: Localized;                    // web compat: { en: text, ar: text }
  imageUrl: string | null;               // signed URL of the attachment
  status: 'pending' | 'streaming' | 'complete' | 'failed' | 'blocked';
  rating: 'up' | 'down' | null;
  date: ISODate; at: ISODate;            // both names kept (app `date`, web `at`)
  citations: TutorCitation[];            // knowledge-base sources the answer was grounded on (tutor messages; [] otherwise, max 3)
}
interface TutorCitation {                // RAG source (label = title in the answer language)
  type: 'lesson' | 'unit' | 'topic' | 'question_explanation' | 'faq';
  id: ID;                                // source id (lesson / unit / topic / question / FAQ item)
  lessonId: ID | null;                   // lesson to open (lesson chunks, question explanations linked to a lesson)
  subjectId: ID | null;                  // null for FAQs
  title: string;                         // e.g. lesson title "المشتقات", "الفصل: المشتقات", "سؤال شائع: …"
}
interface ConversationSummary { id: ID; subjectId: ID; subjectSlug: SubjectSlug; title: string; lastMessagePreview: string; messageCount: number; updatedAt: ISODate; createdAt: ISODate }
interface ConversationDto extends ConversationSummary { messages: TutorMessage[] }   // newest page, chronological
```

#### AIT-01 · `GET /ai-tutor/allowance`
Auth student. → data `AiAllowance`. Used by: U AiTutor header/low-quota/lock, Dashboard tile; A tutor AllowancePill/LimitReached, home stats.

#### AIT-02 · `GET /ai-tutor/suggestions`
Auth student. Query `subjectId` (uuid|slug). → data `Localized[]` (3, from `ai_settings.suggestedPrompts[slug]`). Used by: U AiTutor suggestions, A SuggestedPrompts.

#### AIT-03 · `GET /ai-tutor/conversations`
Auth student. Query `subjectId?`, `page`, `pageSize` (default 20). → data `ConversationSummary[]` (sorted `-updatedAt`). Used by: A HistorySheet, U AiTutor (per-subject thread = newest conversation of that subject).

#### AIT-04 · `POST /ai-tutor/conversations`
Auth student. Body `{ subjectId: ID | SubjectSlug; title?: string }`. → data `ConversationDto` (with the localized welcome message,
`kind:'welcome'`). Used by: U "New chat", A new chat / first send.

#### AIT-05 · `GET /ai-tutor/conversations/:id`
Auth student. Query `before?: ISODate` (cursor for older messages), `limit?: number (default 50)`. → data `ConversationDto`. Used by: U/A open thread.

#### AIT-06 · `PATCH /ai-tutor/conversations/:id`
Auth student. Body `{ subjectId?: ID | SubjectSlug; title?: string }` (subject change only while the thread has no student messages).
→ data `ConversationSummary`. Used by: A subject chips (`setSubject`).

#### AIT-07 · `DELETE /ai-tutor/conversations/:id`
Auth student. → `OkDto`. Used by: A HistorySheet delete.

#### AIT-08 · `POST /ai-tutor/conversations/:id/messages` — **streaming**
Auth student · ent:ai · rl:ai. Body `{ text: string /*0..1200 — may be '' when attachmentFileKey is sent*/; attachmentFileKey?: FileKey /*purpose ai_attachment; requires feature flag ai_tutor_attachments*/; lang: Lang; clientMessageId?: string /*idempotent offline retries: same id → the stored pair is replayed, never asked twice*/; lessonId?: ID /*lesson the student is viewing: its knowledge-base chunks are preferred*/ }`
(`text` may be empty when an attachment is sent; server substitutes the localized "explain this image" prompt).
Checks in order: global kill switch → per-user disable → package includes AI → allowance → rate limits → blocked keywords.
Decrements allowance only on successful completion.
* **`Accept: text/event-stream`** → SSE (`Content-Type: text/event-stream`, heartbeat comment every 15 s):
  * `event: meta` `data: { studentMessage: TutorMessage; tutorMessageId: ID; allowance: AiAllowance }`
  * `event: delta` `data: { text: string }` (append)
  * `event: done` `data: { message: TutorMessage; allowance: AiAllowance }` — `message.text` is ALWAYS the full answer (clients may discard deltas)
  * `event: error` `data: { code: string; reason?: string; message: string; allowance?: AiAllowance }`
* **otherwise** (polling fallback, app when SSE unavailable) → JSON `data: { studentMessage: TutorMessage; tutorMessage: TutorMessage /*status pending*/; allowance: AiAllowance; pollAfterMs: 800 }`, then poll AIT-09.
Errors (both modes, before stream opens): 402 `AI_NOT_INCLUDED`, 403 `AI_DISABLED` / `AI_GLOBALLY_DISABLED`, 422 `AI_ALLOWANCE_EXHAUSTED` /
`AI_BLOCKED_CONTENT`, 429 `AI_RATE_LIMITED`. Retrieval (RAG): the question is embedded (cached) and a top-k cosine search over the
knowledge base (published lessons incl. transcripts, units, chapters, question explanations, FAQs — `ai_settings.retrieval` toggles; lesson notes
from the student's own notes) restricted to the conversation subject and subjects the student is entitled to (FAQs always), boosted for
`lessonId`; never explanations of questions in a live exam attempt. The sources come back in `message.citations` (`done` event / AIT-09).
Answers default to Arabic (`lang`), math in `$…$` / `$$…$$`. Safety rules prepended; flagged conversations create `ai_flags`.
Used by: U AiTutor/TutorChat/Composer/StreamingAnswer, A tutor tab/Composer.

#### AIT-09 · `GET /ai-tutor/messages/:messageId`
Auth student. → data `TutorMessage` (with partial `text` while `streaming`). Used by: A polling fallback, U reconnect.

#### AIT-10 · `POST /ai-tutor/messages/:messageId/feedback`
Auth student. Body `{ rating: 'up' | 'down' | null; comment?: string /*≤1000*/ }` (null clears). → data `TutorMessage`. Used by: U TutorChat rate, A TutorBubble thumbs.

---

## 13. Notifications (student) — `/notifications`

#### NTF-01 · `GET /notifications`
Auth student. Query `filter?: 'all' | 'unread' | NotificationType` (default all), `cursor?`, `limit?: number (default 30, max 100)`.
→ data `AppNotification[]` + meta `{ …PageMeta; unreadCount: number; counts: Record<'all' | 'unread' | NotificationType, number> }`.
Used by: U Notifications page + TopBar menu (limit 5), A notifications screen.

#### NTF-02 · `GET /notifications/unread-count`
Auth student. → data `{ unreadCount: number }`. Polled every 60 s / on focus. Used by: U Sidebar/BottomTabs/TopBar badges, A HomeHeader bell, profile.

#### NTF-03 · `POST /notifications/:id/read`
Auth student. → data `{ id: ID; read: true; unreadCount: number }`. Used by: U item click, A tap.

#### NTF-04 · `POST /notifications/read-all`
Auth student. → data `{ unreadCount: 0; updated: number }`. Used by: U "Mark all read", A mark all.

#### NTF-05 · `DELETE /notifications/:id`
Auth student. → data `{ unreadCount: number }`. Used by: A swipe-to-delete.

---

## 14. Packages, subscriptions & payments (student)

```ts
type Gateway = 'zaincash' | 'fastpay' | 'qicard' | 'asiahawala' | 'visa' | 'mock';
// web ids map: zain→zaincash, card→visa, asia→asiahawala; app mastercard→visa (card network)
// PAY-06 ACCEPTS these aliases as input (zain, card, asia, mastercard, master, qi) and stores the canonical id;
// card brands (Visa / Mastercard) are one gateway `visa`. Responses always use the canonical id.
type BillingCycle = 'monthly' | 'yearly';
// 'monthly' = the package's base plan (price + validityType/validityValue, e.g. 1 month or a fixed date);
// 'yearly'  = optional long plan (yearlyPrice, yearlyValidityDays default 365)

interface PackageComparison {           // replaces hardcoded PricingCompare ROWS / app ComparisonTable rules
  subjectsCount: number; lessons: boolean; quizzes: boolean;
  questionBank: 'subject' | 'full' | 'unlimited'; mistakes: boolean;
  examSimulator: boolean | 'unlimited'; aiQuota: number;
  pdfResources: boolean; analytics: boolean; devices: number; prioritySupport: boolean;
}
interface PackagePublic {                // website/user & app/user `Package` (+ fields)
  id: ID; name: Localized; tagline: Localized; description: Localized;
  priceMonthly: IQD;                     // base plan price
  priceYearly: IQD | null;               // null → yearly not offered (hide toggle option)
  yearlySavingPct: number | null;        // 1 − yearly/(monthly×12) as %, null if n/a
  baseValidity: { type: 'days' | 'months' | 'until_date'; value: number; validUntil: ISODate | null; days: number /*resolved*/ };
  currency: Currency;                    // 'IQD' (was Localized; label below)
  currencyLabel: Localized;              // { en: 'IQD', ar: 'د.ع' }
  subjects: SubjectSlug[];               // unchanged field (slugs)
  subjectIds: ID[];
  aiQuota: number;                       // package aiQuota ?? ai_settings.monthlyAllowance; 0 = no AI
  popular: boolean;                      // admin `featured`
  features: Localized[];
  comparison: PackageComparison;
  renewal: 'manual' | 'auto' | 'none';
  accessStart: 'immediate' | 'from_date'; accessStartDate: ISODate | null;
  order: number;
  isCurrent: boolean | null;             // optional auth
}
interface MySubscription {
  id: ID; status: 'active' | 'trial' | 'expired' | 'cancelled';
  package: PackagePublic; cycle: BillingCycle;
  startedAt: ISODate; endsAt: ISODate; daysRemaining: number; totalDays: number; remainingPct: number;
  subjects: SubjectRef[];
  aiAllowance: AiAllowance;
  renewal: 'manual' | 'auto' | 'none';
  source: 'payment' | 'manual' | 'trial';
  lastPaymentId: ID | null;
}
interface PaymentMethodDto {
  id: Gateway; kind: 'wallet' | 'card'; name: Localized; hint: Localized;
  color: string; logoUrl: string | null; enabled: boolean;
  requiresPhone: boolean;                // wallet MSISDN collected by OUR UI only for mock/redirect prefill — never PINs/cards
  flow: 'redirect' | 'deeplink' | 'mock';
  mode: 'live' | 'sandbox' | 'mock' | 'disabled'; // server env: sandbox = gateway test/staging/UAT environment (no real money)
  sandbox: boolean;                      // mode === 'sandbox' → clients show a "Sandbox / test mode" badge (EN/AR)
}
interface PriceQuote {
  packageId: ID; cycle: BillingCycle; currency: Currency;
  subtotal: IQD; discount: IQD; prorationCredit: IQD; total: IQD;
  promo: { code: string; discountType: 'percent' | 'fixed'; discountValue: number } | null;
  intent: 'new' | 'renew' | 'upgrade' | 'downgrade';
  startsAt: ISODate; endsAt: ISODate;
  baseValidityDays: number;             // validity of the purchased cycle in days (yearly → yearlyValidityDays)
}
// total = max(0, subtotal − discount − prorationCredit). prorationCredit (upgrade only) = unused value of the current
// subscription = paid total × remaining time / total time, capped at subtotal − discount. renew/downgrade start when
// the current subscription ends (no credit); new/upgrade start now (or accessStartDate when in the future).
type TxnStatus = 'initiated' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';
interface StudentPaymentDto {
  id: ID; ref: string; receiptNumber: string | null;
  status: TxnStatus; gateway: Gateway;
  package: PackageRef; cycle: BillingCycle;
  amount: IQD; discount: IQD; refundedAmount: IQD; currency: Currency; promoCode: string | null;
  createdAt: ISODate; paidAt: ISODate | null;
}
interface ReceiptDto {
  receiptNumber: string; ref: string; issuedAt: ISODate; paidAt: ISODate;
  company: { name: Localized; address: Localized; email: string };
  billedTo: { name: Localized; mobile: string };
  gateway: Gateway; gatewayName: Localized;
  lines: { description: Localized; amount: IQD }[];
  subtotal: IQD; discount: IQD; promoCode: string | null; total: IQD; refunded: IQD; currency: Currency;
  taxNote: Localized;
}
```

#### PAY-01 · `GET /packages`
Auth optional. → data `PackagePublic[]` (status active, ordered). Used by: U Landing Pricing, Pricing page (+PricingCompare), Subscription grid,
Sidebar/Dashboard package name; A subscription index (PlanCard, ComparisonTable), checkout.

#### PAY-02 · `GET /packages/:packageId`
Auth optional. → data `PackagePublic`. Used by: A checkout/success, U PaymentModal.

#### PAY-03 · `GET /subscriptions/my`
Auth student*. → data `MySubscription | null`. Used by: U Subscription hero/member card, Sidebar progress; A CurrentPlanCard, StreakPlanCard.

#### PAY-04 · `POST /payments/quote`
Auth student. Body `{ packageId: ID; cycle: BillingCycle; promoCode?: string }`. → data `PriceQuote` (proration credit for upgrades =
remaining value of the current subscription). Errors 422 `PACKAGE_UNAVAILABLE`, promo reasons. Used by: U PaymentModal summary, A checkout totals.

#### PAY-05 · `POST /promotions/validate`
Auth student · rl:public. Body `{ code: string; packageId: ID; cycle: BillingCycle }`. → data `{ valid: boolean; reason: string | null; code: string; type: 'percent' | 'fixed'; value: number; discountAmount: IQD; total: IQD; quote: PriceQuote | null; message: string | null /*localized reason*/ }`
(**200 with `valid:false`** for invalid codes so the form can show the localized `reason` message; `reason` ∈ PROMO_* + `message`).
Used by: U PaymentModal promo "Apply", A checkout promo.

#### PAY-06 · `POST /payments/initiate`
Auth student · idem · rl. Body `{ packageId: ID; cycle: BillingCycle; gateway: Gateway; promoCode?: string; walletPhone?: string; returnUrl?: string /*web*/; returnScheme?: string /*app deep link e.g. eduway://subscription/success*/ }`.
`gateway` accepts the aliases listed in §14. `returnUrl` / `returnScheme` may contain the placeholder `__ID__`; the server substitutes
the payment id. A quote with `total = 0` (promo / proration credit) is confirmed immediately. With `DEV_MOCK_PAYMENTS` (never in
production; default on only for an explicit `NODE_ENV=development`/`test`), gateways without merchant credentials are confirmed
through the MockGateway (`mock.confirmUrl` set). ZainCash, FastPay and Qi Card settle IQD only: another currency → 422
`PAYMENT_GATEWAY_DISABLED` (`details.currency`).
Creates `payments` row (`initiated` → `pending`), timeline event, quote frozen. → data:
```ts
{ paymentId: ID; ref: string; status: 'pending'; quote: PriceQuote;
  amount: IQD; currency: Currency;
  redirectUrl: string | null;            // real gateway hosted page (web: window.location; app: WebBrowser.openAuthSessionAsync)
  deeplink: string | null;               // wallet app deep link when supported
  mock: { confirmUrl: string } | null;   // non-production MockGateway: client posts PAY-07 after its existing animated sheet
  expiresAt: ISODate }
```
Card numbers, CVV, wallet PINs are **never** sent to our API. Errors 422 `PACKAGE_UNAVAILABLE` / `PAYMENT_GATEWAY_DISABLED` / promo reasons, 409 idempotency mismatch.
Used by: U PaymentModal "Pay", A checkout GatewaySheet.

#### PAY-07 · `POST /payments/mock/:paymentId/confirm`
Auth student (`DEV_MOCK_PAYMENTS` only; 404 otherwise and always in production). Only for payments made through the MockGateway
or through a gateway without credentials (dev stub); 404 for a checkout that went to a configured gateway (SEC-28).
Body `{ outcome: 'success' | 'failure' | 'cancel' }`. Server emits a signed
mock webhook into the normal webhook pipeline (WHK-01) → entitlement. → data `StudentPaymentDto`. Used by: U PaymentModal processing step, A GatewaySheet (dev).

#### PAY-08 · `GET /payments/:paymentId`
Auth student (own). → data `StudentPaymentDto & { subscription: MySubscription | null }`. Polled every 2 s (max 60 s) after redirect/mock confirm
until `paid|failed|cancelled`. Used by: U PaymentModal success step, A checkout → success screen (receipt no., `paidAt`).

#### PAY-09 · `GET /payments/my`
Auth student. Query `page`, `pageSize`. → data `StudentPaymentDto[]`. Used by: U Subscription billing history.

#### PAY-10 · `GET /payments/:paymentId/receipt`
Auth student (own) | `admin:payments.view`. Query `format?: 'json' | 'pdf'` (default json), `lang?: 'en' | 'ar'` (PDF language). → data `ReceiptDto` or PDF file
(`receipt-<receiptNumber>.pdf`, `receipt-<receiptNumber>-ar.pdf` for Arabic). PDF language = `lang` → `Accept-Language` → the payer's account language.
The Arabic PDF embeds Noto Sans Arabic (OFL, `server/assets/fonts`), shapes Arabic (fontkit `arab` shaper), orders mixed text with the Unicode Bidi
algorithm, mirrors the layout (labels right, amounts left) and uses the `ar` values of bilingual fields. Errors 409 when not paid. Used by: U Subscription download receipt, PaymentModal success;
A success "copy receipt" (json); AD TransactionDetail receipt modal.

#### PAY-11 · `GET /payments/methods`
Alias of PUB-09 (`/public/payment-methods`). Used by: A checkout.

---

## 15. Webhooks

#### WHK-01 · `POST /payments/webhook/:provider`
Auth public (signature) · rl:webhook. Path `provider: Gateway`. Raw body + provider signature header (`X-Signature` / provider-specific),
verified by the `PaymentProvider` implementation (`MockGateway` HMAC with `MOCK_GATEWAY_SECRET`). Idempotent on the provider event id
(stored in `payment_events` with `idempotencyKey`; duplicates recorded with `duplicate=true` and **never** re-grant access).
Header `X-Signature: sha256=<hex HMAC-SHA256 of the raw body>`; body `{ id /*event id*/; type: 'payment.succeeded' | 'payment.failed' | 'payment.cancelled';
data: { paymentId | providerRef; amount; currency? }; created?: number | ISODate }`. SEC-24: a success **must** carry `amount`; without
it the event is recorded as rejected, the payment stays pending and the event id is not consumed (a later delivery with the amount can
still settle it). An amount different from the payment total, or a `currency` different from the payment currency (IQD), never grants
access (payment → failed). `created` (unix seconds/ms or ISO; covered by the HMAC) must be within ±5 min of server time — required for
the hosted AsiaHawala / Visa adapters, checked when present for the MockGateway; a stale event → 401 `SIGNATURE_INVALID`. On `payment.succeeded`: payment `paid`, receipt issued, subscription + entitlements created/extended (`entitlement_logs`), promotion
`used+1`, attribution snapshot (school/marketer) stored, AI allowance reset (billing cycle), student notification + push.
→ `200 { success: true, data: { received: true, duplicate: boolean } }`; 401 on bad signature. Used by: gateways / MockGateway.
Real gateways (docs/PROVIDERS.md): **FastPay** IPN and **Qi Card** notifications are unsigned / optionally RSA-signed, so the server
re-reads the payment from the gateway API (FastPay `validate`, Qi `status`) and applies only the gateway-confirmed result (event id
`<gateway>:<txId>:<status>`, with the gateway-reported amount and currency); a notification the gateway does not confirm → 401.

#### WHK-04 · `GET|POST /payments/callback/:provider`
Auth public · rl:webhook. Browser return from a hosted payment page: ZainCash (`?token=<JWT signed with the merchant secret>`), Qi Card
finish URL (`?ref=<payment ref>`), FastPay return (`?order_id=`). The result is verified with the gateway (JWT signature + status API),
applied through the same idempotent pipeline as WHK-01 (a ZainCash token whose `iat` is more than 1 h away from server time → 401),
then → `302` to the payment's `returnScheme` / `returnUrl` (only app schemes or
our own web origins) with `paymentId` + `status` query params, else `USER_APP_URL/subscription`. 401 when verification fails; 404 when the
gateway is not configured. Used by: ZainCash / Qi / FastPay hosted pages.

#### WHK-02 · `POST /webhooks/video/:provider`
Auth public (signature). Transcoding callbacks → `video_assets.streamStatus/cdnStatus/duration/renditions`, lesson `videoState`.
→ `{ received: true }`. Used by: video pipeline.

#### WHK-03 · `POST /webhooks/notifications/:provider`
(Body: one event, an array, or `{ events: [] }`; event = `{ providerMessageId? | messageId? | deliveryId?; status: 'sent' | 'delivered' | 'failed'; error? }`. Signature: header `X-Signature` = hex HMAC-SHA256(raw body, `NOTIFICATION_WEBHOOK_SECRET`), required in every environment; without a secret every receipt → 401, unless `DEV_UNSIGNED_NOTIFICATION_WEBHOOKS=true` (dev only, never in production). Only deliveries sent through `:provider` are updated (`twilio` also matches `twilio-whatsapp`) (SEC-25). → `{ received: true, updated: number }`. Expo push receipts are pulled by the `eduway.expo-push-receipts` job instead.)
Auth public (signature). Delivery receipts (SMS/WhatsApp/email/Expo receipts job) → `notification_deliveries.status/error`. → `{ received: true }`.

---

## 16. Storage — `/storage`

Signed-URL upload flow (all media):
1. `POST /storage/signed-upload-url` → `{ uploadUrl, method, headers, fileKey }`.
2. Client uploads bytes directly to Supabase Storage (`PUT uploadUrl`, XHR/`fetch` with progress events; resumable TUS allowed for
   `lesson_video` via `tusEndpoint`).
3. Client calls the owning endpoint with `fileKey` (e.g. `POST /admin/videos`, `PATCH /admin/lessons/:id { thumbnailFileKey }`,
   `POST /admin/questions/import`). The server validates the object exists, size/type, moves it to its final path and returns signed GET URLs.

| purpose | bucket | max size | types | auth |
|---|---|---|---|---|
| `lesson_video` | `eduway-platform-videos` | 5 GB | video/* | `admin:content.edit` or `content.create` |
| `lesson_thumbnail`, `subject_image`, `teacher_avatar`, `testimonial_avatar`, `logo`, `admin_avatar` | `eduway-platform-thumbnails` | 5 MB (logo 2 MB) | image/png, jpeg, webp, svg+xml(logo) | admin (relevant module edit) / admin self |
| `student_avatar` | `eduway-platform-thumbnails` (`avatars/`) | 5 MB | image/* | student |
| `lesson_resource` | `eduway-platform-resources` | 50 MB | application/pdf | `admin:content.edit` |
| `lesson_captions` | `eduway-platform-resources` | 2 MB | text/vtt, application/x-subrip (.srt converted to .vtt) | `admin:content.edit` |
| `ai_attachment` | `eduway-platform-resources` (`ai/`) | 8 MB | image/* | student |
| `question_image` | `eduway-platform-question-images` | 5 MB | image/* | `admin:questions.create` or `questions.edit` |
| `question_import` | `eduway-platform-resources` (`imports/`) | 10 MB | .csv, .xlsx, .xls | `admin:questions.create` |
| `reconciliation_import` | `eduway-platform-resources` (`reconciliation/`) | 20 MB | .csv, .xlsx | `admin:payments.approve` |

#### STO-01 · `POST /storage/signed-upload-url`
Auth student|admin (per purpose). Body `{ purpose: UploadPurpose; fileName: string; contentType: string; sizeBytes: number }`.
→ data `{ uploadUrl: string; method: 'PUT'; headers: Record<string, string>; fileKey: FileKey; expiresAt: ISODate; tusEndpoint: string | null }`.
Errors 400 (type/size), 403. Used by: AD FileUpload (subject image, lesson thumbnail/video/captions/resources, question image, logo,
BulkImport), A edit-profile avatar (optional upload), A tutor Composer attachment, U Profile change photo.

#### STO-02 · `POST /storage/signed-download-url`
Auth student|admin. Body `{ fileKey: FileKey }`. Only for files the caller may access (owner, entitlement, or admin permission).
→ data `{ url: string; expiresAt: ISODate }`. Used by: any client re-signing an expired URL.

---

## 17. Search — `/search`

#### SRC-01 · `GET /search`
Auth student|admin · rl:search. Query `q: string (min 2)`, `scopes?: string[]` (repeat the param or comma-separated), `limit?: number (default 5, max 20 per scope)`.
Scopes by audience:
* student: `lessons` (default), `subjects`, `questions` (entitled subjects only);
* admin: `students` (`users.view`), `lessons` (`content.view`), `questions` (`questions.view`), `schools` (`schools.view`),
  `marketers` (`marketers.view`), `transactions` (`payments.view`), `admins` (`security.view`). Scopes without permission are silently omitted.
→ data:
```ts
{ lessons?: { id: ID; title: Localized; subjectSlug: SubjectSlug; subjectName: Localized; status?: string /*admin only*/; thumbnail: string }[];
  subjects?: SubjectRef[];
  questions?: { id: ID; code: string; text: Localized; subjectSlug: SubjectSlug }[];
  students?: { id: ID; name: Localized; mobile: string; avatarUrl: string | null }[];
  schools?: SchoolRef[]; marketers?: MarketerRef[];
  transactions?: { id: ID; ref: string; studentName: Localized; amount: IQD; status: TxnStatus }[];
  admins?: { id: ID; name: Localized; email: string }[] }
```
Used by: U TopBar SearchBox (lessons, top 6), AD CommandPalette (students, lessons).

---

# Admin API (`/admin/*`, audience `eduway-admin`)

Every route below requires an admin token; the permission listed is enforced server-side (Super Admin bypasses). Route guards in the
admin UI use `<module>.view`; the server additionally enforces the action permission on each mutation.

## 18. Admin — me, profile & inbox — `/admin/me`

```ts
interface AdminUserDto {               // admin `AdminUser` (name/name_ar → name: Localized)
  id: ID; name: Localized; email: string; mobile: string | null;
  roleId: ID; role: { id: ID; key: string; name: Localized };
  avatarUrl: string | null; mfaEnabled: boolean;
  status: 'active' | 'invited' | 'deactivated';
  lastLogin: ISODate | null; createdAt: ISODate;
}
interface RoleDto {
  id: ID; key: string; name: Localized; description: Localized;
  system: boolean;                       // super_admin & seeded roles; super_admin is immutable
  permissions: PermissionMatrix;
  createdAt: ISODate; updatedAt: ISODate;
  assignedAdmins: { id: ID; name: Localized; avatarUrl: string | null }[];   // non-deactivated, max 8
  assignedCount: number;
  grantedCount: number;                  // true cells (coverage = grantedCount / 84)
}
interface MeAdminDto {
  admin: AdminUserDto;
  role: RoleDto;                         // UI reads role.permissions[module][action]
  permissions: PermissionKey[];          // flat form (ENGINEERING §3)
  roles: string[];                       // [role.key] (one role per admin)
  preferences: { language: Lang; theme: 'light' | 'dark' | 'system'; emailAlerts: boolean /* default true */ };
  unreadNotifications: number;
}
interface AdminInboxNotification {
  id: ID; title: Localized; body: Localized; at: ISODate; read: boolean;
  href: string;                          // admin route, e.g. '/payments/refunds'
  kind: 'info' | 'warning' | 'success' | 'danger';
}
```

#### ADM-ME-01 · `GET /admin/me`
Auth admin. → data `MeAdminDto` (same as AUTH-07 for admin tokens). Used by: AD app boot, Topbar user menu, Profile, Sidebar gating.

#### ADM-ME-02 · `PATCH /admin/me`
Auth admin. Body `{ name?: Localized /*each min 3*/; email?: string; mobile?: string /*^\+964\s?7\d{2}\s?\d{3}\s?\d{4}$*/; avatarFileKey?: FileKey | null }`.
Email change → verification email; stays old until confirmed. → data `AdminUserDto`. `audit:admin.update_profile`. Used by: AD Profile details.

#### ADM-ME-03 · `POST /admin/me/password`
Auth admin. Body `{ currentPassword: string; newPassword: string }` (policy ≥10, upper, lower, digit, symbol; ≠ current).
Revokes the admin's other sessions. → `OkDto`. Errors 401 wrong current, 422 `PASSWORD_POLICY`. `audit:admin.change_password`. Used by: AD Profile.

#### ADM-ME-04 · `PATCH /admin/me/preferences`
Auth admin. Body `{ language?: Lang; theme?: 'light' | 'dark' | 'system'; emailAlerts?: boolean }`. → data `MeAdminDto['preferences']`.
`emailAlerts=false` stops admin-alert emails (new support ticket, export ready, reconciliation issues); security emails are
always sent. Used by: AD Profile preferences, LanguageSwitcher, theme toggle.

#### ADM-ME-05 · `GET /admin/me/sessions`
Auth admin. → data `AdminSessionDto[]` (own; §32). Used by: AD Profile (optional own sessions list).

#### ADM-ME-06 · `GET /admin/me/notifications`
Auth admin. Query `unread?: boolean`, `limit?: number (default 20)`, `cursor?`. → data `AdminInboxNotification[]` + meta `{ unreadCount }`.
Generated server-side per permission (lessons awaiting review, pending refunds, security alerts, backups, tier reached, import done, contact tickets).
Polled every 60 s. Used by: AD Topbar bell.

#### ADM-ME-07 · `POST /admin/me/notifications/:id/read`
Auth admin. → data `{ unreadCount: number }`. Used by: AD Topbar item click.

#### ADM-ME-08 · `POST /admin/me/notifications/read-all`
Auth admin. → data `{ unreadCount: 0 }`. Used by: AD Topbar "Mark all read".

#### ADM-ME-09 · `GET /admin/lookups`
Auth admin. → data `{ governorates: Governorate[]; subjects: SubjectRef[]; units: (UnitRef & { subjectId: ID })[]; topics: TopicRef[]; packages: (PackageRef & { status: string })[]; schools: (SchoolRef & { marketerId: ID | null; status: string })[]; marketers: (MarketerRef & { status: string })[]; teachers: (TeacherRef & { subjectId: ID })[]; admins: AdminRef[]; roles: { id: ID; key: string; name: Localized }[]; gateways: { id: Gateway; name: Localized; color: string }[]; aiModels: Record<'openai' | 'anthropic' | 'azure', { value: string; label: string }[]> }`.
One cached call for all filter dropdowns / name resolution (replaces `store/core.ts` lookups). Used by: every admin page with selects.

---

## 19. Admin — dashboard & support tickets

#### ADM-DSH-01 · `GET /admin/dashboard`
Auth `admin:dashboard.view`. Query `from`, `to` (global range; affects `dau` and `registrationsByGovernorate` only).
Sections the caller lacks module permission for are returned as `null`. → data:
```ts
interface AdminDashboardDto {
  kpis: {
    totalStudents: Kpi;             // spark = cumulative students at end of each of last 12 months
    activeSubscriptions: Kpi & { pctOfTotal: number };   // delta = this month paid subs vs last month
    revenueThisMonth: Kpi;          // net (amount − refunded) of paid|partially_refunded, IQD; spark 12 months
    newRegistrations7d: Kpi;        // spark = 14 daily values
    publishedLessons: Kpi & { totalLessons: number };
    quizAttempts7d: Kpi;            // spark 14 days
    aiQuestionsMonth: Kpi;          // MTD vs previous month same span; spark daily current month
    openIssues: Kpi & { pending: number };   // support tickets; spark = open count at end of last 9 weeks
  };
  monthly: { month: string /*yyyy-MM*/; revenue: IQD; subs: number; regs: number }[];   // 12
  packageDistribution: { packageId: ID | null; name: Localized; value: number; color: string }[];  // incl. "No package", zeros dropped
  dau: { date: DateOnly; dau: number }[];
  registrationsByGovernorate: { governorateId: string; name: Localized; registrations: number }[];  // top 8
  weakestTopics: { topicId: ID; name: Localized; accuracy: number; color: string /*subject color*/ }[]; // 6
  topSchools: { id: ID; name: Localized; tier: string; verifiedPaidStudents: number }[];   // 5
  topMarketers: { id: ID; name: Localized; avatarUrl: string | null; paidStudents: number; pendingReward: IQD }[];  // 5
  pendingReview: { id: ID; title: Localized; subject: SubjectRef; updatedAt: ISODate }[];   // lessons in_review, -updatedAt, max 10
  pendingReviewCount: number;
  recentPayments: { id: ID; ref: string; student: StudentRef; package: PackageRef; amount: IQD; currency: Currency; status: TxnStatus; createdAt: ISODate }[]; // 6
}
```
Used by: AD Dashboard (all cards/charts/panels). "Approve" in Pending review → ADM-LSN-07.

#### ADM-DSH-02 · `GET /admin/system/health`
Auth `admin:dashboard.view`. → data `{ status: 'operational' | 'degraded' | 'down'; uptime30d: number; errorRate24h: number; apiP95Ms: number; lastBackup: ISODate | null; backupSizeGb: number | null; services: { key: 'api' | 'video' | 'payments' | 'sms' | 'ai' | 'db' | 'storage' | 'queue'; name: Localized; status: 'operational' | 'degraded' | 'down'; latencyMs: number | null }[] }`.
Built from HLT-02 checks + request metrics. Used by: AD Dashboard System health.

#### ADM-SUP-01 · `GET /admin/support-tickets`
Auth `admin:users.view`. Query `status?: 'open' | 'pending' | 'resolved'`, `category?`, `priority?`, `source?: 'contact_form' | 'app' | 'admin'`,
`assigneeId?: ID | '__none'`, `studentId?: ID`, `q?` (number, subject, message, student name/phone, contact name/value), `page`, `pageSize`,
`sort` ∈ `createdAt|updatedAt|priority|status|number` (default `-createdAt`).
→ data `SupportTicketDto[]` = `{ id: string /*EW-T-NNNNN*/; student: StudentRef | null; contact: { name: string; contact: string } | null; subject: Localized; message: string; category: 'payment' | 'access' | 'video' | 'content' | 'account'; priority: 'low' | 'medium' | 'high'; status: 'open' | 'pending' | 'resolved'; assignee: AdminRef | null; source: 'contact_form' | 'app' | 'admin'; locale: Lang; replies: number /*admin replies*/; resolvedAt: ISODate | null; createdAt: ISODate; updatedAt: ISODate }`
+ meta `{ …PageMeta; counts: { open: number; pending: number; resolved: number } }` (same filters, status ignored).
`status` meaning: `open` = waiting for the team, `pending` = answered, waiting for the requester, `resolved` = closed.
Used by: AD Support tickets page (`/support`: tabs, filters, KPI cards), Dashboard open-issues card link.

#### ADM-SUP-02 · `PATCH /admin/support-tickets/:id`
Auth `admin:users.edit`. Body `{ status?; priority?; assigneeId?: ID | null }` (`assigneeId` must be an admin user, else 400). `resolvedAt` is set when
the status becomes `resolved` and cleared when it leaves it. → `SupportTicketDto`. `audit:support_ticket.update`. Used by: AD Support list menu + ticket drawer.

#### ADM-SUP-03 · `GET /admin/support-tickets/:id`
Auth `admin:users.view`. `:id` = ticket number or uuid. → `SupportTicketDetailDto = SupportTicketDto & { messages: { id: ID; authorKind: 'student' | 'admin' | 'system'; author: AdminRef | null; body: string; createdAt: ISODate }[] }`
(thread after the original `message`, oldest first). Used by: AD ticket drawer (opened by row click or `/support?ticket=<number>`, the admin-inbox link of a new ticket).

#### ADM-SUP-04 · `POST /admin/support-tickets/:id/replies`
Auth `admin:users.edit`. Body `{ body: string /*2..4000*/; status?: 'open' | 'pending' | 'resolved' }`. Appends an `admin` message, sets the status
(default `pending`; a resolved ticket stays resolved unless `status` says otherwise) and assigns the ticket to the replying admin when unassigned.
Registered students are notified (in_app + push, template type `support_message`, vars `support_message`, `ticket_id`); contact-form tickets have no
account, so the reply is stored and the agent answers through the contact shown on the ticket. → 201 `SupportTicketDetailDto`. `audit:support_ticket.reply`.

#### ADM-SUP-05 · `DELETE /admin/support-tickets/:id`
Auth `admin:users.delete`. Hard delete (thread cascades; the ticket's admin-inbox items are removed). For spam/test tickets — real tickets are resolved.
→ `OkDto`. `audit:support_ticket.delete`.

#### ADM-SUP-06 · `POST /admin/support-tickets/export`
Auth `admin:users.export`. Body `ExportRequest` (`filters` = ADM-SUP-01 query). Columns: ticket, created, status, priority, category, source, subject,
requester, contact, assignee, replies, resolved_at, message.

---

## 20. Admin — students (users module) — `/admin/students`

```ts
type SubscriptionStatus = 'active' | 'expired' | 'trial' | 'none' | 'cancelled';
type AcquisitionSource = 'organic' | 'school' | 'marketer' | 'referral' | 'campaign';
interface AdminStudentRow {
  id: ID; name: Localized; mobile: string; email: string | null; avatarUrl: string | null;
  gender: 'male' | 'female' | null;
  governorateId: string; governorate: Governorate;
  schoolId: ID | null; school: SchoolRef | null; schoolName: string | null;   // free-text school when unverified
  packageId: ID | null; package: PackageRef | null;
  subscriptionStatus: SubscriptionStatus; subscriptionExpiresAt: ISODate | null;
  source: AcquisitionSource; referralCode: string | null;
  marketerId: ID | null; marketer: MarketerRef | null;
  locked: boolean; lockedReason: string | null;
  platforms: Platform[];                 // platforms with active sessions
  lastActive: ISODate | null; createdAt: ISODate;
}
interface AdminStudentDetail extends AdminStudentRow {
  progress: number; avgScore: number;
  aiQuestionsUsed: number; aiAllowance: AiAllowance;      // replaces hardcoded 100
  aiDisabled: boolean;
  lifetimeValue: IQD;                    // Σ(amount − refunded) of paid|partially_refunded
  packageDetail: { id: ID; name: Localized; subjectIds: ID[]; validityType: 'days' | 'months' | 'until_date'; validityValue: number; validityDays: number } | null;
  entitlements: Entitlement[];
  otp: { failures: number; locked: boolean; lockedUntil: ISODate | null };
  counts: { transactions: number; sessions: number; notes: number };
  memberSince: ISODate;
}
interface StudentActivityDto {
  watch: { id: ID; lessonId: ID; lessonTitle: Localized; subject: SubjectRef; watchedSec: number; durationSec: number; completed: boolean; at: ISODate }[];
  quizzes: { id: ID; lessonId: ID; lessonTitle: Localized; correct: number; total: number; score: number; passed: boolean; at: ISODate }[];
  exams: { id: ID; title: Localized; score: number; durationMin: number; status: 'passed' | 'failed' | 'abandoned' | 'in_progress'; at: ISODate }[];
  aiDaily: { date: DateOnly; questions: number }[];        // last `days`
  aiRecent: { id: ID; subject: SubjectRef; text: Localized; at: ISODate }[];
}
```

#### ADM-STU-01 · `GET /admin/students`
Auth `admin:users.view`. Query: `q` (name en/ar, mobile, id, email, referralCode), `status?: SubscriptionStatus | 'locked'`, `packageId?` (`__none`),
`governorateId?`, `schoolId?` (`__none`), `marketerId?` (`__none`), `source?`, `platform?: Platform`, `createdFrom?`, `createdTo?`,
`lastActiveBefore?` (ISO), `sort` ∈ `name|mobile|createdAt|lastActive|subscriptionStatus` (default `-createdAt`), `page`, `pageSize`.
→ data `AdminStudentRow[]`. Used by: AD UsersList.

#### ADM-STU-02 · `GET /admin/students/stats`
Auth `admin:users.view`. → data `{ total: number; active: number; trial: number; expired: number; cancelled: number; none: number; locked: number; byPlatform: Record<Platform, number> }`.
(Unfiltered counts.) Used by: AD UsersList stat cards.

#### ADM-STU-03 · `POST /admin/students/export`
Auth `admin:users.export`. Body `ExportRequest`. Columns: `id, name_en, name_ar, mobile, governorate, school, package, status, locked, source, referralCode, platforms, lastActive, created`.
Used by: AD UsersList toolbar export + bulk "Export selected" (`ids`).

#### ADM-STU-04 · `POST /admin/students/bulk/lock`
Auth `admin:users.edit`. Body `{ ids: ID[]; reason: string }`. Locks + revokes all sessions/push tokens. → `BulkResult`. `audit:student.bulk_lock`. Used by: AD UsersList bulk lock.

#### ADM-STU-05 · `POST /admin/students/bulk/unlock`
Auth `admin:users.edit`. Body `{ ids: ID[]; reason?: string }`. → `BulkResult`. `audit:student.bulk_unlock`. Used by: AD UsersList bulk unlock.

#### ADM-STU-06 · `GET /admin/students/:id`
Auth `admin:users.view`. → data `AdminStudentDetail`. Used by: AD UserDetail header/identity/metrics/OverviewTab.

#### ADM-STU-07 · `POST /admin/students/:id/lock`
Auth `admin:users.edit`. Body `ReasonBody`. Locks, revokes sessions. → `AdminStudentDetail`. `audit:student.lock` (`student.block` when called
from security alerts). Used by: AD UserDetail header, ActionsTab, AiAbuseControls block.

#### ADM-STU-08 · `POST /admin/students/:id/unlock`
Auth `admin:users.edit`. Body `ReasonBody` (reason optional from AI abuse page). → `AdminStudentDetail`. `audit:student.unlock`. Used by: same as ADM-STU-07.

#### ADM-STU-09 · `GET /admin/students/:id/sessions`
Auth `admin:users.view`. → data `SessionDto[]` (platform web/ios/android). Used by: AD SessionsTab.

#### ADM-STU-10 · `DELETE /admin/students/:id/sessions/:sessionId`
Auth `admin:users.edit`. Revokes refresh tokens + push token of that session. → `OkDto`. `audit:student.force_logout`. Used by: AD SessionsTab force logout.

#### ADM-STU-11 · `DELETE /admin/students/:id/sessions`
Auth `admin:users.edit`. Body `{ reason?: string }`. → data `{ revoked: number }`. `audit:student.logout_all`. Used by: AD SessionsTab "Log out all".

#### ADM-STU-12 · `GET /admin/students/:id/notes`
Auth `admin:users.view`. → data `NoteDto[]` (newest first). Used by: AD NotesTab.

#### ADM-STU-13 · `POST /admin/students/:id/notes`
Auth `admin:users.edit`. Body `{ body: string /*3..4000*/ }`. Author from token. → data `NoteDto`. `audit:student.add_note`. Used by: AD NotesTab.

#### ADM-STU-14 · `POST /admin/students/:id/entitlements`
Auth `admin:users.edit` · idem. Body `{ subjectId: ID; days: number /*1..365; UI 7|14|30|60|90*/; reason: string /*min 5*/ }`.
Replaces any existing **manual** entitlement for the subject (package ones kept); writes `entitlement_logs`. → data `Entitlement[]` (all of the student).
`audit:student.grant_access`. Used by: AD ActionsTab manual access grant.

#### ADM-STU-15 · `DELETE /admin/students/:id/entitlements/:entitlementId`
Auth `admin:users.edit`. Body `{ reason?: string }`. Only `source='manual'` (422 `INVALID_TRANSITION` otherwise). → data `Entitlement[]`.
`audit:student.revoke_access`. Used by: AD OverviewTab entitlement revoke.

#### ADM-STU-16 · `GET /admin/students/:id/entitlement-logs`
Auth `admin:users.view`. → data `{ id: ID; action: 'grant' | 'revoke' | 'extend' | 'expire'; subject: SubjectRef; source: 'package' | 'manual' | 'payment' | 'refund'; days: number | null; reason: string | null; actor: AdminRef | null; at: ISODate }[]`.
Used by: AD OverviewTab (entitlement history, optional), spec requirement.

#### ADM-STU-17 · `PATCH /admin/students/:id/attribution`
Auth `admin:users.edit`. Body `{ schoolId: ID | null; referralCode: string | null; reason: string }`. Server derives `marketerId`
(school's marketer, else existing) and `source` (`school` if school; else per referral code kind; else unchanged); validates the code.
Applies to **future** attribution only. → data `AdminStudentDetail`. Errors 422 `REFERRAL_CODE_INVALID`. `audit:student.change_attribution`.
Used by: AD ActionsTab attribution.

#### ADM-STU-18 · `POST /admin/students/:id/otp/reset`
Auth `admin:users.edit`. Clears OTP failures/lockout. → data `{ failures: 0; locked: false }`. `audit:student.reset_otp`. Used by: AD ActionsTab Reset OTP.

#### ADM-STU-19 · `GET /admin/students/:id/activity`
Auth `admin:users.view`. Query `limit?: number (default 20 per list)`, `days?: number (default 14, aiDaily window)`. → data `StudentActivityDto`
(`passed` uses the effective quiz rule threshold). Used by: AD ActivityTab.

#### ADM-STU-20 · `GET /admin/students/:id/transactions`
Auth `admin:users.view` + `payments.view` for row links. Query `page`, `pageSize` (10), `sort` (default `-createdAt`). → data `TransactionRow[]` (§25).
Used by: AD PaymentsTab.

#### ADM-STU-21 · `PATCH /admin/students/:id`
Auth `admin:users.edit`. Body `{ name?: Localized; email?: string | null; gender?; governorateId?; schoolName?: string | null }`. → `AdminStudentDetail`.
`audit:student.update`. (implied: spec "get/update" — no UI form yet.)

---

## 21. Admin — content (`content` module)

```ts
interface AdminSubject {
  id: ID; slug: SubjectSlug /*admin `key`*/; name: Localized; tagline: Localized; description: Localized;
  color: string; icon: string; imageUrl: string | null;
  order: number; status: 'active' | 'hidden'; sequentialUnlock: boolean;
  stats: { units: number; topics: number; lessons: number; published: number; publishedPct: number; questions: number };
  createdAt: ISODate; updatedAt: ISODate;
}
interface AdminTopic { id: ID; unitId: ID; name: Localized; order: number; lessonCount: number }
interface AdminUnit { id: ID; subjectId: ID; name: Localized; order: number; topicCount: number; lessonCount: number; topics: AdminTopic[] }
type ContentStatus = 'draft' | 'in_review' | 'approved' | 'scheduled' | 'published' | 'archived';
type VideoState = 'none' | 'uploading' | 'processing' | 'ready' | 'failed';
interface LessonVersion { id: ID; version: number; author: AdminRef; note: string; status: ContentStatus; createdAt: ISODate }
interface AdminLessonResource { id: ID; name: string /*file name*/; title: Localized; sizeKb: number; pages: number | null; mimeType: string; url: string /*signed*/ }
interface AdminLesson {
  id: ID; subjectId: ID; unitId: ID; topicId: ID;
  subject: SubjectRef; unit: UnitRef; topic: TopicRef;
  title: Localized; description: Localized;
  teacherId: ID; teacher: TeacherRef;
  order: number; durationSec: number;
  thumbnailUrl: string | null;
  videoState: VideoState;
  video: { id: ID; assetId: string; streamStatus: 'ready' | 'processing' | 'failed'; fileName: string | null; sizeMb: number; renditions: string[] } | null;
  captions: string | null;               // caption file name (admin field kept)
  captionTracks: { lang: Lang; fileName: string; url: string }[];
  resources: AdminLessonResource[];
  completionThreshold: number;           // 10..100 step 5
  prerequisiteId: ID | null;
  status: ContentStatus; publishAt: ISODate | null;
  views: number;
  versions: LessonVersion[];             // newest first (detail only; list returns [])
  createdAt: ISODate; updatedAt: ISODate;
}
interface LessonWriteDto {
  title: Localized /*each min 3*/; description?: Localized;
  subjectId: ID; unitId: ID; topicId: ID; teacherId: ID; order?: number /*≥1*/;
  thumbnailFileKey?: FileKey | null;     // null clears
  durationSec?: number;                  // 30..14400; auto-filled from video probe when ready
  captions?: { lang?: Lang /*default 'ar'*/; fileKey: FileKey }[] | null;   // null removes all
  completionThreshold?: number; prerequisiteId?: ID | null;
  versionNote?: string;                  // optional note; default per transition ("Content updated")
}
interface VideoAssetDto {
  id: ID; assetId: string; lessonId: ID; lesson: { id: ID; title: Localized; subject: SubjectRef };
  fileName: string | null; sizeMb: number; durationSec: number;
  streamStatus: 'ready' | 'processing' | 'failed'; cdnStatus: 'synced' | 'pending' | 'error';
  processingProgress: number | null;     // 0-100 while processing
  error: string | null;
  views: number; replays: number;
  resolution: '720p' | '1080p' | '4K'; renditions: string[];
  uploadedAt: ISODate;
}
```

### 21.1 Subjects

#### ADM-SUB-01 · `GET /admin/subjects`
Auth `admin:content.view`. Query `status?`, `q?`. → data `AdminSubject[]` (ordered by `order`). Used by: AD Subjects, Units tabs, filters everywhere.

#### ADM-SUB-02 · `POST /admin/subjects`
Auth `admin:content.create`. Body `{ name: Localized /*min 2*/; slug: string /*required, ^[a-z0-9-]{2,40}$, unique*/; color: string /*#RRGGBB*/; icon?: string; imageFileKey?: FileKey | null; order?: number; status: 'active' | 'hidden'; sequentialUnlock: boolean; tagline?: Localized; description?: Localized }`.
→ data `AdminSubject`. Errors 409 slug taken. `audit:subject.create`. Used by: AD Subjects drawer (key preset → slug).

#### ADM-SUB-03 · `GET /admin/subjects/:id`
Auth `admin:content.view`. → `AdminSubject`.

#### ADM-SUB-04 · `PATCH /admin/subjects/:id`
Auth `admin:content.edit`. Body partial of ADM-SUB-02 (incl. `sequentialUnlock` toggle). → `AdminSubject`. `audit:subject.update`
(summary "Enabled/Disabled sequential unlock for X" when only that changed). Used by: AD Subjects drawer edit, card menu toggle.

#### ADM-SUB-05 · `DELETE /admin/subjects/:id`
Auth `admin:content.delete`. Errors 409 `HAS_DEPENDENTS` (units or lessons). → `OkDto`. `audit:subject.delete`. Used by: AD Subjects delete.

#### ADM-SUB-06 · `PUT /admin/subjects/order`
Auth `admin:content.edit`. Body `{ ids: ID[] }` (full ordered list). → `AdminSubject[]`. `audit:subject.reorder`. (spec reorder; UI uses `order` field.)

### 21.2 Units & topics

#### ADM-UNT-01 · `GET /admin/subjects/:id/units`
Auth `admin:content.view`. → data `AdminUnit[]` (with topics & counts). Used by: AD Units, LessonForm placement selects.

#### ADM-UNT-02 · `POST /admin/subjects/:id/units`
Auth `admin:content.create`. Body `{ name: Localized /*min 2*/ }` (order = last+1). → `AdminUnit`. `audit:unit.create`. Used by: AD Units add.

#### ADM-UNT-03 · `PATCH /admin/units/:id`
Auth `admin:content.edit`. Body `{ name: Localized }`. → `AdminUnit`. `audit:unit.update`.

#### ADM-UNT-04 · `DELETE /admin/units/:id`
Auth `admin:content.delete`. 409 `HAS_DEPENDENTS` if lessons; deletes topics; renumbers. → `OkDto`. `audit:unit.delete`.

#### ADM-UNT-05 · `PUT /admin/subjects/:id/units/order`
Auth `admin:content.edit`. Body `{ ids: ID[]; movedId?: ID }`. → `AdminUnit[]`. `audit:unit.reorder`. Used by: AD Units drag-drop / order input.

#### ADM-TOP-01 · `POST /admin/units/:id/topics`
Auth `admin:content.create`. Body `{ name: Localized }`. → `AdminTopic`. `audit:topic.create`.

#### ADM-TOP-02 · `PATCH /admin/topics/:id`
Auth `admin:content.edit`. Body `{ name: Localized }`. → `AdminTopic`. `audit:topic.update`.

#### ADM-TOP-03 · `DELETE /admin/topics/:id`
Auth `admin:content.delete`. 409 `HAS_DEPENDENTS` if lessons (or questions — `details.questions`). → `OkDto`. `audit:topic.delete`.

#### ADM-TOP-04 · `PUT /admin/units/:id/topics/order`
Auth `admin:content.edit`. Body `{ ids: ID[]; movedId?: ID }`. → `AdminTopic[]`. `audit:topic.reorder`.

### 21.3 Teachers

#### ADM-TCH-01 · `GET /admin/teachers`
Auth `admin:content.view`. Query `subjectId?`, `active?`. → data `TeacherDto[]`. Used by: AD Lessons teacher filter, LessonForm teacher select.

#### ADM-TCH-02 · `POST /admin/teachers` · ADM-TCH-03 `PATCH /admin/teachers/:id` · ADM-TCH-04 `DELETE /admin/teachers/:id`
Auth `admin:content.create|edit|delete`. Body `{ name: Localized; bio?: Localized; avatarFileKey?: FileKey | null; subjectId: ID; yearsExperience?: number | null; studentsCount?: number | null; rating?: number | null; active?: boolean }`.
→ `AdminTeacherDto = TeacherDto & { lessonsCount: number }` (ADM-TCH-01 rows carry `lessonsCount` too). Delete 409 `HAS_DEPENDENTS` (`details.count`)
when lessons reference the teacher — deactivate (`active: false`) instead. `audit:teacher.*`. Used by: AD Content › Teachers (list, drawer form with
`teacher_avatar` signed upload, activate/deactivate, delete); feeds About page (PUB-08 lists active teachers).

### 21.4 Lessons & workflow

#### ADM-LSN-01 · `GET /admin/lessons`
Auth `admin:content.view`. Query: `q` (title en/ar, id), `subjectId?`, `unitId?`, `topicId?`, `status?: ContentStatus | ContentStatus[]`, `teacherId?`,
`excludeArchived?: boolean`, `withoutQuizOverride?: boolean`, `view?: 'table' | 'board' | 'options'` (board/options = lightweight projection
`{ id, title, subject, unit, teacher, durationSec, status, publishAt, updatedAt, order }`), `sort` ∈ `title|subject|order|durationSec|views|status|publishAt|updatedAt`
(default subject.order then lesson order), `page`, `pageSize` (board/options allow `pageSize` up to 1000). Unknown `sort` keys are ignored (default order).
→ data `AdminLesson[]` (versions `[]`) + meta `{ …PageMeta; counts: Record<ContentStatus, number> }`. Board/options items:
`{ id, title, subjectId, subject: SubjectRef, unit: UnitRef, topic: TopicRef, teacherId, teacher: TeacherRef, durationSec, status, publishAt, updatedAt, order }`.
Used by: AD Lessons table, ContentWorkflow board, LessonForm prerequisite options, QuizRules lesson picker, Dashboard pending review link.

#### ADM-LSN-02 · `POST /admin/lessons`
Auth `admin:content.create`. Body `LessonWriteDto & { status?: 'draft' | 'in_review' }` (create as draft or submit). Creates version 1
("Lesson created" or transition note). → `AdminLesson`. `audit:lesson.create`. Used by: AD LessonEditor create.

#### ADM-LSN-03 · `GET /admin/lessons/:id`
Auth `admin:content.view`. → `AdminLesson` (with versions). Used by: AD LessonEditor.

#### ADM-LSN-04 · `PATCH /admin/lessons/:id`
Auth `admin:content.edit`. Body `Partial<LessonWriteDto>`. Always prepends a version ("Content updated"). Editing a `published` lesson keeps it
published (new version). → `AdminLesson`. `audit:lesson.update`. Used by: AD LessonEditor save / sticky bar.

#### ADM-LSN-05 · `DELETE /admin/lessons/:id`
Auth `admin:content.delete`. Soft-deletes (keeps progress history); removes from student catalog. → `OkDto`. `audit:lesson.delete`.

#### ADM-LSN-06 · `POST /admin/lessons/:id/transition`
Auth: `to ∈ {draft, in_review}` → `admin:content.edit` (or `content.create` on own drafts); `to ∈ {approved, scheduled, published, archived}` → `admin:content.approve`.
Body `{ to: ContentStatus; publishAt?: ISODate /*required for scheduled, must be ≥ now − 60 s*/; note?: string; patch?: Partial<LessonWriteDto> /*save form values in the same call*/ }`.
`publishAt`: scheduled → given; published → now; draft/in_review/approved → null; archived unchanged. Publishing requires `videoState='ready'`
(422 `INVALID_TRANSITION`, `details.reason='VIDEO_NOT_READY'`). Prepends version (note per transition). A `publish-scheduled` job flips
`scheduled → published` at `publishAt` and notifies entitled students (`new_lesson`). → `AdminLesson`.
`audit:lesson.<revert_draft|submit|approve|schedule|publish|archive>`. Used by: AD LessonEditor workflow buttons, ContentWorkflow drag-drop.

#### ADM-LSN-07 · `POST /admin/lessons/:id/approve`
Shortcut for transition `to:'approved'` (`admin:content.approve`), body `{ note?: string }` (default "Approved from dashboard"). Used by: AD Dashboard pending review.

#### ADM-LSN-08 · `POST /admin/lessons/bulk/transition`
Body `{ ids: ID[]; to: 'in_review' | 'archived' | 'published' | 'draft'; reason?: string }`. Permission per target as ADM-LSN-06. → `BulkResult`.
`audit:lesson.bulk_submit|bulk_archive|...`. Used by: AD Lessons bulk "Submit for review" / "Archive".

#### ADM-LSN-09 · `POST /admin/lessons/bulk/delete`
Auth `admin:content.delete`. Body `{ ids: ID[] }`. → `BulkResult`. `audit:lesson.bulk_delete`. Used by: AD Lessons bulk delete.

#### ADM-LSN-10 · `POST /admin/lessons/export`
Auth `admin:content.export`. Body `ExportRequest` (cols `id, title_en, title_ar, subject, unit, topic, teacher, duration, views, status, publishAt`). Used by: AD Lessons export.

#### ADM-LSN-11 · `GET /admin/lessons/:id/versions`
Auth `admin:content.view`. → `LessonVersion[]`. Used by: AD LessonEditor version history.

#### ADM-LSN-12 · `PUT /admin/topics/:id/lessons/order`
Auth `admin:content.edit`. Body `{ ids: ID[] }`. → data `{ id: ID; order: number }[]`. `audit:lesson.reorder`. (spec reorder; UI uses `order` field.)

#### ADM-LSN-13 · `POST /admin/lessons/:id/resources`
Auth `admin:content.edit`. Body `{ fileKey: FileKey; title?: Localized; pages?: number | null }` (name/size/mime taken from the upload).
→ `AdminLessonResource`. `audit:lesson.add_resource`. Used by: AD LessonForm resources (after STO-01 upload).

#### ADM-LSN-14 · `PATCH /admin/lessons/:id/resources/:resourceId`
Auth `admin:content.edit`. Body `{ title?: Localized; pages?: number | null; order?: number }`. → `AdminLessonResource`.

#### ADM-LSN-15 · `DELETE /admin/lessons/:id/resources/:resourceId`
Auth `admin:content.edit`. → `OkDto`. `audit:lesson.remove_resource`. Used by: AD LessonForm remove resource.

### 21.5 Videos

#### ADM-VID-01 · `POST /admin/videos`
Auth `admin:content.edit` (or `content.create`). Body `{ lessonId: ID; fileKey: FileKey /*purpose lesson_video*/; replace?: boolean }`.
Registers the asset, sets lesson `videoState='processing'`, enqueues transcoding. → data `VideoAssetDto`. Used by: AD LessonForm video upload
(client shows real upload progress from STO-01 XHR, then polls ADM-VID-03 until `ready|failed`).

#### ADM-VID-02 · `GET /admin/videos`
Auth `admin:content.view`. Query `q` (assetId, lesson title), `subjectId?`, `streamStatus?`, `cdnStatus?`, `sort` ∈ `views|replays|sizeMb|durationSec|uploadedAt` (default `-views`), `page`, `pageSize`.
→ data `VideoAssetDto[]`. Used by: AD Videos library.

#### ADM-VID-03 · `GET /admin/videos/:id`
Auth `admin:content.view`. → `VideoAssetDto` (poll every 3 s while processing). Used by: AD LessonForm processing state, Videos row refresh.

#### ADM-VID-04 · `GET /admin/videos/stats`
Auth `admin:content.view`. → data `{ count: number; totalStorageMb: number; totalViews: number; totalReplays: number; ready: number; readyPct: number; issues: number }`. Used by: AD Videos stat cards.

#### ADM-VID-05 · `POST /admin/videos/:id/cdn-resync`
Auth `admin:content.edit`. → `VideoAssetDto` (cdnStatus pending). `audit:video.cdn_resync`. Used by: AD Videos row action.

#### ADM-VID-06 · `POST /admin/videos/:id/reprocess`
Auth `admin:content.edit`. Body `{ reason?: string }`. → `VideoAssetDto`. `audit:video.reprocess`. Used by: AD Videos row action.

#### ADM-VID-07 · `POST /admin/videos/bulk/cdn-resync`
Auth `admin:content.edit`. Body `{ ids: ID[] }`. → `BulkResult`. Used by: AD Videos bulk re-sync.

#### ADM-VID-08 · `DELETE /admin/lessons/:id/video`
Auth `admin:content.edit`. Detaches the video (`videoState='none'`); asset kept 30 days. → `AdminLesson`. `audit:lesson.remove_video`. Used by: AD LessonForm "Remove video".

#### ADM-VID-09 · `POST /admin/videos/export`
Auth `admin:content.export`. Body `ExportRequest`. Used by: AD Videos export.

---

## 22. Admin — questions (`questions` module) — `/admin/questions`

```ts
type QuestionStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'archived';
interface AdminQuestionOption { id: ID; text: Localized; correct: boolean }
interface AdminQuestion {
  id: ID; code: string;
  subjectId: ID; unitId: ID; topicId: ID;
  subject: SubjectRef; unit: UnitRef; topic: TopicRef;
  type: QuestionType; difficulty: Difficulty;
  body: Localized;                       // admin body_en/body_ar; may contain $…$ LaTeX, **bold**, *italic*, ______ blanks
  formula: string | null;                // optional display LaTeX (no admin field yet → null)
  imageUrl: string | null;
  options: AdminQuestionOption[];        // mcq 2..6 exactly one correct; true_false 2; fill_blank 1..4 all correct
  explanation: Localized;
  tags: string[]; source: string; year: number | null;
  status: QuestionStatus;
  author: AdminRef; reviewer: AdminRef | null;
  usageCount: number; accuracy: number | null;          // null when usage 0
  duplicateOf: { id: ID; code: string; text: Localized } | null;
  reviewComment: string | null;
  createdAt: ISODate; updatedAt: ISODate;
}
interface QuestionWriteDto {
  type: QuestionType; difficulty: Difficulty;
  subjectId: ID; unitId: ID; topicId: ID;
  body: Localized /*en ≥8, ar ≥5*/; explanation: Localized /*each ≥5*/;
  options: { id?: ID; text: Localized; correct: boolean }[];
  imageFileKey?: FileKey | null; formula?: string | null;
  tags?: string[]; source?: string /*QUESTION_SOURCES*/; year?: number | null /*2000..2027*/;
}
```

#### ADM-QST-01 · `GET /admin/questions`
Auth `admin:questions.view`. Query: `q` (code, body en/ar, tags, source, year), `subjectId?`, `unitId?`, `topicId?`, `difficulty?`, `type?`, `status?`,
`duplicatesOnly?: boolean`, `authorId?`, `tags?`, `sort` ∈ `code|difficulty|type|status|usageCount|accuracy|updatedAt|createdAt` (default `code`), `page`, `pageSize`.
→ data `AdminQuestion[]`. Used by: AD QuestionBank.

#### ADM-QST-02 · `GET /admin/questions/stats`
Auth `admin:questions.view`. → data `{ total: number; published: number; publishedPct: number; inReview: number; duplicates: number; subjectCount: number; byStatus: Record<QuestionStatus, number> }`. Used by: AD QuestionBank KPI cards.

#### ADM-QST-03 · `GET /admin/questions/:id`
Auth `admin:questions.view`. → `AdminQuestion`. Used by: AD QuestionEditor.

#### ADM-QST-04 · `POST /admin/questions`
Auth `admin:questions.create`. Body `QuestionWriteDto & { status?: 'draft' | 'in_review' }`. Server generates `code` (`SUBJ-<unit initials>-<seq4>`),
validates (exactly one correct for mcq/true_false, unique option texts, en+ar present), sets author. → `AdminQuestion`. `audit:question.create`.
Used by: AD QuestionEditor create / "Submit for review" (new).

#### ADM-QST-05 · `PATCH /admin/questions/:id`
Auth `admin:questions.edit` (published/archived also require `questions.approve`). Body `Partial<QuestionWriteDto>`. → `AdminQuestion`. `audit:question.update`.

#### ADM-QST-06 · `DELETE /admin/questions/:id`
Auth `admin:questions.delete`. Soft-delete (attempt history keeps a snapshot). → `OkDto`. `audit:question.delete`.

#### ADM-QST-07 · `POST /admin/questions/:id/transition`
Body `{ to: 'in_review' | 'approved' | 'draft' | 'published' | 'archived'; action: 'submit' | 'approve' | 'reject' | 'publish' | 'archive' | 'restore'; comment?: string; patch?: Partial<QuestionWriteDto> }`.
Permissions: submit/restore → `questions.edit`; approve/reject/publish/archive → `questions.approve`. Rules: submit draft→in_review (clears comment);
approve in_review→approved (reviewer=caller, comment optional); reject in_review→draft (`comment` required min 5 → `reviewComment`);
publish approved→published; archive approved|published→archived; restore archived→draft. → `AdminQuestion`.
Errors 422 `INVALID_TRANSITION`. `audit:question.<action>`. Used by: AD QuestionEditor workflow, ReviewQueue approve/reject.

#### ADM-QST-08 · `POST /admin/questions/bulk/transition`
Body `{ ids: ID[]; action: 'submit' | 'approve' | 'publish' | 'archive' }` (only rows in a valid source status change; others reported in `failed`).
→ `BulkResult`. Used by: AD QuestionBank bulk actions.

#### ADM-QST-09 · `POST /admin/questions/bulk/delete`
Auth `admin:questions.delete`. Body `{ ids: ID[] }`. → `BulkResult`. `audit:question.bulk_delete`.

#### ADM-QST-10 · `POST /admin/questions/:id/duplicate`
Auth `admin:questions.create`. → `AdminQuestion` (new id, code `<src>-C[n]`, draft, `duplicateOf=src`). `audit:question.duplicate`. Used by: AD QuestionBank bulk "Duplicate".

#### ADM-QST-11 · `POST /admin/questions/similar`
Auth `admin:questions.view`. Body `{ topicId: ID; body: Localized | { en: string }; excludeId?: ID; threshold?: number /*default 0.72*/; limit?: number /*3*/ }`.
→ data `{ question: { id: ID; code: string; body: Localized; status: QuestionStatus }; score: number /*0..1*/ }[]` (Jaccard of normalized tokens, same topic;
optionally pgvector). Used by: AD QuestionEditor duplicate warning, ReviewQueue similar panel.

#### ADM-QST-12 · `GET /admin/questions/review-queue`
Auth `admin:questions.view`. Query `subjectId?`, `q?`. → data `(AdminQuestion & { similar: { id: ID; code: string; body: Localized; score: number } | null })[]`
(status in_review, sorted `updatedAt` asc, unpaginated max 500) + meta `{ total }`. Used by: AD ReviewQueue.

#### ADM-QST-13 · `GET /admin/questions/:id/preview`
Auth `admin:questions.view`. Query `lang?`. → data `QuestionReview` (exactly what students receive, options in canonical order). Used by: AD QuestionEditor/ReviewQueue student preview.

#### ADM-QST-14 · `GET /admin/tags`
Auth `admin:questions.view`. Query `q?`, `limit?`. → data `{ slug: string; label: Localized | null; count: number }[]`. Used by: AD QuestionForm TagInput autocomplete.

#### ADM-QST-15 · `POST /admin/questions/export`
Auth `admin:questions.export`. Body `ExportRequest` (cols `code, body_en, body_ar, subject, unit, topic, difficulty, type, tags, status, author, reviewer, usage, accuracy, updatedAt`). Used by: AD QuestionBank export.

### 22.1 Bulk import

```ts
interface ImportRow {
  row: number;                           // file line number (header = 1)
  raw: Record<string, string>;           // the 21 template columns
  errors: Record<string /*column*/, string /*localized message*/>;
  valid: boolean;
  duplicateOf: { id: ID; code: string } | null;
  resolved: { subject: SubjectRef | null; unit: UnitRef | null; topic: TopicRef | null };
}
interface ImportPreviewDto {
  importId: ID; fileName: string; status: 'parsing' | 'ready' | 'committed' | 'failed' | 'expired';
  failureReason: string | null;          // set when status = 'failed' (e.g. 'IMPORT_PARSE_FAILED')
  totals: { rows: number; valid: number; invalid: number };
  rows: ImportRow[];                     // paginated via ADM-IMP-03
  createdAt: ISODate; expiresAt: ISODate;
}
```

#### ADM-IMP-01 · `GET /admin/questions/import/template`
Auth `admin:questions.create`. Query `format?: ExportFormat` (default csv). → file `eduway-question-import-template.<ext>` (21 columns:
`subject, unit, topic, type, difficulty, body_en, body_ar, option_a_en, option_a_ar, option_b_en, option_b_ar, option_c_en, option_c_ar, option_d_en, option_d_ar, correct, explanation_en, explanation_ar, tags, source, year` + 3 sample rows). Used by: AD BulkImport step 1.

#### ADM-IMP-02 · `POST /admin/questions/import`
Auth `admin:questions.create`. Body `{ fileKey: FileKey /*purpose question_import*/ }` **or** `multipart/form-data` field `file`.
Parses CSV/XLSX (job `question-import`; small files inline), validates each row (rules in §34.5), detects duplicates (similarity ≥ 0.8 in topic).
→ data `ImportPreviewDto` (`status:'parsing'` for large files — poll ADM-IMP-03). Errors 400 missing columns (>4) / empty file. Used by: AD BulkImport upload / "Use sample file".

#### ADM-IMP-03 · `GET /admin/questions/import/:importId`
Auth `admin:questions.create`. Query `filter?: 'all' | 'valid' | 'invalid'`, `page`, `pageSize` (25). → data `ImportPreviewDto` (rows page) + meta. Used by: AD BulkImport preview table.

#### ADM-IMP-04 · `POST /admin/questions/import/:importId/commit`
Auth `admin:questions.create` · idem. Creates drafts from valid rows (author = caller, sequential codes). → data `{ imported: number; skipped: number; createdIds: ID[] }`.
Errors 422 `IMPORT_NOT_READY` / `IMPORT_EXPIRED`. `audit:question.bulk_import` (`{imported, skipped, file}`); admin inbox notification. Used by: AD BulkImport commit.

#### ADM-IMP-05 · `GET /admin/questions/import/:importId/errors`
Auth `admin:questions.create`. → CSV of invalid rows with an `errors` column. Used by: AD BulkImport (optional error report).

---

## 23. Admin — assessments (`assessments` module)

```ts
interface QuizRuleDto {
  id: ID; scope: 'subject' | 'lesson';
  subjectId: ID; subject: SubjectRef;
  lessonId: ID | null; lesson: (LessonRef & { title: Localized }) | null;
  questionCount: number /*1..50*/; poolSize: number /*1..200, ≥ questionCount*/;
  randomize: boolean; alternativeSets: number /*1..5*/;
  passThreshold: number /*0..100*/;
  retryPolicy: 'unlimited' | 'limited' | 'cooldown'; maxRetries: number /*0..10*/; cooldownMinutes: number /*default 60*/;
  showExplanation: boolean; requireCompletionToUnlock: boolean;
  updatedAt: ISODate;
}
type QuizRuleWriteDto = Omit<QuizRuleDto, 'id' | 'scope' | 'subject' | 'lesson' | 'updatedAt' | 'subjectId' | 'lessonId'>;
interface BlueprintRow { id: ID; subjectId: ID; topicId: ID | null; count: number /*≥1*/; easy: number; medium: number; hard: number /*sum 100*/ }
interface ExamBlueprintDto {
  id: ID; name: Localized; description: Localized;
  rows: BlueprintRow[];
  subjects: SubjectRef[];                // unique row subjects (chips); primary = most questions
  questionCount: number;                 // Σ rows.count
  durationMin: number /*10..300*/; randomize: boolean;
  scoring: 'standard' | 'negative' | 'weighted';   // weighted: easy 1 / medium 2 / hard 3; negative −0.25 per wrong
  attemptLimit: number /*1..10*/; reviewBeforeSubmit: boolean;
  passMark: number /*0..100, default settings.learning.examDefaultPassMark*/;
  availableFrom: ISODate; availableTo: ISODate /*> from*/;
  status: 'draft' | 'published' | 'archived';
  attempts: number;                      // total attempts (server-derived)
  updatedAt: ISODate; createdAt: ISODate;
}
interface AttemptRow {
  id: ID; kind: 'quiz' | 'exam' | 'practice';
  student: StudentRef;
  refId: ID; title: Localized;           // lesson title for quiz, blueprint name for exam
  score: number; correct: number; total: number; timeSec: number;
  status: 'passed' | 'failed' | 'in_progress' | 'abandoned';
  platform: Platform | null; date: ISODate;
}
interface AttemptDetail extends AttemptRow {
  answers: { questionId: ID; code: string | null; difficulty: Difficulty | null; body: Localized | null /*null = question removed*/;
             selectedOptionId: ID | null; selectedText: Localized | null; correctOptionId: ID | null; correctText: Localized | null;
             correct: boolean; flagged: boolean; timeSec: number | null }[];
}
```

### 23.1 Quiz rules

#### ADM-QZR-01 · `GET /admin/quiz-rules`
Auth `admin:assessments.view`. Query `scope?: 'subject' | 'lesson'`, `subjectId?`, `q?` (lesson title), `page`, `pageSize`. → data `QuizRuleDto[]`
(subject defaults first — every active subject always has one: missing defaults are materialized from the system default = settings.learning + global rule — then lesson overrides). Used by: AD QuizRules (defaults cards + overrides table).

#### ADM-QZR-02 · `PUT /admin/quiz-rules/subjects/:subjectId`
Auth `admin:assessments.edit`. Body `QuizRuleWriteDto`. Upserts the subject default. → `QuizRuleDto`. `audit:quiz_rule.update`. Used by: AD RuleDrawer (subject mode).

#### ADM-QZR-03 · `POST /admin/quiz-rules`
Auth `admin:assessments.edit`. Body `QuizRuleWriteDto & { lessonId: ID }` (subject derived). 409 when the lesson already has an override.
→ `QuizRuleDto`. `audit:quiz_rule.create`. Used by: AD "New override".

#### ADM-QZR-04 · `PATCH /admin/quiz-rules/:id`
Auth `admin:assessments.edit`. Body `Partial<QuizRuleWriteDto>`. → `QuizRuleDto`. `audit:quiz_rule.update`.

#### ADM-QZR-05 · `DELETE /admin/quiz-rules/:id`
Auth `admin:assessments.delete`. Only lesson overrides (subject defaults → 422). → `OkDto`. `audit:quiz_rule.delete`.

#### ADM-QZR-06 · `GET /admin/quiz-rules/effective`
Auth `admin:assessments.view`. Query `lessonId`. → `QuizRuleDto & { source: 'subject' | 'lesson' }`.

#### ADM-QZR-07 · `POST /admin/quiz-rules/export`
Auth `admin:assessments.export`. Body `ExportRequest` (overrides). Used by: AD QuizRules export.

### 23.2 Exam blueprints

#### ADM-EBP-01 · `GET /admin/exam-blueprints`
Auth `admin:assessments.view`. Query `status?`, `q?`, `subjectId?`, `sort` ∈ `name|questionCount|durationMin|attemptLimit|availableFrom|status|attempts|updatedAt` (default `-updatedAt`), `page`, `pageSize`.
→ `ExamBlueprintDto[]`. Used by: AD ExamBlueprints.

#### ADM-EBP-02 · `GET /admin/exam-blueprints/stats`
→ data `{ total: number; published: number; totalAttempts: number; avgDurationMin: number }`. Used by: AD ExamBlueprints KPIs.

#### ADM-EBP-03 · `GET /admin/exam-blueprints/:id`
→ `ExamBlueprintDto`. Used by: AD BlueprintEditor.

#### ADM-EBP-04 · `POST /admin/exam-blueprints`
Auth `admin:assessments.create` (+ `approve` if `status='published'`). Body `Omit<ExamBlueprintDto, 'id' | 'subjects' | 'questionCount' | 'attempts' | 'updatedAt' | 'createdAt'>` with rows without ids.
Validates rows (sum 100), window. → `ExamBlueprintDto`. `audit:exam_blueprint.create`.

#### ADM-EBP-05 · `PUT /admin/exam-blueprints/:id`
Auth `admin:assessments.edit` (+ `approve` for status → published). Same body. Status change audited as `exam_blueprint.publish|archived|draft`. → `ExamBlueprintDto`.

#### ADM-EBP-06 · `DELETE /admin/exam-blueprints/:id`
Auth `admin:assessments.delete`. 409 `HAS_DEPENDENTS` when attempts > 0. → `OkDto`.

#### ADM-EBP-07 · `POST /admin/exam-blueprints/:id/publish` · ADM-EBP-08 `…/archive` · ADM-EBP-09 `…/duplicate`
publish `admin:assessments.approve` (body `{ force?: boolean }` — without `force`, 422 `details.reason='POOL_SHORT'` + `details.shortRows` when the pool is insufficient);
archive `admin:assessments.edit`; duplicate `admin:assessments.create` (names + " (copy)"/" (نسخة)", draft, attempts 0).
→ `ExamBlueprintDto`. `audit:exam_blueprint.publish|archive|duplicate`. Used by: AD ExamBlueprints row actions, BlueprintEditor publish.

#### ADM-EBP-10 · `POST /admin/exam-blueprints/availability`
Auth `admin:assessments.view`. Body `{ rows: Omit<BlueprintRow, 'id'>[] }`. → data `{ rows: { index: number; pool: number; ok: boolean; easy: { required: number; available: number }; medium: { required: number; available: number }; hard: { required: number; available: number } }[]; shortRows: number }`
(usable pool = approved + published questions). Used by: AD BlueprintEditor live availability.

#### ADM-EBP-11 · `POST /admin/exam-blueprints/export`
Auth `admin:assessments.export`. Body `ExportRequest`.

### 23.3 Attempts

#### ADM-ATT-01 · `GET /admin/attempts`
Auth `admin:assessments.view`. Query `kind?: 'quiz' | 'exam' | 'practice'`, `status?`, `q` (student name/mobile, title), `studentId?`, `refId?`, `from?`, `to?`, `platform?`,
`sort` ∈ `score|timeSec|date|status` (default `-date`), `page`, `pageSize`. → `AttemptRow[]`. Used by: AD Attempts.

#### ADM-ATT-02 · `GET /admin/attempts/stats`
Same filters. → data `{ total: number; avgScore: number; passRate: number; avgTimeSec: number }`. Used by: AD Attempts KPIs.

#### ADM-ATT-03 · `GET /admin/attempts/:id`
→ `AttemptDetail`. Used by: AD Attempts detail modal.

#### ADM-ATT-04 · `POST /admin/attempts/export`
Auth `admin:assessments.export`. Body `ExportRequest`.

---

## 24. Admin — packages, promotions, subscriptions (`packages` module)

```ts
interface AdminPackage {
  id: ID; name: Localized; description: Localized; tagline: Localized;
  subjectIds: ID[]; subjects: SubjectRef[];
  price: number;                          // base plan price (student "priceMonthly")
  currency: Currency; taxBehavior: 'inclusive' | 'exclusive' | 'exempt';
  validityType: 'days' | 'months' | 'until_date'; validityValue: number; validUntil: ISODate | null;
  yearlyPrice: number | null;             // optional long plan (student "priceYearly"); null = not offered
  yearlyValidityDays: number;             // default 365
  renewal: 'manual' | 'auto' | 'none';
  accessStart: 'immediate' | 'from_date'; accessStartDate: ISODate | null;
  status: 'active' | 'draft' | 'archived';
  featured: boolean;                      // student "popular"
  order: number;
  aiQuota: number | null;                 // null → ai_settings.monthlyAllowance; 0 → no AI
  features: Localized[];
  comparison: PackageComparison;
  subscribers: number;                    // live: active subscriptions
  createdAt: ISODate; updatedAt: ISODate;
}
type PackageWriteDto = Omit<AdminPackage, 'id' | 'subjects' | 'subscribers' | 'createdAt' | 'updatedAt'>;
type PromoType = 'promo' | 'school' | 'referral' | 'campaign';
type PromoPhase = 'live' | 'upcoming' | 'expired' | 'exhausted' | 'disabled';
interface PromotionDto {
  id: ID; code: string /*^[A-Z0-9-]{4,20}$ unique*/; type: PromoType;
  discountType: 'percent' | 'fixed'; discountValue: number;
  packageIds: ID[] /*[] = all*/; packages: PackageRef[];
  eligibility: 'all' | 'new_users' | 'renewals' | 'school_students';
  usageLimit: number; perUserLimit: number /*default 1*/; used: number;
  validFrom: ISODate; validTo: ISODate; enabled: boolean;
  ownerType: 'school' | 'marketer' | null; ownerId: ID | null; owner: SchoolRef | MarketerRef | null;
  phase: PromoPhase;                       // server-computed with real now
  createdAt: ISODate; updatedAt: ISODate;
}
interface AdminSubscriptionDto {
  id: ID; student: StudentRef; package: PackageRef; cycle: BillingCycle;
  status: 'active' | 'trial' | 'expired' | 'cancelled'; source: 'payment' | 'manual' | 'trial';
  startedAt: ISODate; endsAt: ISODate; cancelledAt: ISODate | null; lastPaymentId: ID | null;
}
```

#### ADM-PKG-01 · `GET /admin/packages`
Auth `admin:packages.view`. Query `status?`, `q?`, `sort` ∈ `order|name|price|subscribers|status` (default `order`). → `AdminPackage[]`. Used by: AD Packages (cards & table), lookups.

#### ADM-PKG-02 · `GET /admin/packages/:id` → `AdminPackage`.

#### ADM-PKG-03 · `POST /admin/packages`
Auth `admin:packages.create`. Body `PackageWriteDto` (name each ≥3, ≥1 subject, price ≥ 0, validity rules: days/months → value ≥1; until_date → validUntil required
(end of day platform tz), value 0; from_date → accessStartDate required). → `AdminPackage`. `audit:package.create`. Used by: AD PackageEditor.

#### ADM-PKG-04 · `PATCH /admin/packages/:id`
Auth `admin:packages.edit`. Body `Partial<PackageWriteDto>`. Price changes affect new purchases only. → `AdminPackage`. `audit:package.update`.

#### ADM-PKG-05 · `POST /admin/packages/:id/duplicate` (`create`) · ADM-PKG-06 `…/archive` (`edit`, body `{ reason?: string }`) · ADM-PKG-07 `…/restore` (`edit`)
→ `AdminPackage`. `audit:package.duplicate|archive|restore`. Archive keeps existing subscriptions. Used by: AD Packages actions menu.

#### ADM-PKG-08 · `DELETE /admin/packages/:id`
Auth `admin:packages.delete`. 409 `HAS_DEPENDENTS` when active subscribers (or any payments). → `OkDto`. `audit:package.delete`.

#### ADM-PKG-09 · `PUT /admin/packages/order`
Auth `admin:packages.edit`. Body `{ ids: ID[] }`. → `AdminPackage[]`. (implied: sort order)

#### ADM-PKG-10 · `POST /admin/packages/export`
Auth `admin:packages.export`. Body `ExportRequest`. Used by: AD Packages table export.

#### ADM-PRM-01 · `GET /admin/promotions`
Auth `admin:packages.view`. Query `type?`, `phase?`, `q` (code, type, owner name), `packageId?`, `sort` ∈ `code|discountValue|used|validFrom|validTo` (default `-validFrom`), `page`, `pageSize`.
→ `PromotionDto[]`. Used by: AD Promotions.

#### ADM-PRM-02 · `GET /admin/promotions/stats`
→ data `{ live: number; total: number; redemptions: number; nearLimit: number }`. Used by: AD Promotions KPIs.

#### ADM-PRM-03 · `POST /admin/promotions`
Auth `admin:packages.create`. Body `Omit<PromotionDto, 'id' | 'used' | 'phase' | 'packages' | 'owner' | 'createdAt' | 'updatedAt'>` (percent ≤ 100, value > 0, to ≥ from;
`ownerId` only for school/marketer types). → `PromotionDto`. Errors 409 code taken. `audit:promotion.create`.

#### ADM-PRM-04 · `PATCH /admin/promotions/:id`
Auth `admin:packages.edit`. Partial body (incl. `{ enabled }` inline switch). → `PromotionDto`. `audit:promotion.update|enable|disable`.

#### ADM-PRM-05 · `DELETE /admin/promotions/:id`
Auth `admin:packages.delete`. Promotions with redemptions are soft-deleted (history kept). → `OkDto`. `audit:promotion.delete`.

#### ADM-PRM-06 · `GET /admin/promotions/check-code`
Auth `admin:packages.view`. Query `code`, `excludeId?`. → data `{ available: boolean }`. Used by: AD PromotionForm uniqueness.

#### ADM-PRM-07 · `GET /admin/promotions/generate-code`
Auth `admin:packages.create`. Query `prefix?: string (default 'EDU-')`. → data `{ code: string }` (unique, alphabet without ambiguous chars). Used by: AD PromotionForm "Generate".

#### ADM-PRM-08 · `GET /admin/promotions/:id/redemptions`
Auth `admin:packages.view`. Query `page`, `pageSize`, `sort` ∈ `at|discount|ref|student` (default `-at`). → data `{ id: ID; student: StudentRef; paymentId: ID; ref: string; discount: IQD; at: ISODate }[]`. (implied: no UI yet.)

#### ADM-PRM-09 · `POST /admin/promotions/export`
Auth `admin:packages.export`. Body `ExportRequest`.

#### ADM-PRM-10 · `POST /admin/promotions/:id/redemptions/export`
Auth `admin:packages.export`. Body `ExportRequest` (cols `at, student, mobile, ref, discount`). (CONTRACT_GAPS F2 #4)

#### ADM-SBS-01 · `GET /admin/subscriptions`
Auth `admin:packages.view`. Query `studentId?`, `packageId?`, `status?`, `source?`, `expiringBefore?`, `q`, `page`, `pageSize`, `sort` ∈ `endsAt|startedAt|status|createdAt|student|package` (default `endsAt`). → `AdminSubscriptionDto[]`.
(spec "admin list"; used by UserDetail OverviewTab subscription card via ADM-STU-06 and future subscriptions list.)

#### ADM-SBS-02 · `POST /admin/subscriptions/grant`
Auth `admin:packages.edit` · idem. Body `{ studentId: ID; packageId: ID; days?: number /*default package validity*/; startsAt?: ISODate; reason: string }`.
Creates subscription (`source:'manual'`) + package entitlements + `entitlement_logs`. → `AdminSubscriptionDto`. `audit:subscription.grant`.

#### ADM-SBS-03 · `POST /admin/subscriptions/:id/change-package`
Auth `admin:packages.edit`. Body `{ packageId: ID; reason: string; keepEndDate?: boolean /*default true*/ }`. Upgrade/downgrade; entitlements re-synced. → `AdminSubscriptionDto`. `audit:subscription.change_package`.

#### ADM-SBS-04 · `POST /admin/subscriptions/:id/extend`
Auth `admin:packages.edit`. Body `{ days: number /*1..365*/; reason: string }`. → `AdminSubscriptionDto`. `audit:subscription.extend`.

#### ADM-SBS-05 · `POST /admin/subscriptions/:id/cancel`
Auth `admin:packages.edit`. Body `{ reason: string; immediate?: boolean /*default false: stays until endsAt*/ }`. → `AdminSubscriptionDto`. `audit:subscription.cancel`.

#### ADM-SBS-06 · `POST /admin/subscriptions/export`
Auth `admin:packages.export`. Body `ExportRequest` (cols `student, mobile, package, cycle, status, source, startedAt, endsAt, cancelledAt`). (CONTRACT_GAPS F2 #4)

---

## 25. Admin — payments, refunds, reconciliation (`payments` module)

```ts
interface TxnEvent { id: ID; status: TxnStatus | 'webhook' | 'refund_requested'; at: ISODate; note: string; actor: AdminRef | null }
interface WebhookEventDto { id: ID; type: string; verified: boolean; duplicate: boolean; idempotencyKey: string; receivedAt: ISODate; payload: Record<string, unknown> }
interface TransactionRow {
  id: ID; ref: string; receiptNumber: string | null;
  student: StudentRef; package: PackageRef; cycle: BillingCycle;
  amount: IQD; currency: Currency; discount: IQD; refundedAmount: IQD; refundable: IQD;
  gateway: Gateway; status: TxnStatus;
  promoCode: string | null; school: SchoolRef | null; marketer: MarketerRef | null;
  source: 'school' | 'promo' | 'direct';
  platform: Platform | null;
  createdAt: ISODate; paidAt: ISODate | null;
}
interface TransactionDetail extends TransactionRow {
  student: StudentRef & { governorate: Governorate };
  package: PackageRef & { listPrice: IQD };
  listPrice: IQD;                        // amount + discount
  timeline: TxnEvent[]; webhooks: WebhookEventDto[];
  pendingRefund: RefundDto | null;
  canRefund: boolean; canViewReceipt: boolean;
}
interface RefundDto {
  id: ID; transactionId: ID; ref: string; student: StudentRef;
  amount: IQD; currency: Currency; kind: 'full' | 'partial'; reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: AdminRef; requestedAt: ISODate;
  decidedBy: AdminRef | null; decidedAt: ISODate | null; decisionNote: string | null;
  gatewayRefundId: string | null;
}
interface ReconciliationDayRow { day: DateOnly; count: number; gross: IQD; refunds: IQD; fees: IQD; net: IQD }
interface ReconciliationRow {
  id: ID; day: DateOnly; gateway: Gateway; count: number;
  systemAmount: IQD; reportedAmount: IQD | null /*null = no settlement file yet*/; difference: IQD;
  state: 'matched' | 'mismatch' | 'reconciled' | 'unreported';
  resolvedBy: AdminRef | null; resolvedAt: ISODate | null; note: string | null;
}
```

#### ADM-PAY-01 · `GET /admin/payments`
Auth `admin:payments.view`. Query `from?`, `to?`, `status?`, `gateway?`, `packageId?`, `source?: 'school' | 'promo' | 'direct'`, `schoolId?`, `marketerId?`, `studentId?`, `platform?`,
`q` (ref, student name/mobile, promo), `sort` ∈ `createdAt|amount|status|gateway` (default `-createdAt`), `page`, `pageSize` (25).
→ `TransactionRow[]`. Used by: AD Transactions (+ Dashboard recent payments).

#### ADM-PAY-02 · `GET /admin/payments/summary`
Same filters. → data `{ gross: IQD /*captured: paid|refunded|partially_refunded*/; paidCount: number; failureRate: number; refunded: IQD; pendingRefunds: number; total: number }`. Used by: AD Transactions KPIs.

#### ADM-PAY-03 · `GET /admin/payments/:id`
→ `TransactionDetail`. Used by: AD TransactionDetail.

#### ADM-PAY-04 · `GET /admin/payments/:id/receipt`
Auth `admin:payments.view`. Query `format?: 'json' | 'pdf'`, `lang?: 'en' | 'ar'`. → `ReceiptDto` | PDF. (Same generator and language rules as PAY-10.) Used by: AD receipt modal (print).

#### ADM-PAY-05 · `POST /admin/payments/:id/refunds`
Auth `admin:payments.edit` (+ `payments.approve` when `processNow`) · idem. Body `{ kind: 'full' | 'partial'; amount?: IQD /*partial: 1000..refundable, step 1000*/; reason: string /*min 5*/; processNow?: boolean }`.
Creates refund (pending or approved+settled via gateway refund API), timeline `refund_requested`, settles → payment `refunded|partially_refunded`,
full refund revokes package entitlements (`entitlement_logs`). → data `{ refund: RefundDto; transaction: TransactionDetail }`.
Errors 422 `REFUND_EXCEEDS_REMAINING` / `REFUND_PENDING_EXISTS` / `NOT_REFUNDABLE`. `audit:refund.request|process`. Used by: AD TransactionDetail Refund modal.

#### ADM-PAY-06 · `POST /admin/payments/export`
Auth `admin:payments.export`. Body `ExportRequest` (cols `ref, student, mobile, package, amount, discount, currency, gateway, status, refunded, promo, school, marketer, platform, created`).

#### ADM-REF-01 · `GET /admin/refunds`
Auth `admin:payments.view`. Query `status?`, `q` (ref, student, reason, requestedBy), `from?`, `to?`, `sort` ∈ `requestedAt|amount|status|decidedAt|ref|student` (default `-requestedAt`), `page`, `pageSize`. → `RefundDto[]` + meta `{ counts: Record<'pending'|'approved'|'rejected', number> }`. Used by: AD Refunds tabs.

#### ADM-REF-02 · `GET /admin/refunds/summary`
→ data `{ pending: { count: number; amount: IQD }; approved: { count: number; amount: IQD }; rejected: { count: number } }`. Used by: AD Refunds KPIs.

#### ADM-REF-03 · `POST /admin/refunds/:id/approve`
Auth `admin:payments.approve` · idem. Body `{ note?: string }`. Settles (gateway refund). → data `{ refund: RefundDto; transaction: TransactionRow }`. `audit:refund.approve` + `transaction.refund`.

#### ADM-REF-04 · `POST /admin/refunds/:id/reject`
Auth `admin:payments.approve`. Body `ReasonBody` (stored as `decisionNote`). → `RefundDto`. `audit:refund.reject`.

#### ADM-REF-05 · `POST /admin/refunds/bulk/approve`
Auth `admin:payments.approve` · idem. Body `{ ids: ID[] }`. → `BulkResult`. Used by: AD Refunds bulk approve.

#### ADM-REF-06 · `POST /admin/refunds/export`
Auth `admin:payments.export`. Body `ExportRequest` (`filters.status` = tab).

#### ADM-REC-01 · `GET /admin/reconciliation`
Auth `admin:payments.view`. Query `from`, `to` (default 90 d), `gateway?`. → data:
```ts
{ summary: { gross: IQD; refunds: IQD; fees: IQD; net: IQD; txnCount: number; mismatches: number };
  chart: { date: DateOnly; gross: IQD; refunds: IQD }[];          // zero-filled per day
  daily: ReconciliationDayRow[] }                                  // fees = Σ round(amount × gateway fee rate from settings.payments)
```
Used by: AD Reconciliation KPIs/chart/daily table.

#### ADM-REC-02 · `GET /admin/reconciliation/comparison`
Auth `admin:payments.view`. Query `from`, `to`, `gateway?`, `onlyMismatches?: boolean`, `q?`, `page`, `pageSize` (10), `sort` ∈ `day|gateway|systemAmount|reportedAmount|difference|count|state` (default `-day`; `difference` = absolute value). → `ReconciliationRow[]`.
Rows never persisted (no settlement file, never resolved) carry the synthetic id `"<day>:<gateway>"`.
Used by: AD Reconciliation gateway comparison table.

#### ADM-REC-03 · `POST /admin/reconciliation/resolve`
Auth `admin:payments.approve`. Body `{ day: DateOnly; gateway: Gateway; reason: string }`. Persists `state='reconciled'`. → `ReconciliationRow`. `audit:reconciliation.mark_reconciled`.
Used by: AD Reconciliation "Mark reconciled".

#### ADM-REC-04 · `POST /admin/reconciliation/import`
Auth `admin:payments.approve`. Body `{ gateway: Gateway; fileKey: FileKey /*purpose reconciliation_import: CSV/XLSX day,amount[,count]*/ }`. Upserts reported amounts. → data `{ days: number; matched: number; mismatches: number }`.
`audit:reconciliation.import`. (implied: gateway settlement ingestion; no UI yet.)

#### ADM-REC-05 · `POST /admin/reconciliation/export`
Auth `admin:payments.export`. Body `ExportRequest & { table: 'daily' | 'comparison' }`.

---

## 26. Admin — schools, incentive rules, settlements (`schools` & `marketers` modules)

```ts
interface SchoolDto {
  id: ID; name: Localized; code: string /*^[A-Z0-9-]{4,16}$ unique*/;
  referralLink: string;                  // `${WEB_URL}/join?code=<code>` (also register ?ref=)
  city: Localized; governorateId: string; governorate: Governorate;
  contactName: string; contactMobile: string;
  marketerId: ID | null; marketer: MarketerRef | null;
  contractStart: ISODate; contractEnd: ISODate;
  status: 'active' | 'pending' | 'suspended';
  verifiedPaidStudents: number;          // all-time distinct students with ≥1 paid|partially_refunded payment attributed
  periodPaidStudents: number;            // in the active rule's current period
  tier: string;                          // label of tier reached under the active school incentive rule ('' if none)
  pendingSettlement: IQD;                // Σ pending + approved settlements
  estimatedReward: IQD;                  // calcIncentive(activeRule, periodPaidStudents).amount
  notesCount: number;
  createdAt: ISODate; updatedAt: ISODate;
}
type SchoolWriteDto = { name: Localized; code: string; city: Localized; governorateId: string; contactName: string; contactMobile: string /*^\+?[\d\s]{10,16}$*/;
                        contractStart: ISODate; contractEnd: ISODate /*> start*/; status: SchoolDto['status'] };
// marketerId is NOT writable here — use ADM-SCH-09 (double-attribution guard)
interface IncentiveTier { id: ID; from: number; to: number | null; rewardType: 'per_student' | 'fixed'; amount: IQD; label: string }
interface IncentiveRuleDto {
  id: ID; version: number; name: Localized; partnerType: 'school' | 'marketer';
  qualificationThreshold: number; tiers: IncentiveTier[];
  period: 'monthly' | 'quarterly' | 'semester' | 'yearly';
  effectiveFrom: ISODate; effectiveTo: ISODate | null;
  status: 'active' | 'scheduled' | 'superseded' | 'draft';
  createdBy: AdminRef; createdAt: ISODate; activatedBy: AdminRef | null; activatedAt: ISODate | null;
}
interface IncentiveResult { qualified: boolean; tier: IncentiveTier | null; amount: IQD; nextTier: IncentiveTier | null; studentsToNext: number | null; breakdown: 'not_qualified' | 'no_tier' | 'per_student' | 'fixed' }
interface IncentiveProgressDto {
  rule: IncentiveRuleDto | null; period: { key: string /*2026-10 | 2026-Q4 | 2026-S1 | 2026*/; from: ISODate; to: ISODate };
  paid: number; result: IncentiveResult; progressPct: number;
}
interface SettlementDto {
  id: ID; partnerType: 'school' | 'marketer'; partnerId: ID; partner: SchoolRef | MarketerRef;
  period: string /*e.g. 2026-09*/; ruleId: ID | null; ruleVersion: number | null;
  qualifiedStudents: number; amount: IQD; currency: Currency;
  status: 'pending' | 'approved' | 'paid';
  approvedBy: AdminRef | null; approvedAt: ISODate | null;
  paidAt: ISODate | null; paidBy: AdminRef | null; paymentReference: string | null; note: string | null;
  items?: { studentId: ID; studentName: Localized; paymentId: ID; ref: string; paidAt: ISODate; amount: IQD }[];   // detail only
  createdAt: ISODate;
}
```

### 26.1 Schools

#### ADM-SCH-01 · `GET /admin/schools`
Auth `admin:schools.view`. Query `q` (name en/ar, code, city, contact), `status?`, `governorateId?`, `marketerId?` (`__none`), `tier?`, `sort` ∈ `name|code|verifiedPaidStudents|pendingSettlement|contractEnd|status|periodPaidStudents|createdAt|tier` (default `-verifiedPaidStudents`), `page`, `pageSize`.
→ `SchoolDto[]` (partner schools; directory-only schools served by PUB-03 are not listed). Used by: AD Schools.

#### ADM-SCH-02 · `GET /admin/schools/stats`
→ data `{ total: number; active: number; pending: number; suspended: number; verifiedPaidStudents: number; pendingSettlement: IQD; tiers: string[] }`. Used by: AD Schools KPIs, tier filter options.

#### ADM-SCH-03 · `GET /admin/schools/:id`
→ `SchoolDto`. Used by: AD SchoolDetail.

#### ADM-SCH-04 · `POST /admin/schools`
Auth `admin:schools.create`. Body `SchoolWriteDto & { marketerId?: ID | null }` (initial marketer allowed; no guard needed on create). 409 code taken. → `SchoolDto`. `audit:school.create`. Used by: AD SchoolForm.

#### ADM-SCH-05 · `PATCH /admin/schools/:id`
Auth `admin:schools.edit`. Body `Partial<SchoolWriteDto>` (changing `code` keeps old code as alias for 90 days). → `SchoolDto`. `audit:school.update`. Used by: AD SchoolForm edit.
**Frontend note:** SchoolForm's marketer select must call ADM-SCH-09 when the value changes (fixes the bypass bug).

#### ADM-SCH-06 · `DELETE /admin/schools/:id`
Auth `admin:schools.delete`. Removes code/attribution link (students keep history); paid settlements kept. → `OkDto`. `audit:school.delete`.

#### ADM-SCH-07 · `POST /admin/schools/bulk/status`
Auth `admin:schools.edit`. Body `{ ids: ID[]; status: 'active' | 'suspended'; reason?: string }`. → `BulkResult`. `audit:school.bulk_activate|bulk_suspend`. Used by: AD Schools bulk.

#### ADM-SCH-08 · `GET /admin/schools/:id/students`
Auth `admin:schools.view` (+ `users.view` for links). Query `q`, `page`, `pageSize` (5), `sort` ∈ `name|mobile|createdAt|lastActive|subscriptionStatus` (default `-createdAt`). → `AdminStudentRow[]` (attributed). Used by: AD SchoolDetail attributed students.

#### ADM-SCH-09 · `PUT /admin/schools/:id/marketer`
Auth `admin:schools.edit` (or `marketers.edit`). Body `{ marketerId: ID | null; overrideReason?: string }`. If the school currently has a different marketer and
target ≠ null → `overrideReason` (min 3) required, else 409 `DOUBLE_ATTRIBUTION` (`details.currentMarketer: MarketerRef`). Future attribution only.
→ `SchoolDto`. `audit:school.attribution_override | assign_marketer | unassign_marketer`. Used by: AD SchoolDetail marketer select, MarketerDetail assign/unassign.

#### ADM-SCH-10 · `GET /admin/schools/:id/incentive-progress`
Auth `admin:schools.view`. Query `period?: string`. → `IncentiveProgressDto`. Used by: AD SchoolDetail incentive card.

#### ADM-SCH-11 · `GET /admin/schools/:id/notes` · ADM-SCH-12 `POST /admin/schools/:id/notes`
view `admin:schools.view` → `NoteDto[]`; create `admin:schools.edit` body `{ body: string /*1..4000*/ }` → `NoteDto`, `audit:school.add_note`. Used by: AD SchoolDetail notes.

#### ADM-SCH-13 · `POST /admin/schools/export`
Auth `admin:schools.export`. Body `ExportRequest`.

### 26.2 Incentive rules (versioned)

Permission module = `schools` when `partnerType='school'`, `marketers` when `'marketer'`.

#### ADM-INC-01 · `GET /admin/incentive-rules`
Auth `admin:<module>.view`. Query `partnerType` (required), `status?`. → `IncentiveRuleDto[]` (version desc). Used by: AD IncentiveRules version history.

#### ADM-INC-02 · `GET /admin/incentive-rules/:id` → `IncentiveRuleDto`.

#### ADM-INC-03 · `POST /admin/incentive-rules`
Auth `admin:<module>.edit`. Body `{ partnerType: 'school' | 'marketer'; cloneFromId?: ID }` → new draft (version max+1, cloned from active/latest, `effectiveFrom` tomorrow).
409 `DRAFT_EXISTS` (`details.draftId`). → `IncentiveRuleDto`. `audit:incentive_rule.create_version`. Used by: AD "New version".

#### ADM-INC-04 · `PATCH /admin/incentive-rules/:id`
Auth `admin:<module>.edit`. Draft only (422 otherwise). Body `{ name?; qualificationThreshold?: number /*≥0*/; period?; effectiveFrom?: ISODate; effectiveTo?: ISODate | null; tiers?: Omit<IncentiveTier, 'id'>[] }`.
→ `IncentiveRuleDto`. `audit:incentive_rule.update_draft`.

#### ADM-INC-05 · `DELETE /admin/incentive-rules/:id`
Auth `admin:<module>.delete`. Draft only. → `OkDto`. `audit:incentive_rule.delete`.

#### ADM-INC-06 · `POST /admin/incentive-rules/:id/activate`
Auth `admin:<module>.approve`. Validates tiers (≥1; tiers[0].from = threshold; to ≥ from; only last open-ended; contiguous; amount > 0 → 422 `TIERS_INVALID`).
Atomic: if `effectiveFrom ≤ now` → previous active becomes `superseded` (`effectiveTo = effectiveFrom − 1 day`), draft `active`; if in the future → status `scheduled`
(job switches at `effectiveFrom`). → data `{ activated: IncentiveRuleDto; superseded: IncentiveRuleDto | null }`. `audit:incentive_rule.activate` (+`supersede`).

#### ADM-INC-07 · `POST /admin/incentive-rules/preview`
Auth `admin:schools.view` or `marketers.view`. Body `{ qualificationThreshold: number; tiers: Omit<IncentiveTier, 'id'>[]; students: number }` → `IncentiveResult`.
Used by: AD IncentiveCalculator (may also compute client-side; server is authoritative).

### 26.3 Settlements

#### ADM-SET-01 · `GET /admin/settlements`
Auth `admin:<module>.view` (module from `partnerType`). Query `partnerType` (required), `partnerId?`, `period?`, `status?`, `q` (partner name, period), `sort` ∈ `period|qualifiedStudents|amount|status|paidAt|createdAt|approvedAt|partner` (default `-period`), `page`, `pageSize`.
Period keys: `YYYY-MM` | `YYYY-Qn` | `YYYY-Sn` (S1 = Jan–Jun) | `YYYY` (yearly); Asia/Baghdad boundaries.
→ `SettlementDto[]` + meta `{ totals: Record<'pending'|'approved'|'paid', { amount: IQD; count: number }>; periods: string[] }`. Used by: AD SettlementsTable (school & marketer pages, compact on details).

#### ADM-SET-02 · `GET /admin/settlements/:id` → `SettlementDto` with `items`.

#### ADM-SET-03 · `POST /admin/settlements/generate`
Auth `admin:<module>.approve` · idem. Body `{ partnerType: 'school' | 'marketer'; period: string; partnerIds?: ID[] }`. Applies the rule effective for the period
(`calcIncentive` + threshold; marketers also milestone bonuses). Existing **pending** settlements for the same partner/period are recalculated; approved/paid untouched.
→ data `{ created: number; updated: number; skipped: number; settlements: SettlementDto[] }`. `audit:settlement.generate`. (implied UI button; also monthly job.)

#### ADM-SET-04 · `POST /admin/settlements/:id/approve`
Auth `admin:<module>.approve`. → `SettlementDto`. `audit:settlement.approve`.

#### ADM-SET-05 · `POST /admin/settlements/:id/mark-paid`
Auth `admin:<module>.approve` · idem. Body `{ paymentReference?: string; note?: string; paidAt?: ISODate }`. Only from `approved`. → `SettlementDto`. `audit:settlement.mark_paid`.

#### ADM-SET-06 · `POST /admin/settlements/bulk/approve` · ADM-SET-07 `POST /admin/settlements/bulk/mark-paid`
Body `{ ids: ID[]; paymentReference?: string }` (idem for mark-paid). → `BulkResult`. `audit:settlement.bulk_approve|bulk_mark_paid`.

#### ADM-SET-08 · `POST /admin/settlements/export`
Auth `admin:<module>.export`. Body `ExportRequest` (`filters.partnerType` required).

---

## 27. Admin — marketers & milestones (`marketers` module)

```ts
interface MarketerDto {
  id: ID; name: Localized; mobile: string; email: string; avatarUrl: string | null;
  code: string | null;                   // optional marketer referral code (unique)
  governorateId: string; governorate: Governorate;
  schoolIds: ID[]; schoolsCount: number;
  paidStudents: number;                  // distinct attributed students with ≥1 paid|partially_refunded payment
  milestonesHit: number;                 // vs active milestone set
  pendingReward: IQD;                    // Σ pending + approved marketer settlements + unpaid milestone bonuses
  status: 'active' | 'inactive';
  joinedAt: ISODate;
}
type MarketerWriteDto = { name: Localized; mobile: string /*Iraqi*/; email: string; governorateId: string; status: 'active' | 'inactive'; code?: string | null; avatarFileKey?: FileKey | null };
interface MilestoneItem { id: ID; threshold: number; reward: IQD; label: Localized }
interface MilestoneSetDto {
  id: ID; version: number; status: 'active' | 'draft' | 'superseded';
  effectiveFrom: ISODate; items: MilestoneItem[];
  reachedBy: Record<ID /*itemId*/, MarketerRef[]>;   // active set only
  createdBy: AdminRef; createdAt: ISODate;
}
```

#### ADM-MKT-01 · `GET /admin/marketers`
Auth `admin:marketers.view`. Query `q` (name en/ar, mobile, email), `status?`, `governorateId?`, `sort` ∈ `name|paidStudents|milestonesHit|pendingReward|joinedAt|schoolsCount|status` (default `-paidStudents`), `page`, `pageSize`.
→ `MarketerDto[]`. Used by: AD Marketers.

#### ADM-MKT-02 · `GET /admin/marketers/stats`
→ data `{ total: number; active: number; schoolsAssigned: number; paidStudents: number; pendingRewards: IQD }`. Used by: AD Marketers KPIs.

#### ADM-MKT-03 · `GET /admin/marketers/:id`
→ data `MarketerDto & { schools: SchoolDto[]; milestones: { set: MilestoneSetDto | null; next: MilestoneItem | null; prevThreshold: number; progressPct: number; toNext: number | null } }`. Used by: AD MarketerDetail.

#### ADM-MKT-04 · `GET /admin/marketers/:id/performance`
Query `months?: number (default 12)`. → data `{ month: string /*yyyy-MM*/; students: number }[]` (distinct paying students attributed per month). Used by: AD MarketerDetail chart + KPI sparkline.

#### ADM-MKT-05 · `POST /admin/marketers`
Auth `admin:marketers.create`. Body `MarketerWriteDto`. → `MarketerDto`. `audit:marketer.create`. Used by: AD MarketerForm.

#### ADM-MKT-06 · `PATCH /admin/marketers/:id`
Auth `admin:marketers.edit`. Body `Partial<MarketerWriteDto>`. → `MarketerDto`. `audit:marketer.update`.

#### ADM-MKT-07 · `DELETE /admin/marketers/:id`
Auth `admin:marketers.delete`. Unassigns schools (future attribution), keeps paid settlements. → `OkDto`. `audit:marketer.delete`.

#### ADM-MKT-08 · `POST /admin/marketers/bulk/status`
Auth `admin:marketers.edit`. Body `{ ids: ID[]; status: 'active' | 'inactive' }`. → `BulkResult`. `audit:marketer.bulk_activate|bulk_deactivate`.

#### ADM-MKT-09 · `POST /admin/marketers/:id/schools`
Auth `admin:marketers.edit`. Body `{ schoolId: ID; overrideReason?: string }` (same guard as ADM-SCH-09). → `MarketerDto`. Used by: AD MarketerDetail assign.

#### ADM-MKT-10 · `DELETE /admin/marketers/:id/schools/:schoolId`
Auth `admin:marketers.edit`. → `MarketerDto`. `audit:school.unassign_marketer`. Used by: AD MarketerDetail unassign.

#### ADM-MKT-11 · `GET /admin/marketers/:id/students`
Auth `admin:marketers.view`. Query `q`, `page`, `pageSize`, `sort` ∈ `name|createdAt|lastActive` (default `-createdAt`). → `AdminStudentRow[]` (students with the marketer's code or at an assigned school). Used by: AD MarketerDetail "Attributed students" section.

#### ADM-MKT-13 · `GET /admin/marketers/:id/incentive-progress`
Auth `admin:marketers.view`. Query `period?: string`. → `IncentiveProgressDto` under the marketer incentive rule. (CONTRACT_GAPS F2 #4)

#### ADM-MKT-12 · `POST /admin/marketers/export`
Auth `admin:marketers.export`. Body `ExportRequest`.

#### ADM-MIL-01 · `GET /admin/milestone-sets`
Auth `admin:marketers.view`. Query `status?`. → `MilestoneSetDto[]` (version desc). Used by: AD MilestoneRewards (active, draft, history).

#### ADM-MIL-02 · `POST /admin/milestone-sets`
Auth `admin:marketers.edit`. Body `{ cloneFromId?: ID }`. New draft (clone of active or default `{5, 50000, 'First Five'}`), 409 `DRAFT_EXISTS`. → `MilestoneSetDto`. `audit:milestone_rule.create_version`.

#### ADM-MIL-03 · `PUT /admin/milestone-sets/:id`
Auth `admin:marketers.edit`. Draft only. Body `{ items: { id?: ID; threshold: number /*≥1, unique*/; reward: IQD /*>0*/; label: Localized /*non-empty*/ }[]; effectiveFrom?: ISODate }`.
→ `MilestoneSetDto`. `audit:milestone_rule.update_draft` (draft edits ARE audited server-side).

#### ADM-MIL-04 · `DELETE /admin/milestone-sets/:id`
Auth `admin:marketers.delete` (UI uses edit; server accepts `edit` or `delete`). Draft only. → `OkDto`. `audit:milestone_rule.delete_draft`.

#### ADM-MIL-05 · `POST /admin/milestone-sets/:id/activate`
Auth `admin:marketers.approve`. Supersedes active set, activates draft (`effectiveFrom = max(now, draft.effectiveFrom)`), recomputes `milestonesHit`, queues bonus settlement items
for newly reached milestones. → data `{ activated: MilestoneSetDto; superseded: MilestoneSetDto | null }`. `audit:milestone_rule.activate`.

---

## 28. Admin — AI tutor (`aitutor` module) — `/admin/ai`

```ts
interface AiSettingsDto {
  enabled: boolean;
  monthlyAllowance: number;              // 0..1000; default for packages with aiQuota = null
  resetCycle: 'calendar' | 'billing';
  provider: 'openai' | 'anthropic' | 'azure'; model: string;
  temperature: number /*0..1*/; maxTokens: number /*64..8192*/;
  retrieval: { transcripts: boolean; explanations: boolean; lessonNotes: boolean };
  safetyRules: string;                   // one rule per line
  disabledReason: string | null;         // kill-switch reason (ADM-AI-05) while enabled = false
  activeProvider: string;                // provider actually answering: 'anthropic' | 'openai' | 'azure' | 'mock' (no API key → offline mock)
  vectorRetrieval: boolean;              // pgvector store present + populated (else keyword retrieval)
  disabledUserIds: ID[]; disabledUsers: StudentRef[];
  rateLimitPerMinute: number /*≥1*/; rateLimitPerHour: number /*≥ perMinute*/;
  blockedKeywords: string[];
  suggestedPrompts: Record<SubjectSlug, Localized[]>;   // student suggestions (no admin UI yet)
  updatedAt: ISODate; updatedBy: AdminRef | null;
}
type AiFlagReason = 'off_topic' | 'abuse' | 'cheating' | 'prompt_injection' | 'self_harm';
interface AiFlagDto {
  id: ID; student: StudentRef; subject: SubjectRef; conversationId: ID; messageId: ID | null;
  excerpt: string; reason: AiFlagReason; severity: 'low' | 'medium' | 'high';
  status: 'open' | 'reviewed' | 'dismissed'; source: 'auto' | 'keyword' | 'rate_limit' | 'manual';
  reviewedBy: AdminRef | null; reviewedAt: ISODate | null; note: string | null;
  createdAt: ISODate;
}
interface FlaggedUserDto {
  student: StudentRef; flags: number; open: number; highest: 'low' | 'medium' | 'high';
  last: ISODate; aiDisabled: boolean; locked: boolean; warned: boolean; warnedAt: ISODate | null;
}
```

#### ADM-AI-01 · `GET /admin/ai/usage`
Auth `admin:aitutor.view`. Query `from`, `to`, `platform?`. → data:
```ts
{ kpis: { questions: Kpi; peakActiveUsers: Kpi; avgPerUser: Kpi; costUsd: Kpi; costIqd: number; tokens: Kpi };   // prev = previous equal range; spark = last 20 days
  daily: { date: DateOnly; questions: number; users: number; tokens: number; costUsd: number }[];
  bySubject: { subjectId: ID; slug: SubjectSlug; name: Localized; value: number; color: string }[];
  topUsers: { student: StudentRef; used: number /*current cycle*/; allowance: number; lastActive: ISODate | null }[];   // 8
  openFlags: AiFlagDto[];                // newest 5 open
  enabled: boolean; monthlyAllowance: number; iqdPerUsd: number }
```
Used by: AD AiUsageDashboard.

#### ADM-AI-02 · `GET /admin/ai/settings`
Auth `admin:aitutor.view`. → `AiSettingsDto`. Used by: AD AiSettings, AiAbuseControls.

#### ADM-AI-03 · `PATCH /admin/ai/settings`
Auth `admin:aitutor.edit`. Body `Partial<Omit<AiSettingsDto, 'enabled' | 'disabledUsers' | 'updatedAt' | 'updatedBy'>>` (validation as noted; `model` must belong to provider).
Takes effect immediately (no deploy). → `AiSettingsDto`. Audit action derived from changed keys: `ai_settings.rate_limits` (rate limits only),
`ai_settings.blocked_keywords` (keywords only), else `ai_settings.update`. Used by: AD AiSettings save bar, AiAbuseControls rate-limit & keyword cards.

#### ADM-AI-04 · `POST /admin/ai/settings/enable` · ADM-AI-05 `POST /admin/ai/settings/disable`
Auth `admin:aitutor.edit`. disable body `ReasonBody`. → `AiSettingsDto`. `audit:ai_settings.enable|disable`. Used by: AD AiSettings kill switch.

#### ADM-AI-06 · `PUT /admin/ai/disabled-users/:studentId`
Auth `admin:aitutor.edit`. Body `{ reason?: string }` (UI on Abuse page requires one). → `AiSettingsDto`. `audit:ai_settings.user_disable`. Used by: AD AiSettings per-user chips, AiAbuseControls toggle.

#### ADM-AI-07 · `DELETE /admin/ai/disabled-users/:studentId`
Auth `admin:aitutor.edit`. → `AiSettingsDto`. `audit:ai_settings.user_enable`.

#### ADM-AI-08 · `GET /admin/ai/flags`
Auth `admin:aitutor.view`. Query `status?`, `severity?`, `reason?`, `studentId?`, `q` (excerpt, student name), `from?`, `to?`, `sort` (default `-createdAt`; `createdAt | reason | severity | status`), `page`, `pageSize`. → `AiFlagDto[]`.
Used by: AD AiAbuseControls flagged conversations, AiUsageDashboard panel.

#### ADM-AI-09 · `GET /admin/ai/flags/:id`
Auth `admin:aitutor.view`. → data `AiFlagDto & { transcript: { role: 'student' | 'tutor'; text: string; at: ISODate; flagged: boolean }[] }` (90-day retention; transcript visible
with `aitutor.approve` or Super Admin, otherwise `[]`). Used by: AD flag detail modal.

#### ADM-AI-10 · `PATCH /admin/ai/flags/:id`
Auth `admin:aitutor.edit`. Body `{ status: 'open' | 'reviewed' | 'dismissed'; note?: string }`. → `AiFlagDto`. `audit:ai_flag.<status>` (`review`, `dismiss`, `open`). Used by: Dashboard panel & modal.

#### ADM-AI-11 · `GET /admin/ai/flagged-users`
Auth `admin:aitutor.view`. Query `q`, `page`, `pageSize` (5), `sort` (default highest desc, open desc; `flags | open | highest | last`). → `FlaggedUserDto[]`. Used by: AD AiAbuseControls flagged users.

#### ADM-AI-12 · `POST /admin/ai/flagged-users/:studentId/warn`
Auth `admin:aitutor.edit`. Body `{ message?: Localized }` (default template `support_message`). Persists warning + sends in-app/push notification. → `FlaggedUserDto`.
`audit:student.ai_warning`. Used by: AD AiAbuseControls Warn.

#### ADM-AI-13 · `POST /admin/ai/flags/export` · ADM-AI-14 `POST /admin/ai/flagged-users/export`
Auth `admin:aitutor.export`. Body `ExportRequest`.

#### ADM-AI-15 · `GET /admin/ai/models`
Auth `admin:aitutor.view`. → data `Record<'openai' | 'anthropic' | 'azure', { value: string; label: string }[]>` (server-configured catalog). Used by: AD AiSettings provider/model selects.

```ts
interface KbRunDto {
  id: ID; trigger: 'manual' | 'content' | 'cron' | 'script';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
  full: boolean; progressPct: number /*0..100*/; model: string;
  sourcesTotal: number; chunksTotal: number; chunksEmbedded: number; chunksUnchanged: number; chunksDeleted: number;
  tokens: number; costUsd: number; error: string | null;
  requestedBy: { id: ID; name: Localized } | null;
  startedAt: ISODate | null; finishedAt: ISODate | null; createdAt: ISODate;
}
interface KbStatusDto {
  available: boolean;                    // pgvector + eduway_platform_embeddings present
  embeddingModel: string; realEmbeddings: boolean;   // false = offline mock embeddings (no OPENAI_API_KEY)
  totals: { sources: number; chunks: number; tokens: number;
            byType: Record<'lesson' | 'unit' | 'topic' | 'question_explanation' | 'faq', { sources: number; chunks: number }> };
  lastIndexedAt: ISODate | null;
  running: boolean;                      // a run is queued/running → poll every ~2 s
  lastRun: KbRunDto | null; recentRuns: KbRunDto[] /*≤ 5, newest first*/;
}
```

#### ADM-AI-16 · `GET /admin/ai/knowledge-base`
Auth `admin:aitutor.view`. → data `KbStatusDto`. Used by: AD AiSettings "Knowledge base (RAG)" card (polls while `running`).

#### ADM-AI-17 · `POST /admin/ai/knowledge-base/reindex`
Auth `admin:aitutor.edit`. Body `{ force?: boolean /*default false: incremental, only changed chunks are embedded; true re-embeds all*/ }`.
→ **202** data `KbRunDto` (queued; executed by the pg-boss job `eduway.kb-index`). When a run is already queued/running it is returned instead.
Content is also re-indexed automatically after admin create/update/delete/publish of lessons, units, chapters, subjects, questions and FAQs
(debounced, scoped, `trigger: 'content'`) and nightly (`eduway.embeddings-generate`, `trigger: 'cron'`). Audited as `ai.kb_reindex`.
Used by: AD AiSettings "Reindex knowledge base" / "Re-embed everything".

---

## 29. Admin — analytics & exports (`analytics` module)

All analytics accept `from`, `to`, `grain?: Grain` (default: ≤31 d → day, ≤120 d → week (7-day buckets from `from`), else month),
`compare?: boolean` (adds previous equal-length range), `platform?: Platform` (filters to one platform; omitted = all).
Buckets are returned with `bucketStart: DateOnly` and `label: string` (`d MMM` / `MMM yy`). Data comes from `eduway_platform_analytics_daily_rollups`
(daily job) + live current-day query.

**Paid definitions (canonical):** *paid transaction* = status `paid | partially_refunded | refunded` (business analytics revenue/subscriptions);
*paid student / verified* = ≥1 payment in `paid | partially_refunded` (partner attribution, schools/marketers). Both are documented on each field.

#### ADM-ANL-01 · `GET /admin/analytics/business`
Auth `admin:analytics.view`. → data:
```ts
{ kpis: { registrations: Kpi; paidSubscriptions: Kpi; renewals: Kpi; grossRevenue: Kpi; refunds: Kpi & { count: number }; netRevenue: Kpi };
  timeline: { bucketStart: DateOnly; label: string; registrations: number; paid: number; renewals: number; revenue: IQD; refunds: IQD; net: IQD;
              prevRevenue: IQD | null; prevRegistrations: number | null }[];
  funnel: { registrations: number; paid: number; renewals: number; conversionPct: number; prev: { registrations: number; paid: number; renewals: number; conversionPct: number } | null };
  packages: { packageId: ID; name: Localized; color: string; count: number; prev: number | null; revenue: IQD }[];
  sources: { source: AcquisitionSource; label: Localized; color: string; regs: number; prev: number | null; paid: number; conv: number; revenue: IQD }[];
  schools: { id: ID; name: Localized; tier: string; paid: number; prev: number | null; revenue: IQD }[];     // all, revenue desc
  marketers: { id: ID; name: Localized; color: string; schools: number; paid: number; prev: number | null; revenue: IQD }[];
  platforms: { platform: Platform; registrations: number; paid: number; revenue: IQD }[] }
```
Used by: AD BusinessAnalytics (all charts/tables).

#### ADM-ANL-02 · `GET /admin/analytics/learning`
Auth `admin:analytics.view`. Query + `subjectId?` — narrows every subject-scoped chart: `scoreBySubject`, `weakTopics`, `questionAccuracy` (questions of the subject), `examScores` (blueprints of the subject) and `mistakeRecurrence`. KPIs, `timeline` and `platforms` come from the daily rollups, which have no subject dimension, and stay platform-wide. → data:
```ts
{ kpis: { dau: Kpi & { wau: number; mau: number; prevWau: number; prevMau: number /*end of previous equal range*/ }; watchHours: Kpi; videoCompletion: Kpi; quizCompletion: Kpi; examAttempts: Kpi; aiQuestions: Kpi };
  timeline: { bucketStart: DateOnly; label: string; dau: number; wau: number; mau: number; watchHours: number; videoCompletion: number; quizCompletion: number;
              quizAttempts: number; examAttempts: number; aiQuestions: number; prevDau: number | null }[];
  scoreBySubject: { subjectId: ID; name: Localized; score: number; color: string }[];          // range-filtered
  weakTopics: { topicId: ID; topic: Localized; unit: Localized; subject: SubjectRef; accuracy: number; mistakeRecurrence: number; attempts: number; avgTimeSec: number }[];   // asc accuracy
  questionAccuracy: { label: string /*'0–40'…'90–100'*/; questions: number; color: string }[];   // from real per-question accuracy
  examScores: { label: string /*'<50'…'90+'*/; students: number }[];                              // exam attempts in range (best per student)
  mistakeRecurrence: { topicId: ID; name: Localized; recurrence: number }[];                     // top 8
  platforms: { platform: Platform; dau: number; watchHours: number; quizAttempts: number }[] }
```
Used by: AD LearningAnalytics.

#### ADM-ANL-03 · `GET /admin/analytics/daily`
Auth `admin:analytics.view` (or `dashboard.view`). Query `from`, `to`, `fields?: string[]` (subset of `dau, wau, mau, watchMinutes, videoCompletionRate, quizAttempts, quizCompletionRate, examAttempts, aiQuestions, aiActiveUsers, aiTokens, aiCostUsd, errorRate, registrations, revenue`), `platform?`.
→ data `({ date: DateOnly } & Record<string, number>)[]` (+ `aiBySubject: Record<SubjectSlug, number>` when requested). Used by: AD Dashboard DAU/quiz/AI cards (via ADM-DSH-01), generic charts.

#### ADM-ANL-04 · `GET /admin/analytics/topics`
Auth `admin:analytics.view`. Query `subjectId?`, `from?`, `to?`, `sort` (default `accuracy`), `limit?`. → data `{ topicId: ID; topic: Localized; unit: Localized; subject: SubjectRef; accuracy: number; attempts: number; mistakeRecurrence: number; avgTimeSec: number }[]`.
Used by: AD Dashboard weakest topics, LearningAnalytics heatmap.

#### ADM-ANL-05 · `GET /admin/analytics/platform-split`
Auth `admin:analytics.view`. Query `from`, `to`. → data `{ platform: Platform; activeUsers: number; sessions: number; registrations: number; payments: number; revenue: IQD; watchMinutes: number; aiQuestions: number }[]`.
(spec "split by platform"; consumed by Business/Learning platform sections.)

#### ADM-EXP-01 · `POST /admin/exports`
Auth `admin:analytics.export` (+ module view permission for the report: students→users.view, transactions/refunds→payments.view, audit→security.view). · idem.
Body `{ report: 'students' | 'transactions' | 'refunds' | 'schools' | 'learning' | 'ai' | 'audit'; from: ISODate; to: ISODate; format: ExportFormat }`.
Generates the file (inline if ≤ 50k rows else job). Columns per report exactly as listed in §34.6. → data `ExportRecord`. Errors 422 `details.reason='NO_ROWS'`.
`audit:export.create` ("Exported N <report> rows (FMT, range)"). Used by: AD Exports Generate.

#### ADM-EXP-02 · `GET /admin/exports`
Auth `admin:analytics.view`. Query `report?`, `q?`, `page`, `pageSize`, `sort` ∈ `at|report|rows|format|by|status` (default `-at`). → `ExportRecord[]`:
```ts
interface ExportRecord { id: ID; report: string; format: ExportFormat; range: string /*"d MMM yyyy – d MMM yyyy"*/; from: ISODate | null; to: ISODate | null;
  rows: number; by: AdminRef; at: ISODate; status: 'ready' | 'processing' | 'failed'; source: 'exports_page' | 'table' ; downloadUrl: string | null; expiresAt: ISODate | null }
```
(Includes table exports from §0.7 with `source:'table'`.) Used by: AD Exports history.

#### ADM-EXP-03 · `GET /admin/exports/:id/download`
Auth `admin:analytics.export`. → file (stored 30 days with the record; 422 `EXPORT_NOT_READY` while processing). Used by: AD Exports history re-download, Generate result.

#### ADM-EXP-05 · `POST /admin/exports/history/export`
Auth `admin:analytics.export`. Body `ExportRequest` (`filters` = ADM-EXP-02 query). Cols `at, report, format, range, rows, by, source, status`. (CONTRACT_GAPS F2 #4)

#### ADM-EXP-04 · `GET /admin/exports/preview`
Auth `admin:analytics.view`. Query `report`, `from`, `to`. → data `{ rows: number }`. Used by: AD Exports preview row count.

---

## 30. Admin — notifications (`notifications` module)

```ts
type NotifChannel = 'push' | 'in_app' | 'sms' | 'whatsapp' | 'email';
type NotifType = 'otp' | 'payment_confirmation' | 'subscription_expiry' | 'new_lesson' | 'unfinished_lesson' | 'exam_reminder' | 'progress_reminder' | 'support_message';
interface NotificationTemplateDto {
  id: ID; name: string; type: NotifType; channel: NotifChannel;
  subject: Localized;                    // title for push/in_app, subject for email; '' for sms/whatsapp
  body: Localized;
  variables: string[];                   // extracted {token}s
  active: boolean; updatedAt: ISODate; updatedBy: AdminRef | null;
}
interface CampaignFilters { packageId?: ID | null; subjectId?: ID | null; governorateId?: string | null; schoolId?: ID | null; inactiveDays?: number | null;
  platforms?: Platform[] | null /*target app (ios/android) and/or web*/; subscriptionStatus?: SubscriptionStatus | null }
interface CampaignDto {
  id: ID; name: string; channel: NotifChannel; templateId: ID | null; template: { id: ID; name: string } | null;
  filters: CampaignFilters; audienceCount: number;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';
  scheduledAt: ISODate | null; sentAt: ISODate | null;
  stats: { queued: number; sent: number; delivered: number; failed: number };
  createdBy: AdminRef; createdAt: ISODate;
}
interface DeliveryDto {
  id: ID; campaignId: ID | null; template: { id: ID; name: string } | null;
  recipient: StudentRef; channel: NotifChannel; provider: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  error: string | null; attempts: number; platform: Platform | null;
  createdAt: ISODate; updatedAt: ISODate;
}
```

#### ADM-NTT-01 · `GET /admin/notification-templates`
Auth `admin:notifications.view`. Query `type?`, `channel?`, `active?`, `q` (name, body en/ar, type, channel), `sort` (default `-updatedAt`; `name | type | channel | updatedAt`), `page`, `pageSize`.
→ `NotificationTemplateDto[]` + meta `{ matrix: Record<NotifType, Record<NotifChannel, { count: number; active: boolean }>> }`. Used by: AD Templates (table + Type×Channel matrix), SendCampaign template select.

#### ADM-NTT-02 · `GET /admin/notification-templates/:id` → `NotificationTemplateDto`. Used by: AD TemplateEditor.

#### ADM-NTT-03 · `POST /admin/notification-templates`
Auth `admin:notifications.create`. Body `{ name: string /*≥3*/; type; channel; active: boolean; subject: Localized /*required for email & push*/; body: Localized /*each ≥5*/ }`.
Server extracts `variables`; unknown variables allowed (warning only). → `NotificationTemplateDto`. `audit:notification_template.create`.

#### ADM-NTT-04 · `PATCH /admin/notification-templates/:id`
Auth `admin:notifications.edit`. Partial body (incl. `{ active }` row switch). → `NotificationTemplateDto`. `audit:notification_template.update|activate|deactivate`.

#### ADM-NTT-05 · `DELETE /admin/notification-templates/:id`
Auth `admin:notifications.delete`. System templates used by jobs (otp, payment_confirmation, …) → 409 `HAS_DEPENDENTS` when it is the only active template for a system type/channel. → `OkDto`.

#### ADM-NTT-06 · `POST /admin/notification-templates/:id/duplicate`
Auth `admin:notifications.create`. → `NotificationTemplateDto` (`"<name> (copy)"`, inactive). `audit:notification_template.duplicate`.

#### ADM-NTT-07 · `POST /admin/notification-templates/bulk`
Body `{ ids: ID[]; action: 'activate' | 'deactivate' | 'delete' }` (edit for (de)activate, delete for delete). → `BulkResult`. `audit:notification_template.bulk_update|bulk_delete`.

#### ADM-NTT-08 · `GET /admin/notification-templates/variables`
Auth `admin:notifications.view`. → data `{ key: string; sample: Localized; description: Localized; types: NotifType[] | null }[]` (`student_name, lesson_title, subject_name, expiry_date, otp_code, amount, package_name, exam_date, progress, ticket_id, support_message`).
Used by: AD TemplateEditor variable palette & preview.

#### ADM-NTT-09 · `POST /admin/notification-templates/preview`
Auth `admin:notifications.view`. Body `{ channel; subject: Localized; body: Localized; lang: Lang }`. → data `{ subject: string; body: string; sms: { chars: number; segments: number; encoding: 'GSM-7' | 'UCS-2' } | null }`. (optional; UI renders client-side.)

#### ADM-NTT-10 · `POST /admin/notification-templates/export`
Auth `admin:notifications.export`. Body `ExportRequest`.

#### ADM-CMP-01 · `GET /admin/campaigns`
Auth `admin:notifications.view`. Query `status?`, `channel?`, `q?`, `sort` (default `-createdAt`; `name | status | createdAt | audienceCount`), `page`, `pageSize` (5). → `CampaignDto[]`. Used by: AD SendCampaign history.

#### ADM-CMP-02 · `GET /admin/campaigns/:id` → `CampaignDto`.

#### ADM-CMP-03 · `POST /admin/campaigns/audience-preview`
(Body may include `templateId?: ID` so the template's preference category — lessons/exams/payments/progress — is applied to `optedOut`. `platforms` matches students registered on / signed in from / holding a push token for a platform; push reachability counts only ios/android tokens of the targeted platforms. Exclusions are counted in priority order locked → optedOut → noEmail/noPushToken, so `matched = reachable + Σ excluded`.)
Auth `admin:notifications.view`. Body `{ filters: CampaignFilters; channel: NotifChannel }`. Always excludes locked students and those who opted out of the category/channel.
→ data `{ matched: number; reachable: number; total: number; excluded: { noEmail: number; noPushToken: number; optedOut: number; locked: number } }`. Used by: AD SendCampaign live count.

#### ADM-CMP-04 · `POST /admin/campaigns`
Auth `admin:notifications.create` · idem. Body `{ name: string /*≥3*/; channel: NotifChannel; templateId: ID; filters: CampaignFilters; sendAt: ISODate | null /*null = now; must be future*/; draft?: boolean }`.
Now → `status:'sending'`, deliveries queued (pg-boss `notification-dispatch`, Expo push for app users, in-app rows, SMS/WhatsApp/email providers). Later → `scheduled`.
→ `CampaignDto`. Errors 422 `details.reason='NO_RECIPIENTS'`. `audit:campaign.send|schedule`.

#### ADM-CMP-05 · `POST /admin/campaigns/:id/cancel`
Auth `admin:notifications.create`. Only `scheduled`. → `CampaignDto` (status `draft`, scheduledAt null). `audit:campaign.cancel`.

#### ADM-CMP-06 · `POST /admin/campaigns/export`
Auth `admin:notifications.export`. Body `ExportRequest`.

#### ADM-DLV-01 · `GET /admin/deliveries`
Auth `admin:notifications.view`. Query `channel?`, `status?`, `provider?`, `campaignId?`, `templateId?`, `studentId?`, `from?`, `to?`, `q` (id, student name/mobile, provider, error), `sort` (default `-createdAt`; `createdAt | updatedAt | status | channel | provider | attempts`; unknown keys ignored), `page`, `pageSize`.
→ `DeliveryDto[]`. Used by: AD DeliveryLog.

#### ADM-DLV-02 · `GET /admin/deliveries/stats`
(`delivered` counts `sent` + `delivered` rows; `rate` = delivered / (delivered + failed) × 100, queued excluded.)
Same filters (except status). → data `{ total: number; delivered: number; failed: number; queued: number; rate: number; byProvider: { provider: string; channel: NotifChannel; total: number; delivered: number; failed: number; rate: number }[] }`.
Used by: AD DeliveryLog KPIs & provider health cards.

#### ADM-DLV-03 · `POST /admin/deliveries/retry`
Auth `admin:notifications.edit` or `notifications.create`. Body `{ ids?: ID[]; filter?: Record<string, unknown> /*ADM-DLV-01 query params minus page/pageSize*/ /*retry all failed in view*/ }` (only `failed` rows are retried).
→ `BulkResult`. `audit:notification.retry`. Used by: AD DeliveryLog row retry, "Retry all failed", bulk retry.

#### ADM-DLV-04 · `POST /admin/deliveries/export`
Auth `admin:notifications.export`. Body `ExportRequest`.

---

## 31. Admin — settings, feature flags, legal, CMS (`settings` module)

```ts
interface GeneralSettingsDto { platformName: Localized; logoUrl: string | null; logoFileKey?: FileKey | null /*write*/; defaultLanguage: Lang; currency: Currency;
  timezone: 'Asia/Baghdad' | 'Asia/Dubai' | 'Asia/Riyadh' | 'Europe/Istanbul' | 'UTC'; dateFormat: 'd MMM yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd'; academicYear: string }
interface OtpSettingsDto { expirySeconds: number /*30..900*/; codeLength: 4 | 6; resendLimit: number /*1..10*/; resendCooldownSeconds: number /*15..600*/;
  maxAttempts: number /*1..20*/; lockoutMinutes: number /*1..1440*/; provider: 'korek' | 'twilio' | 'whatsapp';
  fallbackProvider: 'none' | 'korek' | 'twilio' | 'whatsapp' /*≠ provider*/; devBypassCode: string | null /*non-prod only*/ }
interface AppSettingsDto { minVersionIos: string; minVersionAndroid: string /*semver*/; latestVersion: string; forceUpdate: boolean;
  maintenanceMode: boolean; maintenanceMessage: Localized; deviceLimit: number /*1..5*/; sessionTimeoutMinutes: 60 | 240 | 1440 | 10080 | 43200;
  storeUrls: { ios: string | null; android: string | null }; maintenanceAppliesTo: ('web' | 'ios' | 'android')[] }
interface SupportContactsDto { phone: string; whatsapp: string; email: string; hours: Localized; address: Localized;
  facebook: string; instagram: string; telegram: string; youtube: string; tiktok: string }
interface PaymentSettingsDto { gateways: { id: Gateway; enabled: boolean; feeRatePct: number; name: Localized; color: string; displayOrder: number }[];
  mockGatewayEnabled: boolean /*forced false in production*/; receiptCompany: { name: Localized; address: Localized; email: string }; taxNote: Localized;
  gatewayModes: Partial<Record<Gateway, 'live' | 'sandbox' | 'mock' | 'disabled'>> /*read-only (server env), ignored on PUT*/ }
interface LearningSettingsDto { quizQuestionCount: number; quizPassMark: number; examDefaultPassMark: number; practiceSessionSizes: number[]; practiceMaxSize: number;
  dailyGoalMinutes: number; watchHeartbeatSeconds: number; examAutosaveSeconds: number; examGraceSeconds: number;
  gradeBands: { key: string; min: number }[]; heatmapLevels: number[] /*minutes thresholds*/ }
interface MarketingSettingsDto { stats: { satisfactionPct: number; passRatePct: number; rating: number; ratingCount: number };
  displayOverrides: Partial<Record<'students' | 'lessons' | 'questions', string>>; appLinks: { appStore: string | null; googlePlay: string | null } }
interface SecuritySettingsDto { adminMfaMandatory: boolean; adminSessionHours: number; passwordMinLength: number }
type SettingsSection = 'general' | 'otp' | 'app' | 'support' | 'payments' | 'learning' | 'marketing' | 'security';
interface FeatureFlagDto { id: ID; key: string; name: Localized; description: Localized; enabled: boolean;
  environment: 'production' | 'staging' | 'beta'; platforms: Platform[] /*default all*/; rolloutPct: number /*default 100*/; updatedAt: ISODate; updatedBy: AdminRef | null }
interface LegalVersionDto { id: ID; doc: LegalDoc; version: string; title: Localized; body: Localized /*sections markdown*/;
  status: 'draft' | 'published' | 'retired'; publishedAt: ISODate | null; acceptances: number; changeSummary: Localized | null;
  createdBy: AdminRef; createdAt: ISODate; updatedAt: ISODate }
```

#### ADM-CFG-01 · `GET /admin/settings/:section`
Auth `admin:settings.view`. Path `section: SettingsSection`. → the section DTO. Used by: AD General, Otp, AppSettings, SupportContacts pages (+ General side summary of support).

#### ADM-CFG-02 · `PUT /admin/settings/:section`
Auth `admin:settings.edit`. Body = full section DTO (or partial; server merges). Server diffs & audits changed keys only; no-op returns unchanged.
Takes effect without deploy (cached config invalidated; `/public/app-config` reflects immediately). → section DTO. `audit:settings.update` (`entityId=section`).
Special confirmations stay client-side (maintenance type-to-confirm, force update). Used by: AD settings save bars.

#### ADM-FLG-01 · `GET /admin/feature-flags`
Auth `admin:settings.view`. Query `environment?`, `q?`. → data `FeatureFlagDto[]` + meta `{ counts: { total; enabled; production; betaStaging } }`. Used by: AD FeatureFlags.

#### ADM-FLG-02 · `PATCH /admin/feature-flags/:id`
Auth `admin:settings.edit`. Body `{ enabled?: boolean; platforms?: Platform[]; rolloutPct?: number }`. → `FeatureFlagDto`. `audit:feature_flag.toggle` ("Enabled/Disabled <name> in <env>"). Used by: AD FeatureFlags toggle.

#### ADM-FLG-03 · `POST /admin/feature-flags` · ADM-FLG-04 `DELETE /admin/feature-flags/:id`
Auth `admin:settings.edit` / `settings.delete`. Body `{ key: string /*^[a-z][a-z0-9_]{2,40}$*/; name: Localized; description: Localized; environment; enabled: boolean }`. (implied; no UI yet.)

#### ADM-LGL-01 · `GET /admin/legal/:doc/versions`
Auth `admin:settings.view`. → `LegalVersionDto[]` (drafts first, then publishedAt desc). Used by: AD LegalDocuments tabs/version list.

#### ADM-LGL-02 · `POST /admin/legal/:doc/versions`
Auth `admin:settings.edit`. Body `{ version?: string /*default next minor*/; cloneFromId?: ID }`. 409 `DRAFT_EXISTS` (`details.draftId`). → `LegalVersionDto`. `audit:legal_document.create`.

#### ADM-LGL-03 · `PATCH /admin/legal/versions/:id`
Auth `admin:settings.edit`. Draft only. Body `{ version?: string; title?: Localized; body?: Localized; changeSummary?: Localized | null }`. → `LegalVersionDto`. `audit:legal_document.update`.

#### ADM-LGL-04 · `POST /admin/legal/versions/:id/publish`
Auth `admin:settings.edit`. Requires non-empty version + bodies. Atomic: current published → `retired`, draft → `published`; all students get `pendingLegal` (re-acceptance).
Body `{ requireReacceptance?: boolean /*default true*/ }`. → data `{ published: LegalVersionDto; retired: LegalVersionDto | null }`. `audit:legal_document.publish` + `retire`.

#### ADM-LGL-05 · `DELETE /admin/legal/versions/:id`
Auth `admin:settings.edit`. Draft only. → `OkDto`. `audit:legal_document.delete`.

#### ADM-LGL-06 · `GET /admin/legal/:doc/stats`
Auth `admin:settings.view`. → data `{ currentVersion: string | null; publishedAt: ISODate | null; acceptances: number; totalStudents: number; rate: number; pendingReacceptance: number; byVersion: { version: string; acceptances: number }[] }`.
Used by: AD LegalDocuments KPIs & acceptance chart.

#### ADM-LGL-07 · `GET /admin/legal/versions/:id/acceptances`
Auth `admin:settings.view`. Query `q`, `page`, `pageSize`. → data `{ student: StudentRef; acceptedAt: ISODate; platform: Platform; ip: string }[]`. (implied)

#### ADM-CMS-01 · `GET /admin/cms/testimonials` · ADM-CMS-02 `POST` · ADM-CMS-03 `PATCH /admin/cms/testimonials/:id` · ADM-CMS-04 `DELETE /admin/cms/testimonials/:id`
Auth `admin:settings.view|edit`. Body `{ name: Localized; city: Localized; role: Localized; quote: Localized; avatarFileKey?: FileKey | null; rating: number /*1..5*/; placements: ('landing' | 'auth' | 'app')[]; order: number; active: boolean }`.
→ `Testimonial & { active: boolean; placements: string[] }`. `audit:cms_testimonial.*`. (implied: feeds PUB-06; admin page to be added under Settings.)

#### ADM-CMS-05 · `GET /admin/cms/faq` · ADM-CMS-06 `POST` · ADM-CMS-07 `PATCH /admin/cms/faq/:id` · ADM-CMS-08 `DELETE /admin/cms/faq/:id`
Auth `admin:settings.view|edit`. Body `{ q: Localized; a: Localized; placements: ('landing' | 'pricing' | 'subscription_app' | 'contact')[]; order: number; active: boolean }`. → `FaqItem & { active; placements }`. `audit:cms_faq.*`. (implied: feeds PUB-07.)

#### ADM-CMS-09 · `PUT /admin/cms/order`
Auth `admin:settings.edit`. Body `{ kind: 'testimonials' | 'faq'; ids: ID[] }`. → `OkDto`.

### 31a. Admin — linked WhatsApp number (`whatsapp` module) — `/admin/whatsapp`
WhatsApp Web session (Baileys, unofficial; docs/PROVIDERS.md) that sends student OTPs when `WHATSAPP_PROVIDER=baileys`.
```ts
type WhatsAppStatus = 'disconnected' | 'qr_pending' | 'connecting' | 'connected';
interface WhatsAppStatusDto { status: WhatsAppStatus; since: ISODate; phone: string | null /*E.164 of the linked number*/; displayName: string | null;
  connectedAt: ISODate | null; lastError: string | null /*'logged_out' | 'qr_expired' | 'replaced_by_another_client' | 'forbidden' | 'logged_out_by_admin' | …*/;
  qrAvailable: boolean; qrUpdatedAt: ISODate | null; owner: 'this' | 'other' | null /*API instance holding the socket*/;
  provider: { selected: boolean /*WHATSAPP_PROVIDER=baileys*/; configured: boolean /*WHATSAPP_SESSION_SECRET set*/; active: string; smsFallback: string };
  otpPreview: { en: string; ar: string /*full bilingual text, that language first*/; expirySeconds: number; codeLength: number } }
interface WhatsAppQrDto { status: WhatsAppStatus; qr: string | null /*PNG data URL*/; updatedAt: ISODate | null }
```

#### ADM-WA-01 · `GET /admin/whatsapp/status`
Auth `admin:settings.view`. → `WhatsAppStatusDto`. Poll about every 3 s while `qr_pending` / `connecting`. Used by: AD Settings → WhatsApp.

#### ADM-WA-02 · `POST /admin/whatsapp/connect`
Auth `admin:settings.edit`. Starts or restarts linking and waits up to 15 s for the first QR (or the open connection when a session is already stored).
→ `WhatsAppStatusDto & { qr: string | null }`. 422 `WHATSAPP_NOT_CONFIGURED`. `audit:whatsapp.connect` (status only, never the QR).

#### ADM-WA-03 · `GET /admin/whatsapp/qr`
Auth `admin:settings.edit`. → `WhatsAppQrDto`. WhatsApp rotates the QR about every 20 s. Poll every 2–3 s while `status = 'qr_pending'`.
After about 2 minutes without a scan the attempt ends with `status: 'disconnected'`, `lastError: 'qr_expired'`.

#### ADM-WA-04 · `POST /admin/whatsapp/disconnect`
Auth `admin:settings.edit`. Body `{ logout?: boolean /*default true: unlink the device + wipe the stored session*/ }`. → `WhatsAppStatusDto`.
`audit:whatsapp.logout` / `whatsapp.disconnect`.

#### ADM-WA-05 · `POST /admin/whatsapp/test-send`
Auth `admin:settings.edit`. Body `{ phone: string /*any international format*/; text?: string /*≤1000; default: bilingual test text*/ }`.
→ `{ messageId: string; to: string /*masked*/; channel: 'whatsapp' }`. 422 `WHATSAPP_NOT_CONNECTED` / `WHATSAPP_NOT_ON_WHATSAPP` / `WHATSAPP_NOT_CONFIGURED`;
409 `WHATSAPP_OTHER_INSTANCE`; 502 `WHATSAPP_SEND_FAILED`. `audit:whatsapp.test_send`.

---

## 32. Admin — security (`security` module)

```ts
interface AuditLogDto {
  id: ID; at: ISODate;
  actor: string;                         // display name (UI filters by it)
  actorId: ID | null; actorType: 'admin' | 'student' | 'system';
  actorRole: string;                     // role key/name
  action: string; entity: string; entityId: string; summary: string;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  ip: string; device: string;            // "Chrome 129 · Windows 11"
  platform: ClientPlatform | null; requestId: string | null;
}
interface AdminSessionDto { id: ID; admin: AdminRef & { email: string }; device: string; browser: string; deviceType: 'desktop' | 'mobile' | 'tablet';
  ip: string; location: string; countryCode: string | null; abroad: boolean; startedAt: ISODate; lastActive: ISODate; current: boolean }
interface SecurityAlertDto {
  id: ID; kind: 'multiple_devices' | 'otp_bruteforce' | 'unusual_location' | 'payment_fraud' | 'admin_login_failure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  subject: string; subjectId: ID | null; subjectType: 'student' | 'admin' | null;
  detail: string; status: 'open' | 'resolved' | 'blocked';
  resolvedBy: AdminRef | null; resolvedAt: ISODate | null; resolutionReason: string | null;
  createdAt: ISODate;
}
```

#### ADM-ROL-01 · `GET /admin/roles`
Auth `admin:security.view`. → `RoleDto[]` (+ meta `{ customCount: number; assignedAdmins: number }`). Used by: AD Roles, Permissions overview, AdminUsers role select, Topbar "Preview as".

#### ADM-ROL-02 · `GET /admin/roles/:id` → `RoleDto`. Used by: AD RoleEditor.

#### ADM-ROL-03 · `POST /admin/roles`
Auth `admin:security.create`. Body `{ key: string /*^[a-z][a-z0-9_]{2,40}$ unique*/; name: Localized /*min 2*/; description?: Localized; permissions: PermissionMatrix }`.
Server normalizes implications (any action ⇒ view; no view ⇒ none). → `RoleDto`. `audit:role.create`.

#### ADM-ROL-04 · `PUT /admin/roles/:id`
Auth `admin:security.edit`. Same body (`key` immutable for system roles; `super_admin` → 403 `SYSTEM_ROLE`). Audit before/after keyed `"module.action": bool` for changed cells.
Permission changes take effect on the affected admins' next request (permissions cached ≤ 60 s). → `RoleDto`. `audit:role.update`.

#### ADM-ROL-05 · `POST /admin/roles/:id/clone`
Auth `admin:security.create`. → `RoleDto` (`<key>_copy[_N]`, "Copy of X"). `audit:role.clone`.

#### ADM-ROL-06 · `DELETE /admin/roles/:id`
Auth `admin:security.delete`. 403 `SYSTEM_ROLE`; 409 `HAS_DEPENDENTS` when assigned to non-deactivated admins. Body `{ confirmKey: string }` (must equal role key). → `OkDto`. `audit:role.delete`.

#### ADM-ROL-07 · `GET /admin/permissions/catalog`
Auth `admin:security.view`. → data `{ modules: ModuleKey[]; actions: PermAction[]; labels: Record<ModuleKey, Localized> }`. Used by: AD RoleForm matrix, Permissions overview.

#### ADM-ADM-01 · `GET /admin/admins`
Auth `admin:security.view`. Query `roleId?`, `status?`, `q` (name en/ar, email, mobile), `sort` (default `-lastLogin`), `page`, `pageSize`. → `AdminUserDto[]` + meta `{ stats: { total; active; mfaPct; invited } }`. Used by: AD AdminUsers.

#### ADM-ADM-02 · `POST /admin/admins/invite`
Auth `admin:security.create`. Body `{ name: Localized /*en min 2; ar defaults to en*/; email: string /*unique ci*/; roleId: ID; mobile?: string | null }`. Sends invite email (7-day token). → `AdminUserDto` (status invited). `audit:admin.invite`.

#### ADM-ADM-03 · `POST /admin/admins/:id/resend-invite`
Auth `admin:security.edit`. → `OkDto`. `audit:admin.resend_invite`.

#### ADM-ADM-04 · `PATCH /admin/admins/:id/role`
Auth `admin:security.edit`. Body `{ roleId: ID }`. 422 for deactivated admins. → `AdminUserDto`. `audit:admin.change_role`.

#### ADM-ADM-05 · `POST /admin/admins/:id/reset-mfa`
Auth `admin:security.edit`. → `AdminUserDto` (mfaEnabled false; next login forces enrolment when mandatory). `audit:admin.reset_mfa`.

#### ADM-ADM-06 · `POST /admin/admins/:id/deactivate`
Auth `admin:security.edit`. Body `ReasonBody`. 422 `SELF_ACTION`. Revokes all their sessions. → `AdminUserDto`. `audit:admin.deactivate`.

#### ADM-ADM-07 · `POST /admin/admins/:id/activate`
Auth `admin:security.edit`. → `AdminUserDto`. `audit:admin.reactivate`.

#### ADM-ADM-08 · `POST /admin/admins/export`
Auth `admin:security.export`. Body `ExportRequest`.

#### ADM-AUD-01 · `GET /admin/audit-logs`
Auth `admin:security.view`. Query `from?`, `to?`, `actor?` (name) / `actorId?`, `entity?`, `entityId?`, `action?` (prefix match), `sensitive?: boolean`, `q` (actor, action, entity, entityId, summary, ip),
`since?: ISODate` (live polling: only newer rows), `sort` (default `-at`), `page`, `pageSize` (25) or `cursor`.
→ `AuditLogDto[]` + meta `{ kpis: { total: number; last24h: number; actors: number; sensitive: number } }`. Live: poll with `since` every 10 s. Used by: AD AuditLogs; Exports `audit` report.

#### ADM-AUD-02 · `GET /admin/audit-logs/:id` → `AuditLogDto`. Used by: AD audit detail drawer (diff).

#### ADM-AUD-03 · `GET /admin/audit-logs/facets`
Auth `admin:security.view`. Query `from?`, `to?`. → data `{ actors: { id: ID | null; name: string }[]; entities: string[]; actions: string[] }`. Used by: AD AuditLogs filters.

#### ADM-AUD-04 · `POST /admin/audit-logs/export`
Auth `admin:security.export`. Body `ExportRequest`.

#### ADM-SES-01 · `GET /admin/admin-sessions`
Auth `admin:security.view`. Query `adminId?`, `q?`, `sort` (default `-lastActive`), `page`, `pageSize`. → `AdminSessionDto[]` + meta `{ kpis: { active; admins; mobile; abroad } }`. Used by: AD Sessions.

#### ADM-SES-02 · `DELETE /admin/admin-sessions/:id`
Auth `admin:security.edit`. 422 `SELF_ACTION` for current. → `OkDto`. `audit:admin_session.revoke`.

#### ADM-SES-03 · `POST /admin/admin-sessions/revoke-all`
Auth `admin:security.edit`. Body `{ adminId?: ID /*omit = all admins*/; exceptCurrent: true }`. → data `{ revoked: number }`. `audit:admin_session.revoke_all`.

#### ADM-SES-04 · `POST /admin/admin-sessions/export`
Auth `admin:security.export`. Body `ExportRequest`.

#### ADM-ALR-01 · `GET /admin/security-alerts`
Auth `admin:security.view`. Query `kind?`, `severity?`, `status?` (UI default open), `subjectType?`, `q?`, `sort` (default severity desc, `-createdAt`), `page`, `pageSize`.
→ `SecurityAlertDto[]` + meta `{ stats: { open: number; openCriticalHigh: number; resolved: number; blocked: number } }`. Used by: AD SuspiciousActivity.

#### ADM-ALR-02 · `POST /admin/security-alerts/:id/resolve`
Auth `admin:security.edit`. Body `ReasonBody`. → `SecurityAlertDto`. `audit:security_alert.resolve`.

#### ADM-ALR-03 · `POST /admin/security-alerts/:id/block`
Auth `admin:security.edit` (+ `users.edit` for student subjects). Body `ReasonBody`. Student subject → lock + revoke all sessions (`audit:student.block`); admin subject →
deactivate + revoke sessions (`audit:admin.deactivate`). → `SecurityAlertDto`. `audit:security_alert.block`.

#### ADM-ALR-04 · `POST /admin/security-alerts/:id/reopen`
Auth `admin:security.edit`. Does not unlock the subject. → `SecurityAlertDto`. `audit:security_alert.reopen`.

---

## 33. Real-time, uploads & jobs summary

| Concern | Mechanism | Endpoints |
|---|---|---|
| AI tutor answers | **SSE** (`text/event-stream`) on AIT-08; events `meta`, `delta`, `done`, `error`; 15 s heartbeat comments; client aborts via `AbortController` | AIT-08 |
| AI tutor fallback | JSON response + poll AIT-09 every `pollAfterMs` until `complete|failed|blocked` (app when RN EventSource unavailable / network proxies) | AIT-08, AIT-09 |
| Exam timer | server-authoritative `startedAt/endsAt/serverNow`; client skew correction; autosave EXM-05 (15 s + on change, offline queue with `seq`); pg-boss job `exam-auto-submit` at `endsAt + grace` | EXM-03…07 |
| Watch progress | PUT heartbeat every `watchHeartbeatSeconds` (10) + pause/leave/background; idempotent | PRG-01 |
| Video processing | upload via STO-01 signed URL (XHR progress) → ADM-VID-01 → poll ADM-VID-03 every 3 s; provider callback WHK-02 | |
| Payment status | PAY-06 → redirect/deeplink/mock → webhook WHK-01 → poll PAY-08 every 2 s | |
| Notification badges | poll NTF-02 / ADM-ME-06 every 60 s + on focus; Expo push (ME-07) with `data: { link, target }` | |
| Audit live view | poll ADM-AUD-01 with `since` every 10 s | |
| Question import | ADM-IMP-02 (job for large files) → poll ADM-IMP-03 | |
| Exports | ADM-EXP-01 inline or job → ADM-EXP-02 status → ADM-EXP-03 | |

**pg-boss jobs** (schema `eduway_platform_pgboss`; queue names are prefixed `eduway.` — e.g. `eduway.notification-dispatch`; registered in `server/src/jobs/registry.ts`; jobs implemented by other modules are resolved lazily by exported function name: `expireSubscriptionsAndRemind`, `autoSubmitExpiredAttempts`, `rollupDailyAnalytics`, `calculateSettlements`, `processQuestionImport`, `processVideoCallback`, `publishScheduledLessons`, `activateScheduledIncentiveRules`): `notification-dispatch`, `campaign-scheduled-send`, `subscription-expiry` (+ reminders 7/3/1 days via
`subscription_expiry` template), `ai-allowance-reset` (calendar 1st 00:00 platform tz; billing per student), `exam-auto-submit`, `analytics-daily-rollup` (00:30),
`settlement-calculation` (monthly/period end, creates pending settlements), `question-import`, `video-processing-callback`, `embeddings-generate`
(lesson transcripts & question explanations on publish), `lesson-publish-scheduled` (every minute), `incentive-rule-activate` (scheduled versions),
`today-plan-generate` (lazy on first request of the day), `expo-push-receipts`.

---

## 34. Spec deltas, resolved conflicts & implied features

### 34.1 Resolved conflicts

1. **Admin route prefix.** The spec names groups `/students`, `/questions`, `/packages`… for admin CRUD while students also read `/subjects`, `/packages`, `/lessons`.
   To keep audiences, DTO shapes and permission middleware unambiguous, **all admin-audience endpoints live under `/admin/*`** (e.g. spec `/students` → `/admin/students`,
   spec `/questions` CRUD → `/admin/questions`, `/exam-blueprints` → `/admin/exam-blueprints`, `/security/*` → `/admin/roles|admins|audit-logs|admin-sessions|security-alerts`,
   `/settings/*` → `/admin/settings/*`, `/analytics/*` → `/admin/analytics/*`). Student/public paths keep the spec names (`/me`, `/subjects`, `/lessons`, `/quizzes`, `/practice`,
   `/mistakes`, `/exams`, `/ai-tutor`, `/progress`, `/notifications`, `/payments`, `/subscriptions/my`, `/storage`, `/search`, `/health`). Auth stays `/auth` + `/auth/admin/*`.
2. **`phone` vs `mobile`.** ENGINEERING's auth bodies use `phone` → kept for `/auth/*` requests; all entity DTOs keep the frontends' `mobile` field (E.164).
3. **Bilingual shape.** ENGINEERING mandates `{ en, ar }`; the admin UI uses flat `x_en/x_ar`. The API uses `Localized` everywhere; admin integration maps fields (§0.7).
4. **verify-otp vs register.** ENGINEERING: verify-otp returns tokens + `isNewUser`; both frontends collect registration data *before* OTP. Resolution: AUTH-02 accepts an
   optional `registration` object and creates the profile atomically; AUTH-03 remains for profile completion.
5. **Admin 2FA.** UI always routes to `/verify-2fa`; spec says MFA optional. AUTH-10 returns `mfaRequired:false` + tokens when MFA is off (UI must skip the 2FA page),
   and supports `settings.security.adminMfaMandatory` forced enrolment.
6. **Option indices vs ids.** Student UIs use `correctIndex/chosenIndex`; server uses option ids (shuffling, alternative sets). DTOs carry both `…OptionId` and `…Index`
   (index = position in the served `options` array); requests accept `optionId` (preferred) or `chosenIndex` (mistake retry).
7. **Correct answers exposure.** Quiz/practice reveal per answer (QUZ-02/PRA-02), never in the start payload; exam answers only after submit (EXM-08). Bank listing reveals
   only with `reveal=true` for entitled subjects (app detail sheet).
8. **Mistake retry outcome.** Web left status unchanged on correct retry; app auto-mastered. Canonical: correct → `mastered` (spec "mastery update keeps history");
   web's "Mark as mastered" button remains (MST-04, idempotent).
9. **Package pricing.** Admin has one `price` + validity; students show monthly/yearly. Canonical: base plan = `price` (+validity) exposed as `priceMonthly`; optional
   `yearlyPrice` (+`yearlyValidityDays`) exposed as `priceYearly` (`null` → no yearly option). `featured` ↔ `popular`. Admin PackageForm must add yearly price, tagline,
   features, AI quota, comparison and order fields (new inputs; nothing removed).
10. **Package currency.** Student `currency: Localized` → `currency: 'IQD'` + `currencyLabel: Localized`.
11. **Gateways.** Canonical ids `zaincash | fastpay | qicard | asiahawala | visa` (+ `mock` dev). Web `zain→zaincash`, `card→visa`; app `mastercard→visa`; Pricing page
    "prepaid" card removed from methods only if not enabled in PaymentSettings (it is rendered from PUB-09).
12. **Receipt numbers.** Server formats: ref `EDW-XXXX-XXXX`, receipt `R-XXXX-XXXX` (replaces web `EW-#####` and app `EDW-XXXXXXXX`).
13. **Governorates.** Admin ids `gov_bgd` vs student `baghdad`: canonical slug ids (`baghdad`, …, 19 incl. `halabja`).
14. **Subject ids.** Students used `SubjectId` union as id; API returns uuid `id` + `slug`; student path params accept either; slug-keyed maps (`scores`, colours) use `slug`.
15. **Student `chapter` = admin `topic`.** Student DTOs keep `chapters`/`chapterId` (= topic) for drop-in; admin DTOs use topics.
16. **"Paid" definitions** (3 variants in the admin UI) are canonicalised in §29 and stated per field.
17. **Watch heartbeat** web 5 s / app 5 s / spec 10 s → server-driven `heartbeatSeconds` (default 10). **Exam autosave** app on-change vs spec 15 s → both supported (`seq`).
18. **Quiz pass mark** (hardcoded 60 web/app) and **exam pass mark** (hardcoded 50) → quiz rules `passThreshold` / blueprint `passMark` (new admin field, default from LearningSettings).
19. **Exam blueprint vs student exam card.** Admin blueprints are multi-subject without `description`/`passMark`; student cards need both + a single `subjectId`.
    Added `description`, `passMark` to blueprints; `subjectId` = primary row subject; per-user `attemptsLeft/bestScore` split out of the blueprint.
20. **Attempt counting.** Web counted on submit, app on start; canonical: an attempt is consumed on **start** (resume is free); auto-submit guarantees completion.
21. **Referral code formats.** Web `^[A-Za-z0-9-]{4,12}$`, app `^[A-Z0-9]{6,10}$`, school codes `SCH-BAG107` → server accepts `^[A-Za-z0-9-]{4,20}$`; app regex must be relaxed.
22. **Notification links.** App routes vs web `/student/...` routes → `link` is the canonical app route + structured `target` that web maps.
23. **SchoolForm marketer bypass bug** → `marketerId` is not writable via ADM-SCH-05; changes go through ADM-SCH-09 (double-attribution guard).
24. **Milestone draft edits** were silent client-side → audited server-side. **Incentive activation with future `effectiveFrom`** → `scheduled` status instead of immediate.
25. **AI per-user disable reason** (optional on Settings page, required on Abuse page) → optional in API.
26. **Table exports** were client-side & unlogged → server exports, all logged (`exports_log`, `audit:export.create`) and permission-gated (`<module>.export`), including the AI tables.

### 34.2 Features implied by the frontends that the spec did not list (all included above)

* Public CMS: marketing stats, testimonials, FAQ, teachers/about, contact form → support tickets, payment-method catalogue, referral-code validation, school directory (PUB-01…10, ADM-CMS-*, ADM-SUP-*).
* Teacher entity (name, bio, avatar, years, students, rating) — lessons reference `teacherId` (ADM-TCH-*).
* Lesson notes per student (CAT-08/09); lesson resources with signed downloads; caption tracks; quality renditions.
* Today plan, achievements/badges, recent activity feed, weekly study minutes + last-week comparison, streak calendar levels, score trend, subject mastery,
  weak topics (PRG-04…13).
* Practice sessions with results & topic/difficulty breakdowns; bank facets & match counts (BNK-*, PRA-*).
* Exam "upcoming" dates (EXM-02), share-card data (EXM-08 `student.name`).
* AI tutor: conversation list/rename/delete, message feedback, image attachments, suggested prompts, allowance `resetsAt` (AIT-*).
* Notification delete, unread counts by type; notification preferences union (ME-09/10).
* Payment quote/proration, promo validation shape, mock gateway confirm, receipts (json/pdf), billing history, gateway fee configuration, reconciliation import & persisted state.
* Admin: lookups endpoint, dashboard composite, system health, support tickets, student OTP reset & OTP state, entitlement ids & logs, student activity telemetry,
  lesson versions/transition endpoint, video library ops, question similarity/preview/tags, import job, quiz-rule effective, blueprint availability, attempts detail,
  promotion code generation/check/redemptions, settlement generation & payment reference, marketer referral code & attributed students, milestone sets,
  AI flags transcript/warn/flagged users, analytics platform split, export history/download, template variables/preview, campaign platforms & cancel,
  delivery stats/retry, settings sections `payments | learning | marketing | security`, feature-flag platforms/rollout, legal acceptance list, CMS,
  admin inbox notifications, admin preferences, admin password reset & invite acceptance (**new admin pages: reset-password, accept-invite**).

### 34.3 New tables implied (all `eduway_platform_` prefixed)

`governorates`, `teachers`, `lesson_notes`, `lesson_caption_tracks`, `achievements`, `user_achievements`, `today_plan_items`, `support_tickets`, `cms_testimonials`, `cms_faq`,
`ai_message_feedback` (or column on `ai_messages`), `ai_warnings`, `reconciliation_records`, `gateway_settlements`, `milestone_sets`, `milestone_items`, `admin_notifications`,
`uploads` (fileKey registry), `admin_invites`, `password_resets`, `promotion` owner columns, `marketers.code`, `packages.yearly_price/tagline/features/comparison/ai_quota/sort_order`,
`exam_blueprints.description/pass_mark`, `feature_flags.platforms/rollout_pct`, `notes` for schools (`school_notes`), `student_notes`.

### 34.4 Admin UI coverage of the endpoints listed here earlier

All items now have admin UI: Teachers (Content › Teachers), testimonials/FAQ (Settings › CMS), marketing/payments/learning/security settings sections,
support tickets (People › Support tickets, ADM-SUP-01..06), subscriptions list/grant/extend/cancel + export, promotion redemptions + redemption export,
reconciliation import, settlement "Generate", feature-flag create/delete, legal acceptance list, AI suggested-prompts editor, marketer attributed students
and incentive progress (MarketerDetail), export-history export, and the drill-down screens added 2026-10-23 (reads in `website/admin/src/api/drilldown.ts`, strings in
`i18n/modules/drilldown.*.json`):
* **Assessments › Effective Rule** `/assessments/effective-rule?subjectId&lessonId` — ADM-QZR-06 (+ ADM-LSN-01 `view=options` picker, ADM-QZR-01 subject defaults for the
  side-by-side comparison; `assessments.view`).
* **Campaign detail** `/notifications/campaigns/:id` (linked from the Send-campaign history name) — ADM-CMP-02 (polls while `sending`), ADM-DLV-01 `?campaignId&status`,
  ADM-CMP-05 cancel for `scheduled` (`notifications.create`).
* **Incentive-rule detail** `/schools/incentive-rules/:id` · `/marketers/incentive-rules/:id` (module follows `partnerType`; "View details" on the versions page) — ADM-INC-02,
  ADM-INC-07 calculator.
* **Settlement detail** `/schools/settlements/:id` · `/marketers/settlements/:id` (period cell in every settlements table) — ADM-SET-02 with `items`, ADM-SET-04 approve,
  ADM-SET-05 mark paid (`<module>.approve`).
* **Analytics › Daily Metrics** `/analytics/daily` — ADM-ANL-03 with every field + `aiBySubject`, `platform` filter, client CSV of the daily table (`analytics.view`).

No server endpoint was added for these screens. Every admin operation in §35.2 now has a UI caller; the only ones `verify-admin-endpoints.mjs --unused` still lists are the
student/question detail paths built from a variable (`base(id)`, `q(id)`), which the static scan cannot resolve.

### 34.5 Question import row validation (ADM-IMP-02)

`subject` = subject slug; `unit`/`topic` = order numbers within subject/unit; `type` ∈ mcq|true_false|fill_blank; `difficulty` ∈ easy|medium|hard; body_en ≥ 8, body_ar ≥ 5;
non-fill_blank needs ≥ 2 options with any text; each present option needs en **and** ar; `correct` = letter of a present option; `year` empty or 4-digit 2000–2027;
both explanations required; `duplicate` when an existing question in the same topic has similarity ≥ 0.8; tags split on `;` or `|`; source default `EDUWAY Original`;
imported rows are `draft`, author = caller; fill_blank keeps only the `correct` letter's option. Error messages localized; keys = column names.

### 34.6 Analytics export columns (ADM-EXP-01)

| report | rows | columns |
|---|---|---|
| students | createdAt in range | id, name_en, name_ar, mobile, governorate, school, package, subscription, source, platform, created |
| transactions | createdAt in range | ref, student, package, amount, discount, currency, gateway, status, refunded, promo, school, platform, created |
| refunds | requestedAt in range | id, transaction, student, amount, kind, reason, status, requested_by, requested_at, decided_by, decided_at |
| schools | all schools | code, school, governorate, status, tier, paid_students_in_period, revenue_in_period, verified_paid_students, pending_settlement_iqd |
| learning | daily rows | date, dau, wau, mau, watch_minutes, video_completion_pct, quiz_attempts, quiz_completion_pct, exam_attempts |
| ai | daily rows | date, questions, active_users, tokens, cost_usd, q_<slug> per subject |
| audit | at in range | at, actor, role, action, entity, entity_id, summary, ip, device |

---

## 35. Endpoint index

Aliases (documented once, not counted): PUB-12 → CAT-01, PUB-13 → PAY-01, PAY-11 → PUB-09.

### 35.1 Counts by group

| Group | Prefix | Endpoints |
|---|---|---|
| Health | `HLT` | 2 |
| Public / CMS | `PUB` | 11 |
| Auth | `AUTH` | 17 |
| Me (student) | `ME` | 11 |
| Catalog & lessons | `CAT` | 10 |
| Progress & dashboard | `PRG` | 13 |
| Quizzes | `QUZ` | 5 |
| Question bank | `BNK` | 3 |
| Practice | `PRA` | 5 |
| Bookmarks | `BMK` | 4 |
| Mistakes | `MST` | 5 |
| Exams | `EXM` | 9 |
| AI tutor | `AIT` | 10 |
| Notifications | `NTF` | 5 |
| Packages/subscriptions/payments | `PAY` | 10 |
| Webhooks | `WHK` | 3 |
| Storage | `STO` | 2 |
| Search | `SRC` | 1 |
| Admin me/inbox/lookups | `ADM-ME` | 9 |
| Admin dashboard | `ADM-DSH` | 2 |
| Admin support tickets | `ADM-SUP` | 6 |
| Admin students | `ADM-STU` | 21 |
| Admin subjects | `ADM-SUB` | 6 |
| Admin units | `ADM-UNT` | 5 |
| Admin topics | `ADM-TOP` | 4 |
| Admin teachers | `ADM-TCH` | 4 |
| Admin lessons | `ADM-LSN` | 15 |
| Admin videos | `ADM-VID` | 9 |
| Admin questions | `ADM-QST` | 15 |
| Admin question import | `ADM-IMP` | 5 |
| Admin quiz rules | `ADM-QZR` | 7 |
| Admin exam blueprints | `ADM-EBP` | 11 |
| Admin attempts | `ADM-ATT` | 4 |
| Admin packages | `ADM-PKG` | 10 |
| Admin promotions | `ADM-PRM` | 9 |
| Admin subscriptions | `ADM-SBS` | 5 |
| Admin payments | `ADM-PAY` | 6 |
| Admin refunds | `ADM-REF` | 6 |
| Admin reconciliation | `ADM-REC` | 5 |
| Admin schools | `ADM-SCH` | 13 |
| Admin incentive rules | `ADM-INC` | 7 |
| Admin settlements | `ADM-SET` | 8 |
| Admin marketers | `ADM-MKT` | 12 |
| Admin milestones | `ADM-MIL` | 5 |
| Admin AI tutor | `ADM-AI` | 15 |
| Admin analytics | `ADM-ANL` | 5 |
| Admin exports | `ADM-EXP` | 4 |
| Admin notification templates | `ADM-NTT` | 10 |
| Admin campaigns | `ADM-CMP` | 6 |
| Admin deliveries | `ADM-DLV` | 4 |
| Admin settings sections | `ADM-CFG` | 2 |
| Admin feature flags | `ADM-FLG` | 4 |
| Admin legal | `ADM-LGL` | 7 |
| Admin CMS | `ADM-CMS` | 9 |
| Admin roles | `ADM-ROL` | 7 |
| Admin users (admins) | `ADM-ADM` | 8 |
| Admin audit logs | `ADM-AUD` | 4 |
| Admin sessions | `ADM-SES` | 4 |
| Admin security alerts | `ADM-ALR` | 4 |
| **Total** | | **428** (public/student/shared/webhooks 126, admin 302) |

### 35.2 All endpoints

| ID | Method | Path |
|---|---|---|
| HLT-01 | GET | `/health` |
| HLT-02 | GET | `/health/ready` |
| PUB-01 | GET | `/public/app-config` |
| PUB-02 | GET | `/public/governorates` |
| PUB-03 | GET | `/public/schools` |
| PUB-04 | GET | `/public/referral-codes/:code` |
| PUB-05 | GET | `/public/stats` |
| PUB-06 | GET | `/public/testimonials` |
| PUB-07 | GET | `/public/faq` |
| PUB-08 | GET | `/public/teachers` |
| PUB-09 | GET | `/public/payment-methods` |
| PUB-10 | POST | `/public/contact` |
| PUB-11 | GET | `/legal/:doc` |
| PUB-12 (alias) | GET | `/subjects` |
| PUB-13 (alias) | GET | `/packages` |
| AUTH-01 | POST | `/auth/send-otp` |
| AUTH-02 | POST | `/auth/verify-otp` |
| AUTH-03 | POST | `/auth/register` |
| AUTH-04 | POST | `/auth/refresh` |
| AUTH-05 | POST | `/auth/logout` |
| AUTH-06 | POST | `/auth/logout-all` |
| AUTH-07 | GET | `/auth/me` |
| AUTH-08 | POST | `/auth/accept-legal` |
| AUTH-10 | POST | `/auth/admin/login` |
| AUTH-11 | POST | `/auth/admin/mfa/verify` |
| AUTH-12 | POST | `/auth/admin/mfa/setup` |
| AUTH-13 | POST | `/auth/admin/mfa/enable` |
| AUTH-14 | POST | `/auth/admin/mfa/disable` |
| AUTH-15 | POST | `/auth/admin/forgot-password` |
| AUTH-16 | POST | `/auth/admin/reset-password` |
| AUTH-17 | GET | `/auth/admin/invite/:token` |
| AUTH-18 | POST | `/auth/admin/accept-invite` |
| ME-01 | GET | `/me` |
| ME-02 | PATCH | `/me` |
| ME-03 | GET | `/me/sessions` |
| ME-04 | DELETE | `/me/sessions/:sessionId` |
| ME-05 | DELETE | `/me/sessions` |
| ME-06 | GET | `/me/devices` |
| ME-07 | POST | `/me/push-token` |
| ME-08 | DELETE | `/me/push-token` |
| ME-09 | GET | `/me/notification-preferences` |
| ME-10 | PATCH | `/me/notification-preferences` |
| ME-11 | GET | `/me/entitlements` |
| ME-12 | POST | `/me/email/verification` |
| AUTH-30 | POST | `/auth/email/verify` |
| CAT-01 | GET | `/subjects` |
| CAT-02 | GET | `/subjects/:subjectId` |
| CAT-03 | GET | `/subjects/:subjectId/question-stats` |
| CAT-04 | GET | `/subjects/:subjectId/exams` |
| CAT-05 | GET | `/lessons/:lessonId` |
| CAT-06 | GET | `/lessons/:lessonId/stream-url` |
| CAT-07 | GET | `/lessons/:lessonId/resources/:resourceId/url` |
| CAT-08 | GET | `/lessons/:lessonId/note` |
| CAT-09 | PUT | `/lessons/:lessonId/note` |
| CAT-10 | GET | `/lessons/:lessonId/quiz-rule` |
| PRG-01 | PUT | `/progress/watch` |
| PRG-02 | POST | `/progress/complete` |
| PRG-03 | GET | `/progress/lessons` |
| PRG-04 | GET | `/progress/dashboard` |
| PRG-05 | GET | `/progress/subjects` |
| PRG-06 | GET | `/progress/summary` |
| PRG-07 | GET | `/progress/score-trend` |
| PRG-08 | GET | `/progress/weak-topics` |
| PRG-09 | GET | `/progress/streak-calendar` |
| PRG-10 | GET | `/progress/activity` |
| PRG-11 | GET | `/progress/today-plan` |
| PRG-12 | PATCH | `/progress/today-plan/:itemId` |
| PRG-13 | GET | `/progress/achievements` |
| QUZ-01 | POST | `/quizzes/:lessonId/start` |
| QUZ-02 | POST | `/quizzes/attempts/:attemptId/answer` |
| QUZ-03 | POST | `/quizzes/attempts/:attemptId/submit` |
| QUZ-04 | GET | `/quizzes/attempts` |
| QUZ-05 | GET | `/quizzes/attempts/:attemptId` |
| BNK-01 | GET | `/bank/questions` |
| BNK-02 | GET | `/bank/facets` |
| BNK-03 | GET | `/bank/questions/:questionId` |
| PRA-01 | POST | `/practice/start` |
| PRA-02 | POST | `/practice/:sessionId/answer` |
| PRA-03 | POST | `/practice/:sessionId/finish` |
| PRA-04 | GET | `/practice/:sessionId/result` |
| PRA-05 | GET | `/practice/sessions` |
| BMK-01 | GET | `/bookmarks` |
| BMK-02 | GET | `/bookmarks/ids` |
| BMK-03 | PUT | `/bookmarks/:questionId` |
| BMK-04 | DELETE | `/bookmarks/:questionId` |
| MST-01 | GET | `/mistakes` |
| MST-02 | GET | `/mistakes/summary` |
| MST-03 | GET | `/mistakes/:id` |
| MST-04 | PATCH | `/mistakes/:id` |
| MST-05 | POST | `/mistakes/:id/retry` |
| EXM-01 | GET | `/exams/available` |
| EXM-02 | GET | `/exams/upcoming` |
| EXM-03 | POST | `/exams/:blueprintId/start` |
| EXM-04 | GET | `/exams/attempts/:attemptId` |
| EXM-05 | PUT | `/exams/attempts/:attemptId/autosave` |
| EXM-06 | POST | `/exams/attempts/:attemptId/flag` |
| EXM-07 | POST | `/exams/attempts/:attemptId/submit` |
| EXM-08 | GET | `/exams/attempts/:attemptId/result` |
| EXM-09 | GET | `/exams/attempts` |
| AIT-01 | GET | `/ai-tutor/allowance` |
| AIT-02 | GET | `/ai-tutor/suggestions` |
| AIT-03 | GET | `/ai-tutor/conversations` |
| AIT-04 | POST | `/ai-tutor/conversations` |
| AIT-05 | GET | `/ai-tutor/conversations/:id` |
| AIT-06 | PATCH | `/ai-tutor/conversations/:id` |
| AIT-07 | DELETE | `/ai-tutor/conversations/:id` |
| AIT-08 | POST | `/ai-tutor/conversations/:id/messages` |
| AIT-09 | GET | `/ai-tutor/messages/:messageId` |
| AIT-10 | POST | `/ai-tutor/messages/:messageId/feedback` |
| NTF-01 | GET | `/notifications` |
| NTF-02 | GET | `/notifications/unread-count` |
| NTF-03 | POST | `/notifications/:id/read` |
| NTF-04 | POST | `/notifications/read-all` |
| NTF-05 | DELETE | `/notifications/:id` |
| PAY-01 | GET | `/packages` |
| PAY-02 | GET | `/packages/:packageId` |
| PAY-03 | GET | `/subscriptions/my` |
| PAY-04 | POST | `/payments/quote` |
| PAY-05 | POST | `/promotions/validate` |
| PAY-06 | POST | `/payments/initiate` |
| PAY-07 | POST | `/payments/mock/:paymentId/confirm` |
| PAY-08 | GET | `/payments/:paymentId` |
| PAY-09 | GET | `/payments/my` |
| PAY-10 | GET | `/payments/:paymentId/receipt` |
| PAY-11 (alias) | GET | `/payments/methods` |
| WHK-01 | POST | `/payments/webhook/:provider` |
| WHK-04 | GET, POST | `/payments/callback/:provider` |
| WHK-02 | POST | `/webhooks/video/:provider` |
| WHK-03 | POST | `/webhooks/notifications/:provider` |
| STO-01 | POST | `/storage/signed-upload-url` |
| STO-02 | POST | `/storage/signed-download-url` |
| SRC-01 | GET | `/search` |
| ADM-ME-01 | GET | `/admin/me` |
| ADM-ME-02 | PATCH | `/admin/me` |
| ADM-ME-03 | POST | `/admin/me/password` |
| ADM-ME-04 | PATCH | `/admin/me/preferences` |
| ADM-ME-05 | GET | `/admin/me/sessions` |
| ADM-ME-06 | GET | `/admin/me/notifications` |
| ADM-ME-07 | POST | `/admin/me/notifications/:id/read` |
| ADM-ME-08 | POST | `/admin/me/notifications/read-all` |
| ADM-ME-09 | GET | `/admin/lookups` |
| ADM-DSH-01 | GET | `/admin/dashboard` |
| ADM-DSH-02 | GET | `/admin/system/health` |
| ADM-SUP-01 | GET | `/admin/support-tickets` |
| ADM-SUP-02 | PATCH | `/admin/support-tickets/:id` |
| ADM-SUP-03 | GET | `/admin/support-tickets/:id` |
| ADM-SUP-04 | POST | `/admin/support-tickets/:id/replies` |
| ADM-SUP-05 | DELETE | `/admin/support-tickets/:id` |
| ADM-SUP-06 | POST | `/admin/support-tickets/export` |
| ADM-STU-01 | GET | `/admin/students` |
| ADM-STU-02 | GET | `/admin/students/stats` |
| ADM-STU-03 | POST | `/admin/students/export` |
| ADM-STU-04 | POST | `/admin/students/bulk/lock` |
| ADM-STU-05 | POST | `/admin/students/bulk/unlock` |
| ADM-STU-06 | GET | `/admin/students/:id` |
| ADM-STU-07 | POST | `/admin/students/:id/lock` |
| ADM-STU-08 | POST | `/admin/students/:id/unlock` |
| ADM-STU-09 | GET | `/admin/students/:id/sessions` |
| ADM-STU-10 | DELETE | `/admin/students/:id/sessions/:sessionId` |
| ADM-STU-11 | DELETE | `/admin/students/:id/sessions` |
| ADM-STU-12 | GET | `/admin/students/:id/notes` |
| ADM-STU-13 | POST | `/admin/students/:id/notes` |
| ADM-STU-14 | POST | `/admin/students/:id/entitlements` |
| ADM-STU-15 | DELETE | `/admin/students/:id/entitlements/:entitlementId` |
| ADM-STU-16 | GET | `/admin/students/:id/entitlement-logs` |
| ADM-STU-17 | PATCH | `/admin/students/:id/attribution` |
| ADM-STU-18 | POST | `/admin/students/:id/otp/reset` |
| ADM-STU-19 | GET | `/admin/students/:id/activity` |
| ADM-STU-20 | GET | `/admin/students/:id/transactions` |
| ADM-STU-21 | PATCH | `/admin/students/:id` |
| ADM-SUB-01 | GET | `/admin/subjects` |
| ADM-SUB-02 | POST | `/admin/subjects` |
| ADM-SUB-03 | GET | `/admin/subjects/:id` |
| ADM-SUB-04 | PATCH | `/admin/subjects/:id` |
| ADM-SUB-05 | DELETE | `/admin/subjects/:id` |
| ADM-SUB-06 | PUT | `/admin/subjects/order` |
| ADM-UNT-01 | GET | `/admin/subjects/:id/units` |
| ADM-UNT-02 | POST | `/admin/subjects/:id/units` |
| ADM-UNT-03 | PATCH | `/admin/units/:id` |
| ADM-UNT-04 | DELETE | `/admin/units/:id` |
| ADM-UNT-05 | PUT | `/admin/subjects/:id/units/order` |
| ADM-TOP-01 | POST | `/admin/units/:id/topics` |
| ADM-TOP-02 | PATCH | `/admin/topics/:id` |
| ADM-TOP-03 | DELETE | `/admin/topics/:id` |
| ADM-TOP-04 | PUT | `/admin/units/:id/topics/order` |
| ADM-TCH-01 | GET | `/admin/teachers` |
| ADM-TCH-02 | POST | `/admin/teachers` |
| ADM-TCH-03 | PATCH | `/admin/teachers/:id` |
| ADM-TCH-04 | DELETE | `/admin/teachers/:id` |
| ADM-LSN-01 | GET | `/admin/lessons` |
| ADM-LSN-02 | POST | `/admin/lessons` |
| ADM-LSN-03 | GET | `/admin/lessons/:id` |
| ADM-LSN-04 | PATCH | `/admin/lessons/:id` |
| ADM-LSN-05 | DELETE | `/admin/lessons/:id` |
| ADM-LSN-06 | POST | `/admin/lessons/:id/transition` |
| ADM-LSN-07 | POST | `/admin/lessons/:id/approve` |
| ADM-LSN-08 | POST | `/admin/lessons/bulk/transition` |
| ADM-LSN-09 | POST | `/admin/lessons/bulk/delete` |
| ADM-LSN-10 | POST | `/admin/lessons/export` |
| ADM-LSN-11 | GET | `/admin/lessons/:id/versions` |
| ADM-LSN-12 | PUT | `/admin/topics/:id/lessons/order` |
| ADM-LSN-13 | POST | `/admin/lessons/:id/resources` |
| ADM-LSN-14 | PATCH | `/admin/lessons/:id/resources/:resourceId` |
| ADM-LSN-15 | DELETE | `/admin/lessons/:id/resources/:resourceId` |
| ADM-VID-01 | POST | `/admin/videos` |
| ADM-VID-02 | GET | `/admin/videos` |
| ADM-VID-03 | GET | `/admin/videos/:id` |
| ADM-VID-04 | GET | `/admin/videos/stats` |
| ADM-VID-05 | POST | `/admin/videos/:id/cdn-resync` |
| ADM-VID-06 | POST | `/admin/videos/:id/reprocess` |
| ADM-VID-07 | POST | `/admin/videos/bulk/cdn-resync` |
| ADM-VID-08 | DELETE | `/admin/lessons/:id/video` |
| ADM-VID-09 | POST | `/admin/videos/export` |
| ADM-QST-01 | GET | `/admin/questions` |
| ADM-QST-02 | GET | `/admin/questions/stats` |
| ADM-QST-03 | GET | `/admin/questions/:id` |
| ADM-QST-04 | POST | `/admin/questions` |
| ADM-QST-05 | PATCH | `/admin/questions/:id` |
| ADM-QST-06 | DELETE | `/admin/questions/:id` |
| ADM-QST-07 | POST | `/admin/questions/:id/transition` |
| ADM-QST-08 | POST | `/admin/questions/bulk/transition` |
| ADM-QST-09 | POST | `/admin/questions/bulk/delete` |
| ADM-QST-10 | POST | `/admin/questions/:id/duplicate` |
| ADM-QST-11 | POST | `/admin/questions/similar` |
| ADM-QST-12 | GET | `/admin/questions/review-queue` |
| ADM-QST-13 | GET | `/admin/questions/:id/preview` |
| ADM-QST-14 | GET | `/admin/tags` |
| ADM-QST-15 | POST | `/admin/questions/export` |
| ADM-IMP-01 | GET | `/admin/questions/import/template` |
| ADM-IMP-02 | POST | `/admin/questions/import` |
| ADM-IMP-03 | GET | `/admin/questions/import/:importId` |
| ADM-IMP-04 | POST | `/admin/questions/import/:importId/commit` |
| ADM-IMP-05 | GET | `/admin/questions/import/:importId/errors` |
| ADM-QZR-01 | GET | `/admin/quiz-rules` |
| ADM-QZR-02 | PUT | `/admin/quiz-rules/subjects/:subjectId` |
| ADM-QZR-03 | POST | `/admin/quiz-rules` |
| ADM-QZR-04 | PATCH | `/admin/quiz-rules/:id` |
| ADM-QZR-05 | DELETE | `/admin/quiz-rules/:id` |
| ADM-QZR-06 | GET | `/admin/quiz-rules/effective` |
| ADM-QZR-07 | POST | `/admin/quiz-rules/export` |
| ADM-EBP-01 | GET | `/admin/exam-blueprints` |
| ADM-EBP-02 | GET | `/admin/exam-blueprints/stats` |
| ADM-EBP-03 | GET | `/admin/exam-blueprints/:id` |
| ADM-EBP-04 | POST | `/admin/exam-blueprints` |
| ADM-EBP-05 | PUT | `/admin/exam-blueprints/:id` |
| ADM-EBP-06 | DELETE | `/admin/exam-blueprints/:id` |
| ADM-EBP-07 | POST | `/admin/exam-blueprints/:id/publish` |
| ADM-EBP-08 | POST | `/admin/exam-blueprints/:id/archive` |
| ADM-EBP-09 | POST | `/admin/exam-blueprints/:id/duplicate` |
| ADM-EBP-10 | POST | `/admin/exam-blueprints/availability` |
| ADM-EBP-11 | POST | `/admin/exam-blueprints/export` |
| ADM-ATT-01 | GET | `/admin/attempts` |
| ADM-ATT-02 | GET | `/admin/attempts/stats` |
| ADM-ATT-03 | GET | `/admin/attempts/:id` |
| ADM-ATT-04 | POST | `/admin/attempts/export` |
| ADM-PKG-01 | GET | `/admin/packages` |
| ADM-PKG-02 | GET | `/admin/packages/:id` |
| ADM-PKG-03 | POST | `/admin/packages` |
| ADM-PKG-04 | PATCH | `/admin/packages/:id` |
| ADM-PKG-05 | POST | `/admin/packages/:id/duplicate` |
| ADM-PKG-06 | POST | `/admin/packages/:id/archive` |
| ADM-PKG-07 | POST | `/admin/packages/:id/restore` |
| ADM-PKG-08 | DELETE | `/admin/packages/:id` |
| ADM-PKG-09 | PUT | `/admin/packages/order` |
| ADM-PKG-10 | POST | `/admin/packages/export` |
| ADM-PRM-01 | GET | `/admin/promotions` |
| ADM-PRM-02 | GET | `/admin/promotions/stats` |
| ADM-PRM-03 | POST | `/admin/promotions` |
| ADM-PRM-04 | PATCH | `/admin/promotions/:id` |
| ADM-PRM-05 | DELETE | `/admin/promotions/:id` |
| ADM-PRM-06 | GET | `/admin/promotions/check-code` |
| ADM-PRM-07 | GET | `/admin/promotions/generate-code` |
| ADM-PRM-08 | GET | `/admin/promotions/:id/redemptions` |
| ADM-PRM-09 | POST | `/admin/promotions/export` |
| ADM-PRM-10 | POST | `/admin/promotions/:id/redemptions/export` |
| ADM-SBS-01 | GET | `/admin/subscriptions` |
| ADM-SBS-02 | POST | `/admin/subscriptions/grant` |
| ADM-SBS-03 | POST | `/admin/subscriptions/:id/change-package` |
| ADM-SBS-04 | POST | `/admin/subscriptions/:id/extend` |
| ADM-SBS-05 | POST | `/admin/subscriptions/:id/cancel` |
| ADM-SBS-06 | POST | `/admin/subscriptions/export` |
| ADM-PAY-01 | GET | `/admin/payments` |
| ADM-PAY-02 | GET | `/admin/payments/summary` |
| ADM-PAY-03 | GET | `/admin/payments/:id` |
| ADM-PAY-04 | GET | `/admin/payments/:id/receipt` |
| ADM-PAY-05 | POST | `/admin/payments/:id/refunds` |
| ADM-PAY-06 | POST | `/admin/payments/export` |
| ADM-REF-01 | GET | `/admin/refunds` |
| ADM-REF-02 | GET | `/admin/refunds/summary` |
| ADM-REF-03 | POST | `/admin/refunds/:id/approve` |
| ADM-REF-04 | POST | `/admin/refunds/:id/reject` |
| ADM-REF-05 | POST | `/admin/refunds/bulk/approve` |
| ADM-REF-06 | POST | `/admin/refunds/export` |
| ADM-REC-01 | GET | `/admin/reconciliation` |
| ADM-REC-02 | GET | `/admin/reconciliation/comparison` |
| ADM-REC-03 | POST | `/admin/reconciliation/resolve` |
| ADM-REC-04 | POST | `/admin/reconciliation/import` |
| ADM-REC-05 | POST | `/admin/reconciliation/export` |
| ADM-SCH-01 | GET | `/admin/schools` |
| ADM-SCH-02 | GET | `/admin/schools/stats` |
| ADM-SCH-03 | GET | `/admin/schools/:id` |
| ADM-SCH-04 | POST | `/admin/schools` |
| ADM-SCH-05 | PATCH | `/admin/schools/:id` |
| ADM-SCH-06 | DELETE | `/admin/schools/:id` |
| ADM-SCH-07 | POST | `/admin/schools/bulk/status` |
| ADM-SCH-08 | GET | `/admin/schools/:id/students` |
| ADM-SCH-09 | PUT | `/admin/schools/:id/marketer` |
| ADM-SCH-10 | GET | `/admin/schools/:id/incentive-progress` |
| ADM-SCH-11 | GET | `/admin/schools/:id/notes` |
| ADM-SCH-12 | POST | `/admin/schools/:id/notes` |
| ADM-SCH-13 | POST | `/admin/schools/export` |
| ADM-INC-01 | GET | `/admin/incentive-rules` |
| ADM-INC-02 | GET | `/admin/incentive-rules/:id` |
| ADM-INC-03 | POST | `/admin/incentive-rules` |
| ADM-INC-04 | PATCH | `/admin/incentive-rules/:id` |
| ADM-INC-05 | DELETE | `/admin/incentive-rules/:id` |
| ADM-INC-06 | POST | `/admin/incentive-rules/:id/activate` |
| ADM-INC-07 | POST | `/admin/incentive-rules/preview` |
| ADM-SET-01 | GET | `/admin/settlements` |
| ADM-SET-02 | GET | `/admin/settlements/:id` |
| ADM-SET-03 | POST | `/admin/settlements/generate` |
| ADM-SET-04 | POST | `/admin/settlements/:id/approve` |
| ADM-SET-05 | POST | `/admin/settlements/:id/mark-paid` |
| ADM-SET-06 | POST | `/admin/settlements/bulk/approve` |
| ADM-SET-07 | POST | `/admin/settlements/bulk/mark-paid` |
| ADM-SET-08 | POST | `/admin/settlements/export` |
| ADM-MKT-01 | GET | `/admin/marketers` |
| ADM-MKT-02 | GET | `/admin/marketers/stats` |
| ADM-MKT-03 | GET | `/admin/marketers/:id` |
| ADM-MKT-04 | GET | `/admin/marketers/:id/performance` |
| ADM-MKT-05 | POST | `/admin/marketers` |
| ADM-MKT-06 | PATCH | `/admin/marketers/:id` |
| ADM-MKT-07 | DELETE | `/admin/marketers/:id` |
| ADM-MKT-08 | POST | `/admin/marketers/bulk/status` |
| ADM-MKT-09 | POST | `/admin/marketers/:id/schools` |
| ADM-MKT-10 | DELETE | `/admin/marketers/:id/schools/:schoolId` |
| ADM-MKT-11 | GET | `/admin/marketers/:id/students` |
| ADM-MKT-12 | POST | `/admin/marketers/export` |
| ADM-MKT-13 | GET | `/admin/marketers/:id/incentive-progress` |
| ADM-MIL-01 | GET | `/admin/milestone-sets` |
| ADM-MIL-02 | POST | `/admin/milestone-sets` |
| ADM-MIL-03 | PUT | `/admin/milestone-sets/:id` |
| ADM-MIL-04 | DELETE | `/admin/milestone-sets/:id` |
| ADM-MIL-05 | POST | `/admin/milestone-sets/:id/activate` |
| ADM-AI-01 | GET | `/admin/ai/usage` |
| ADM-AI-02 | GET | `/admin/ai/settings` |
| ADM-AI-03 | PATCH | `/admin/ai/settings` |
| ADM-AI-04 | POST | `/admin/ai/settings/enable` |
| ADM-AI-05 | POST | `/admin/ai/settings/disable` |
| ADM-AI-06 | PUT | `/admin/ai/disabled-users/:studentId` |
| ADM-AI-07 | DELETE | `/admin/ai/disabled-users/:studentId` |
| ADM-AI-08 | GET | `/admin/ai/flags` |
| ADM-AI-09 | GET | `/admin/ai/flags/:id` |
| ADM-AI-10 | PATCH | `/admin/ai/flags/:id` |
| ADM-AI-11 | GET | `/admin/ai/flagged-users` |
| ADM-AI-12 | POST | `/admin/ai/flagged-users/:studentId/warn` |
| ADM-AI-13 | POST | `/admin/ai/flags/export` |
| ADM-AI-14 | POST | `/admin/ai/flagged-users/export` |
| ADM-AI-15 | GET | `/admin/ai/models` |
| ADM-ANL-01 | GET | `/admin/analytics/business` |
| ADM-ANL-02 | GET | `/admin/analytics/learning` |
| ADM-ANL-03 | GET | `/admin/analytics/daily` |
| ADM-ANL-04 | GET | `/admin/analytics/topics` |
| ADM-ANL-05 | GET | `/admin/analytics/platform-split` |
| ADM-EXP-01 | POST | `/admin/exports` |
| ADM-EXP-02 | GET | `/admin/exports` |
| ADM-EXP-03 | GET | `/admin/exports/:id/download` |
| ADM-EXP-04 | GET | `/admin/exports/preview` |
| ADM-EXP-05 | POST | `/admin/exports/history/export` |
| ADM-NTT-01 | GET | `/admin/notification-templates` |
| ADM-NTT-02 | GET | `/admin/notification-templates/:id` |
| ADM-NTT-03 | POST | `/admin/notification-templates` |
| ADM-NTT-04 | PATCH | `/admin/notification-templates/:id` |
| ADM-NTT-05 | DELETE | `/admin/notification-templates/:id` |
| ADM-NTT-06 | POST | `/admin/notification-templates/:id/duplicate` |
| ADM-NTT-07 | POST | `/admin/notification-templates/bulk` |
| ADM-NTT-08 | GET | `/admin/notification-templates/variables` |
| ADM-NTT-09 | POST | `/admin/notification-templates/preview` |
| ADM-NTT-10 | POST | `/admin/notification-templates/export` |
| ADM-CMP-01 | GET | `/admin/campaigns` |
| ADM-CMP-02 | GET | `/admin/campaigns/:id` |
| ADM-CMP-03 | POST | `/admin/campaigns/audience-preview` |
| ADM-CMP-04 | POST | `/admin/campaigns` |
| ADM-CMP-05 | POST | `/admin/campaigns/:id/cancel` |
| ADM-CMP-06 | POST | `/admin/campaigns/export` |
| ADM-DLV-01 | GET | `/admin/deliveries` |
| ADM-DLV-02 | GET | `/admin/deliveries/stats` |
| ADM-DLV-03 | POST | `/admin/deliveries/retry` |
| ADM-DLV-04 | POST | `/admin/deliveries/export` |
| ADM-CFG-01 | GET | `/admin/settings/:section` |
| ADM-CFG-02 | PUT | `/admin/settings/:section` |
| ADM-FLG-01 | GET | `/admin/feature-flags` |
| ADM-FLG-02 | PATCH | `/admin/feature-flags/:id` |
| ADM-FLG-03 | POST | `/admin/feature-flags` |
| ADM-FLG-04 | DELETE | `/admin/feature-flags/:id` |
| ADM-LGL-01 | GET | `/admin/legal/:doc/versions` |
| ADM-LGL-02 | POST | `/admin/legal/:doc/versions` |
| ADM-LGL-03 | PATCH | `/admin/legal/versions/:id` |
| ADM-LGL-04 | POST | `/admin/legal/versions/:id/publish` |
| ADM-LGL-05 | DELETE | `/admin/legal/versions/:id` |
| ADM-LGL-06 | GET | `/admin/legal/:doc/stats` |
| ADM-LGL-07 | GET | `/admin/legal/versions/:id/acceptances` |
| ADM-CMS-01 | GET | `/admin/cms/testimonials` |
| ADM-CMS-03 | PATCH | `/admin/cms/testimonials/:id` |
| ADM-CMS-04 | DELETE | `/admin/cms/testimonials/:id` |
| ADM-CMS-02 | POST | `/admin/cms/testimonials` |
| ADM-CMS-05 | GET | `/admin/cms/faq` |
| ADM-CMS-07 | PATCH | `/admin/cms/faq/:id` |
| ADM-CMS-08 | DELETE | `/admin/cms/faq/:id` |
| ADM-CMS-06 | POST | `/admin/cms/faq` |
| ADM-CMS-09 | PUT | `/admin/cms/order` |
| ADM-WA-01 | GET | `/admin/whatsapp/status` |
| ADM-WA-02 | POST | `/admin/whatsapp/connect` |
| ADM-WA-03 | GET | `/admin/whatsapp/qr` |
| ADM-WA-04 | POST | `/admin/whatsapp/disconnect` |
| ADM-WA-05 | POST | `/admin/whatsapp/test-send` |
| ADM-ROL-01 | GET | `/admin/roles` |
| ADM-ROL-02 | GET | `/admin/roles/:id` |
| ADM-ROL-03 | POST | `/admin/roles` |
| ADM-ROL-04 | PUT | `/admin/roles/:id` |
| ADM-ROL-05 | POST | `/admin/roles/:id/clone` |
| ADM-ROL-06 | DELETE | `/admin/roles/:id` |
| ADM-ROL-07 | GET | `/admin/permissions/catalog` |
| ADM-ADM-01 | GET | `/admin/admins` |
| ADM-ADM-02 | POST | `/admin/admins/invite` |
| ADM-ADM-03 | POST | `/admin/admins/:id/resend-invite` |
| ADM-ADM-04 | PATCH | `/admin/admins/:id/role` |
| ADM-ADM-05 | POST | `/admin/admins/:id/reset-mfa` |
| ADM-ADM-06 | POST | `/admin/admins/:id/deactivate` |
| ADM-ADM-07 | POST | `/admin/admins/:id/activate` |
| ADM-ADM-08 | POST | `/admin/admins/export` |
| ADM-AUD-01 | GET | `/admin/audit-logs` |
| ADM-AUD-02 | GET | `/admin/audit-logs/:id` |
| ADM-AUD-03 | GET | `/admin/audit-logs/facets` |
| ADM-AUD-04 | POST | `/admin/audit-logs/export` |
| ADM-SES-01 | GET | `/admin/admin-sessions` |
| ADM-SES-02 | DELETE | `/admin/admin-sessions/:id` |
| ADM-SES-03 | POST | `/admin/admin-sessions/revoke-all` |
| ADM-SES-04 | POST | `/admin/admin-sessions/export` |
| ADM-ALR-01 | GET | `/admin/security-alerts` |
| ADM-ALR-02 | POST | `/admin/security-alerts/:id/resolve` |
| ADM-ALR-03 | POST | `/admin/security-alerts/:id/block` |
| ADM-ALR-04 | POST | `/admin/security-alerts/:id/reopen` |
