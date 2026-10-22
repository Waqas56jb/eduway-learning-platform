/**
 * Central error handler → `{ success: false, error: { code, message, details } }` (API_CONTRACT §0.2).
 * Message localized from Accept-Language (reason message wins over code message). Maps AppError, zod,
 * Postgres, body-parser and multer errors. 500s carry `details.requestId`.
 */
import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { PG_ERR } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { AppError, NotFoundError, ServiceUnavailableError, ValidationError } from '../errors/index.js';
import { isKnownReason, translate } from '../i18n/index.js';
import type { ErrorEnvelope } from '../utils/response.js';
import { validationErrorFrom, zodIssues } from './validate.js';

interface PgLikeError {
  code?: string;
  constraint?: string;
  message: string;
}

const isPgError = (e: unknown): e is PgLikeError =>
  typeof e === 'object' && e !== null && typeof (e as PgLikeError).code === 'string' && /^[0-9A-Z]{5}$/.test((e as PgLikeError).code ?? '');

/** Normalize anything thrown into an AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return validationErrorFrom(zodIssues(err));

  const e = err as { type?: string };
  if (e?.type === 'entity.parse.failed') return new AppError('VALIDATION_ERROR', 400, { reason: 'INVALID_JSON' });
  if (e?.type === 'entity.too.large') return new AppError('VALIDATION_ERROR', 413, { reason: 'PAYLOAD_TOO_LARGE' });
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return new AppError('VALIDATION_ERROR', 413, { reason: 'FILE_TOO_LARGE' });
    return new AppError('VALIDATION_ERROR', 400, { details: { multer: err.code } });
  }
  if (isPgError(err)) {
    switch (err.code) {
      case PG_ERR.uniqueViolation:
        return new AppError('CONFLICT', 409, { reason: 'ALREADY_EXISTS', details: { constraint: err.constraint } });
      case PG_ERR.foreignKeyViolation:
        return new AppError('CONFLICT', 409, { reason: 'HAS_DEPENDENTS', details: { constraint: err.constraint } });
      case PG_ERR.checkViolation:
      case PG_ERR.notNullViolation:
        return new AppError('VALIDATION_ERROR', 400, { details: { constraint: err.constraint } });
      case PG_ERR.invalidTextRepresentation:
        return new NotFoundError('resource');
      case '57014':
      case '53300':
      case '08006':
      case '08001':
        return new ServiceUnavailableError();
      default:
        break;
    }
  }
  const msg = (err as Error)?.message ?? '';
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Connection terminated|timeout exceeded when trying to connect|tenant\/user .* not found/i.test(msg)) {
    return new ServiceUnavailableError();
  }
  return new AppError('INTERNAL', 500, { cause: err });
}

// Express recognizes error handlers by arity (4 args) — keep `_next`.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appErr = toAppError(err);
  const locale = req.locale ?? 'ar';

  if (appErr.status >= 500) {
    const original = (appErr.cause ?? err) as Error;
    logger.error(
      { requestId: req.requestId, method: req.method, path: req.originalUrl, err: { message: original?.message, stack: original?.stack, code: (original as PgLikeError)?.code } },
      'request failed',
    );
  } else {
    logger.debug({ requestId: req.requestId, code: appErr.code, reason: appErr.reason, status: appErr.status }, 'request rejected');
  }

  if (res.headersSent) {
    res.end();
    return;
  }
  if (appErr.headers) for (const [k, v] of Object.entries(appErr.headers)) res.setHeader(k, v);

  let details = appErr.toDetails();
  if (appErr instanceof ValidationError) {
    const fields: Record<string, string> = {};
    for (const i of appErr.issues) {
      if (fields[i.path]) continue;
      fields[i.path] = isKnownReason(i.message) ? translate('VALIDATION_ERROR', locale, undefined, i.message) : i.message;
    }
    details = { ...(details ?? {}), fields };
  }
  if (appErr.status >= 500) details = { ...(appErr.reason ? { reason: appErr.reason } : {}), requestId: req.requestId };

  const body: ErrorEnvelope = {
    success: false,
    error: {
      code: appErr.code,
      message: translate(appErr.code, locale, appErr.params, appErr.reason),
      ...(details !== undefined ? { details } : {}),
    },
  };
  res.status(appErr.status).json(body);
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', 404, { reason: 'ROUTE_NOT_FOUND', details: { entity: 'route', method: req.method, path: req.originalUrl.split('?')[0] } }));
}
