/**
 * The `eduway_platform_whatsapp_sessions` row: admin-visible status + the single-socket lease.
 * Lease rule: an instance holds the WhatsApp socket only while it owns an unexpired lease; it renews it on a
 * heartbeat and releases it whenever its socket stops, so "lease held" ⇔ "a socket is running somewhere".
 */
import { T } from '../../../config/constants.js';
import { db } from '../../../config/db.js';

export type WaStatus = 'disconnected' | 'qr_pending' | 'connecting' | 'connected';

export interface SessionRow {
  id: string;
  status: WaStatus;
  desired: 'connected' | 'disconnected';
  status_since: Date;
  phone: string | null;
  jid: string | null;
  display_name: string | null;
  connected_at: Date | null;
  qr: string | null;
  qr_updated_at: Date | null;
  last_error: string | null;
  lease_owner: string | null;
  lease_expires_at: Date | null;
}

export type SessionPatch = Partial<Pick<SessionRow, 'status' | 'desired' | 'status_since' | 'phone' | 'jid' | 'display_name' | 'connected_at' | 'qr' | 'qr_updated_at' | 'last_error'>>;

export interface SessionRepo {
  ensure(): Promise<void>;
  read(): Promise<SessionRow | null>;
  update(patch: SessionPatch): Promise<void>;
  /** Take the lease when free, expired or already ours. */
  acquireLease(owner: string, ttlMs: number): Promise<boolean>;
  /** Extend our lease; false when another instance owns it now. */
  renewLease(owner: string, ttlMs: number): Promise<boolean>;
  releaseLease(owner: string): Promise<void>;
}

const COLUMNS = new Set(['status', 'desired', 'status_since', 'phone', 'jid', 'display_name', 'connected_at', 'qr', 'qr_updated_at', 'last_error']);

export function pgSessionRepo(id = 'default'): SessionRepo {
  return {
    async ensure() {
      await db.query(`INSERT INTO ${T.whatsapp_sessions} (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [id]);
    },
    read() {
      return db.maybeOne<SessionRow>(`SELECT * FROM ${T.whatsapp_sessions} WHERE id = $1`, [id]);
    },
    async update(patch) {
      const keys = Object.keys(patch).filter((k) => COLUMNS.has(k));
      if (!keys.length) return;
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      await db.query(`UPDATE ${T.whatsapp_sessions} SET ${sets} WHERE id = $1`, [id, ...keys.map((k) => (patch as Record<string, unknown>)[k])]);
    },
    async acquireLease(owner, ttlMs) {
      const n = await db.exec(
        `UPDATE ${T.whatsapp_sessions} SET lease_owner = $2, lease_expires_at = now() + make_interval(secs => $3::double precision)
          WHERE id = $1 AND (lease_owner IS NULL OR lease_owner = $2 OR lease_expires_at IS NULL OR lease_expires_at < now())`,
        [id, owner, ttlMs / 1000],
      );
      return n > 0;
    },
    async renewLease(owner, ttlMs) {
      const n = await db.exec(
        `UPDATE ${T.whatsapp_sessions} SET lease_expires_at = now() + make_interval(secs => $3::double precision) WHERE id = $1 AND lease_owner = $2`,
        [id, owner, ttlMs / 1000],
      );
      return n > 0;
    },
    async releaseLease(owner) {
      await db.query(`UPDATE ${T.whatsapp_sessions} SET lease_owner = NULL, lease_expires_at = NULL WHERE id = $1 AND lease_owner = $2`, [id, owner]);
    },
  };
}
