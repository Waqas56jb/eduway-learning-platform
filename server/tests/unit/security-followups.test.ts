/**
 * Security follow-ups SEC-21 … SEC-32 (docs/SECURITY.md). No database needed: SQL-backed pieces are exercised with
 * small in-memory fakes, everything else through pure helpers or supertest.
 */
import { createHmac } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { corsOptions, createApp } from '../../src/app.js';
import { AppError } from '../../src/common/errors/index.js';
import { createRateLimit, PostgresRateLimitStore, type RateLimitDb } from '../../src/common/middleware/rateLimit.js';
import { errorHandler, toAppError } from '../../src/common/middleware/errorHandler.js';
import { exportRequest } from '../../src/common/services/exporter.js';
import { PURPOSE_RULES } from '../../src/common/services/storage.js';
import { escapeLike, likeContains, likePrefix } from '../../src/common/utils/like.js';
import { closeDb } from '../../src/config/db.js';
import { env, envProblems, resolveDevFlags, trustProxySetting, type Env } from '../../src/config/env.js';
import { normalizeRecoveryCode, recoveryCodeHash, totpStep, totpStepAcceptable } from '../../src/modules/auth/admin-auth.service.js';
import { adminLoginBody, mfaCodeBody, mfaVerifyBody } from '../../src/modules/auth/schemas.js';
import { publicChecks } from '../../src/modules/health/routes.js';
import { verifyReceiptSignature } from '../../src/modules/notifications/routes.js';
import { isFresh, timestampMs } from '../../src/modules/payments/gateways/common.js';
import { createFastPay, type FastPayConfig } from '../../src/modules/payments/gateways/fastpay.js';
import { createQiCard, type QiConfig } from '../../src/modules/payments/gateways/qicard.js';
import { createZainCash, ZAINCASH_CALLBACK_MAX_AGE_SEC, type ZainCashConfig } from '../../src/modules/payments/gateways/zaincash.js';
import { getProvider, parseGeneric } from '../../src/modules/payments/providers.js';
import { mockConfirmAllowed } from '../../src/modules/payments/student.service.js';
import { mockSettleableProviders } from '../../src/modules/payments/webhook.service.js';
import { fakeHttp } from './helpers/fake-http.js';

afterAll(() => closeDb());

const prodEnv: Env = {
  ...env,
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_ADMIN_SECRET: 'b'.repeat(40),
  JWT_REFRESH_SECRET: 'c'.repeat(40),
  CORS_ORIGINS: ['https://eduway.iq', 'https://admin.eduway.iq'],
  PUBLIC_API_URL: 'https://api.eduway.iq',
  ADMIN_APP_URL: 'https://admin.eduway.iq',
  USER_APP_URL: 'https://eduway.iq',
  DB_SSL: true,
  TRUST_PROXY: '1',
  API_DOCS_PUBLIC: undefined,
  DEV_OTP_BYPASS: undefined,
  DEV_LAN_CORS: undefined,
  DEV_MOCK_PAYMENTS: undefined,
  DEV_UNSIGNED_NOTIFICATION_WEBHOOKS: undefined,
};

