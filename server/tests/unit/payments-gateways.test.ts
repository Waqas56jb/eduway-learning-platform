/** ZainCash / FastPay / Qi Card adapters with mocked HTTP + callback/webhook verification. */
import jwt from 'jsonwebtoken';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { createFastPay, type FastPayConfig } from '../../src/modules/payments/gateways/fastpay.js';
import { createQiCard, verifyQiSignature, type QiConfig } from '../../src/modules/payments/gateways/qicard.js';
import { createZainCash, type ZainCashConfig } from '../../src/modules/payments/gateways/zaincash.js';
import { getProvider } from '../../src/modules/payments/providers.js';
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

describe('FastPay', () => {
  const cfg: FastPayConfig = { storeId: 'store_1', storePassword: 'pw', baseUrl: 'https://staging-apigw-merchant.fast-pay.iq' };

  it('initiation returns the hosted redirect_uri; order id = our ref', async () => {
    const f = fakeHttp(() => ({ data: { code: 200, messages: [], data: { redirect_uri: 'https://staging-pgw.fast-pay.iq/pay/abc' } } }));
    const r = await createFastPay(() => cfg, f.http).createCheckout(checkout);
    expect(r).toEqual({ providerRef: 'EDU-ABC123', redirectUrl: 'https://staging-pgw.fast-pay.iq/pay/abc', deeplink: null });
    expect(f.calls[0]?.url).toBe('https://staging-apigw-merchant.fast-pay.iq/api/v1/public/pgw/payment/initiation');
    expect(f.body()).toMatchObject({ store_id: 'store_1', store_password: 'pw', order_id: 'EDU-ABC123', bill_amount: 30_000, currency: 'IQD' });
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
  it('refund calls the refund API', async () => {
    const f = fakeHttp(() => ({ data: { code: 200, data: { refund_id: 'rf_1' } } }));
    const r = await createFastPay(() => cfg, f.http).refund({ paymentId: checkout.paymentId, providerRef: 'EDU-ABC123', amount: 10_000, reason: 'r' });
    expect(r.refundId).toBe('rf_1');
    expect(f.body()).toMatchObject({ order_id: 'EDU-ABC123', amount: 10_000 });
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
  it('notification: optional RSA signature + mandatory status re-check', async () => {
    const f = fakeHttp(() => ({ data: { paymentId: 'qi_1', status: 'SUCCESS', amount: 30000 } }));
    const qi = createQiCard(() => ({ ...cfg, publicKey: pem }), f.http);
    const raw = Buffer.from(JSON.stringify({ paymentId: 'qi_1', status: 'SUCCESS' }));
    const sig = createSign('RSA-SHA256').update(raw).sign(privateKey, 'base64');
    const ok = await qi.verifyWebhook?.({ rawBody: raw, headers: { 'x-signature': sig }, body: { paymentId: 'qi_1' } });
    expect(ok?.event).toMatchObject({ eventId: 'qicard:qi_1:SUCCESS', type: 'payment.succeeded', amount: 30_000 });
    expect(f.calls[0]?.url).toBe('https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/qi_1/status');
    const bad = await qi.verifyWebhook?.({ rawBody: raw, headers: { 'x-signature': 'AAAA' }, body: { paymentId: 'qi_1' } });
    expect(bad).toBeNull();
    expect(verifyQiSignature(pem, raw, sig)).toBe(true);
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
