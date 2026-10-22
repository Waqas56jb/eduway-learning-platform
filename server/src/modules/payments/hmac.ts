import { createHmac } from 'node:crypto';

/** Hex HMAC-SHA256 (gateway webhook signatures). */
export function hmacHex(secret: string, raw: Buffer | string): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}
