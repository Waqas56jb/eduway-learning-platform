/**
 * Process entry point: HTTP listener + background jobs + graceful shutdown.
 * The server boots even when the database is unreachable (/health/ready reports it; jobs retry).
 */
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { logProviderStatus } from './common/providers/status.js';
import { closeDb, pingDb } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { startJobs, stopJobs } from './jobs/index.js';
import { whatsappSession } from './common/services/whatsapp/index.js';

let server: Server | undefined;
let shuttingDown = false;

async function main(): Promise<void> {
  const app = createApp();
  server = app.listen(env.PORT, () => {
    logger.info(`EDUWAY API listening on http://localhost:${env.PORT}${env.API_PREFIX} (docs: /api/docs)`);
  });
  server.keepAliveTimeout = 65_000;
  logProviderStatus(logger);

  const db = await pingDb(5000);
  if (db.ok) logger.info({ latencyMs: db.latencyMs }, 'database reachable');
  else logger.warn({ error: db.error }, 'database NOT reachable at startup — API will report not-ready until it is');

  if (env.JOBS_ENABLED) {
    startJobs().catch((err: Error) => logger.warn({ err: err.message }, 'background jobs not started'));
  }
  // Linked WhatsApp number (Baileys): resume a linked session / stand by for the single-socket lease.
  if (env.WHATSAPP_PROVIDER === 'baileys' && env.NODE_ENV !== 'test') {
    whatsappSession.boot().catch((err: Error) => logger.warn({ err: err.message }, 'whatsapp session not started'));
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    logger.error('forced exit after timeout');
    process.exit(1);
  }, 10_000);
  force.unref();
  // first: hand the WhatsApp lease over quickly (server.close can wait on keep-alive sockets)
  await whatsappSession.shutdown().catch(() => undefined);
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await stopJobs().catch(() => undefined);
  await closeDb();
  logger.info('bye');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason instanceof Error ? reason.message : String(reason) }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'uncaught exception');
  void shutdown('uncaughtException');
});

void main();
