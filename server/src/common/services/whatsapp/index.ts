/**
 * WhatsApp (Baileys) session singleton + the port used by the `baileys` provider in providers/sms.ts.
 * Loaded lazily by the provider, eagerly by server.ts (boot/shutdown) and the admin `whatsapp` module.
 */
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { pgAuthKV } from './auth-state.js';
import { createSessionCipher, type SessionCipher } from './cipher.js';
import { enqueue } from '../../../jobs/index.js';
import { WHATSAPP_SEND_JOB, deliver, openJob, queueWhatsApp, sealJob, type SmsFallback, type WhatsAppJobData, type WhatsAppOutboxItem } from './outbox.js';
import { pgSessionRepo } from './session-repo.js';
import { WhatsAppSessionManager, type SocketFactory, type SocketLike } from './session.js';

export { WhatsAppSessionManager, WhatsAppError, phoneToJid, jidToPhone, leaseAlive, type SessionSnapshot } from './session.js';
export { WHATSAPP_SEND_JOB } from './outbox.js';

const cipher: SessionCipher | null = env.WHATSAPP_SESSION_SECRET ? createSessionCipher(env.WHATSAPP_SESSION_SECRET) : null;

/** Real Baileys socket (the library is imported only when a session actually starts). */
const baileysSocket: SocketFactory = async (auth) => {
  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default;
  const log = logger.child({ module: 'baileys' }, { level: 'warn' });
  let version: [number, number, number] | undefined;
  try {
    const latest = await Promise.race([baileys.fetchLatestBaileysVersion(), new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
    if (latest?.version) version = latest.version as [number, number, number];
  } catch {
    /* use the library default */
  }
  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: { creds: auth.creds, keys: baileys.makeCacheableSignalKeyStore(auth.keys, log as never) },
    logger: log as never,
    browser: baileys.Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 30_000,
    getMessage: async () => undefined,
  });
  return sock as unknown as SocketLike;
};

export const whatsappSession = new WhatsAppSessionManager({ repo: pgSessionRepo(), kv: pgAuthKV(), cipher, createSocket: baileysSocket });

/** True when the server is configured to send the `whatsapp` channel through the linked (Baileys) number. */
export const baileysProviderSelected = (): boolean => env.WHATSAPP_PROVIDER === 'baileys';

/** Port consumed by BaileysWhatsAppProvider (providers/sms.ts). */
export const baileysPort = {
  configured: () => cipher !== null,
  isLive: () => whatsappSession.isLive(),
  remoteConnected: () => whatsappSession.remoteConnected(),
  checkNumber: (phone: string) => whatsappSession.checkNumber(phone),
  async queue(item: WhatsAppOutboxItem, smsFallback: () => SmsFallback) {
    if (!cipher) throw new Error('WHATSAPP_SESSION_SECRET not configured');
    return queueWhatsApp(item, cipher, whatsappSession, smsFallback);
  },
};
export type BaileysPort = typeof baileysPort;

/** Max hand-backs before falling back to SMS (each waits ≥1 s; with N instances the holder is hit quickly). */
const MAX_FORWARD_HOPS = 15;

/**
 * pg-boss handler for `eduway.whatsapp-send`. Every instance consumes the shared queue, but only the lease holder
 * has the live socket: a non-holder hands the job back to the queue (short delay) instead of falling back to SMS
 * while the linked number is connected elsewhere.
 */
export async function handleWhatsAppJob(data: WhatsAppJobData, smsFallback: () => SmsFallback): Promise<void> {
  if (!cipher) throw new Error('WHATSAPP_SESSION_SECRET not configured — cannot open queued WhatsApp message');
  const item = openJob(cipher, data);
  const hops = item.hops ?? 0;
  const expired = !!item.expiresAt && Date.parse(item.expiresAt) <= Date.now() + 2000;
  if (!whatsappSession.isLive() && hops < MAX_FORWARD_HOPS && !expired && (await whatsappSession.remoteConnected())) {
    const ttl = item.expiresAt ? Math.max(30, Math.ceil((Date.parse(item.expiresAt) - Date.now()) / 1000)) : 3600;
    await enqueue(WHATSAPP_SEND_JOB, sealJob(cipher, { ...item, hops: hops + 1 }), { retryLimit: 0, startAfter: 1, expireInSeconds: Math.min(ttl, 3600) });
    logger.debug({ hops: hops + 1 }, 'whatsapp: socket held by another instance — job handed back to the queue');
    return;
  }
  await deliver(item, whatsappSession, smsFallback);
}