describe('SEC-21 · dev-only behaviours are explicit opt-ins, impossible in production', () => {
  const flags = (over: Partial<Env>, raw: string | undefined) => resolveDevFlags({ ...prodEnv, NODE_ENV: 'development', ...over }, raw);

  it('NODE_ENV unset (defaulted to development) enables nothing', () => {
    expect(flags({}, undefined)).toEqual({ apiDocs: false, otpBypass: false, lanCors: false, mockPayments: false, unsignedNotificationWebhooks: false });
  });
  it('an explicit NODE_ENV=development/test turns the dev conveniences on (unsigned receipts stay off)', () => {
    for (const raw of ['development', 'test']) {
      expect(flags({ NODE_ENV: raw as Env['NODE_ENV'] }, raw)).toEqual({ apiDocs: true, otpBypass: true, lanCors: true, mockPayments: true, unsignedNotificationWebhooks: false });
    }
  });
  it('each flag can be switched individually', () => {
    expect(flags({ DEV_MOCK_PAYMENTS: false, DEV_OTP_BYPASS: true }, undefined)).toMatchObject({ mockPayments: false, otpBypass: true, lanCors: false });
    expect(flags({ DEV_UNSIGNED_NOTIFICATION_WEBHOOKS: true }, 'development').unsignedNotificationWebhooks).toBe(true);
  });
  it('production forces every flag off, whatever is set', () => {
    const f = resolveDevFlags({ ...prodEnv, API_DOCS_PUBLIC: true, DEV_OTP_BYPASS: true, DEV_LAN_CORS: true, DEV_MOCK_PAYMENTS: true, DEV_UNSIGNED_NOTIFICATION_WEBHOOKS: true }, 'production');
    expect(Object.values(f).every((v) => v === false)).toBe(true);
  });

  it('a complete production config passes', () => expect(envProblems(prodEnv)).toEqual([]));
  it('production refuses to start when required settings are missing or dev-only flags are set', () => {
    const problems = (over: Partial<Env>) => envProblems({ ...prodEnv, ...over }).join('\n');
    expect(problems({ PUBLIC_API_URL: undefined })).toMatch(/PUBLIC_API_URL/);
    expect(problems({ PUBLIC_API_URL: 'http://api.eduway.iq' })).toMatch(/PUBLIC_API_URL/);
    expect(problems({ ADMIN_APP_URL: 'http://localhost:5174' })).toMatch(/ADMIN_APP_URL/);
    expect(problems({ USER_APP_URL: 'https://127.0.0.1' })).toMatch(/USER_APP_URL/);
    expect(problems({ CORS_ORIGINS: ['http://localhost:5173'] })).toMatch(/CORS_ORIGINS/);
    expect(problems({ DB_SSL: false })).toMatch(/DB_SSL/);
    expect(problems({ TRUST_PROXY: undefined })).toMatch(/TRUST_PROXY/);
    expect(problems({ TRUST_PROXY: 'true' })).toMatch(/TRUST_PROXY/);
    for (const k of ['API_DOCS_PUBLIC', 'DEV_OTP_BYPASS', 'DEV_LAN_CORS', 'DEV_MOCK_PAYMENTS', 'DEV_UNSIGNED_NOTIFICATION_WEBHOOKS'] as const) {
      expect(problems({ [k]: true })).toMatch(new RegExp(k));
    }
  });
  it('none of the production rules apply outside production', () => {
    expect(envProblems({ ...prodEnv, NODE_ENV: 'development', PUBLIC_API_URL: undefined, TRUST_PROXY: undefined, DEV_OTP_BYPASS: true })).toEqual([]);
  });

  it('LAN / localhost browser origins pass CORS only with DEV_LAN_CORS', async () => {
    const check = (lanCors: boolean, origin: string) =>
      new Promise<boolean>((resolve) => {
        const fn = corsOptions({ lanCors }).origin as (o: string, cb: (err: Error | null, ok?: boolean) => void) => void;
        fn(origin, (_e, ok) => resolve(!!ok));
      });
    expect(await check(true, 'http://192.168.1.20:8081')).toBe(true);
    expect(await check(false, 'http://192.168.1.20:8081')).toBe(false);
    expect(await check(false, env.ADMIN_APP_URL)).toBe(true); // configured origins always pass
  });
});

describe('SEC-22 · trust proxy from TRUST_PROXY', () => {
  it('parses hop counts, off switches and address lists', () => {
    expect(trustProxySetting(undefined)).toEqual(['loopback']);
    expect(trustProxySetting('')).toEqual(['loopback']);
    expect(trustProxySetting('1')).toBe(1);
    expect(trustProxySetting('2')).toBe(2);
    expect(trustProxySetting('false')).toBe(false);
    expect(trustProxySetting('0')).toBe(false);
    expect(trustProxySetting('true')).toBe(true);
    expect(trustProxySetting('10.0.0.0/8, loopback')).toEqual(['10.0.0.0/8', 'loopback']);
  });
  it('the app applies the setting (default: only loopback proxies are trusted)', () => {
    const app = createApp();
    expect(app.get('trust proxy')).toEqual(trustProxySetting(env.TRUST_PROXY));
  });
  it('with TRUST_PROXY=false a spoofed X-Forwarded-For is ignored', async () => {
    const app = express();
    app.set('trust proxy', trustProxySetting('false'));
    app.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });
    const r = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.9');
    expect(r.body.ip).not.toBe('203.0.113.9');
  });
});

