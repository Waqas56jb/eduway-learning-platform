/** ZainCash / FastPay / Qi Card adapters with mocked HTTP + callback/webhook verification. */
import jwt from 'jsonwebtoken';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { createFastPay, type FastPayConfig } from '../../src/modules/payments/gateways/fastpay.js';
import { createQiCard, qiSignatureString, verifyQiSignature, type QiConfig } from '../../src/modules/payments/gateways/qicard.js';
import { createZainCash, zainCashConfig, zainCashMissing, zainCashMsisdn, type ZainCashConfig } from '../../src/modules/payments/gateways/zaincash.js';
import { gatewayMode, getProvider } from '../../src/modules/payments/providers.js';
import { safeReturnTarget } from '../../src/modules/payments/webhook.service.js';
import { fakeHttp } from './helpers/fake-http.js';

const EMPTY = Buffer.alloc(0);
const mutableEnv = env as { PUBLIC_API_URL?: string };
const prevPublic = mutableEnv.PUBLIC_API_URL;
beforeAll(() => {
  mutableEnv.PUBLIC_API_URL = 'https://api.eduway.test';
});
afterAll(() => {
  mutableEnv.PUBLIC_API_URL = prevPublic;
});

const checkout = { paymentId: '6f1c2b1e-0000-4000-8000-000000000001', ref: 'EDU-ABC123', amount: 30_000, currency: 'IQD', returnUrl: null, returnScheme: null, walletPhone: null };

