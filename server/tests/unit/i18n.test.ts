import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { BusinessRuleError, NotFoundError, RateLimitError, UnauthorizedError } from '../../src/common/errors/index.js';
import { CODE_MESSAGES, REASON_MESSAGES, resolveLocale, translate } from '../../src/common/i18n/index.js';
import { errorHandler } from '../../src/common/middleware/errorHandler.js';
import { locale, requestId } from '../../src/common/middleware/requestContext.js';
import { validate } from '../../src/common/middleware/validate.js';
import { iraqiPhone } from '../../src/common/validation/schemas.js';
import { z } from '../../src/common/validation/zod.js';

const ARABIC = /[؀-ۿ]/;

describe('locale resolution', () => {
  it.each([
    [undefined, 'ar'],
    ['en', 'en'],
    ['en-US,en;q=0.9', 'en'],
    ['ar-IQ,ar;q=0.9,en;q=0.8', 'ar'],
    ['fr-FR,en;q=0.5', 'en'],
    ['de', 'ar'],
    ['en;q=0.2,ar;q=0.9', 'ar'],
  ])('%s → %s', (h, out) => expect(resolveLocale(h)).toBe(out));
});

describe('message catalogue', () => {
  it('closed code set matches the contract', () => {
    expect(Object.keys(CODE_MESSAGES).sort()).toEqual(
      ['BUSINESS_RULE', 'CONFLICT', 'FORBIDDEN', 'INTERNAL', 'NOT_ENTITLED', 'NOT_FOUND', 'RATE_LIMITED', 'SUBSCRIPTION_REQUIRED', 'TOKEN_EXPIRED', 'UNAUTHORIZED', 'VALIDATION_ERROR'].sort(),
    );
  });

  it('every code and reason has non-empty EN and Arabic AR text', () => {
    for (const [k, v] of Object.entries({ ...CODE_MESSAGES, ...REASON_MESSAGES })) {
      expect(v.en.length, k).toBeGreaterThan(5);
      expect(ARABIC.test(v.ar), k).toBe(true);
    }
  });

  it('interpolates params and localized entity names', () => {
    expect(translate('BUSINESS_RULE', 'en', { attemptsLeft: 2 }, 'OTP_INVALID')).toContain('2 attempts');
    expect(translate('NOT_FOUND', 'ar', { entity: 'lesson' })).toContain('الدرس');
    expect(translate('NOT_FOUND', 'en', { entity: 'lesson' })).toBe('The requested lesson was not found.');
    expect(translate('UNKNOWN_CODE', 'en')).toBe(CODE_MESSAGES.INTERNAL.en);
  });
});

describe('error envelope localization (errorHandler)', () => {
  const app = express();
  app.use(express.json());
  app.use(requestId, locale);
  app.get('/nf', () => {
    throw new NotFoundError('lesson');
  });
  app.get('/otp', () => {
    throw new UnauthorizedError('OTP_INVALID', { attemptsLeft: 3 });
  });
  app.get('/rule', () => {
    throw new BusinessRuleError('DEVICE_LIMIT_REACHED', { limit: 2 });
  });
  app.get('/rl', () => {
    throw new RateLimitError(42, 'OTP_RESEND_COOLDOWN');
  });
  app.get('/boom', () => {
    throw new Error('kaboom');
  });
  app.post('/v', validate({ body: z.object({ phone: iraqiPhone, n: z.number().int().min(1) }) }), (_req, res) => {
    res.json({ success: true });
  });
  app.use(errorHandler);

  it('404 with entity, English and Arabic', async () => {
    const en = await request(app).get('/nf').set('Accept-Language', 'en');
    expect(en.status).toBe(404);
    expect(en.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'The requested lesson was not found.', details: { entity: 'lesson' } } });
    const ar = await request(app).get('/nf').set('Accept-Language', 'ar');
    expect(ARABIC.test(ar.body.error.message)).toBe(true);
  });

  it('reason drives message + details.reason', async () => {
    const r = await request(app).get('/otp').set('Accept-Language', 'ar');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('UNAUTHORIZED');
    expect(r.body.error.details).toEqual({ reason: 'OTP_INVALID', attemptsLeft: 3 });
    expect(r.body.error.message).toContain('3');
    const b = await request(app).get('/rule');
    expect(b.status).toBe(422);
    expect(b.body.error.details.reason).toBe('DEVICE_LIMIT_REACHED');
  });

  it('429 carries retryAfterSeconds and Retry-After', async () => {
    const r = await request(app).get('/rl').set('Accept-Language', 'en');
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBe('42');
    expect(r.body.error.details).toEqual({ reason: 'OTP_RESEND_COOLDOWN', retryAfterSeconds: 42 });
    expect(r.body.error.message).toContain('42 seconds');
  });

  it('500 hides internals and returns requestId', async () => {
    const r = await request(app).get('/boom').set('X-Request-Id', 'req-test-123456');
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('INTERNAL');
    expect(r.body.error.details).toEqual({ requestId: 'req-test-123456' });
    expect(JSON.stringify(r.body)).not.toContain('kaboom');
  });

  it('400 VALIDATION_ERROR with localized details.fields and coded reason', async () => {
    const r = await request(app).post('/v').set('Accept-Language', 'ar').send({ phone: '123', n: 0 });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.details.reason).toBe('PHONE_INVALID');
    expect(Object.keys(r.body.error.details.fields).sort()).toEqual(['n', 'phone']);
    expect(ARABIC.test(r.body.error.details.fields.phone)).toBe(true);
  });

  it('invalid JSON body → 400', async () => {
    const r = await request(app).post('/v').set('Content-Type', 'application/json').send('{bad');
    expect(r.status).toBe(400);
    expect(r.body.error.details.reason).toBe('INVALID_JSON');
  });
});
