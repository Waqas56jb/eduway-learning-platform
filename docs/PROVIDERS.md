# EDUWAY — External Providers (plug-in guide)

Every external integration sits behind an interface in `server/src` and is selected by environment variables.
To go live, add the credentials to `server/.env`, flip the provider variable and restart the API. You don't need
to change any code.

- **Safe default.** If a provider has no credentials, the server uses that provider's mock. The server always starts and all
  tests pass without credentials. `NODE_ENV=test` always uses the mocks.
- **Startup log.** Each provider gets one log line on startup, for example
  `provider sms: twilio` or `provider sms: twilio requested but not configured — using mock` with `missing: [TWILIO_ACCOUNT_SID]`.
  The log contains only provider ids and variable **names**. It never contains secret values.
- **Templates.** Every variable is listed in `server/.env.example` with a comment.

| Area | Switch | Values | Code |
|---|---|---|---|
| SMS / OTP | `SMS_PROVIDER` | `mock` (default) · `twilio` · `whatsapp_cloud` · `http` | `server/src/common/providers/sms.ts` |
| WhatsApp channel | `WHATSAPP_PROVIDER` | same values + `baileys` (linked number, QR in admin; unofficial); defaults to `SMS_PROVIDER` | same + `server/src/common/services/whatsapp/` |
| Email | `EMAIL_PROVIDER` | `mock` · `smtp` (unset = smtp when SMTP is configured) | `server/src/common/providers/mail.ts` |
| Push | `PUSH_PROVIDER` | `auto` (Expo in production) · `expo` · `mock` | `server/src/modules/notifications/channels.ts` |
| AI tutor | `AI_PROVIDER` | unset (admin setting) · `anthropic` · `openai` · `azure` · `mock` | `server/src/modules/ai-tutor/providers/` |
| Payments | per-gateway credentials | ZainCash · FastPay · Qi Card | `server/src/modules/payments/gateways/` |

---

## 1. SMS / OTP and WhatsApp

`SMS_PROVIDER` handles the `sms` channel (OTP by SMS, SMS campaigns). `WHATSAPP_PROVIDER` handles the `whatsapp`
channel (OTP by WhatsApp, WhatsApp campaigns) and defaults to `SMS_PROVIDER`. You can mix them, for example SMS through
Twilio and WhatsApp through Meta Cloud API.

**Error handling.** Provider 4xx errors (invalid number, unapproved template, bad credentials) are permanent: the delivery
fails and is not retried. 5xx and 429 errors are retried with backoff, up to 3 attempts. If an OTP send fails, the OTP is
discarded and the client receives `502 OTP_SEND_FAILED`.

### Twilio (SMS + WhatsApp)
| Variable | Where to get it |
|---|---|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | console.twilio.com → Account Info |
| `TWILIO_FROM` **or** `TWILIO_MESSAGING_SERVICE_SID` | Phone Numbers → an SMS-capable number, or Messaging → Services. Iraq (+964) usually needs an alphanumeric sender or Messaging Service, so check Twilio's Iraq SMS guidelines. |
| `TWILIO_WHATSAPP_FROM` | Messaging → Senders → WhatsApp senders (approved number, without the `whatsapp:` prefix) |
| `TWILIO_WHATSAPP_CONTENT_SID` | Content Template Builder → an **approved** authentication template with variable `{{1}}` = code (`HX…`). Without it, WhatsApp messages are sent as free text, which WhatsApp only delivers inside a 24-hour session. |

Set `SMS_PROVIDER=twilio` (and `WHATSAPP_PROVIDER=twilio` if you want WhatsApp too).

**How to test**
1. Use a trial account with a verified recipient number, set the variables, and restart.
2. The startup log should show `provider sms: twilio`.
3. Call `POST /api/v1/auth/send-otp { "phone": "+964…", "channel": "sms" }` and check that the SMS arrives.
4. Check the message in Twilio Console → Monitor → Messaging logs.