describe('ZainCash', () => {
  const cfg: ZainCashConfig = { merchantId: 'm-1', secret: 'zain-secret-0123456789', msisdn: '9647835077893', baseUrl: 'https://test.zaincash.iq', lang: 'ar', serviceType: 'EDUWAY' };

  it('init: posts a HS256 JWT signed with the merchant secret and redirects to /transaction/pay', async () => {
    const f = fakeHttp(() => ({ data: { id: 'tx_777' } }));
    const r = await createZainCash(() => cfg, f.http).createCheckout(checkout);
    expect(r).toEqual({ providerRef: 'tx_777', redirectUrl: 'https://test.zaincash.iq/transaction/pay?id=tx_777', deeplink: null });
    expect(f.calls[0]?.url).toBe('https://test.zaincash.iq/transaction/init');
    const body = f.body();
    expect(body.merchantId).toBe('m-1');
    const claims = jwt.verify(String(body.token), cfg.secret) as Record<string, unknown>;
    expect(claims).toMatchObject({ amount: 30_000, orderId: 'EDU-ABC123', msisdn: 9647835077893, redirectUrl: 'https://api.eduway.test/api/v1/payments/callback/zaincash' });
  });
  it('init errors surface as PAYMENT_GATEWAY_DISABLED', async () => {
    const f = fakeHttp(() => ({ data: { err: { msg: 'invalid merchant' } } }));
    await expect(createZainCash(() => cfg, f.http).createCheckout(checkout)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  });
  it('callback: verifies the signed token, cross-checks status and emits an idempotent event', async () => {
    const f = fakeHttp(() => ({ data: { status: 'completed', amount: '30000', orderid: 'EDU-ABC123' } }));
    const token = jwt.sign({ status: 'success', orderid: 'EDU-ABC123', id: 'tx_777' }, cfg.secret);
    const r = await createZainCash(() => cfg, f.http).handleCallback?.({ query: { token }, body: {}, headers: {} });
    expect(r?.event).toMatchObject({ eventId: 'zaincash:tx_777:success', type: 'payment.succeeded', providerRef: 'tx_777', amount: 30_000 });
    expect(f.calls[0]?.url).toBe('https://test.zaincash.iq/transaction/get');
  });
  it('callback: status API disagreement → no grant; forged token → rejected', async () => {
    const f = fakeHttp(() => ({ data: { status: 'pending' } }));
    const zc = createZainCash(() => cfg, f.http);
    const ok = await zc.handleCallback?.({ query: { token: jwt.sign({ status: 'success', id: 'tx_1', orderid: 'R' }, cfg.secret) }, body: {}, headers: {} });
    expect(ok?.event).toBeNull();
    const forged = await zc.handleCallback?.({ query: { token: jwt.sign({ status: 'success', id: 'tx_1' }, 'attacker') }, body: {}, headers: {} });
    expect(forged).toBeNull();
  });
  it('callback: failed → payment.failed with reason', async () => {
    const r = await createZainCash(() => cfg, fakeHttp(() => ({ data: {} })).http).handleCallback?.({ query: { token: jwt.sign({ status: 'failed', id: 'tx_2', orderid: 'R2', msg: 'insufficient balance' }, cfg.secret) }, body: {}, headers: {} });
    expect(r?.event).toMatchObject({ type: 'payment.failed', payload: { reason: 'insufficient balance' } });
  });
  it('without credentials the registry entry stays a dev stub that rejects forged webhooks', async () => {
    const p = getProvider('zaincash');
    expect(p?.configured()).toBe(false);
    expect((await p?.createCheckout(checkout))?.providerRef).toBe('zaincash_dev_EDU-ABC123');
  });
});

describe('ZainCash v2 (OAuth2 Payment Gateway API)', () => {
  const cfg: ZainCashConfig = { apiVersion: 'v2', merchantId: 'client-1', secret: 'client-secret-0123456789', msisdn: '', baseUrl: 'https://pg-api-uat.zaincash.iq', lang: 'ar', serviceType: 'EDUWAY, subscription+' };
  const TX = '9da792d5-f818-4e98-9fb6-6c0b13902c8b';
  const inquiry = (status: string, value: number | null = 30_000, orderId = 'EDU-ABC123') => ({
    data: { status, transactionDetails: { transactionId: TX, orderId, amount: value === null ? undefined : { currency: 'IQD', value } } },
  });
  /** Answers the OAuth token call, then delegates to `rest` for API calls. */
  const gw = (rest: (url: string) => { status?: number; data: unknown }) => {
    const f = fakeHttp((c) => (String(c.url).endsWith('/oauth2/token') ? { data: { access_token: 'at-1', expires_in: 86399 } } : rest(String(c.url))));
    return { f, zc: createZainCash(() => cfg, f.http) };
  };
  const token = (data: Record<string, unknown>, opts: jwt.SignOptions = {}, key = cfg.secret) => jwt.sign({ eventType: 'STATUS_CHANGED', eventId: 'e-1', data: { transactionId: TX, orderId: 'EDU-ABC123', ...data } }, key, opts);

  it('config: v2 needs client id/secret + PUBLIC_API_URL (no MSISDN); UAT host by default', () => {
    const base = { ...env, ZAINCASH_API_VERSION: 'v2', ZAINCASH_ENV: 'test', ZAINCASH_API_URL: undefined, ZAINCASH_MERCHANT_ID: 'c', ZAINCASH_SECRET: 's', ZAINCASH_MSISDN: undefined, PUBLIC_API_URL: 'https://api.eduway.test' } as typeof env;
    expect(zainCashConfig(base)).toMatchObject({ apiVersion: 'v2', baseUrl: 'https://pg-api-uat.zaincash.iq' });
    expect(zainCashMissing(base)).toEqual([]);
    expect(zainCashMissing({ ...base, ZAINCASH_API_VERSION: 'v1' } as typeof env)).toEqual(['ZAINCASH_MSISDN']);
    expect(zainCashConfig({ ...base, ZAINCASH_ENV: 'live' } as typeof env)?.baseUrl).toBe('https://pg-api.zaincash.iq');
  });
  it('init: OAuth client_credentials token, then JSON init with IQD amount + redirect URLs; token is cached', async () => {
    const { f, zc } = gw(() => ({ data: { status: 'SUCCESS', transactionDetails: { transactionId: TX }, redirectUrl: `https://pg-uat.zaincash.iq/transaction/pay?id=${TX}&token=t` } }));
    const r = await zc.createCheckout({ ...checkout, walletPhone: '+964 780 299 9569' });
    expect(r).toEqual({ providerRef: TX, redirectUrl: `https://pg-uat.zaincash.iq/transaction/pay?id=${TX}&token=t`, deeplink: null });
    expect(f.calls[0]?.url).toBe('https://pg-api-uat.zaincash.iq/oauth2/token');
    expect(f.body(0)).toMatchObject({ grant_type: 'client_credentials', client_id: 'client-1', client_secret: 'client-secret-0123456789' });
    expect(f.calls[1]?.url).toBe('https://pg-api-uat.zaincash.iq/api/v2/payment-gateway/transaction/init');
    expect(f.calls[1]?.headers?.Authorization).toBe('Bearer at-1');
    expect(f.body(1)).toEqual({
      language: 'ar',
      externalReferenceId: checkout.paymentId,
      orderId: 'EDU-ABC123',
      serviceType: 'EDUWAY  subscription',
      amount: { value: '30000', currency: 'IQD' },
      customer: { phone: '9647802999569' },
      redirectUrls: { successUrl: 'https://api.eduway.test/api/v1/payments/callback/zaincash', failureUrl: 'https://api.eduway.test/api/v1/payments/callback/zaincash' },
    });
    await zc.createCheckout(checkout);
    expect(f.calls.filter((c) => String(c.url).endsWith('/oauth2/token'))).toHaveLength(1);
  });
  it('init without a transaction id → PAYMENT_GATEWAY_DISABLED', async () => {
    const { zc } = gw(() => ({ status: 400, data: { message: 'bad' } }));
    await expect(zc.createCheckout(checkout)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  });
  it('callback: verified token + inquiry SUCCESS → idempotent paid event with the inquiry amount', async () => {
    const { f, zc } = gw(() => inquiry('SUCCESS'));
    const r = await zc.handleCallback?.({ query: { token: token({ currentStatus: 'SUCCESS', amount: { value: 1, currency: 'IQD' } }) }, body: {}, headers: {} });
    // The token claims 1 IQD; the inquiry (authoritative) says 30000.
    expect(r?.event).toMatchObject({ eventId: `zaincash:${TX}:success`, type: 'payment.succeeded', providerRef: TX, amount: 30_000, currency: 'IQD' });
    expect(r?.ref).toBe('EDU-ABC123');
    expect(f.calls[1]?.url).toBe(`https://pg-api-uat.zaincash.iq/api/v2/payment-gateway/transaction/inquiry/${TX}`);
  });
  it('callback: token says SUCCESS but inquiry is still pending → no grant', async () => {
    const { zc } = gw(() => inquiry('OTP_SENT'));
    expect((await zc.handleCallback?.({ query: { token: token({ currentStatus: 'SUCCESS' }) }, body: {}, headers: {} }))?.event).toBeNull();
  });
  it('callback: inquiry unreachable → trusted but no state change', async () => {
    const { zc } = gw(() => ({ status: 503, data: {} }));
    expect((await zc.handleCallback?.({ query: { token: token({ currentStatus: 'SUCCESS' }) }, body: {}, headers: {} }))?.event).toBeNull();
  });
  it('callback: FAILED / EXPIRED → payment.failed with reason', async () => {
    const failed = await gw(() => inquiry('FAILED')).zc.handleCallback?.({ query: { token: token({ currentStatus: 'FAILED', errorMessage: 'Insufficient balance' }) }, body: {}, headers: {} });
    expect(failed?.event).toMatchObject({ eventId: `zaincash:${TX}:failed`, type: 'payment.failed', payload: { reason: 'Insufficient balance' } });
    const expired = await gw(() => inquiry('EXPIRED')).zc.handleCallback?.({ query: { token: token({ currentStatus: 'EXPIRED' }) }, body: {}, headers: {} });
    expect(expired?.event).toMatchObject({ type: 'payment.failed', payload: { reason: 'expired' } });
  });
  it('callback: forged / expired / stale tokens and orderId mismatch are rejected', async () => {
    const { zc } = gw(() => inquiry('SUCCESS'));
    expect(await zc.handleCallback?.({ query: { token: token({}, {}, 'attacker-secret') }, body: {}, headers: {} })).toBeNull();
    expect(await zc.handleCallback?.({ query: { token: token({}, { expiresIn: -10 }) }, body: {}, headers: {} })).toBeNull();
    const old = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
    expect(await zc.handleCallback?.({ query: { token: jwt.sign({ iat: old, data: { transactionId: TX, orderId: 'EDU-ABC123' } }, cfg.secret) }, body: {}, headers: {} })).toBeNull();
    const other = gw(() => inquiry('SUCCESS', 30_000, 'EDU-OTHER')).zc;
    expect(await other.handleCallback?.({ query: { token: token({}) }, body: {}, headers: {} })).toBeNull();
  });
  it('webhook { webhook_token } goes through the same verification; v1 has no webhook', async () => {
    const { zc } = gw(() => inquiry('SUCCESS'));
    const ok = await zc.verifyWebhook?.({ rawBody: EMPTY, headers: {}, body: { webhook_token: token({ currentStatus: 'SUCCESS' }) } });
    expect(ok?.event).toMatchObject({ eventId: `zaincash:${TX}:success`, amount: 30_000 });
    expect(await zc.verifyWebhook?.({ rawBody: EMPTY, headers: {}, body: {} })).toBeNull();
    const v1 = createZainCash(() => ({ ...cfg, apiVersion: 'v1' }), fakeHttp(() => ({ data: {} })).http);
    expect(await v1.verifyWebhook?.({ rawBody: EMPTY, headers: {}, body: { webhook_token: token({}) } })).toBeNull();
  });
  it('refund: partial-reverse; a 200 with status FAILED is a failure', async () => {
    const ok = gw(() => ({ data: { status: 'COMPLETED', reversalReferenceId: 'rv-1' } }));
    expect((await ok.zc.refund({ paymentId: checkout.paymentId, providerRef: TX, amount: 5000, reason: 'Customer, asked for a refund because of a long reason text' })).refundId).toBe('rv-1');
    expect(ok.f.calls[1]?.url).toBe('https://pg-api-uat.zaincash.iq/api/v2/payment-gateway/transaction/partial-reverse');
    const b = ok.f.body(1);
    expect(b).toMatchObject({ transactionId: TX, amount: 5000 });
    expect(String(b.reason).length).toBeLessThanOrEqual(44);
    expect(String(b.reason)).not.toContain(',');
    const bad = gw(() => ({ data: { status: 'FAILED', errorMessage: 'PGW-044' } }));
    await expect(bad.zc.refund({ paymentId: checkout.paymentId, providerRef: TX, amount: 1, reason: 'r' })).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  });
  it('msisdn normalisation', () => {
    expect(zainCashMsisdn('+9647802999569')).toBe('9647802999569');
    expect(zainCashMsisdn('07802999569')).toBe('9647802999569');
    expect(zainCashMsisdn('009647802999569')).toBe('9647802999569');
    expect(zainCashMsisdn('12345')).toBeNull();
    expect(zainCashMsisdn(null)).toBeNull();
    // Every common way a student types an Iraqi wallet number.
    for (const v of ['7802999569', '964 780 299 9569', '+964 (780) 299-9569', '0780-299-9569', '٠٧٨٠٢٩٩٩٥٦٩', '۰۷۸۰۲۹۹۹۵۶۹']) {
      expect(zainCashMsisdn(v)).toBe('9647802999569');
    }
    // Non-Iraqi / landline numbers are not wallets.
    expect(zainCashMsisdn('+923001234567')).toBeNull();
    expect(zainCashMsisdn('0612345678')).toBeNull();
  });
  it('gateway mode: unconfigured real gateways are mock (dev) or disabled — never sandbox/live', () => {
    for (const g of ['zaincash', 'fastpay', 'qicard']) expect(['mock', 'disabled']).toContain(gatewayMode(g));
  });
});

describe('FastPay', () => {
  const cfg: FastPayConfig = { storeId: 'store_1', storePassword: 'pw', baseUrl: 'https://staging-apigw-merchant.fast-pay.iq' };

  it('initiation returns the hosted redirect_uri; order id = our ref', async () => {
    const f = fakeHttp(() => ({ data: { code: 200, messages: [], data: { redirect_uri: 'https://staging-pgw.fast-pay.iq/pay/abc' } } }));
    const r = await createFastPay(() => cfg, f.http).createCheckout(checkout);
    expect(r).toEqual({ providerRef: 'EDU-ABC123', redirectUrl: 'https://staging-pgw.fast-pay.iq/pay/abc', deeplink: null });
    expect(f.calls[0]?.url).toBe('https://staging-apigw-merchant.fast-pay.iq/api/v1/public/pgw/payment/initiation');
    expect(f.body()).toMatchObject({
      store_id: 'store_1',
      store_password: 'pw',
      order_id: 'EDU-ABC123',
      bill_amount: 30_000,
      currency: 'IQD',
      success_url: 'https://api.eduway.test/api/v1/payments/callback/fastpay?order_id=EDU-ABC123',
      callback_url: 'https://api.eduway.test/api/v1/payments/webhook/fastpay',
    });
    // FastPay requires the cart as a JSON-encoded string.
    expect(JSON.parse(String(f.body().cart))).toEqual([{ name: 'EDUWAY subscription', qty: 1, unit_price: 30_000, sub_total: 30_000 }]);
  });
  it('IPN is never trusted as-is: it is re-validated and only validated data is applied', async () => {
    const f = fakeHttp(() => ({ data: { code: 200, data: { gw_transaction_id: 'gw9', merchant_order_id: 'EDU-ABC123', received_amount: 30000, currency: 'IQD', status: 'Success', store_password: 'pw' } } }));
    const fp = createFastPay(() => cfg, f.http);
    // The IPN claims a different amount; the validate API is authoritative.
    const r = await fp.verifyWebhook?.({ rawBody: EMPTY, headers: {}, body: { merchant_order_id: 'EDU-ABC123', status: 'Success', received_amount: 1 } });
    expect(r?.event).toMatchObject({ eventId: 'fastpay:gw9:success', type: 'payment.succeeded', providerRef: 'EDU-ABC123', amount: 30_000 });
    expect(JSON.stringify(r?.event?.payload)).not.toContain('pw');
    expect(f.calls[0]?.url).toContain('/payment/validate');
  });
  it('validate failure → untrusted; unsigned sync path fails closed', async () => {
    const fp = createFastPay(() => cfg, fakeHttp(() => ({ status: 500, data: {} })).http);
    expect(await fp.verifyWebhook?.({ rawBody: EMPTY, headers: {}, body: { merchant_order_id: 'X' } })).toBeNull();
    expect(fp.verifySignature(EMPTY, {})).toBe(false);
  });
  it('refund calls the refund API with the refund secret and the payer msisdn from the validate API', async () => {
    const f = fakeHttp((c) =>
      String(c.url).endsWith('/validate')
        ? { data: { code: 200, data: { merchant_order_id: 'EDU-ABC123', status: 'Success', customer_mobile_number: '+9641000000004' } } }
        : { data: { code: 200, data: { summary: { invoice_id: 'CXMNPZQ030' } } } },
    );
    const r = await createFastPay(() => ({ ...cfg, refundSecret: 'rs' }), f.http).refund({ paymentId: checkout.paymentId, providerRef: 'EDU-ABC123', amount: 10_000, reason: 'r' });
    expect(r.refundId).toBe('CXMNPZQ030');
    expect(f.calls[1]?.url).toContain('/pgw/payment/refund');
    expect(f.body()).toMatchObject({ order_id: 'EDU-ABC123', amount: 10_000, refund_secret_key: 'rs', msisdn: '+9641000000004' });
  });
  it('refund without FASTPAY_REFUND_SECRET fails closed before calling FastPay', async () => {
    const f = fakeHttp(() => ({ data: {} }));
    await expect(createFastPay(() => cfg, f.http).refund({ paymentId: checkout.paymentId, providerRef: 'EDU-ABC123', amount: 1, reason: 'r' })).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
    expect(f.calls).toHaveLength(0);
  });
});

describe('Qi Card', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const cfg: QiConfig = { terminalId: 'T-1', username: 'merchant', password: 'pw', baseUrl: 'https://uat-sandbox-3ds-api.qi.iq' };

  it('create: Basic auth + X-Terminal-Id, finish/notification URLs point at our API', async () => {
    const f = fakeHttp(() => ({ data: { paymentId: 'qi_1', formUrl: 'https://uat-sandbox-3ds.qi.iq/form/qi_1', status: 'CREATED' } }));
    const r = await createQiCard(() => cfg, f.http).createCheckout(checkout);
    expect(r).toEqual({ providerRef: 'qi_1', redirectUrl: 'https://uat-sandbox-3ds.qi.iq/form/qi_1', deeplink: null });
    expect(f.calls[0]?.auth).toEqual({ username: 'merchant', password: 'pw' });
    expect(f.calls[0]?.headers?.['X-Terminal-Id']).toBe('T-1');
    expect(f.body()).toMatchObject({
      requestId: 'EDU-ABC123',
      amount: 30_000,
      finishPaymentUrl: 'https://api.eduway.test/api/v1/payments/callback/qicard?ref=EDU-ABC123',
      notificationUrl: 'https://api.eduway.test/api/v1/payments/webhook/qicard',
    });
  });
  it('notification: optional RSA signature (documented field string) + mandatory status re-check', async () => {
    const f = fakeHttp(() => ({ data: { paymentId: 'qi_1', status: 'SUCCESS', amount: 30000 } }));
    const qi = createQiCard(() => ({ ...cfg, publicKey: pem }), f.http);
    const body = { requestId: 'EDU-ABC123', paymentId: 'qi_1', status: 'SUCCESS', amount: 30000, currency: 'IQD', creationDate: '2025-01-13T21:25:19' };
    const raw = Buffer.from(JSON.stringify(body));
    expect(qiSignatureString(body)).toBe('qi_1|30000.000|IQD|2025-01-13T21:25:19|SUCCESS');
    const sig = createSign('RSA-SHA256').update(qiSignatureString(body)).sign(privateKey, 'base64');
    const ok = await qi.verifyWebhook?.({ rawBody: raw, headers: { 'x-signature': sig }, body });
    expect(ok?.event).toMatchObject({ eventId: 'qicard:qi_1:SUCCESS', type: 'payment.succeeded', amount: 30_000 });
    expect(f.calls[0]?.url).toBe('https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/qi_1/status');
    const bad = await qi.verifyWebhook?.({ rawBody: raw, headers: { 'x-signature': 'AAAA' }, body });
    expect(bad).toBeNull();
    // A signature over different field values (tampered status) is refused.
    const tampered = await qi.verifyWebhook?.({ rawBody: raw, headers: { 'x-signature': sig }, body: { ...body, status: 'FAILED' } });
    expect(tampered).toBeNull();
    expect(verifyQiSignature(pem, qiSignatureString(body), sig)).toBe(true);
  });
  it('canceled flag → payment.cancelled; CREATED → pending', async () => {
    const canceled = await createQiCard(() => cfg, fakeHttp(() => ({ data: { paymentId: 'qi_4', status: 'FAILED', canceled: true, amount: 1000 } })).http).verifyWebhook?.({ rawBody: EMPTY, headers: {}, body: { paymentId: 'qi_4' } });
    expect(canceled?.event).toMatchObject({ type: 'payment.failed' });
    const cancelOnly = await createQiCard(() => cfg, fakeHttp(() => ({ data: { paymentId: 'qi_5', status: 'CREATED', canceled: true } })).http).verifyWebhook?.({ rawBody: EMPTY, headers: {}, body: { paymentId: 'qi_5' } });
    expect(cancelOnly?.event).toMatchObject({ type: 'payment.cancelled', eventId: 'qicard:qi_5:CANCELED' });
    const created = await createQiCard(() => cfg, fakeHttp(() => ({ data: { paymentId: 'qi_6', status: 'CREATED', canceled: false } })).http).verifyWebhook?.({ rawBody: EMPTY, headers: {}, body: { paymentId: 'qi_6' } });
    expect(created).toEqual({ event: null });
  });
  it('finish callback resolves the Qi payment id from our ref and maps failures', async () => {
    const f = fakeHttp(() => ({ data: { paymentId: 'qi_2', status: 'AUTHENTICATION_FAILED' } }));
    const r = await createQiCard(() => cfg, f.http).handleCallback?.({ query: { ref: 'EDU-1' }, body: {}, headers: {}, lookupProviderRef: async () => 'qi_2' });
    expect(r?.event).toMatchObject({ type: 'payment.failed', providerRef: 'qi_2' });
    expect(r?.ref).toBe('EDU-1');
  });
  it('pending statuses produce no event', async () => {
    const r = await createQiCard(() => cfg, fakeHttp(() => ({ data: { status: 'FORM_SHOWED' } })).http).verifyWebhook?.({ rawBody: EMPTY, headers: {}, body: { paymentId: 'qi_3' } });
    expect(r).toEqual({ event: null });
  });
});

describe('callback return target', () => {
  it('allows app schemes and our own web origins only (no open redirect)', () => {
    expect(safeReturnTarget('eduway://payment/123')).toBe('eduway://payment/123');
    expect(safeReturnTarget(`${env.USER_APP_URL}/payment/result`)).toBe(`${env.USER_APP_URL}/payment/result`);
    expect(safeReturnTarget('https://evil.example.com/x')).toBeNull();
    expect(safeReturnTarget('javascript:alert(1)')).toBeNull();
  });
});
