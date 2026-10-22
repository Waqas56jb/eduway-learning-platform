/**
 * Linked WhatsApp number (Baileys): OTP text, session encryption, DB auth state, session manager (QR, connect,
 * logged-out, reconnect, lease), the `baileys` provider (fallback to SMS) and the outbox. Baileys' socket is
 * replaced by a fake — nothing touches the network or the database.
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@whiskeysockets/baileys', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    default: () => {
      throw new Error('makeWASocket must not be called in unit tests');
    },
  };
});

import { env, type Env } from '../../src/config/env.js';
import { arabicMinutes, buildWhatsAppOtpText, otpMessageAr, otpMessageEn } from '../../src/common/providers/otp-message.js';
import { BaileysWhatsAppProvider, ChannelRouterSmsProvider, MockSmsProvider, selectSmsProviders, SmsSendError } from '../../src/common/providers/sms.js';
import { describeProviders } from '../../src/common/providers/status.js';
import { usePostgresAuthState, type AuthKV } from '../../src/common/services/whatsapp/auth-state.js';
import { createSessionCipher } from '../../src/common/services/whatsapp/cipher.js';
import { deliver, openJob, sealJob, type SmsFallback } from '../../src/common/services/whatsapp/outbox.js';
import type { SessionPatch, SessionRepo, SessionRow } from '../../src/common/services/whatsapp/session-repo.js';
import { jidToPhone, phoneToJid, WA_CLOSE, WhatsAppSessionManager, type ConnectionUpdate, type SocketLike } from '../../src/common/services/whatsapp/session.js';

const SECRET = 'unit-test-whatsapp-session-secret-0123456789';
const SESSION_BYTES = Buffer.from([115, 101, 115, 115, 105, 111, 110]);
const cipher = createSessionCipher(SECRET);
const dev = (over: Partial<Env>): Env => ({ ...env, NODE_ENV: 'development', ...over }) as Env;

// ── fakes ───────────────────────────────────────────────────────────────────────────────────────────

function memoryKV(): AuthKV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(keys) {
      return new Map(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k) as string]));
    },
    async set(entries) {
      for (const e of entries) data.set(e.key, e.value);
    },
    async del(keys) {
      for (const k of keys) data.delete(k);
    },
    async clear() {
      data.clear();
    },
    async has(key) {
      return data.has(key);
    },
  };
}

function memoryRepo(): SessionRepo & { row: SessionRow } {
  const row: SessionRow = {
    id: 'default',
    status: 'disconnected',
    desired: 'disconnected',
    status_since: new Date(),
    phone: null,
    jid: null,
    display_name: null,
    connected_at: null,
    qr: null,
    qr_updated_at: null,
    last_error: null,
    lease_owner: null,
    lease_expires_at: null,
  };
  const free = (owner: string) => !row.lease_owner || row.lease_owner === owner || !row.lease_expires_at || row.lease_expires_at.getTime() < Date.now();
  return {
    row,
    async ensure() {},
    async read() {
      return { ...row };
    },
    async update(patch: SessionPatch) {
      Object.assign(row, patch);
    },
    async acquireLease(owner, ttlMs) {
      if (!free(owner)) return false;
      row.lease_owner = owner;
      row.lease_expires_at = new Date(Date.now() + ttlMs);
      return true;
    },
    async renewLease(owner, ttlMs) {
      if (row.lease_owner !== owner) return false;
      row.lease_expires_at = new Date(Date.now() + ttlMs);
      return true;
    },
    async releaseLease(owner) {
      if (row.lease_owner === owner) {
        row.lease_owner = null;
        row.lease_expires_at = null;
      }
    },
  };
}

class FakeSocket implements SocketLike {
  readonly emitter = new EventEmitter();
  user: SocketLike['user'] = undefined;
  sent: { jid: string; text: string }[] = [];
  presence: string[] = [];
  registered: Record<string, boolean> = { '+9647701234567': true, '+447700900123': true };
  ended = false;
  loggedOut = false;
  ev = { on: (event: string, cb: (u: ConnectionUpdate) => void) => void this.emitter.on(event, cb) } as SocketLike['ev'];
  emit(u: ConnectionUpdate) {
    this.emitter.emit('connection.update', u);
  }
  async sendMessage(jid: string, content: { text: string }) {
    this.sent.push({ jid, text: content.text });
    return { key: { id: `MSG${this.sent.length}` } };
  }
  async onWhatsApp(...phones: string[]) {
    return phones.map((p) => ({ jid: phoneToJid(p), exists: !!this.registered[p] }));
  }
  async sendPresenceUpdate(type: string) {
    this.presence.push(type);
  }
  async logout() {
    this.loggedOut = true;
  }
  end() {
    this.ended = true;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const boom = (statusCode: number) => ({ connection: 'close' as const, lastDisconnect: { error: { output: { statusCode } } } });

function makeManager(over: { repo?: ReturnType<typeof memoryRepo>; kv?: ReturnType<typeof memoryKV>; instanceId?: string } = {}) {
  const sockets: FakeSocket[] = [];
  const sleeps: number[] = [];
  const repo = over.repo ?? memoryRepo();
  const kv = over.kv ?? memoryKV();
  const m = new WhatsAppSessionManager({
    repo,
    kv,
    cipher,
    instanceId: over.instanceId ?? 'test-instance',
    createSocket: async () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
    minGapMs: 1000,
    maxGapMs: 3000,
    typingMs: [400, 800],
  });
  return { m, repo, kv, sockets, sleeps };
}

const managers: WhatsAppSessionManager[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const m of managers.splice(0)) await m.shutdown();
});

// ── OTP message ─────────────────────────────────────────────────────────────────────────────────────

describe('WhatsApp OTP message', () => {
  it('matches the owner-approved Arabic and English wording with the expiry from settings', () => {
    expect(otpMessageAr('123456', 300)).toBe('رمز التحقق الخاص بك في EDUWAY هو: 123456\nصالح لمدة 5 دقائق. لا تشارك هذا الرمز مع أي شخص.');
    expect(otpMessageEn('123456', 300)).toBe('Your EDUWAY verification code is: 123456\nValid for 5 minutes. Do not share this code with anyone.');
  });
  it('puts the student language first and includes the other language', () => {
    const ar = buildWhatsAppOtpText('4821', 120, 'ar');
    const en = buildWhatsAppOtpText('4821', 120, 'en');
    expect(ar.startsWith('رمز التحقق')).toBe(true);
    expect(ar).toContain('Your EDUWAY verification code is: 4821');
    expect(en.startsWith('Your EDUWAY verification code is: 4821\nValid for 2 minutes.')).toBe(true);
    expect(en).toContain('صالح لمدة دقيقتين');
  });
  it('uses correct Arabic counting for minutes', () => {
    expect([1, 2, 3, 10, 11, 15].map(arabicMinutes)).toEqual(['دقيقة واحدة', 'دقيقتين', '3 دقائق', '10 دقائق', '11 دقيقة', '15 دقيقة']);
    expect(otpMessageEn('1', 45)).toContain('Valid for 1 minute.');
  });
});

// ── encryption + auth state ─────────────────────────────────────────────────────────────────────────

describe('session encryption at rest', () => {
  it('round-trips and binds the ciphertext to its key (AAD)', () => {
    const blob = cipher.encrypt('{"secret":1}', 'creds');
    expect(blob.startsWith('v1:')).toBe(true);
    expect(blob).not.toContain('secret');
    expect(cipher.decrypt(blob, 'creds')).toBe('{"secret":1}');
    expect(() => cipher.decrypt(blob, 'session-x')).toThrow();
    expect(() => createSessionCipher('another-secret-that-is-long-enough-0000').decrypt(blob, 'creds')).toThrow();
  });
  it('refuses a short secret', () => {
    expect(() => createSessionCipher('short')).toThrow(/32/);
  });
});

describe('Baileys auth state in the database', () => {
  it('persists creds and signal keys encrypted and restores Buffers', async () => {
    const kv = memoryKV();
    const a = await usePostgresAuthState(kv, cipher);
    expect(a.state.creds.registered).toBe(false);
    await a.saveCreds();
    await a.state.keys.set({ 'pre-key': { '1': { public: Buffer.from([1, 2, 3]), private: Buffer.from([4, 5, 6]) } }, session: { 'abc.0': SESSION_BYTES } });
    expect([...kv.data.keys()].sort()).toEqual(['creds', 'pre-key-1', 'session-abc.0']);
    for (const v of kv.data.values()) expect(v.startsWith('v1:')).toBe(true);
    expect(kv.data.get('session-abc.0')).not.toContain(SESSION_BYTES.toString('base64'));

    const b = await usePostgresAuthState(kv, cipher);
    expect(Buffer.from(b.state.creds.noiseKey.public).equals(Buffer.from(a.state.creds.noiseKey.public))).toBe(true);
    const pre = await b.state.keys.get('pre-key', ['1', '2']);
    expect(Buffer.from(pre['1']!.private).equals(Buffer.from([4, 5, 6]))).toBe(true);
    expect(pre['2']).toBeUndefined();

    await b.state.keys.set({ 'pre-key': { '1': null } });
    expect(kv.data.has('pre-key-1')).toBe(false);
    await b.clear();
    expect(kv.data.size).toBe(0);
  });
});

// ── session manager ─────────────────────────────────────────────────────────────────────────────────

describe('WhatsAppSessionManager', () => {
  it('connect → QR pending (data URL) → scan → connected with the linked number', async () => {
    const { m, repo, sockets } = makeManager();
    managers.push(m);
    const pending = m.connect(2000);
    await flush();
    sockets[0]!.emit({ qr: '2@ABCDEF,noise,identity,adv' });
    const snap = await pending;
    expect(snap.status).toBe('qr_pending');
    expect(snap.qrAvailable).toBe(true);
    expect(repo.row.desired).toBe('connected');
    expect(repo.row.lease_owner).toBe('test-instance');
    expect(repo.row.qr).toMatch(/^v1:/); // the persisted QR is encrypted
    const qr = await m.qrDataUrl();
    expect(qr.qr).toMatch(/^data:image\/png;base64,/);

    // after the scan WhatsApp asks for a restart, then the connection opens
    sockets[0]!.emit(boom(WA_CLOSE.restartRequired));
    await flush();
    await flush();
    expect(sockets).toHaveLength(2);
    sockets[1]!.user = { id: '9647709876543:4@s.whatsapp.net', name: 'EDUWAY Support' };
    sockets[1]!.emit({ connection: 'open' });
    await flush();
    const s = await m.snapshot();
    expect(s).toMatchObject({ status: 'connected', phone: '+9647709876543', displayName: 'EDUWAY Support', owner: 'this', qrAvailable: false });
    expect(repo.row).toMatchObject({ status: 'connected', phone: '+9647709876543' });
    expect(m.isLive()).toBe(true);
  });

  it('logged out from the phone → session wiped, status disconnected, lease released, no reconnect', async () => {
    const { m, repo, kv, sockets } = makeManager();
    managers.push(m);
    await m.connect(0);
    sockets[0]!.user = { id: '9647709876543@s.whatsapp.net' };
    sockets[0]!.emit({ connection: 'open' });
    await flush();
    kv.data.set('creds', cipher.encrypt('{}', 'creds'));
    sockets[0]!.emit(boom(WA_CLOSE.loggedOut));
    await flush();
    await flush();
    expect(kv.data.size).toBe(0);
    expect(repo.row).toMatchObject({ status: 'disconnected', desired: 'disconnected', last_error: 'logged_out', phone: null, lease_owner: null });
    expect(sockets).toHaveLength(1);
    expect(m.isLive()).toBe(false);
  });

  it('unscanned QR codes running out → qr_expired instead of looping', async () => {
    const { m, repo, sockets } = makeManager();
    managers.push(m);
    await m.connect(0);
    sockets[0]!.emit({ qr: 'qr-1' });
    await flush();
    sockets[0]!.emit(boom(WA_CLOSE.timedOut));
    await flush();
    await flush();
    expect(repo.row).toMatchObject({ status: 'disconnected', last_error: 'qr_expired', lease_owner: null });
    expect(sockets).toHaveLength(1);
  });

  it('a dropped connection reconnects with exponential backoff', async () => {
    vi.useFakeTimers();
    const { m, repo, sockets } = makeManager();
    managers.push(m);
    await m.connect(0);
    sockets[0]!.emit({ connection: 'open' });
    await vi.advanceTimersByTimeAsync(0);
    // pretend the device was paired
    (m as unknown as { auth: { state: { creds: { registered: boolean } } } }).auth.state.creds.registered = true;
    sockets[0]!.emit(boom(WA_CLOSE.connectionClosed));
    await vi.advanceTimersByTimeAsync(0);
    expect(repo.row.status).toBe('connecting');
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000); // attempt 0 → 1 s
    expect(sockets).toHaveLength(2);
    expect(m.backoffMs(0)).toBe(1000);
    expect(m.backoffMs(3)).toBe(8000);
    expect(m.backoffMs(20)).toBe(60_000);
  });

  it('only one instance runs the socket (lease); the other reports its status', async () => {
    const repo = memoryRepo();
    const a = makeManager({ repo, instanceId: 'A' });
    const b = makeManager({ repo, instanceId: 'B' });
    managers.push(a.m, b.m);
    const pa = a.m.connect(1000);
    await flush();
    a.sockets[0]!.emit({ qr: 'qr-A' });
    await pa;
    const sb = await b.m.connect(0);
    expect(b.sockets).toHaveLength(0);
    expect(sb).toMatchObject({ status: 'qr_pending', owner: 'other', qrAvailable: true });
    expect((await b.m.qrDataUrl()).qr).toMatch(/^data:image\/png/); // decrypted from the shared row
    // A shuts down gracefully → lease free → B can take over
    await a.m.shutdown();
    expect(repo.row.lease_owner).toBeNull();
    expect(await repo.acquireLease('B', 30_000)).toBe(true);
  });

  it('disconnect(logout) logs out the device and wipes the stored session', async () => {
    const { m, repo, kv, sockets } = makeManager();
    managers.push(m);
    await m.connect(0);
    sockets[0]!.emit({ connection: 'open' });
    await flush();
    kv.data.set('creds', 'x');
    const snap = await m.disconnect({ logout: true });
    expect(sockets[0]!.loggedOut).toBe(true);
    expect(sockets[0]!.ended).toBe(true);
    expect(kv.data.size).toBe(0);
    expect(snap.status).toBe('disconnected');
    expect(repo.row).toMatchObject({ desired: 'disconnected', last_error: 'logged_out_by_admin', lease_owner: null });
  });

  it('checks numbers (cached) and sends serialized messages with a random gap and typing presence', async () => {
    const { m, sockets, sleeps } = makeManager();
    managers.push(m);
    await m.connect(0);
    sockets[0]!.emit({ connection: 'open' });
    await flush();
    const spy = vi.spyOn(sockets[0]!, 'onWhatsApp');
    expect(await m.checkNumber('+9647701234567')).toEqual({ exists: true, jid: '9647701234567@s.whatsapp.net' });
    expect(await m.checkNumber('+9647701234567')).toEqual({ exists: true, jid: '9647701234567@s.whatsapp.net' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await m.checkNumber('+9647500000000'))?.exists).toBe(false);

    const [id1, id2] = await Promise.all([m.sendText('+9647701234567', 'one'), m.sendText('+447700900123', 'two')]);
    expect([id1, id2]).toEqual(['MSG1', 'MSG2']);
    expect(sockets[0]!.sent.map((s) => s.text)).toEqual(['one', 'two']);
    expect(sockets[0]!.presence).toEqual(['composing', 'paused', 'composing', 'paused']);
    expect(sleeps.filter((ms) => ms === 400)).toHaveLength(2); // typing delay (random = 0 → minimum)
    expect(sleeps.some((ms) => ms > 400 && ms <= 1000)).toBe(true); // gap before the 2nd message
  });

  it('refuses to send when not connected and without a session secret', async () => {
    const { m } = makeManager();
    managers.push(m);
    await expect(m.sendText('+9647701234567', 'x')).rejects.toMatchObject({ reason: 'WHATSAPP_NOT_CONNECTED' });
    const n = new WhatsAppSessionManager({ repo: memoryRepo(), kv: memoryKV(), cipher: null, createSocket: async () => new FakeSocket() });
    expect(n.configured).toBe(false);
    await expect(n.connect(0)).rejects.toMatchObject({ reason: 'WHATSAPP_NOT_CONFIGURED' });
  });

  it('maps JIDs and phones', () => {
    expect(phoneToJid('+964 770 123 4567')).toBe('9647701234567@s.whatsapp.net');
    expect(jidToPhone('9647701234567:12@s.whatsapp.net')).toBe('+9647701234567');
    expect(jidToPhone('12345@lid')).toBe('+12345');
    expect(jidToPhone(undefined)).toBeNull();
  });
});

// ── provider + outbox ───────────────────────────────────────────────────────────────────────────────

function fakePort(over: Partial<{ configured: boolean; live: boolean; remote: boolean; exists: boolean | null }> = {}) {
  const queued: unknown[] = [];
  const o = { configured: true, live: true, remote: true, exists: true as boolean | null, ...over };
  const port = {
    configured: () => o.configured,
    isLive: () => o.live,
    remoteConnected: async () => o.remote,
    checkNumber: async (phone: string) => (o.exists === null ? null : { exists: o.exists, jid: o.exists ? phoneToJid(phone) : null }),
    queue: async (item: unknown) => {
      queued.push(item);
      return { jobId: 'job-1', outcome: null };
    },
  };
  return { port, queued };
}

describe('BaileysWhatsAppProvider', () => {
  const otpMsg = { to: '+9647701234567', text: 'SMS: code 123456', channel: 'whatsapp' as const, devCode: '123456', locale: 'en' as const, ttlSeconds: 300, otpId: 'otp-1' };

  it('queues the bilingual OTP (student language first) and reports the whatsapp channel', async () => {
    const sms = new MockSmsProvider();
    const { port, queued } = fakePort();
    const r = await new BaileysWhatsAppProvider(sms, async () => port as never).send(otpMsg);
    expect(r).toMatchObject({ channel: 'whatsapp', provider: 'baileys', providerMessageId: 'baileys_job_job-1' });
    const item = queued[0] as { text: string; jid: string; fallback: { text: string; devCode: string }; otpId: string; expiresAt: string };
    expect(item.text.startsWith('Your EDUWAY verification code is: 123456\nValid for 5 minutes.')).toBe(true);
    expect(item.text).toContain('رمز التحقق الخاص بك في EDUWAY هو: 123456');
    expect(item).toMatchObject({ jid: '9647701234567@s.whatsapp.net', fallback: { text: 'SMS: code 123456', devCode: '123456' }, otpId: 'otp-1' });
    expect(Date.parse(item.expiresAt)).toBeGreaterThan(Date.now());
    expect(sms.outbox).toHaveLength(0);
  });

  it('falls back to SMS when the session is disconnected or the number is not on WhatsApp', async () => {
    for (const over of [{ remote: false, live: false }, { exists: false }, { configured: false }]) {
      const sms = new MockSmsProvider();
      const { port, queued } = fakePort(over);
      const r = await new BaileysWhatsAppProvider(sms, async () => port as never).send(otpMsg);
      expect(r.channel).toBe('sms');
      expect(r.provider).toBe('mock');
      expect(queued).toHaveLength(0);
      expect(sms.outbox[0]).toMatchObject({ channel: 'sms', text: 'SMS: code 123456', devCode: '123456' });
    }
  });

  it('non-OTP messages (campaigns) fail permanently instead of switching to paid SMS', async () => {
    const { port } = fakePort({ remote: false, live: false });
    const e = (await new BaileysWhatsAppProvider(new MockSmsProvider(), async () => port as never).send({ to: '+1', text: 'hi', channel: 'whatsapp' }).catch((x: unknown) => x)) as SmsSendError;
    expect(e).toBeInstanceOf(SmsSendError);
    expect(e.permanent).toBe(true);
  });

  it('makes WhatsApp the default OTP channel only while the linked number is connected', async () => {
    const sms = new MockSmsProvider();
    const up = new ChannelRouterSmsProvider(sms, new BaileysWhatsAppProvider(sms, async () => fakePort().port as never));
    const down = new ChannelRouterSmsProvider(sms, new BaileysWhatsAppProvider(sms, async () => fakePort({ remote: false }).port as never));
    expect(await up.otpDefaultChannel()).toBe('whatsapp');
    expect(await down.otpDefaultChannel()).toBe('sms');
    expect(await new ChannelRouterSmsProvider(sms, sms).otpDefaultChannel()).toBe('sms');
  });

  it('is selected by WHATSAPP_PROVIDER=baileys when the session secret is set (else mock + missing var)', () => {
    const on = selectSmsProviders(dev({ WHATSAPP_PROVIDER: 'baileys', WHATSAPP_SESSION_SECRET: SECRET }));
    expect(on.whatsapp).toEqual({ requested: 'baileys', active: 'baileys' });
    expect(on.provider.nameFor('whatsapp')).toBe('baileys');
    const off = selectSmsProviders(dev({ WHATSAPP_PROVIDER: 'baileys', WHATSAPP_SESSION_SECRET: undefined }));
    expect(off.whatsapp.active).toBe('mock');
    const row = describeProviders(dev({ WHATSAPP_PROVIDER: 'baileys', WHATSAPP_SESSION_SECRET: undefined })).find((p) => p.provider === 'whatsapp');
    expect(row?.missing).toEqual(['WHATSAPP_SESSION_SECRET']);
  });
});

describe('WhatsApp outbox (pg-boss job)', () => {
  const fallback = () => {
    const sent: unknown[] = [];
    const f: SmsFallback & { sent: unknown[] } = { name: 'twilio', sent, send: async (m) => (sent.push(m), { providerMessageId: 'SM1' }) };
    return f;
  };

  it('encrypts the queued payload', () => {
    const data = sealJob(cipher, { to: '+9647701234567', text: 'code 123456' });
    expect(JSON.stringify(data)).not.toContain('123456');
    expect(openJob(cipher, data)).toEqual({ to: '+9647701234567', text: 'code 123456' });
  });

  it('sends through the live session, or falls back to SMS for OTPs, or drops expired messages', async () => {
    const { m, sockets } = makeManager();
    managers.push(m);
    const sms = fallback();
    // not connected → SMS
    expect(await deliver({ to: '+9647701234567', text: 'wa', fallback: { text: 'sms', devCode: '1' } }, m, () => sms)).toMatchObject({ channel: 'sms', provider: 'twilio' });
    // expired → dropped
    expect((await deliver({ to: '+9647701234567', text: 'wa', expiresAt: new Date(Date.now() - 1000).toISOString() }, m, () => sms)).channel).toBe('dropped');
    // connected → WhatsApp
    await m.connect(0);
    sockets[0]!.emit({ connection: 'open' });
    await flush();
    expect(await deliver({ to: '+9647701234567', text: 'wa' }, m, () => sms)).toMatchObject({ channel: 'whatsapp', provider: 'baileys', providerMessageId: 'MSG1' });
    // connected but not on WhatsApp → SMS
    expect((await deliver({ to: '+9647500000000', text: 'wa', fallback: { text: 'sms' } }, m, () => sms)).channel).toBe('sms');
    // non-OTP without fallback → error
    await expect(deliver({ to: '+9647500000000', text: 'wa' }, m, () => sms)).rejects.toThrow(/not delivered/);
    expect(sms.sent).toHaveLength(2);
  });
});