### Meta WhatsApp Cloud API
| Variable | Where to get it |
|---|---|
| `WHATSAPP_CLOUD_TOKEN` | Meta Business Settings → System users → generate a **permanent** token with `whatsapp_business_messaging` (the temporary token from API Setup expires in 24 h) |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | developers.facebook.com → your app → WhatsApp → API Setup → *Phone number ID* |
| `WHATSAPP_CLOUD_OTP_TEMPLATE` | WhatsApp Manager → Message templates → create an **Authentication** template (copy-code button) and wait until it is approved. Enter its name here. |
| `WHATSAPP_CLOUD_TEMPLATE_LANG` | the template language code (`ar`, `en_US`, …) |
| `WHATSAPP_CLOUD_OTP_BUTTON` | `true` (default) if the template has a copy-code / one-tap button, `false` if it has none |
| `WHATSAPP_CLOUD_NOTIFY_TEMPLATE` | optional **Utility** template with body `{{1}}`, used for WhatsApp campaigns. Without it, campaigns are sent as plain text (24-hour window only). |
| `WHATSAPP_CLOUD_API_VERSION` | default `v21.0` |

Set `WHATSAPP_PROVIDER=whatsapp_cloud`. If you set `SMS_PROVIDER=whatsapp_cloud`, SMS-channel OTPs are also delivered over WhatsApp.

**How to test**
1. Add your phone as a test recipient in API Setup.
2. Call `POST /auth/send-otp { "phone": "+964…", "channel": "whatsapp" }`.
3. The template message should arrive with the code. Errors (for example `132001 template does not exist`) appear in the API log and on the delivery row.

### Linked WhatsApp number (Baileys — QR in the admin portal)

> ⚠️ **Warning — unofficial client.** `baileys` (`@whiskeysockets/baileys`) is an **unofficial WhatsApp Web client**. Using it is
> **against WhatsApp's Terms of Service**, and WhatsApp can **restrict or permanently ban the number at any time, without notice**.
> - Use a **dedicated number** for EDUWAY (a new SIM/eSIM), never a personal number or your main business number.
> - Keep the phone switched on and online now and then; do not use the number for bulk or unsolicited messages.
> - For scale, or when deliverability matters, use the official **WhatsApp Cloud API** (`WHATSAPP_PROVIDER=whatsapp_cloud`, above):
>   approved templates, no ban risk for OTPs, but Meta business verification and per-conversation pricing.

| Variable | Notes |
|---|---|
| `WHATSAPP_PROVIDER=baileys` | sends the `whatsapp` channel (OTPs) from the linked number. `SMS_PROVIDER` stays your SMS provider and is the **fallback**. |
| `WHATSAPP_SESSION_SECRET` | random string of at least 32 characters, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. It encrypts the WhatsApp session stored in the database (AES-256-GCM, HKDF-derived key). **Changing it invalidates the stored session**, so you must scan the QR again. Without it, the provider falls back to the mock and the admin page shows "not configured". |

How it works:
- **Linking.** Admin → Settings → WhatsApp → **Link WhatsApp** shows a QR code (it refreshes automatically about every 20 s; after about 2 minutes
  without a scan the attempt stops with "QR expired" and you click again). On the phone: WhatsApp → Settings / ⋮ → **Linked devices** →
  **Link a device** → scan.
- **Session storage.** The session (credentials + signal keys) lives in `eduway_platform_whatsapp_auth`, encrypted. Nothing is stored on disk, so
  Railway redeploys keep the link. The status, linked number and current QR are in `eduway_platform_whatsapp_sessions`.
- **One socket per deployment.** The instance that holds the lease row (renewed every 10 s, expires after 30 s) runs the socket. Other
  instances read the status/QR from the row and take over when the lease expires. A graceful shutdown hands the lease over at once.
- **Reconnects.** A dropped connection reconnects with exponential backoff (1 s → 60 s). If the phone logs the device out, WhatsApp
  bans/forbids the number, or another WhatsApp Web session replaces it, the stored session is cleared (when it is no longer usable), the
  status becomes `disconnected`, and an admin must link again.
- **Sending OTPs.** When the linked number is connected, `POST /auth/send-otp` without a `channel` uses WhatsApp. The server checks that the
  student's number is on WhatsApp (`onWhatsApp`). The message is queued on pg-boss (`eduway.whatsapp-send`, encrypted payload) and sent one
  at a time with a random 1.2–3.5 s gap and a short "typing…" presence, which lowers the ban risk.
  The text is bilingual: the student's language first (account language, else `Accept-Language`), for example
  `رمز التحقق الخاص بك في EDUWAY هو: 123456` / `صالح لمدة 5 دقائق. لا تشارك هذا الرمز مع أي شخص.` + the English equivalent. The validity comes
  from Settings → OTP.
