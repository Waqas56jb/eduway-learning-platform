# Contract gaps reported by frontend integrators (server builders: resolve all; update API_CONTRACT.md)

## From F2 (website/admin: packages, payments, partners, AI, analytics, notifications, settings, security)
1. Accept these `sort` values (UI sends column ids; unknown sort keys must be ignored, never 500):
   - ADM-SBS-01: endsAt, startedAt · ADM-REF-01: requestedAt, amount · ADM-REC-02: day, gateway, systemAmount, difference
   - ADM-SET-01: period, qualifiedStudents, amount, status, paidAt · ADM-AI-08: createdAt, reason, severity, status
   - ADM-AI-11: flags, open, highest, last · §30 templates: name, type, channel, updatedAt
   - §30 campaigns: name, status, createdAt, audienceCount · §30 deliveries: createdAt
   - security lists: name, lastLogin, status, at, actor, action, entity, entityId, device, browser, ip, location, startedAt, lastActive
   - ADM-SCH-01 + ADM-MKT-01: also `status`; ADM-SCH-08 / ADM-MKT-11: `-createdAt`.
2. ADM-PKG-01 and ADM-ROL-01 are called with `pageSize=100` (return paginated envelope); ADM-FLG-01, ADM-CMS-01/05 are treated as plain arrays.
3. ADM-REC-05 body = `ExportRequest & { table }`.
4. Missing endpoints: subscriptions export; exports-history export; ADM-PRM-08 sort + export; marketer incentive progress.
5. Session DTO: follow §32 `AdminSessionDto` (location/browser strings, deviceType, abroad, admin.email) everywhere.
6. 409 DOUBLE_ATTRIBUTION `details.currentMarketer` = `MarketerRef { id, name }`.
7. Add reasons NO_RECIPIENTS (ADM-CMP-04) and NO_ROWS (ADM-EXP-01) to the §0.3 catalogue (+ en/ar messages).
8. ADM-ANL-02 `kpis` should include previous-period WAU/MAU; ADM-NTT-01 `meta.matrix` = unfiltered totals;
   CMS testimonial: request `avatarFileKey`, response `avatar` (signed URL); `PaymentSettingsDto.gateways` includes
   `mock` iff `mockGatewayEnabled`; ADM-AI-13/14 exports CSV only is fine.
9. ADM-ROL-06 DELETE: accept `confirmKey` from body OR query string.
10. Governorate ids are canonical slugs (`baghdad`).

## From G (app/user)
1. PRA-01 zero matches → reason `NO_QUESTIONS` (add to §0.3 catalogue + en/ar).
2. Promo discount type: unify to `'percent' | 'fixed'` in both PAY-05 and `PriceQuote.promo.discountType`.
3. EXM-03/04: return `lastSavedAt` (server time) on autosave + attempt; client compares with clock-corrected `clientSavedAt`.
4. EXM-08 after time-up: if the attempt is already auto-submitted, return the final result (200) instead of 409 so a queued offline submit resolves.
5. DEVICE_LIMIT_REACHED: `details.sessions: SessionDto[]`; the SAME OTP may be retried with `revokeSessionId` within its validity (do not burn the code on a device-limit rejection).
6. ME-02: omitted school fields = unchanged; validate `avatarPreset` against PUB-01 `avatarPresets`.
7. PUB-03: `governorateId` ranks (boosts) schools, does not filter.
8. PRG-04 dashboard: include `subscription.endsAt` (+ daysRemaining).
9. Caption `.vtt` URLs: signed, fetchable without auth header.
10. MST-03: do not include the correct answer before a retry; reveal it in the MST-05 response.
11. AIT-08 `kind:'welcome'` message: optional; client hides it.
12. Quote: expose `prorationCredit` + `baseValidityDays` (client folds into total for now).
13. Gateways: add `mastercard` (or document card brands map to `card`).
14. STO-01 must accept tutor image + avatar uploads (bucket rules) — client currently uploads chosen images via signed URL.

