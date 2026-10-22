/**
 * requestId + locale + client context (X-Client-Platform, X-Device-Id). Mounted first in app.ts.
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { CLIENT_PLATFORMS, type ClientPlatform } from '../../config/constants.js';
import { resolveLocale } from '../i18n/index.js';

const SAFE_ID = /^[A-Za-z0-9._:-]{6,128}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

export function locale(req: Request, res: Response, next: NextFunction): void {
  req.locale = resolveLocale(req.get('accept-language'));
  res.setHeader('Content-Language', req.locale);
  next();
}

export function clientContext(req: Request, _res: Response, next: NextFunction): void {
  const platform = req.get('x-client-platform')?.toLowerCase();
  req.clientPlatform = platform && (CLIENT_PLATFORMS as readonly string[]).includes(platform) ? (platform as ClientPlatform) : null;
  const deviceId = req.get('x-device-id');
  req.deviceId = deviceId && SAFE_ID.test(deviceId) ? deviceId : null;
  next();
}