- **Fallback.** If the session is disconnected, the number is not on WhatsApp, the send fails, or the API instance has no live socket, the OTP
  is sent by `SMS_PROVIDER` instead. `otp_codes.channel` / `provider` record what was actually used, and the `send-otp` response `channel`
  tells the web/app which one to show ("sent via WhatsApp"). Campaign messages on this provider do **not** fall back to SMS; they fail.

**How to test**
1. Set both variables and restart. The startup log shows `provider whatsapp: baileys`.
2. Admin → Settings → WhatsApp → **Link WhatsApp**, and scan with the dedicated phone. The status becomes **Connected** with the number and profile name.
3. Use **Send test message** to your own WhatsApp.
4. Sign in on the web or app with a student number that has WhatsApp. The code arrives on WhatsApp and the OTP screen says "sent via WhatsApp".
   Try a number without WhatsApp (or **Disconnect**): the code goes by SMS.

### Generic HTTP gateway (Korek, Asiacell, or any local aggregator)
`SMS_PROVIDER=http`, `SMS_HTTP_URL`, `SMS_HTTP_TOKEN`. The server POSTs `{ to, text, channel }` with a bearer token and expects
`{ id }` back. If the vendor uses a different request format, write a small adapter that implements `SmsProvider`.

---

## 2. Email (SMTP via nodemailer)
| Variable | Notes |
|---|---|
| `EMAIL_PROVIDER` | `smtp`, or leave unset (auto) |
| `SMTP_URL` | e.g. `smtps://user:pass@smtp.example.com:465`. This **or** the separate fields below. |
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (default `true` on 465), `SMTP_USER`, `SMTP_PASS` | from your mail provider (Google Workspace, Microsoft 365, Amazon SES SMTP credentials, Mailgun, Brevo, …) |
| `MAIL_FROM` | `EDUWAY <no-reply@your-domain>`. The domain must be verified (SPF/DKIM) with your provider. With Gmail / Google Workspace SMTP the address part is replaced by `SMTP_USER` automatically (Gmail rewrites it anyway) and the display name is kept: `"EDUWAY" <account@gmail.com>`. |
| `MAIL_RATE_PER_MINUTE` | default `20`. Outgoing throttle; deliveries over the limit go back to the queue for the next minute without using a retry attempt. Gmail personal accounts allow ~500 messages/day. |
| `MAIL_DEV_ALLOWLIST` | outside production only: comma-separated mailboxes that may receive real mail (default `SMTP_USER`; `+aliases` allowed). Mail to anyone else (seed admins, demo students) is redirected to the first address with the subject `[DEV → original@address] …`. Ignored when `NODE_ENV=production`. |

**Gmail example (development).** `EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`,
`SMTP_USER=<account>@gmail.com`, `SMTP_PASS=<16-character app password>` (Google Account → Security → 2-Step Verification →
App passwords), `MAIL_FROM="EDUWAY <account@gmail.com>"`.

### How email is sent
- **Templates** — `server/src/modules/notifications/email/catalog.ts` (+ `layout.ts`): branded, responsive, table-based HTML
  with a plain-text part. Every email contains **both languages**: the recipient's language first (Arabic RTL by default,
  English when the admin/student language is `en`), then the other. All variables are HTML-escaped; only http(s) links are
  rendered. Templates: `admin_password_reset`, `admin_invite`, `admin_password_changed`, `admin_mfa_enabled`,
  `admin_mfa_disabled`, `admin_new_device_login`, `admin_alert`, `admin_export_ready`, `email_verification`,
  `payment_receipt` (receipt PDF attached), `subscription_activated`, `subscription_expiring`, `subscription_expired`,
  `support_reply`, `notification` (campaign / template texts on the email channel).
- **Queue** — `queueEmail()` (`email/send.ts`) writes an `email` row to the delivery log
  (`eduway_platform_notification_deliveries`, `payload.template` + variables) and pokes the pg-boss job
  `eduway.notification-dispatch` without awaiting it: requests never wait for SMTP. The dispatcher renders and sends,
  records `sent` + the SMTP `provider_message_id`, retries transient failures with backoff (3 attempts, cron sweep every
  2 minutes) and fails permanently on SMTP 5xx / invalid recipients. Campaign and `notify()` email deliveries use the same
  path and the same branded layout.
- **One-time links** (reset, invite, email confirmation) are removed from the delivery row once the delivery is final
  (`payload.scrubbed = true`; an admin "retry" of such a row fails with "request a new email"). `NODE_ENV=development`
  keeps them so local tests can read the link from the row.