## From E (website/user)
1. `LessonDetail.unitIndex` is 1-based (document it).
2. PAY-06 `returnUrl` may contain the placeholder `__ID__`; server substitutes the payment id.
3. AIT-08: `text` may be empty ('') when `attachmentFileKey` is present (0–1200 chars).
4. Feature flag key for AI image attachments: `ai_tutor_attachments` (seed it, enabled).
5. Device-limit retry: same code + `revokeSessionId` — do NOT consume the code on DEVICE_LIMIT_REACHED (same as G #5).
6. PRA-01: `mode: 'bookmarks'` combines with any other filters sent.
7. AIT-08 SSE `done` event always carries the full message text.
8. NTF-01 accepts `limit` up to 100; MST-01 `pageSize` up to 100.
9. `SubjectSummary.icon` values: seeded slugs (`math|physics|chemistry|biology|english`) — keep them.
10. PRG-01 accepts keepalive requests (best effort, no special handling needed).

## From F1 (website/admin: auth, dashboard, users, content, questions, assessments, profile)
1. [A] AUTH-13 (MFA enable) must accept the `mfaToken` as bearer during forced enrolment AND return full admin tokens on success (no extra AUTH-11 round-trip needed; keep AUTH-11 working too).
2. [A] AUTH-18 accept-invite with `mfaEnrollmentRequired: true`: tokens may only call profile/MFA endpoints until MFA is enabled (return 403 reason `MFA_ENROLLMENT_REQUIRED` elsewhere).
3. [A] DELETE with body (ADM-STU-11, ADM-STU-15 `reason`): also accept `?reason=` query param.
4. [B] LessonWriteDto `captions[].lang` optional (default `ar`).
5. [B] ADM-SUB-02 `slug` required — admin now sends it (keep validation: `^[a-z0-9-]{2,40}$`, unique).
6. [B] ADM-QZR-01 should return the EFFECTIVE default for every subject (stored or system default from settings).
7. [B] ADM-LSN-01 `view=board|options`: include `subjectId`, `teacherId`, `topic`, and the `subject` ref.
8. [B] ADM-IMP-03 `status: failed` → `failureReason` code (e.g. `IMPORT_PARSE_FAILED`).
9. [B] ADM-QST-12: for duplicates include `duplicateOf { id, code, text }`.
10. [B] SRC-01: accept `scopes` comma-separated; return `lessons[].status` for admins.

## Resolved by A (foundation modules)
- F1-1 AUTH-13 accepts the AUTH-10 `mfaToken` as bearer during forced enrolment and returns `{ mfaEnabled, recoveryCodes, tokens, me }` (AUTH-11 unchanged).
- F1-2 With `settings.security.adminMfaMandatory` and MFA not enrolled, admin tokens only reach `/admin/me*`, `/auth/*`, `/storage/signed-upload-url`; elsewhere 403 `FORBIDDEN` reason `MFA_ENROLLMENT_REQUIRED`.
- F1-3 / F2-9 ADM-STU-11, ADM-STU-15 accept `?reason=`; ADM-ROL-06 accepts `confirmKey` in body or `?confirmKey=`.
- F2-1 Security/admin lists accept the listed sort keys; unknown keys fall back to the default sort (never 500).
- F2-5 `AdminSessionDto` (§32) used by ADM-SES-* and ADM-ME-05; student `SessionDto` additionally carries `deviceType`, `abroad`, `startedAt`.
- F2-8 `PaymentSettingsDto.gateways` includes `mock` only when `mockGatewayEnabled` (always false in production); CMS testimonials take `avatarFileKey`, return `avatar` (signed URL).
- G-5 / E-5 DEVICE_LIMIT_REACHED is evaluated before the OTP is consumed; retry with the same code + `revokeSessionId`.
- G-6 ME-02: omitted fields unchanged; `avatarPreset` must be one of PUB-01 `avatarPresets` (400 `details.fields.avatarPreset`).
- G-7 PUB-03 `governorateId` boosts ranking, never filters. G-14 STO-01 allows `student_avatar` + `ai_attachment` for students.
- E-4 Feature flag `ai_tutor_attachments` seeded (enabled, production).

## Resolution log — Agent D (AI tutor, notifications, jobs, OpenAPI)
- F2 #1 (D scope): sort keys accepted — ADM-AI-08 `createdAt|reason|severity|status`; ADM-AI-11 `flags|open|highest|last`; templates
  `name|type|channel|updatedAt`; campaigns `name|status|createdAt|audienceCount`; deliveries `createdAt` (+ more). Unknown keys fall back to the default. ✅
- F2 #7: `NO_RECIPIENTS` (ADM-CMP-04) and `NO_ROWS` (all exports) added to §0.3 + en/ar messages. ✅
- F2 #8 (D scope): ADM-NTT-01 `meta.matrix` = unfiltered type×channel totals ✅; ADM-AI-13/14 export CSV (XLSX also accepted) ✅.
- G #11: AIT-04 still stores a `kind:'welcome'` message; clients may hide it ✅.
- G #14 (AI part): `ai_attachment` uploads via STO-01 are consumed by AIT-08 (`attachmentFileKey`) ✅.
- E #3: AIT-08 `text` may be '' when `attachmentFileKey` is sent (server substitutes "Explain this image step by step") ✅.
- E #4: feature flag `ai_tutor_attachments` seeded enabled (src/db/seed/engagement.ts) and enforced by AIT-08 ✅.
- E #7: SSE `done` always carries the full message text ✅ (also documented in §12).
- E #8 (D scope): NTF-01 `limit` up to 100 ✅.

## Resolved by Agent B (learning) — contract updated in API_CONTRACT.md
- G#1 / E#6 PRA-01 `NO_QUESTIONS` (+ catalogue); bookmarks/mistakes modes combine with filters.
- G#3 EXM-05 returns `lastSavedAt` (server time); EXM-04 state carries `lastSavedAt`.
- G#4 EXM-08 auto-submits an expired attempt and returns the result (200); 409 `EXAM_IN_PROGRESS` only while running. EXM-07 is idempotent (returns the final status).
- G#8 PRG-04 `subscription.endsAt` (+ `daysRemaining`, `totalDays`).
- G#9 caption `.vtt` URLs are signed storage URLs (no auth header needed).
- G#10 MST-03 conceals the answer until MST-05 (`reveal=true` query to override; mastered mistakes show it).
- E#1 `LessonDetail.unitIndex` is 1-based. E#8 MST-01 `pageSize` ≤ 100. E#9 subject `icon` values are served as stored (seeded slugs). E#10 PRG-01 is idempotent (keepalive-safe).
- F1#4 captions `lang` optional (default `ar`). F1#5 ADM-SUB-02 `slug` required `^[a-z0-9-]{2,40}$`, unique (409 `ALREADY_EXISTS`).
- F1#6 ADM-QZR-01 always returns an (effective, materialized) default for every subject.
- F1#7 ADM-LSN-01 board/options include `subjectId`, `subject`, `teacherId`, `teacher`, `unit`, `topic`.
- F1#8 ADM-IMP-03 `failureReason` when `status:'failed'`. F1#9 `duplicateOf { id, code, text }`. F1#10 SRC-01 `scopes` comma-separated; admin `lessons[].status`.
- F2#1 (learning lists): unknown `sort` keys are ignored, never 500.

## Resolution log — Agent C (packages, promotions, subscriptions, payments, schools, marketers, settlements, analytics, exports)
- F2 #1 (C scope): sort keys accepted (unknown keys fall back to the default, never 500) — ADM-SBS-01 `endsAt|startedAt|status|createdAt|student|package`;
  ADM-REF-01 `requestedAt|amount|status|decidedAt|ref|student`; ADM-REC-02 `day|gateway|systemAmount|reportedAmount|difference|count|state`;
  ADM-SET-01 `period|qualifiedStudents|amount|status|paidAt|createdAt|approvedAt|partner`; ADM-SCH-01/ADM-MKT-01 include `status`;
  ADM-SCH-08 / ADM-MKT-11 accept `-createdAt` (default). ✅
- F2 #2: ADM-PKG-01 returns the paginated envelope (`pageSize` default 100). ✅
- F2 #3: ADM-REC-05 body `ExportRequest & { table: 'daily' | 'comparison' }`. ✅
- F2 #4: added ADM-SBS-06 (subscriptions export), ADM-EXP-05 (`POST /admin/exports/history/export`), ADM-PRM-08 `sort` + ADM-PRM-10
  (redemptions export), ADM-MKT-13 (marketer incentive progress). ✅
- F2 #6: 409 DOUBLE_ATTRIBUTION `details.currentMarketer` = `MarketerRef { id, name, avatarUrl }`. ✅
- F2 #8 (C scope): ADM-ANL-02 `kpis.dau` adds `prevWau`, `prevMau`. ✅
- G #2: promo `discountType` / PAY-05 `type` unified to `'percent' | 'fixed'` (PAY-05 also returns a localized `message`). ✅
- G #12: `PriceQuote.prorationCredit` + `baseValidityDays` returned; `total` already nets the credit. ✅
- G #13: gateway input aliases accepted (`mastercard`/`card`/`master` → `visa`, `zain` → `zaincash`, `asia` → `asiahawala`); card brands map to `visa`. ✅
- E #2: PAY-06 `returnUrl` / `returnScheme` `__ID__` placeholder replaced with the payment id. ✅
