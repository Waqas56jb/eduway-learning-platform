/**
 * Idempotency-Key support (payments + critical mutations).
 *   route({ ..., idempotency: 'required' })      // or 'optional'
 *
 * First request: row inserted as `processing`; on completion the status + JSON body are stored.
 * Replays with the same key + same payload → stored response is returned (header `Idempotent-Replayed: true`).
 * Same key + different payload → 422 IDEMPOTENCY_CONFLICT. Concurrent duplicate → 409 IDEMPOTENCY_IN_PROGRESS.
 * 5xx responses release the key so the client can retry.
 */
import type { NextFunction, Request, Response } from 'express';
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { AppError, ConflictError } from '../errors/index.js';
import { sha256 } from '../utils/crypto.js';

const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const STALE_PROCESSING_MS = 60_000;

interface IdemRow {
  id: string;
  request_hash: string;
  status: 'processing' | 'completed';
  response_status: number | null;
  response_body: unknown;
  locked_at: Date;
}

export function idempotency(mode: 'required' | 'optional' = 'optional') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.get('idempotency-key');
    if (!key) {
      if (mode === 'required') throw new AppError('VALIDATION_ERROR', 400, { reason: 'IDEMPOTENCY_KEY_REQUIRED' });
      return next();
    }
    if (!KEY_RE.test(key)) throw new AppError('VALIDATION_ERROR', 400, { details: { header: 'Idempotency-Key' } });

    const principal = req.admin?.userId ?? req.student?.userId ?? 'anon';
    const routePath = (req.route as { path?: string } | undefined)?.path ?? req.path;
    const scope = `${req.method} ${req.baseUrl}${routePath}|${principal}`;
    const requestHash = sha256(JSON.stringify({ p: req.params, b: req.body ?? null }));

    const inserted = await db.maybeOne<{ id: string }>(
      `INSERT INTO ${T.idempotency_keys} (scope, key, user_id, request_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scope, key) DO NOTHING
       RETURNING id`,
      [scope, key, principal === 'anon' ? null : principal, requestHash],
    );

    if (!inserted) {
      const existing = await db.maybeOne<IdemRow>(
        `SELECT id, request_hash, status, response_status, response_body, locked_at
           FROM ${T.idempotency_keys} WHERE scope = $1 AND key = $2`,
        [scope, key],
      );
      if (existing) {
        if (existing.request_hash !== requestHash) throw new ConflictError('IDEMPOTENCY_MISMATCH');
        if (existing.status === 'completed' && existing.response_status) {
          res.setHeader('Idempotent-Replayed', 'true');
          res.status(existing.response_status).json(existing.response_body);
          return;
        }
        if (Date.now() - existing.locked_at.getTime() < STALE_PROCESSING_MS) throw new ConflictError('IDEMPOTENCY_IN_PROGRESS');
        // Stale lock (crashed request) — take it over.
        await db.query(`UPDATE ${T.idempotency_keys} SET locked_at = now() WHERE id = $1`, [existing.id]);
      }
    }

    let captured: unknown;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      captured = body;
      return originalJson(body);
    };
    res.on('finish', () => {
      const status = res.statusCode;
      const sql =
        status >= 500
          ? `DELETE FROM ${T.idempotency_keys} WHERE scope = $1 AND key = $2`
          : `UPDATE ${T.idempotency_keys} SET status = 'completed', response_status = $3, response_body = $4::jsonb
              WHERE scope = $1 AND key = $2`;
      const params = status >= 500 ? [scope, key] : [scope, key, status, JSON.stringify(captured ?? null)];
      db.query(sql, params).catch((err: Error) => logger.error({ err: err.message }, 'idempotency finalize failed'));
    });
    next();
  };
}
