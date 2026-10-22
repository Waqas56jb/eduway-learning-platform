/** pg-boss job registration uses the prefixed schema; all spec jobs are registered; hooks degrade gracefully. */
import { afterEach, describe, expect, it, vi } from 'vitest';

const created: { opts: Record<string, unknown>; queues: string[]; schedules: { name: string; cron: string; tz?: string }[]; workers: string[] }[] = [];

vi.mock('pg-boss', () => {
  class FakeBoss {
    rec: (typeof created)[number];
    constructor(opts: Record<string, unknown>) {
      this.rec = { opts, queues: [], schedules: [], workers: [] };
      created.push(this.rec);
    }
    on() {}
    async start() {}
    async stop() {}
    async createQueue(name: string) {
      this.rec.queues.push(name);
    }
    async work(name: string) {
      this.rec.workers.push(name);
    }
    async schedule(name: string, cron: string, _d: unknown, o: { tz?: string }) {
      this.rec.schedules.push({ name, cron, tz: o?.tz });
    }
    async unschedule() {}
    async send() {
      return 'job-id';
    }
  }
  return { default: FakeBoss };
});

vi.mock('../../src/config/db.js', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return { ...actual, pingDb: vi.fn(async () => ({ ok: true, latencyMs: 1 })) };
});

const { PGBOSS_SCHEMA } = await import('../../src/config/constants.js');
const jobs = await import('../../src/jobs/index.js');
const hooks = await import('../../src/jobs/hooks.js');
const db = await import('../../src/config/db.js');

const EXPECTED = [
  'eduway.notification-dispatch',
  'eduway.campaign-scheduled-send',
  'eduway.expo-push-receipts',
  'eduway.subscription-expiry',
  'eduway.ai-allowance-reset',
  'eduway.exam-auto-submit',
  'eduway.analytics-daily-rollup',
  'eduway.settlement-calculation',
  'eduway.question-import',
  'eduway.video-processing-callback',
  'eduway.embeddings-generate',
  'eduway.lesson-publish-scheduled',
  'eduway.incentive-rule-activate',
  'eduway.maintenance.purge',
];

afterEach(async () => {
  await jobs.stopJobs();
});

describe('background jobs (pg-boss)', () => {
  it('uses the prefixed schema eduway_platform_pgboss — never the default "pgboss"', () => {
    expect(PGBOSS_SCHEMA).toBe('eduway_platform_pgboss');
    expect(jobs.bossOptions().schema).toBe(PGBOSS_SCHEMA);
    expect(String(jobs.bossOptions().schema)).not.toBe('pgboss');
  });

  it('registers every spec job with eduway.* names', async () => {
    const names = await jobs.loadJobModules();
    for (const n of EXPECTED) expect(names, n).toContain(n);
    for (const n of names) expect(n.startsWith('eduway.')).toBe(true);
    expect(() => jobs.registerJob({ name: 'pgboss.bad', handler: async () => undefined })).toThrow();
  }, 60_000);

  it('startJobs constructs pg-boss with the prefixed schema, creates queues, workers and cron schedules', async () => {
    await jobs.startJobs();
    expect(jobs.jobsRunning()).toBe(true);
    const boss = created.at(-1);
    expect(boss?.opts.schema).toBe('eduway_platform_pgboss');
    for (const n of EXPECTED) {
      expect(boss?.queues).toContain(n);
      expect(boss?.workers).toContain(n);
    }
    const sched = Object.fromEntries((boss?.schedules ?? []).map((s) => [s.name, s]));
    expect(sched['eduway.analytics-daily-rollup']).toMatchObject({ cron: '30 0 * * *', tz: 'Asia/Baghdad' });
    expect(sched['eduway.exam-auto-submit']).toMatchObject({ cron: '* * * * *', tz: 'UTC' });
    expect(sched['eduway.question-import']).toBeUndefined(); // on-demand only
  }, 60_000);

  it('does not start (and never throws) when the database is unreachable', async () => {
    vi.mocked(db.pingDb).mockResolvedValueOnce({ ok: false, error: 'ECONNREFUSED' });
    const before = created.length;
    await expect(jobs.startJobs()).resolves.toBeUndefined();
    expect(jobs.jobsRunning()).toBe(false);
    expect(created.length).toBe(before);
  });

  it('cross-module hooks: explicit provider wins; missing hooks are skipped', async () => {
    hooks.resetHooks();
    const fn = vi.fn(async () => ({ expired: 2 }));
    hooks.provideJobHook('expireSubscriptionsAndRemind', fn);
    await jobs.runJobNow('eduway.subscription-expiry');
    expect(fn).toHaveBeenCalledTimes(1);
    const r = await hooks.callHook('definitelyNotImplementedAnywhere', []);
    expect(r.ran).toBe(false);
  }, 60_000);
});
