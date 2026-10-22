/**
 * WhatsApp Web (multi-device) session via Baileys — the number an admin links by scanning a QR code in the admin
 * portal (Settings → WhatsApp). UNOFFICIAL client: see docs/PROVIDERS.md for the ban-risk warning.
 *
 *  - Auth state lives in Postgres, encrypted (auth-state.ts / cipher.ts) — never on disk.
 *  - One socket per deployment: an instance runs the socket only while it holds the lease row (session-repo.ts).
 *    Other instances read the status/QR from the row and take over when the lease expires.
 *  - Auto-reconnect with exponential backoff + jitter. Logged out / banned / QR expired → auth state cleared,
 *    status `disconnected`, no reconnect until an admin connects again.
 *  - Outgoing messages are serialized with a random gap and a short "typing…" presence to look less bot-like.
 */
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import type { AuthenticationState } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { logger } from '../../../config/logger.js';
import { maskPhone } from '../../utils/phone.js';
import type { AuthKV, PersistedAuthState } from './auth-state.js';
import { usePostgresAuthState } from './auth-state.js';
import type { SessionCipher } from './cipher.js';
import type { SessionRepo, SessionRow, WaStatus } from './session-repo.js';

/** Disconnect status codes (mirrors Baileys' DisconnectReason, kept local so this module loads without Baileys). */
export const WA_CLOSE = {
  connectionClosed: 428,
  timedOut: 408,
  connectionReplaced: 440,
  loggedOut: 401,
  badSession: 500,
  restartRequired: 515,
  multideviceMismatch: 411,
  forbidden: 403,
  unavailableService: 503,
} as const;

export interface ConnectionUpdate {
  connection?: 'open' | 'connecting' | 'close';
  qr?: string;
  lastDisconnect?: { error?: unknown };
}

/** The slice of a Baileys socket this service uses (mocked in unit tests). */
export interface SocketLike {
  ev: { on(event: 'connection.update', cb: (u: ConnectionUpdate) => void): void; on(event: 'creds.update', cb: () => void): void };
  user?: { id: string; name?: string; notify?: string; verifiedName?: string } | undefined;
  sendMessage(jid: string, content: { text: string }): Promise<{ key?: { id?: string | null } } | undefined>;
  onWhatsApp(...phones: string[]): Promise<{ jid: string; exists: boolean }[] | undefined>;
  sendPresenceUpdate(type: 'composing' | 'paused' | 'available' | 'unavailable', jid?: string): Promise<void>;
  logout(msg?: string): Promise<void>;
  end(error: Error | undefined): void | Promise<void>;
}

export type SocketFactory = (auth: AuthenticationState) => Promise<SocketLike>;

