/**
 * Background jobs on pg-boss (schema `eduway_platform_pgboss` — never the default `pgboss`; TEST=1 uses
 * `eduway_platform_test_pgboss`).
 *
 * Register jobs from anywhere at import time (job modules are listed in ./registry.ts):
 *
 *   registerJob({
 *     name: 'eduway.subscription-expiry',
 *     cron: '*\/15 * * * *', tz: 'UTC',          // optional schedule
 *     handler: async (data) => { … },
 *   });
 *   await enqueue('eduway.notification-dispatch', { campaignId });
 *
 * Boot: `startJobs()` first checks that the database is reachable; if not (or pg-boss fails to start) it logs and
 * retries every 60 s — the HTTP API never crashes because of jobs. When the queue is not running, `enqueue()` runs
 * the handler inline (dev/tests) so features keep working.
 */
import PgBoss from 'pg-boss';
import { PGBOSS_SCHEMA } from '../config/constants.js';
import { pingDb } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface JobDefinition<T extends object = Record<string, unknown>> {
  /** Queue name — must start with `eduway.` */
  name: string;
  /** Cron expression for scheduled runs. */
  cron?: string;
  /** IANA timezone of the cron (default UTC). */
  tz?: string;
  handler: (data: T) => Promise<void>;
  /** pg-boss work options */
  batchSize?: number;
  /** Retries on failure (default 2, exponential backoff). */
  retryLimit?: number;
  /** Human description (docs / health). */
  description?: string;
}

const definitions = new Map<string, JobDefinition<object>>();
let boss: PgBoss | null = null;
let retryTimer: NodeJS.Timeout | null = null;
let starting = false;

export function registerJob<T extends object>(def: JobDefinition<T>): void {
  if (!def.name.startsWith('eduway.')) throw new Error(`job name must start with "eduway.": ${def.name}`);
  definitions.set(def.name, def as JobDefinition<object>);
}

export function registeredJobs(): string[] {
  return [...definitions.keys()];
}

export function jobDefinitions(): JobDefinition<object>[] {
  return [...definitions.values()];
}

/** pg-boss constructor options — the schema is ALWAYS the prefixed one. */
export function bossOptions(): PgBoss.ConstructorOptions {
  return {
    connectionString: env.SUPABASE_DB_URL,
    schema: PGBOSS_SCHEMA,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
    max: 3,
    application_name: 'eduway-jobs',
  };
}

/** Load job modules (side-effect registrations). */
export async function loadJobModules(): Promise<string[]> {
  await import('./registry.js');
  return registeredJobs();
}

export async function enqueue<T extends object>(name: string, data: T, opts: PgBoss.SendOptions = {}): Promise<string | null> {
  if (!boss) {
    if (!definitions.size) await loadJobModules().catch(() => undefined);
    const def = definitions.get(name);
    if (def) {
      logger.debug({ job: name }, 'job queue not running — running handler inline');
      await def.handler(data);
    } else logger.warn({ job: name }, 'unknown job — dropped');
    return null;
  }
  return boss.send(name, data, opts);
}

/** Run a registered job's handler now (admin tools / tests / scripts). */
export async function runJobNow(name: string, data: object = {}): Promise<void> {
  if (!definitions.size) await loadJobModules();
  const def = definitions.get(name);
  if (!def) throw new Error(`unknown job ${name}`);
  await def.handler(data);
}

async function start(): Promise<void> {
  await loadJobModules();
  const ping = await pingDb(5000);
  if (!ping.ok) throw new Error(`database not reachable (${ping.error ?? 'unknown'})`);

  const instance = new PgBoss(bossOptions());
  instance.on('error', (err: Error) => logger.error({ err: err.message }, 'pg-boss error'));
  await instance.start();
  for (const def of definitions.values()) {
    await instance.createQueue(def.name, { name: def.name, retryLimit: def.retryLimit ?? 2, retryBackoff: true, retryDelay: 30 }).catch(() => undefined);
    await instance.work<object>(def.name, { batchSize: def.batchSize ?? 1 }, async (jobs) => {
      for (const job of jobs) {
        const started = Date.now();
        try {
          await def.handler(job.data ?? {});
          logger.debug({ job: def.name, ms: Date.now() - started }, 'job done');
        } catch (err) {
          logger.error({ job: def.name, err: (err as Error).message }, 'job failed');
          throw err; // pg-boss marks it failed and retries per queue policy
        }
      }
    });
    if (def.cron) await instance.schedule(def.name, def.cron, {}, { tz: def.tz ?? 'UTC' });
    else await instance.unschedule(def.name).catch(() => undefined);
  }
  boss = instance;
  logger.info({ schema: PGBOSS_SCHEMA, jobs: [...definitions.keys()] }, 'background jobs started');
}

export async function startJobs(): Promise<void> {
  if (boss || starting) return;
  starting = true;
  try {
    await start();
  } catch (err) {
    logger.warn({ err: (err as Error).message.replace(/postgres(ql)?:\/\/\S+/gi, '[db-url]') }, 'background jobs not started — retrying in 60s');
    retryTimer = setTimeout(() => void startJobs(), 60_000);
    retryTimer.unref();
  } finally {
    starting = false;
  }
}

export async function stopJobs(): Promise<void> {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (boss) await boss.stop({ graceful: true, timeout: 5000 });
  boss = null;
}

export function jobsRunning(): boolean {
  return boss !== null;
}
