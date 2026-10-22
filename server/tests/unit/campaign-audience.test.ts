/** Campaign audience builder + template helpers (Agent D). Pure SQL generation — no database. */
import { describe, expect, it } from 'vitest';
import { T } from '../../src/config/constants.js';
import { buildAudienceCountQuery, buildAudienceQuery } from '../../src/modules/notifications/audience.js';
import { categoryForType, extractVariables, renderTemplate, smsInfo } from '../../src/modules/notifications/templates.js';
import { targetFromLink } from '../../src/modules/notifications/service.js';

const placeholders = (sql: string) => [...new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

describe('campaign audience builder', () => {
  it('no filters: all students, only prefixed tables, every placeholder bound', () => {
    const q = buildAudienceQuery({}, 'in_app');
    expect(q.sql).toContain(`FROM ${T.users} u`);
    expect(q.sql).toContain(`u.kind = 'student'`);
    for (const m of q.sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/g)) expect(m[1]?.startsWith('eduway_platform_'), m[1]).toBe(true);
    const ph = placeholders(q.sql);
    expect(ph.length ? Math.max(...ph) : 0).toBe(q.params.length);
    // in-app: no channel opt-out switch, still excludes locked students
    expect(q.sql).toContain(`WHEN u.status <> 'active' THEN 'locked'`);
    expect(q.sql).not.toContain('noPushToken');
  });

  it('binds every filter value as a parameter (never interpolated)', () => {
    const evil = `x'); DROP TABLE users; --`;
    const q = buildAudienceQuery(
      { packageId: '11111111-1111-4111-8111-111111111111', subjectId: '22222222-2222-4222-8222-222222222222', governorateId: evil, schoolId: '33333333-3333-4333-8333-333333333333', inactiveDays: 14, platforms: ['ios', 'android'], subscriptionStatus: 'active' },
      'push',
      'exam_reminder',
    );
    expect(q.sql).not.toContain(evil);
    expect(q.params).toContain(evil);
    expect(q.params).toContain('11111111-1111-4111-8111-111111111111');
    expect(q.params).toContain(14);
    expect(q.params).toContainEqual(['ios', 'android']);
    expect(q.params).toContain('active');
    expect(q.params).toContain('push'); // channel opt-out key
    expect(q.params).toContain('exams'); // category opt-out key for exam_reminder
    expect(Math.max(...placeholders(q.sql))).toBe(q.params.length);
  });

  it('push excludes students without an app token on the targeted platforms (web never has push)', () => {
    const q = buildAudienceQuery({ platforms: ['web', 'ios'] }, 'push');
    expect(q.sql).toContain(`THEN 'noPushToken'`);
    expect(q.params).toContainEqual(['ios']); // push token platforms exclude web
    expect(q.params).toContainEqual(['web', 'ios']); // platform targeting keeps web for matching
  });

  it('email excludes students without an address; sms uses the sms switch', () => {
    expect(buildAudienceQuery({}, 'email').sql).toContain(`THEN 'noEmail'`);
    const sms = buildAudienceQuery({}, 'sms');
    expect(sms.params).toContain('sms');
    expect(sms.sql).toContain('optedOut');
  });

  it('every channel binds exactly the parameters it references', () => {
    for (const ch of ['push', 'in_app', 'sms', 'whatsapp', 'email'] as const) {
      for (const f of [{}, { platforms: ['web' as const] }, { inactiveDays: 3, subscriptionStatus: 'expired' as const }]) {
        const q = buildAudienceQuery(f, ch, 'new_lesson');
        const ph = placeholders(q.sql);
        expect(ph, ch).toEqual(q.params.map((_, i) => i + 1));
      }
    }
  });

  it("supports '__none' for package and school", () => {
    const q = buildAudienceQuery({ packageId: '__none', schoolId: '__none' }, 'in_app');
    expect(q.sql).toContain(`cs.status NOT IN ('active', 'trial')`);
    expect(q.sql).toContain('sp.school_id IS NULL');
    expect(q.params).not.toContain('__none');
  });

  it('subscription status filter treats no subscription as none', () => {
    const q = buildAudienceQuery({ subscriptionStatus: 'none' }, 'in_app');
    expect(q.sql).toContain(`coalesce(cs.status, 'none') = $1`);
    expect(q.params).toEqual(['none']);
  });

  it('count query wraps the audience into matched/reachable/excluded buckets', () => {
    const q = buildAudienceCountQuery({ inactiveDays: 7 }, 'email');
    for (const k of ['matched', 'reachable', 'no_email', 'no_push', 'opted_out', 'locked', 'total']) expect(q.sql).toContain(` AS ${k}`);
    expect(q.params).toContain(7);
  });
});

describe('template helpers', () => {
  it('extracts variables across languages without duplicates', () => {
    expect(extractVariables('Hi {student_name}', 'مرحبا {student_name}، {expiry_date}')).toEqual(['student_name', 'expiry_date']);
  });
  it('renders localized values and blanks unknown variables', () => {
    expect(renderTemplate('Hi {student_name} — {nope}', { student_name: { en: 'Ali', ar: 'علي' } }, 'ar')).toBe('Hi علي — ');
  });
  it('computes SMS segments for GSM-7 and UCS-2 (Arabic)', () => {
    expect(smsInfo('a'.repeat(160))).toEqual({ chars: 160, segments: 1, encoding: 'GSM-7' });
    expect(smsInfo('a'.repeat(161)).segments).toBe(2);
    expect(smsInfo('ب'.repeat(70))).toEqual({ chars: 70, segments: 1, encoding: 'UCS-2' });
    expect(smsInfo('ب'.repeat(71)).segments).toBe(2);
  });
  it('maps template types to preference categories', () => {
    expect(categoryForType('exam_reminder')).toBe('exams');
    expect(categoryForType('new_lesson')).toBe('lessons');
    expect(categoryForType('otp')).toBeNull();
  });
  it('derives notification targets from canonical links', () => {
    expect(targetFromLink('/lesson/abc')).toEqual({ kind: 'lesson', id: 'abc' });
    expect(targetFromLink('/exams/result/r1')).toEqual({ kind: 'exam_result', id: 'r1' });
    expect(targetFromLink('/subscription')).toEqual({ kind: 'subscription', id: null });
    expect(targetFromLink(null)).toEqual({ kind: 'none', id: null });
  });
});