- **Who gets what**
  - Admins: password-reset link (single use, newest link only, expiry = `auth.passwordResetExpiryMinutes`), invite with
    set-password link, password changed (reset or profile), 2FA enabled / disabled (also when another admin resets it),
    sign-in from a new device/browser. These security emails are always sent.
  - Admin alerts: every new admin-inbox item (`adminInbox.notify`: new support ticket, question import finished,
    settlement-file reconciliation mismatches, gateway amount/currency mismatch on a payment) is also emailed, and a
    background export emails its requester a download link (`/analytics/exports?download=<id>`). Admins can switch these
    off with **Profile → Preferences → Email alerts** (`preferences.emailAlerts`).
  - Students: only a **confirmed** email receives mail (`users.email_verified_at`). Setting/changing the email (profile,
    registration, admin edit) sends a confirmation link to `USER_APP_URL/verify-email?token=…` (24 h, single use).
    Then: payment receipt with the PDF attached, subscription activated (manual grant), expiring (7/3/1 days) and expired
    (both honour the student's *payments* switch), support-ticket replies, and campaigns / notifications on the email
    channel (student's *email* switch).
  - Contact-form tickets (no account): when the ticket contact is an email address the admin's reply is emailed to it.

**How to test**
1. Set the variables and restart. The startup log should show `provider email: smtp`.
2. Admin portal → *Forgot password* (or invite an admin / send an email campaign). The delivery row in
   Notifications → Delivery log shows `sent` with the provider; `provider_message_id` holds the SMTP message id.
3. Failed sends are recorded on the delivery row and retried. Without a real mailbox, use a sandbox SMTP service
   (Mailtrap, Ethereal).

---|---|
| `EMAIL_PROVIDER` | `smtp`, or leave unset (auto) |
| `SMTP_URL` | e.g. `smtps://user:pass@smtp.example.com:465`. This **or** the separate fields below. |
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (default `true` on 465), `SMTP_USER`, `SMTP_PASS` | from your mail provider (Google Workspace, Microsoft 365, Amazon SES SMTP credentials, Mailgun, Brevo, …) |
| `MAIL_FROM` | `EDUWAY <no-reply@your-domain>`. The domain must be verified (SPF/DKIM) with your provider. |

**How to test**
1. Set the variables and restart. The startup log should show `provider email: smtp`.
2. Trigger an admin invite or password reset, or send a notification campaign with the email channel.
3. Failed sends are recorded on the delivery row and retried. If you don't have a real mailbox, use a sandbox SMTP service
   (Mailtrap, Ethereal) to test.

---

## 3. Push (Expo, via `expo-server-sdk`)
| Variable | Notes |
|---|---|
| `PUSH_PROVIDER` | `expo` (or `auto`, which uses Expo when `NODE_ENV=production`) |
| `EXPO_ACCESS_TOKEN` | expo.dev → Account settings → Access tokens. Required only if *Enhanced push security* is on for the project. |

FCM (Android) and APNs (iOS) credentials are uploaded to Expo (`eas credentials`), not to this server.

How sending works:
- Messages are chunked (100 per request).
- Each ticket is mapped back to its delivery row.
- Malformed tokens and `DeviceNotRegistered` tickets **revoke** the token in `eduway_platform_push_tokens`.
- The `eduway.expo-push-receipts` job (every 15 min) fetches receipts in chunks of 300. Each `sent` delivery becomes
  `delivered` or `failed`, and dead tokens are revoked.

**How to test**
1. Install the app build on a device and sign in, so the device registers its token.
2. Send a push campaign to yourself from the admin portal.
3. The delivery should go `sent`, then `delivered` once receipts are fetched (about 15 min later).
4. You can also send a test push from Expo's tool at expo.dev/notifications.

---

## 4. AI tutor
The provider comes from `AI_PROVIDER` if it is set. Otherwise it comes from the admin setting (AI Tutor → Settings → provider/model).
If the selected provider has no API key, the offline mock answers. Allowances and usage are unchanged for every provider: one question
counts only after a successful answer. Tokens come from the provider's usage report and cost from the admin per-1k prices.

### Anthropic (official `@anthropic-ai/sdk`, streamed to the existing SSE endpoint)
| Variable | Notes |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API keys |
| `AI_PROVIDER=anthropic` | or choose Anthropic in the admin settings |
| `ANTHROPIC_MODEL` | default `claude-sonnet-5-5`. Used when the admin-selected model is not a Claude model. |
| `ANTHROPIC_SERVER_FALLBACK` | default `true`. Sends `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) so that a policy refusal is retried on a fallback model. If a request is still refused, the student gets a polite localized message. Set `false` if a proxy rejects beta headers. |
| `ANTHROPIC_BASE_URL` | default `https://api.anthropic.com` |

`temperature` is not sent to current Claude models, which reject non-default sampling. Legacy models (≤ 4.6) still receive it.

### OpenAI (and Azure OpenAI) — current live configuration
| Variable | Notes |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys. Also enables real embeddings for the knowledge base (RAG). Never log or commit it. |
| `AI_PROVIDER=openai` | or choose OpenAI in the admin settings |
| `OPENAI_MODEL` | default **`gpt-6-luna`** (cost-effective: $0.10 / 1M input, $0.50 / 1M output, Oct 2026 list price). Used when the admin-selected model is not an OpenAI model; an OpenAI model chosen in Admin → AI Tutor → Settings wins (catalogue: gpt-6-luna, gpt-6-sol, gpt-5.4-mini, gpt-4o, gpt-4o-mini). |
| `OPENAI_REASONING_EFFORT` | default `low` (`none`·`minimal`·`low`·`medium`·`high`). Sent as `reasoning_effort` to reasoning models (gpt-5+/gpt-6/o-series). |
| `OPENAI_BASE_URL` | default `https://api.openai.com/v1` |
| `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL` (`https://<res>.openai.azure.com/openai/deployments/<deployment>`) | `AI_PROVIDER=azure` |

Model parameters are chosen per family: reasoning models (gpt-5+, gpt-6, o-series) get `max_completion_tokens` (= admin
max tokens + headroom for hidden reasoning: none 0 · minimal 256 · low 1024 · medium 4096 · high 8192) and `reasoning_effort`,
and no `temperature` (they reject non-default values). gpt-4o-style models keep `max_tokens` + `temperature`. Answers stream
over the existing SSE endpoint; `usage` (prompt / completion tokens, reasoning included) from the final stream chunk feeds the
allowance and cost accounting. **Set the admin per-1k prices to the model's prices** (gpt-6-luna: input `0.0001`, output
`0.0005` USD per 1k — configured on the dev DB).

Tutor behaviour (server/src/modules/ai-tutor/service.ts `systemPrompt`): persona for Iraqi 6th preparatory scientific students
(السادس الإعدادي العلمي, ministerial exams), Arabic (فصحى مبسّطة) unless the request `lang` is `en`, math/physics/chemistry in
`$…$` / `$$…$$` LaTeX only (stray `\(…\)` / `\[…\]` are rewritten before the answer is stored), grounded on the retrieved
course excerpts.

### Knowledge base (RAG, pgvector)
| Variable | Notes |
|---|---|
| `AI_EMBEDDING_MODEL` | default `text-embedding-3-small` (1536 dims, $0.02 / 1M tokens). Needs `OPENAI_API_KEY`; without it, deterministic offline mock embeddings are used. |
| `AI_EMBEDDING_COST_PER_1M_USD` | default `0.02`; only used for the reindex cost estimate shown in admin. |

- **Storage:** `eduway_platform_embeddings` (migration `012_embeddings`, created only when the shared `vector` extension is
  enabled; the type and operator class are qualified with the extension's schema, e.g. `extensions.vector`, so nothing depends
  on `search_path`) with HNSW cosine index `eduway_platform_idx_embeddings_vec`. Run log `eduway_platform_kb_index_runs`
  (migration `405_knowledge_base`).
- **Sources:** published lessons (title, subject/unit/chapter path, description, transcript), units, chapters (topics), published
  questions with explanations (+ correct option), active CMS FAQs — one document per locale (a missing locale falls back to the
  other language), ~1000-char chunks each prefixed with the title.
- **Incremental:** each chunk's hash = sha256(model, title, content); unchanged chunks are skipped, changed ones embedded in
  batches of 96 per OpenAI call and upserted with one SQL statement per batch; unpublished/deleted sources are removed.
- **Triggers:** admin content create/update/delete/publish (lessons, units, chapters, subjects, questions, FAQs) → debounced (4 s),
  scoped run (pg-boss `eduway.kb-index`); Admin → AI Tutor → Settings → *Knowledge base* → **Reindex knowledge base**
  (`aitutor.edit`, progress shown live) or *Re-embed everything*; nightly `eduway.embeddings-generate` (23:30 UTC);
  `npm run kb:index [-- --force]`.
- **Retrieval:** the question embedding is cached (1 h LRU); ONE SQL statement does top-k cosine search restricted to the
  conversation subject + subjects the student is currently entitled to (FAQs always), excludes questions of a live exam,
  boosts the current `lessonId`, keeps ≤ 2 chunks per source, drops chunks below similarity 0.25 or > 0.12 below the best hit.
  If the vector index is unavailable it falls back to keyword search. Sources are returned in `TutorMessage.citations`.
- **Initial index (dev DB, 2026-10-23):** 176 sources → 352 chunks (69 lessons, 17 units, 32 chapters, 52 question
  explanations, 6 FAQs × 2 locales), 39,954 embedding tokens ≈ **$0.0008**; incremental re-runs with no changes cost $0.

**How to test**
1. Set the key (`AI_PROVIDER=openai`) and restart. The startup log should show `provider ai: openai`.
2. `npm run migrate` (applies `012_embeddings` once pgvector is enabled, and `405_knowledge_base`), then `npm run kb:index`
   (or Admin → AI Tutor → Settings → Reindex knowledge base). The card shows sources/chunks per type and the last run.
3. As a student, ask the tutor a question. The answer streams over SSE (`delta` events, then `done`); `done.message.citations`
   lists the lessons used, and the message row stores `model`, `tokensIn`, `tokensOut`, `costUsd`; the allowance drops by one.
4. `AI_FORCE_MOCK=true` switches back to the mock instantly.

---

## 5. Payments

**Common setup for all real gateways:**
- `PUBLIC_API_URL` must be the public HTTPS base of this API (e.g. `https://api.eduway.iq`). Gateways call back to:
  - redirect / finish: `{PUBLIC_API_URL}/api/v1/payments/callback/<gateway>` (WHK-04, GET or POST). After verifying, it redirects the browser
    with 302 to the app's `returnScheme` / `returnUrl` (only app schemes or our own web origins), adding `paymentId` and `status`.
  - server-to-server: `{PUBLIC_API_URL}/api/v1/payments/webhook/<gateway>` (WHK-01).
- **Enable the gateway** in Admin → Settings → Payments (gateway list).
- **Without credentials** a gateway stays a stub. Production rejects it with `PAYMENT_GATEWAY_DISABLED`. Development
  confirms it through the MockGateway (`POST /payments/mock/:id/confirm`). The startup log shows `live`, `mock-confirm` or `disabled` for each gateway.

**Safety (unchanged).**
- Every result goes through the idempotent webhook pipeline. The event id is `<gateway>:<txId>:<status>`. A duplicate,
  replay or second callback is recorded but never grants access twice.
- An amount that differs from the payment total marks the payment failed.
- Nothing from the browser is trusted:
  - ZainCash tokens are verified with the merchant secret **and** cross-checked against the status API.
  - FastPay IPNs and Qi notifications are re-read from the gateway API before they are applied.

### ZainCash
| Variable | Notes |
|---|---|
| `ZAINCASH_MERCHANT_ID`, `ZAINCASH_SECRET`, `ZAINCASH_MSISDN` | issued by ZainCash at merchant onboarding. ZainCash's public developer docs list shared **test** credentials for the test environment. |
| `ZAINCASH_ENV` | `test` (https://test.zaincash.iq) or `live` (https://api.zaincash.iq) |
| `ZAINCASH_LANG`, `ZAINCASH_SERVICE_TYPE` | page language (`ar`/`en`/`ku`) and the description shown to the payer |

Flow:
1. `POST /transaction/init` with a HS256 JWT (`amount, serviceType, msisdn, orderId, redirectUrl`).
2. The student pays on `/transaction/pay?id=…`.
3. ZainCash redirects the browser to `/payments/callback/zaincash?token=<JWT>`.
4. The server verifies the token, confirms with `/transaction/get` and applies the result. The minimum amount is 250 IQD.

**Confirm with ZainCash before go-live** (also listed as TODOs in `gateways/zaincash.ts`):
- that your account uses the v1 JWT API (newer merchants may get the v2 "pg-api" OAuth credentials instead)
- the callback JWT field names
- the `/transaction/get` response fields

ZainCash has no public refund API. Approving a refund records a `zaincash_manual_…` reference, and you complete the reversal in the
ZainCash merchant portal.

**How to test**
1. Set `ZAINCASH_ENV=test` with the test credentials, a public `PUBLIC_API_URL` (use a tunnel such as ngrok or Cloudflare Tunnel in
   development) and enable ZainCash in admin settings.
2. Start a checkout. `redirectUrl` should point at `test.zaincash.iq`.
3. Pay with ZainCash's published test wallet.
4. The payment should become `paid` and the browser should return to the app.

### FastPay
| Variable | Notes |
|---|---|
| `FASTPAY_STORE_ID`, `FASTPAY_SECRET` (store password) | FastPay merchant panel → store credentials |
| `FASTPAY_ENV` | `staging` (https://staging-apigw-merchant.fast-pay.iq) or `live` (https://apigw-merchant.fast-pay.iq) |

In the FastPay merchant panel, set:
- **IPN URL** = `{PUBLIC_API_URL}/api/v1/payments/webhook/fastpay`
- success / fail / cancel URLs = `{PUBLIC_API_URL}/api/v1/payments/callback/fastpay`

Flow: initiation returns a `redirect_uri`, and the order id is our payment ref. The IPN is unsigned, so every IPN and return is
re-validated with `POST /payment/validate` before it is applied. Refunds call the refund API.

**Confirm with FastPay before go-live:**
- endpoint paths and hosts for your store
- whether `cart` is required
- the exact `status` values (assumed `Success` / `Failed` / `Cancelled`)
- the refund request fields

**How to test**
1. Use staging credentials and the sandbox wallet from FastPay.
2. Complete a checkout.
3. In Admin → Payments → transaction detail, a verified webhook event appears in the timeline.

### Qi Card
| Variable | Notes |
|---|---|
| `QICARD_TERMINAL_ID`, `QICARD_USERNAME`, `QICARD_SECRET` (API password) | issued by Qi at merchant onboarding |
| `QICARD_ENV` | `uat` (https://uat-sandbox-3ds-api.qi.iq) or `live` (https://3ds-api.qi.iq) |
| `QICARD_WEBHOOK_PUBLIC_KEY` | optional PEM public key for verifying notification signatures. Leave it unset until Qi confirms the signature scheme, because the status re-check is authoritative on its own. |

Flow:
1. `POST /api/v1/payment` (Basic auth + `X-Terminal-Id`) with `finishPaymentUrl` = our callback and `notificationUrl` = our webhook.
2. The student pays on `formUrl`.
3. Both the notification and the finish redirect re-read `GET /api/v1/payment/{id}/status`.
4. `SUCCESS` → paid; `FAILED` / `AUTHENTICATION_FAILED` → failed; `CANCELED` → cancelled.

Refunds call `POST /api/v1/payment/{id}/refund`.

**Confirm with Qi before go-live:**
- hosts and paths
- the auth scheme
- status values
- the notification signature header, algorithm and signed content
- amount units
- refund fields

**How to test**
1. Use the UAT terminal and Qi's UAT test cards.
2. Complete a 3DS checkout.
3. You should land back in the app with `status=paid`, and Admin → Payments shows the verified event.

### AsiaHawala / Visa-Mastercard
These are still stubs: HMAC `X-Signature` webhooks with `*_SECRET`, and no hosted-page API calls. Add adapters in
`server/src/modules/payments/gateways/` once a merchant contract exists.

---

## 6. Running the adapter tests
`cd server && npm test`. Every adapter has unit tests with mocked HTTP and no network access:
- `tests/unit/providers-messaging.test.ts`: Twilio, WhatsApp Cloud, SMTP, Expo push, selection and startup status
- `tests/unit/whatsapp-baileys.test.ts`: linked WhatsApp number with a fake Baileys socket: QR/connect/logged-out/backoff/lease, encrypted DB session, OTP text, SMS fallback, outbox
- `tests/unit/providers-ai.test.ts`: Anthropic SDK streaming via a mocked `fetch`, OpenAI streaming, selection
- `tests/unit/ai-knowledge-base.test.ts`: RAG chunking/hashing/scoping, OpenAI reasoning-model parameters, batch embeddings, tutor prompt / LaTeX / citations
- `tests/unit/payments-gateways.test.ts`: ZainCash JWT init/callback, FastPay initiation/IPN validation/refund, Qi create/notify/RSA signature, open-redirect guard
