/**
 * At-rest encryption of the Baileys session (creds + signal keys). AES-256-GCM with a key derived (HKDF-SHA256)
 * from WHATSAPP_SESSION_SECRET. The row key is bound as additional authenticated data, so a ciphertext cannot be
 * moved to another key. Format: `v1:<iv b64>:<tag b64>:<ciphertext b64>`.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export interface SessionCipher {
  encrypt(plain: string, aad: string): string;
  decrypt(blob: string, aad: string): string;
}

export function deriveSessionKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('eduway-platform-whatsapp-session'), Buffer.from('aes-256-gcm v1'), 32));
}

export function createSessionCipher(secret: string): SessionCipher {
  if (!secret || secret.length < 32) throw new Error('WHATSAPP_SESSION_SECRET must be at least 32 characters');
  const key = deriveSessionKey(secret);
  return {
    encrypt(plain, aad) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      c.setAAD(Buffer.from(aad, 'utf8'));
      const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
      return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
    },
    decrypt(blob, aad) {
      const [v, iv, tag, ct] = blob.split(':');
      if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('unsupported WhatsApp session ciphertext');
      const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      d.setAAD(Buffer.from(aad, 'utf8'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
    },
  };
}
