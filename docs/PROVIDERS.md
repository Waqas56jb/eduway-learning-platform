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
| WhatsApp channel | `WHATSAPP_PROVIDER` | same values; defaults to `SMS_PROVIDER` | same |
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

### OpenAI (and Azure OpenAI)
| Variable | Notes |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys. This key also enables real embeddings for pgvector retrieval (`AI_EMBEDDING_MODEL`). |
| `AI_PROVIDER=openai`, `OPENAI_MODEL` (default `gpt-4o`), `OPENAI_BASE_URL` | |
| `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL` (`https://<res>.openai.azure.com/openai/deployments/<deployment>`) | `AI_PROVIDER=azure` |

**How to test**
1. Set the key and restart. The startup log should show `provider ai: anthropic`.
2. Admin → AI Tutor settings should show `activeProvider: anthropic`.
3. As a student, ask the tutor a question. The answer streams over SSE (`delta` events, then `done`), and the
   message row stores `model`, `tokensIn` and `tokensOut`.
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
- `tests/unit/providers-ai.test.ts`: Anthropic SDK streaming via a mocked `fetch`, OpenAI streaming, selection
- `tests/unit/payments-gateways.test.ts`: ZainCash JWT init/callback, FastPay initiation/IPN validation/refund, Qi create/notify/RSA signature, open-redirect guard