export interface WhatsAppSessionDeps {
  repo: SessionRepo;
  kv: AuthKV;
  /** null when WHATSAPP_SESSION_SECRET is missing (the session cannot be stored → not configured). */
  cipher: SessionCipher | null;
  createSocket: SocketFactory;
  instanceId?: string;
  leaseTtlMs?: number;
  heartbeatMs?: number;
  standbyMs?: number;
  /** Random gap between two outgoing messages. */
  minGapMs?: number;
  maxGapMs?: number;
  /** "typing…" presence before a message. */
  typingMs?: [number, number];
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface SessionSnapshot {
  status: WaStatus;
  since: string;
  phone: string | null;
  jid: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastError: string | null;
  qrAvailable: boolean;
  qrUpdatedAt: string | null;
  /** Whether this API instance runs the socket ('this'), another one does ('other'), or nobody (null). */
  owner: 'this' | 'other' | null;
  desired: 'connected' | 'disconnected';
}

export class WhatsAppError extends Error {
  constructor(
    readonly reason: 'WHATSAPP_NOT_CONFIGURED' | 'WHATSAPP_NOT_CONNECTED' | 'WHATSAPP_NOT_ON_WHATSAPP' | 'WHATSAPP_SEND_FAILED' | 'WHATSAPP_OTHER_INSTANCE',
    message?: string,
  ) {
    super(message ?? reason);
    this.name = 'WhatsAppError';
  }
}

const statusCodeOf = (err: unknown): number | undefined => {
  const e = err as { output?: { statusCode?: number }; statusCode?: number } | undefined;
  return e?.output?.statusCode ?? e?.statusCode;
};

/** `+9647701234567` → `9647701234567@s.whatsapp.net`. */
export const phoneToJid = (phone: string): string => `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
/** `9647701234567:12@s.whatsapp.net` → `+9647701234567`. */
export const jidToPhone = (jid: string | undefined | null): string | null => {
  const user = jid?.split('@')[0]?.split(':')[0];
  return user && /^\d+$/.test(user) ? `+${user}` : null;
};

const QR_PERSIST_AAD = 'qr';
const NUMBER_CACHE_TTL_MS = 60 * 60_000;
const NEGATIVE_CACHE_TTL_MS = 10 * 60_000;

export class WhatsAppSessionManager {
  readonly instanceId: string;
  private readonly leaseTtlMs: number;
  private readonly heartbeatMs: number;
  private readonly standbyMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  private sock: SocketLike | null = null;
  private auth: PersistedAuthState | null = null;
  private status: WaStatus = 'disconnected';
  private since = new Date();
  private qr: string | null = null;
  private qrAt: Date | null = null;
  private me: { jid: string; phone: string | null; name: string | null } | null = null;
  private connectedAt: Date | null = null;
  private lastError: string | null = null;
  private ownsLease = false;
  private generation = 0;
  private attempts = 0;
  private stopping = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private standbyTimer: NodeJS.Timeout | null = null;
  private sendChain: Promise<unknown> = Promise.resolve();
  private lastSendAt = 0;
  private readonly numberCache = new Map<string, { exists: boolean; jid: string | null; at: number }>();
  private waiters: (() => void)[] = [];

  constructor(private readonly deps: WhatsAppSessionDeps) {
    this.instanceId = deps.instanceId ?? `${hostname()}:${process.pid}:${randomBytes(3).toString('hex')}`;
    this.leaseTtlMs = deps.leaseTtlMs ?? 30_000;
    this.heartbeatMs = deps.heartbeatMs ?? 10_000;
    this.standbyMs = deps.standbyMs ?? 15_000;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = deps.random ?? Math.random;
  }

  get configured(): boolean {
    return this.deps.cipher !== null;
  }

  private requireCipher(): SessionCipher {
    if (!this.deps.cipher) throw new WhatsAppError('WHATSAPP_NOT_CONFIGURED');
    return this.deps.cipher;
  }

  /** True when THIS instance holds an open WhatsApp socket. */
  isLive(): boolean {
    return this.ownsLease && this.status === 'connected' && this.sock !== null;
  }

  /** True when a socket is connected on this or another instance (lease alive + status connected). */
  async remoteConnected(): Promise<boolean> {
    if (this.isLive()) return true;
    if (!this.configured) return false;
    const row = await this.deps.repo.read().catch(() => null);
    return !!row && row.status === 'connected' && leaseAlive(row);
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────────────────────────

  /** Server start: resume a linked session (desired = connected) and watch for a lease to take over. */
  async boot(): Promise<void> {
    if (!this.configured) return;
    try {
      await this.deps.repo.ensure();
      const row = await this.deps.repo.read();
      if (row?.desired === 'connected') await this.tryTakeOver();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'whatsapp: boot failed — will retry');
    }
    this.standbyTimer ??= setInterval(() => void this.standbyTick(), this.standbyMs);
    this.standbyTimer.unref?.();
  }

  private async standbyTick(): Promise<void> {
    if (this.ownsLease) return;
    try {
      const row = await this.deps.repo.read();
      if (row?.desired === 'connected' && !leaseAlive(row)) await this.tryTakeOver();
    } catch {
      /* database blip — next tick */
    }
  }

  private async tryTakeOver(): Promise<boolean> {
    if (this.ownsLease) return true;
    if (!(await this.deps.repo.acquireLease(this.instanceId, this.leaseTtlMs))) return false;
    this.ownsLease = true;
    this.startHeartbeat();
    logger.info({ instance: this.instanceId }, 'whatsapp: lease acquired — starting session');
    await this.startSocket();
    return true;
  }

  /** Admin "Connect": start (or restart) the session and wait briefly for a QR code or the open connection. */
  async connect(waitMs = 15_000): Promise<SessionSnapshot> {
    this.requireCipher();
    await this.deps.repo.ensure();
    await this.deps.repo.update({ desired: 'connected' });
    if (this.ownsLease) {
      if (!this.sock) await this.startSocket();
    } else if (!(await this.tryTakeOver())) {
      // another live instance runs the socket — it reports QR/status through the row
      return this.snapshot();
    }
    if (waitMs > 0 && this.status !== 'connected' && !this.qr) await this.waitForChange(waitMs);
    return this.snapshot();
  }

  /** Admin "Disconnect": stop the socket; `logout` also unlinks the device and wipes the stored session. */
  async disconnect(opts: { logout?: boolean } = {}): Promise<SessionSnapshot> {
    this.requireCipher();
    const logout = opts.logout ?? true;
    await this.deps.repo.ensure();
    if (this.ownsLease) {
      await this.stopSocket({ logout, reason: logout ? 'logged_out_by_admin' : 'stopped_by_admin' });
    } else {
      const row = await this.deps.repo.read();
      // the owning instance sees desired=disconnected on its next heartbeat and stops (logging out if asked)
      await this.deps.repo.update({ desired: 'disconnected', last_error: logout ? 'logout_requested' : 'stop_requested' });
      if (!row || !leaseAlive(row)) {
        if (logout) await this.deps.kv.clear();
        await this.deps.repo.update({ status: 'disconnected', status_since: new Date(), qr: null, qr_updated_at: null, ...(logout ? { phone: null, jid: null, display_name: null, connected_at: null } : {}) });
      }
    }
    return this.snapshot();
  }

  /** Graceful process shutdown: close the socket WITHOUT logging out and hand the lease over. */
  async shutdown(): Promise<void> {
    this.clearTimers(true);
    if (this.sock) {
      this.stopping = true;
      this.generation++;
      try {
        await this.sock.end(undefined);
      } catch {
        /* already closed */
      }
      this.sock = null;
    }
    if (this.ownsLease) await this.deps.repo.releaseLease(this.instanceId).catch(() => undefined);
    this.ownsLease = false;
  }

  // ── socket ─────────────────────────────────────────────────────────────────────────────────────

  private async startSocket(): Promise<void> {
    const cipher = this.requireCipher();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const gen = ++this.generation;
    this.stopping = false;
    this.auth = await usePostgresAuthState(this.deps.kv, cipher);
    await this.setStatus('connecting');
    const sock = await this.deps.createSocket(this.auth.state);
    if (gen !== this.generation) {
      await Promise.resolve(sock.end(undefined)).catch(() => undefined);
      return;
    }
    this.sock = sock;
    const auth = this.auth;
    sock.ev.on('creds.update', () => {
      auth.saveCreds().catch((err: Error) => logger.error({ err: err.message }, 'whatsapp: saving credentials failed'));
    });
    sock.ev.on('connection.update', (u: ConnectionUpdate) => {
      this.onUpdate(gen, u).catch((err: Error) => logger.error({ err: err.message }, 'whatsapp: connection update handling failed'));
    });
  }

  private async onUpdate(gen: number, u: ConnectionUpdate): Promise<void> {
    if (gen !== this.generation) return;
    if (u.qr) {
      this.qr = u.qr;
      this.qrAt = new Date();
      await this.setStatus('qr_pending', { qr: this.encQr(u.qr), qr_updated_at: this.qrAt });
      this.wake();
    }
    if (u.connection === 'open') {
      this.attempts = 0;
      const user = this.sock?.user;
      this.me = user ? { jid: user.id, phone: jidToPhone(user.id), name: user.name ?? user.verifiedName ?? user.notify ?? null } : null;
      this.connectedAt = new Date();
      this.qr = null;
      this.qrAt = null;
      this.lastError = null;
      await this.setStatus('connected', { qr: null, qr_updated_at: null, phone: this.me?.phone ?? null, jid: this.me?.jid ?? null, display_name: this.me?.name ?? null, connected_at: this.connectedAt, last_error: null });
      logger.info({ phone: this.me?.phone ? maskPhone(this.me.phone) : null }, 'whatsapp: connected');
      this.wake();
    }
    if (u.connection === 'close') {
      this.sock = null;
      if (this.stopping) return;
      await this.onClose(statusCodeOf(u.lastDisconnect?.error));
      this.wake();
    }
  }

  private async onClose(code: number | undefined): Promise<void> {
    const registered = !!this.auth?.state.creds.registered;
    logger.warn({ code, registered }, 'whatsapp: connection closed');
    switch (code) {
      case WA_CLOSE.restartRequired: // right after the QR scan — reconnect immediately with the new credentials
        await this.startSocket();
        return;
      case WA_CLOSE.loggedOut:
        await this.finish('logged_out', { wipe: true });
        return;
      case WA_CLOSE.connectionReplaced:
        await this.finish('replaced_by_another_client', { wipe: false });
        return;
      case WA_CLOSE.forbidden:
        await this.finish('forbidden', { wipe: true });
        return;
      case WA_CLOSE.multideviceMismatch:
        await this.finish('multidevice_mismatch', { wipe: true });
        return;
      default:
        if (!registered && (code === WA_CLOSE.timedOut || this.qr)) {
          // QR codes ran out without a scan: stop instead of looping QR generation forever
          await this.finish('qr_expired', { wipe: true });
          return;
        }
        if (code === WA_CLOSE.badSession && this.attempts >= 5) {
          await this.finish('bad_session', { wipe: true });
          return;
        }
        this.scheduleReconnect(code);
    }
  }

  /** Exponential backoff 1 s → 60 s (+ up to 1 s jitter); keeps trying while the lease is ours. */
  backoffMs(attempt: number): number {
    return Math.min(60_000, 1000 * 2 ** attempt) + Math.floor(this.random() * 1000);
  }

  private scheduleReconnect(code: number | undefined): void {
    const delay = this.backoffMs(this.attempts++);
    this.lastError = code ? `connection_closed_${code}` : 'connection_closed';
    void this.setStatus('connecting', { last_error: this.lastError });
    logger.info({ delayMs: delay, attempt: this.attempts }, 'whatsapp: reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.ownsLease) this.startSocket().catch((err: Error) => {
        logger.error({ err: err.message }, 'whatsapp: reconnect failed');
        this.scheduleReconnect(undefined);
      });
    }, delay);
    this.reconnectTimer.unref?.();
  }

  /** Terminal stop: status disconnected, lease released, no reconnect until an admin connects again. */
  private async finish(reason: string, opts: { wipe: boolean }): Promise<void> {
    logger.warn({ reason }, 'whatsapp: session stopped');
    this.generation++;
    if (opts.wipe) await this.deps.kv.clear().catch((err: Error) => logger.error({ err: err.message }, 'whatsapp: clearing session failed'));
    this.sock = null;
    this.qr = null;
    this.qrAt = null;
    this.lastError = reason;
    if (opts.wipe) {
      this.me = null;
      this.connectedAt = null;
    }
    this.numberCache.clear();
    await this.setStatus('disconnected', {
      desired: 'disconnected',
      qr: null,
      qr_updated_at: null,
      last_error: reason,
      ...(opts.wipe ? { phone: null, jid: null, display_name: null, connected_at: null } : {}),
    });
    this.clearTimers(false);
    await this.deps.repo.releaseLease(this.instanceId).catch(() => undefined);
    this.ownsLease = false;
  }

  private async stopSocket(opts: { logout: boolean; reason: string }): Promise<void> {
    this.stopping = true;
    const sock = this.sock;
    if (sock) {
      if (opts.logout) {
        try {
          await sock.logout('EDUWAY admin disconnected WhatsApp');
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'whatsapp: logout request failed — wiping the local session anyway');
        }
      }
      try {
        await sock.end(undefined);
      } catch {
        /* already closed */
      }
    }
    await this.finish(opts.reason, { wipe: opts.logout });
  }

  // ── lease heartbeat ────────────────────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), this.heartbeatMs);
    this.heartbeatTimer.unref?.();
  }

  private async heartbeat(): Promise<void> {
    if (!this.ownsLease) return;
    try {
      if (!(await this.deps.repo.renewLease(this.instanceId, this.leaseTtlMs))) {
        logger.warn('whatsapp: lease lost to another instance — closing the local socket');
        this.stopping = true;
        this.generation++;
        if (this.sock) await Promise.resolve(this.sock.end(undefined)).catch(() => undefined);
        this.sock = null;
        this.ownsLease = false;
        this.clearTimers(false);
        return;
      }
      const row = await this.deps.repo.read();
      if (row?.desired === 'disconnected' && (this.sock || this.reconnectTimer)) {
        await this.stopSocket({ logout: row.last_error === 'logout_requested', reason: row.last_error === 'logout_requested' ? 'logged_out_by_admin' : 'stopped_by_admin' });
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'whatsapp: lease heartbeat failed');
    }
  }

  private clearTimers(includeStandby: boolean): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    if (includeStandby && this.standbyTimer) {
      clearInterval(this.standbyTimer);
      this.standbyTimer = null;
    }
  }

  // ── state ──────────────────────────────────────────────────────────────────────────────────────

  private async setStatus(status: WaStatus, extra: Parameters<SessionRepo['update']>[0] = {}): Promise<void> {
    const changed = status !== this.status;
    this.status = status;
    if (changed) this.since = new Date();
    await this.deps.repo
      .update({ status, ...(changed ? { status_since: this.since } : {}), ...extra })
      .catch((err: Error) => logger.warn({ err: err.message }, 'whatsapp: status not persisted'));
  }

  private encQr(qr: string): string {
    return this.deps.cipher ? this.deps.cipher.encrypt(qr, QR_PERSIST_AAD) : qr;
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const fn of w) fn();
  }

  private waitForChange(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      t.unref?.();
      this.waiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  async snapshot(): Promise<SessionSnapshot> {
    if (this.ownsLease) {
      return {
        status: this.status,
        since: this.since.toISOString(),
        phone: this.me?.phone ?? null,
        jid: this.me?.jid ?? null,
        displayName: this.me?.name ?? null,
        connectedAt: this.connectedAt?.toISOString() ?? null,
        lastError: this.lastError,
        qrAvailable: this.status === 'qr_pending' && !!this.qr,
        qrUpdatedAt: this.qrAt?.toISOString() ?? null,
        owner: 'this',
        desired: 'connected',
      };
    }
    const row = this.configured ? await this.deps.repo.read() : null;
    if (!row) {
      return { status: 'disconnected', since: new Date(0).toISOString(), phone: null, jid: null, displayName: null, connectedAt: null, lastError: null, qrAvailable: false, qrUpdatedAt: null, owner: null, desired: 'disconnected' };
    }
    const alive = leaseAlive(row);
    const status: WaStatus = alive ? row.status : row.desired === 'connected' ? 'connecting' : 'disconnected';
    return {
      status,
      since: row.status_since.toISOString(),
      phone: row.phone,
      jid: row.jid,
      displayName: row.display_name,
      connectedAt: row.connected_at?.toISOString() ?? null,
      lastError: row.last_error,
      qrAvailable: alive && row.status === 'qr_pending' && !!row.qr,
      qrUpdatedAt: row.qr_updated_at?.toISOString() ?? null,
      owner: alive ? 'other' : null,
      desired: row.desired,
    };
  }

  /** Current QR as a PNG data URL (null when no QR is pending). */
  async qrDataUrl(): Promise<{ status: WaStatus; qr: string | null; updatedAt: string | null }> {
    let raw: string | null = null;
    let updatedAt: Date | null = null;
    let status: WaStatus = this.status;
    if (this.ownsLease) {
      raw = this.status === 'qr_pending' ? this.qr : null;
      updatedAt = this.qrAt;
    } else {
      const snap = await this.snapshot();
      status = snap.status;
      const row = snap.qrAvailable ? await this.deps.repo.read() : null;
      if (row?.qr && this.deps.cipher) {
        try {
          raw = this.deps.cipher.decrypt(row.qr, QR_PERSIST_AAD);
          updatedAt = row.qr_updated_at;
        } catch {
          raw = null;
        }
      }
    }
    if (!raw) return { status, qr: null, updatedAt: null };
    const qr = await QRCode.toDataURL(raw, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
    return { status, qr, updatedAt: updatedAt?.toISOString() ?? null };
  }

  // ── messaging ──────────────────────────────────────────────────────────────────────────────────

  /** Is `phone` (E.164) a WhatsApp account? Cached (1 h positive / 10 min negative). null = unknown (check failed). */
  async checkNumber(phone: string, timeoutMs = 8000): Promise<{ exists: boolean; jid: string | null } | null> {
    if (!this.isLive() || !this.sock) throw new WhatsAppError('WHATSAPP_NOT_CONNECTED');
    const hit = this.numberCache.get(phone);
    if (hit && Date.now() - hit.at < (hit.exists ? NUMBER_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS)) return { exists: hit.exists, jid: hit.jid };
    const sock = this.sock;
    try {
      const res = await Promise.race([sock.onWhatsApp(phone), this.sleep(timeoutMs).then(() => 'timeout' as const)]);
      if (res === 'timeout' || !res) return null;
      const r = res[0];
      const out = { exists: !!r?.exists, jid: r?.exists ? r.jid : null };
      this.numberCache.set(phone, { ...out, at: Date.now() });
      return out;
    } catch (err) {
      logger.warn({ err: (err as Error).message, to: maskPhone(phone) }, 'whatsapp: number lookup failed');
      return null;
    }
  }

  /** Send a text message (serialized, random gap + short typing presence). Returns the WhatsApp message id. */
  sendText(phone: string, text: string, jid?: string | null): Promise<string> {
    const run = async (): Promise<string> => {
      const gap = (this.deps.minGapMs ?? 1200) + Math.floor(this.random() * Math.max(0, (this.deps.maxGapMs ?? 3500) - (this.deps.minGapMs ?? 1200)));
      const wait = this.lastSendAt + gap - Date.now();
      if (wait > 0) await this.sleep(wait);
      if (!this.isLive() || !this.sock) throw new WhatsAppError('WHATSAPP_NOT_CONNECTED');
      const sock = this.sock;
      const to = jid ?? phoneToJid(phone);
      const [tMin, tMax] = this.deps.typingMs ?? [500, 1500];
      try {
        await sock.sendPresenceUpdate('composing', to).catch(() => undefined);
        await this.sleep(tMin + Math.floor(this.random() * Math.max(0, tMax - tMin)));
        const res = await sock.sendMessage(to, { text });
        await sock.sendPresenceUpdate('paused', to).catch(() => undefined);
        return res?.key?.id ?? `wa_${Date.now()}`;
      } catch (err) {
        throw new WhatsAppError('WHATSAPP_SEND_FAILED', `whatsapp send failed: ${(err as Error).message}`);
      } finally {
        this.lastSendAt = Date.now();
      }
    };
    const p = this.sendChain.then(run, run);
    this.sendChain = p.catch(() => undefined);
    return p;
  }
}

export function leaseAlive(row: Pick<SessionRow, 'lease_owner' | 'lease_expires_at'>, now = Date.now()): boolean {
  return !!row.lease_owner && !!row.lease_expires_at && row.lease_expires_at.getTime() > now;
}
