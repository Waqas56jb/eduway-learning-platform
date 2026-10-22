/**
 * Baileys auth state persisted in Postgres (`eduway_platform_whatsapp_auth`), NOT the filesystem (Railway disks are
 * ephemeral). One row per key: `creds` plus `<signal type>-<id>` for signal keys. Every value is encrypted with the
 * session cipher (see cipher.ts); the row key is the AAD.
 */
import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type AuthenticationState, type SignalDataSet, type SignalDataTypeMap } from '@whiskeysockets/baileys';
import { T } from '../../../config/constants.js';
import { db } from '../../../config/db.js';
import type { SessionCipher } from './cipher.js';

/** Raw (encrypted) key/value storage — Postgres in production, an in-memory map in unit tests. */
export interface AuthKV {
  get(keys: string[]): Promise<Map<string, string>>;
  set(entries: { key: string; value: string }[]): Promise<void>;
  del(keys: string[]): Promise<void>;
  clear(): Promise<void>;
  /** True when a paired (registered) session exists. */
  has(key: string): Promise<boolean>;
}

export function pgAuthKV(sessionId = 'default'): AuthKV {
  return {
    async get(keys) {
      const out = new Map<string, string>();
      if (!keys.length) return out;
      const rows = await db.many<{ key: string; value: string }>(`SELECT key, value FROM ${T.whatsapp_auth} WHERE session_id = $1 AND key = ANY($2::text[])`, [sessionId, keys]);
      for (const r of rows) out.set(r.key, r.value);
      return out;
    },
    async set(entries) {
      if (!entries.length) return;
      await db.query(
        `INSERT INTO ${T.whatsapp_auth} (session_id, key, value)
         SELECT $1, k, v FROM unnest($2::text[], $3::text[]) AS x(k, v)
         ON CONFLICT (session_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [sessionId, entries.map((e) => e.key), entries.map((e) => e.value)],
      );
    },
    async del(keys) {
      if (!keys.length) return;
      await db.query(`DELETE FROM ${T.whatsapp_auth} WHERE session_id = $1 AND key = ANY($2::text[])`, [sessionId, keys]);
    },
    async clear() {
      await db.query(`DELETE FROM ${T.whatsapp_auth} WHERE session_id = $1`, [sessionId]);
    },
    async has(key) {
      return !!(await db.scalar<number>(`SELECT 1 FROM ${T.whatsapp_auth} WHERE session_id = $1 AND key = $2`, [sessionId, key]));
    },
  };
}

export interface PersistedAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clear: () => Promise<void>;
}

const CREDS = 'creds';

export async function usePostgresAuthState(kv: AuthKV, cipher: SessionCipher): Promise<PersistedAuthState> {
  const encode = (key: string, value: unknown) => cipher.encrypt(JSON.stringify(value, BufferJSON.replacer), key);
  const decode = (key: string, blob: string): unknown => JSON.parse(cipher.decrypt(blob, key), BufferJSON.reviver);

  const stored = (await kv.get([CREDS])).get(CREDS);
  const creds: AuthenticationCreds = stored ? (decode(CREDS, stored) as AuthenticationCreds) : initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      async get<K extends keyof SignalDataTypeMap>(type: K, ids: string[]) {
        const names = ids.map((id) => `${type}-${id}`);
        const found = await kv.get(names);
        const out: { [id: string]: SignalDataTypeMap[K] } = {};
        ids.forEach((id, i) => {
          const name = names[i] as string;
          const blob = found.get(name);
          if (!blob) return;
          let value = decode(name, blob);
          if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
          out[id] = value as SignalDataTypeMap[K];
        });
        return out;
      },
      async set(data: SignalDataSet) {
        const upserts: { key: string; value: string }[] = [];
        const deletes: string[] = [];
        for (const category of Object.keys(data) as (keyof SignalDataSet)[]) {
          const entries = data[category] ?? {};
          for (const id of Object.keys(entries)) {
            const name = `${category}-${id}`;
            const value = entries[id];
            if (value) upserts.push({ key: name, value: encode(name, value) });
            else deletes.push(name);
          }
        }
        await kv.set(upserts);
        await kv.del(deletes);
      },
    },
  };

  return {
    state,
    saveCreds: () => kv.set([{ key: CREDS, value: encode(CREDS, state.creds) }]),
    clear: () => kv.clear(),
  };
}