describe('SEC-23 · shared Postgres rate-limit store', () => {
  /** In-memory stand-in for eduway_platform_rate_limits with the same fixed-window upsert semantics. */
  function fakeDb() {
    const rows = new Map<string, { hits: number; reset_at: Date }>();
    const sql: string[] = [];
    const db: RateLimitDb = {
      async query<R extends Record<string, unknown>>(text: string, values: unknown[] = []) {
        sql.push(text);
        if (text.startsWith('INSERT')) {
          const [key, windowMs] = values as [string, number];
          const now = Date.now();
          const cur = rows.get(key);
          const next = !cur || cur.reset_at.getTime() <= now ? { hits: 1, reset_at: new Date(now + windowMs) } : { hits: cur.hits + 1, reset_at: cur.reset_at };
          rows.set(key, next);
          return { rows: [next as unknown as R] };
        }
        if (text.startsWith('UPDATE')) {
          const cur = rows.get(values[0] as string);
          if (cur) cur.hits = Math.max(0, cur.hits - 1);
        }
        if (text.startsWith('DELETE') && values.length) rows.delete(values[0] as string);
        return { rows: [] };
      },
    };
    return { db, rows, sql };
  }

  const prev = process.env.RATE_LIMIT_IN_TESTS;
  beforeAll(() => {
    process.env.RATE_LIMIT_IN_TESTS = '1';
  });
  afterEach(() => undefined);
  afterAll(() => {
    if (prev === undefined) delete process.env.RATE_LIMIT_IN_TESTS;
    else process.env.RATE_LIMIT_IN_TESTS = prev;
  });

  it('counts per key in the prefixed table and reports the window reset', async () => {
    const f = fakeDb();
    const store = new PostgresRateLimitStore(() => f.db);
    store.init({ windowMs: 60_000 } as Parameters<PostgresRateLimitStore['init']>[0]);
    expect((await store.increment('k')).totalHits).toBe(1);
    const second = await store.increment('k');
    expect(second.totalHits).toBe(2);
    expect(second.resetTime!.getTime()).toBeGreaterThan(Date.now());
    await store.decrement('k');
    expect(f.rows.get('rl:k')?.hits).toBe(1);
    await store.resetKey('k');
    expect(f.rows.has('rl:k')).toBe(false);
    expect(f.sql.every((s) => s.includes('eduway_platform_') && s.includes('rate_limits'))).toBe(true);
    expect(store.localKeys).toBe(false);
  });

  it('two app instances sharing the store share one budget (429 on the third request)', async () => {
    const f = fakeDb();
    const mk = () => {
      const app = express();
      app.use(createRateLimit({ name: 'shared-test', windowMs: 60_000, limit: 2, store: new PostgresRateLimitStore(() => f.db) }));
      app.get('/x', (_req, res) => {
        res.json({ ok: true });
      });
      app.use(errorHandler);
      return app;
    };
    const a = mk();
    const b = mk();
    expect((await request(a).get('/x')).status).toBe(200);
    expect((await request(b).get('/x')).status).toBe(200);
    const third = await request(a).get('/x');
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  it('a store failure lets the request through (logged) instead of failing every request', async () => {
    const broken: RateLimitDb = {
      query: async () => {
        throw new Error('db down');
      },
    };
    const app = express();
    app.use(createRateLimit({ name: 'broken-test', windowMs: 60_000, limit: 1, store: new PostgresRateLimitStore(() => broken) }));
    app.get('/x', (_req, res) => {
      res.json({ ok: true });
    });
    expect((await request(app).get('/x')).status).toBe(200);
  });
});

describe('SEC-24 · gateway adapters: currency, amount, replay window', () => {
  const mutableEnv = env as { PUBLIC_API_URL?: string };
  const prevPublic = mutableEnv.PUBLIC_API_URL;
  beforeAll(() => {
    mutableEnv.PUBLIC_API_URL = 'https://api.eduway.test';
  });
  afterAll(() => {
    mutableEnv.PUBLIC_API_URL = prevPublic;
  });
  const checkout = { paymentId: '6f1c2b1e-0000-4000-8000-000000000001', ref: 'EDU-ABC123', amount: 30_000, currency: 'IQD', returnUrl: null, returnScheme: null, walletPhone: null };
  const zcCfg: ZainCashConfig = { merchantId: 'm-1', secret: 'zain-secret-0123456789', msisdn: '9647835077893', baseUrl: 'https://test.zaincash.iq', lang: 'ar', serviceType: 'EDUWAY' };
  const fpCfg: FastPayConfig = { storeId: 'store_1', storePassword: 'pw', baseUrl: 'https://staging-apigw-merchant.fast-pay.iq' };
  const qiCfg: QiConfig = { terminalId: 'T-1', username: 'merchant', password: 'pw', baseUrl: 'https://uat-sandbox-3ds-api.qi.iq' };

  it('every real adapter refuses a non-IQD checkout before calling the gateway', async () => {
    const f = fakeHttp(() => ({ data: {} }));
    for (const gw of [createZainCash(() => zcCfg, f.http), createFastPay(() => fpCfg, f.http), createQiCard(() => qiCfg, f.http)]) {
      await expect(gw.createCheckout({ ...checkout, currency: 'USD' })).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
    }
    expect(f.calls).toHaveLength(0);
  });

  it('ZainCash: events carry IQD; a stale callback token (iat outside the window) is refused', async () => {
    const f = fakeHttp(() => ({ data: { status: 'completed', amount: '30000' } }));
    const zc = createZainCash(() => zcCfg, f.http);
    const fresh = await zc.handleCallback?.({ query: { token: jwt.sign({ status: 'success', orderid: 'EDU-ABC123', id: 'tx_1' }, zcCfg.secret) }, body: {}, headers: {} });
    expect(fresh?.event).toMatchObject({ currency: 'IQD', amount: 30_000 });
    const old = Math.floor(Date.now() / 1000) - ZAINCASH_CALLBACK_MAX_AGE_SEC - 60;
    const stale = await zc.handleCallback?.({ query: { token: jwt.sign({ status: 'success', orderid: 'EDU-ABC123', id: 'tx_1', iat: old }, zcCfg.secret) }, body: {}, headers: {} });
    expect(stale).toBeNull();
  });

  it('ZainCash: success without a confirmed amount carries none (the pipeline will not apply it)', async () => {
    const zc = createZainCash(() => zcCfg, fakeHttp(() => ({ status: 500, data: {} })).http);
    const r = await zc.handleCallback?.({ query: { token: jwt.sign({ status: 'success', orderid: 'R', id: 'tx_2' }, zcCfg.secret) }, body: {}, headers: {} });
    expect(r?.event).toMatchObject({ type: 'payment.succeeded', amount: null });
  });

  it('FastPay / Qi: the validated currency and amount are passed through for the settlement check', async () => {
    const fp = createFastPay(() => fpCfg, fakeHttp(() => ({ data: { code: 200, data: { gw_transaction_id: 'g', merchant_order_id: 'EDU-ABC123', received_amount: 30000, currency: 'usd', status: 'Success' } } })).http);
    expect((await fp.verifyWebhook?.({ rawBody: Buffer.alloc(0), headers: {}, body: { merchant_order_id: 'EDU-ABC123' } }))?.event).toMatchObject({ currency: 'USD', amount: 30_000 });
    const qi = createQiCard(() => qiCfg, fakeHttp(() => ({ data: { paymentId: 'qi_9', status: 'SUCCESS' } })).http);
    expect((await qi.verifyWebhook?.({ rawBody: Buffer.alloc(0), headers: {}, body: { paymentId: 'qi_9' } }))?.event).toMatchObject({ amount: null });
  });

  it('timestamps: unix s / ms / ISO within ±5 min are fresh, others are not', () => {
    const now = Date.now();
    expect(timestampMs(Math.floor(now / 1000))).toBe(Math.floor(now / 1000) * 1000);
    expect(isFresh(Math.floor(now / 1000))).toBe(true);
    expect(isFresh(now)).toBe(true);
    expect(isFresh(new Date(now - 60_000).toISOString())).toBe(true);
    expect(isFresh(Math.floor(now / 1000) - 3600)).toBe(false);
    expect(isFresh(undefined)).toBe(false);
    expect(isFresh('garbage')).toBe(false);
  });

  it('signed generic webhooks: a stale `created` is refused; hosted gateways require one', () => {
    const body = (created?: unknown) => ({ id: 'evt', type: 'payment.succeeded', ...(created !== undefined ? { created } : {}), data: { paymentId: 'p', amount: 1, currency: 'iqd' } });
    expect(parseGeneric(body()).currency).toBe('IQD');
    expect(parseGeneric(body(Math.floor(Date.now() / 1000))).amount).toBe(1);
    expect(() => parseGeneric(body(Math.floor(Date.now() / 1000) - 3600))).toThrow(AppError);
    expect(() => parseGeneric(body(), true)).toThrow(AppError);
    expect(() => getProvider('asiahawala')!.parseWebhook(body())).toThrow(AppError);
    expect(getProvider('mock')!.parseWebhook(body()).eventId).toBe('evt');
  });
});

describe('SEC-25 · notification receipts must be signed', () => {
  const receiptJson = JSON.stringify({ messageId: 'm1', status: 'delivered' });
  const raw = Buffer.from(receiptJson, 'utf8');
  const sig = (secret: string) => createHmac('sha256', secret).update(raw).digest('hex');
  it('no secret → rejected unless the explicit dev flag is on', () => {
    expect(() => verifyReceiptSignature(raw, undefined, undefined, false)).toThrow(AppError);
    expect(() => verifyReceiptSignature(raw, undefined, undefined, true)).not.toThrow();
  });
  it('with a secret: valid HMAC accepted, missing / wrong signature rejected (the dev flag does not bypass it)', () => {
    expect(() => verifyReceiptSignature(raw, `sha256=${sig('s3cret')}`, 's3cret', false)).not.toThrow();
    expect(() => verifyReceiptSignature(raw, sig('other'), 's3cret', true)).toThrow(AppError);
    expect(() => verifyReceiptSignature(raw, undefined, 's3cret', true)).toThrow(AppError);
  });
  it('the live route rejects an unsigned receipt in the test env (secret unset, flag off)', async () => {
    const r = await request(createApp()).post(`${env.API_PREFIX}/webhooks/notifications/twilio`).send({ messageId: 'm1', status: 'delivered' });
    expect(r.status).toBe(401);
  });
});

describe('SEC-26 · TOTP replay + recovery codes', () => {
  const secret = authenticator.generateSecret(20);
  it('a code maps to its time step; the same step is not accepted twice', () => {
    const now = Date.now();
    const code = authenticator.clone({ epoch: now }).generate(secret);
    const step = totpStep(secret, code, now);
    expect(step).toBe(Math.floor(now / 30_000));
    expect(totpStepAcceptable(null, step)).toBe(true);
    expect(totpStepAcceptable(step, step)).toBe(false); // replay inside the window
    expect(totpStepAcceptable(step! - 1, step)).toBe(true);
    expect(totpStepAcceptable(String(step! + 1), step)).toBe(false); // an older code after a newer one
    expect(totpStep(secret, '000000', now) === step).toBe(false);
    expect(totpStep(null, code, now)).toBeNull();
  });
  it('recovery codes are case/dash-insensitive and hashed like at enrolment', () => {
    expect(normalizeRecoveryCode('abcde-fghjk')).toBe('ABCDE-FGHJK');
    expect(normalizeRecoveryCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    expect(normalizeRecoveryCode('123456')).toBeNull();
    expect(normalizeRecoveryCode('ABCDE-FGHIO')).toBeNull(); // I/O are never issued
    expect(recoveryCodeHash('ABCDE-FGHJK')).toMatch(/^[0-9a-f]{64}$/);
    expect(recoveryCodeHash('ABCDE-FGHJK')).not.toBe(recoveryCodeHash('ABCDE-FGHJM'));
  });
  it('login and step-up accept a recovery code; enrolment still needs a 6-digit code', () => {
    expect(adminLoginBody.safeParse({ email: 'a@b.iq', password: 'x', totp: 'ABCDE-FGHJK' }).success).toBe(true);
    expect(mfaVerifyBody.safeParse({ mfaToken: 'x'.repeat(30), code: 'abcdefghjk' }).success).toBe(true);
    expect(mfaVerifyBody.safeParse({ mfaToken: 'x'.repeat(30), code: '123456' }).success).toBe(true);
    expect(mfaVerifyBody.safeParse({ mfaToken: 'x'.repeat(30), code: '12345' }).success).toBe(false);
    expect(mfaCodeBody.safeParse({ code: 'ABCDE-FGHJK' }).success).toBe(false);
  });
});

describe('SEC-28 · mock confirmation only for mock / unconfigured gateways', () => {
  it('allows the MockGateway and dev stubs, never a configured gateway', () => {
    expect(mockConfirmAllowed('mock')).toBe(true);
    expect(mockConfirmAllowed('zaincash')).toBe(!getProvider('zaincash')!.configured());
    expect(mockConfirmAllowed('paypal')).toBe(false);
    const settleable = mockSettleableProviders();
    expect(settleable).toContain('mock');
    for (const g of settleable) expect(g === 'mock' || !getProvider(g)!.configured()).toBe(true);
  });
});

describe('SEC-29 · LIKE wildcard escaping', () => {
  it('escapes %, _ and the escape character', () => {
    expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(likeContains('a_b')).toBe('%a\\_b%');
    expect(likePrefix('Q-1%')).toBe('Q-1\\%%');
    expect(likeContains('plain')).toBe('%plain%');
  });
});

describe('SEC-30 · export filters are validated', () => {
  it('rejects nested objects and coerces single-string keys', () => {
    expect(exportRequest.safeParse({ format: 'csv', filters: { q: { $ne: 1 } } }).success).toBe(false);
    const r = exportRequest.parse({ format: 'csv', filters: { q: 123, sort: ['-createdAt', 'x'], status: ['active', 'expired'], onlyMismatches: true, from: null } });
    expect(r.filters).toEqual({ q: '123', sort: '-createdAt', status: ['active', 'expired'], onlyMismatches: true });
  });
  it('drops prototype keys', () => {
    const r = exportRequest.parse({ format: 'csv', filters: JSON.parse('{"__proto__":"x","q":"a"}') });
    expect(r.filters).toEqual({ q: 'a' });
  });
});

describe('SEC-31 · no internals in public errors in production', () => {
  it('readiness checks lose their messages in production only', () => {
    const checks = { db: { status: 'down' as const, latencyMs: null, message: 'connect ECONNREFUSED 10.0.0.5:5432' } };
    expect(publicChecks(checks, true)).toEqual({ db: { status: 'down', latencyMs: null } });
    expect(publicChecks(checks, false)).toEqual(checks);
  });
  it('pg constraint names are hidden in production', () => {
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'eduway_platform_users_phone_key' });
    expect(toAppError(pgErr, true).toDetails()).not.toHaveProperty('constraint');
    expect(toAppError(pgErr, true).reason).toBe('ALREADY_EXISTS');
    expect(toAppError(pgErr, false).toDetails()).toMatchObject({ constraint: 'eduway_platform_users_phone_key' });
  });
});

describe('SEC-32 · no SVG uploads', () => {
  it('no upload purpose accepts image/svg+xml', () => {
    for (const [purpose, rule] of Object.entries(PURPOSE_RULES)) expect(rule.types.test('image/svg+xml'), purpose).toBe(false);
    expect(PURPOSE_RULES.logo.types.test('image/png')).toBe(true);
    expect(PURPOSE_RULES.question_image.types.test('image/gif')).toBe(true);
  });
});
