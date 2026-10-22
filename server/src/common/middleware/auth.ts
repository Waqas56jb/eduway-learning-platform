/**
 * Authentication middleware (API_CONTRACT §0.5). Usually applied through the route builder `auth` option:
 *   'student'  — student token, completed profile, accepted legal docs, not in maintenance / forced update
 *   'student*' — student token; allowed before profile completion / legal acceptance
 *   'admin'    — admin token (aud eduway-admin), roles/permissions loaded
 *   'any'      — student* or admin
 *   'optional' — attaches req.student when a valid student token is present; never fails
 */
import type { NextFunction, Request, Response } from 'express';
import { resolveAdmin, resolveStudent } from '../auth/principal.js';
import { extractBearer, peekAudience, verifyAccessToken } from '../auth/tokens.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { settingsStore } from '../services/settings-store.js';
import { compareSemver } from '../utils/semver.js';

async function authStudent(req: Request, token: string): Promise<void> {
  const claims = verifyAccessToken(token, 'student');
  req.student = await resolveStudent(claims.sub, claims.sid);
}

async function authAdmin(req: Request, token: string): Promise<void> {
  const claims = verifyAccessToken(token, 'admin');
  req.admin = await resolveAdmin(claims.sub, claims.sid);
}

/** 403 MAINTENANCE / UPDATE_REQUIRED for student traffic (contract §0.3). */
export async function clientGate(req: Request): Promise<void> {
  const app = await settingsStore.app();
  const platform = req.clientPlatform ?? req.student?.platform ?? 'web';
  if (platform === 'admin') return;
  if (app.maintenanceMode && (app.maintenancePlatforms as string[]).includes(platform)) {
    throw new ForbiddenError('MAINTENANCE', { message: app.maintenanceMessage });
  }
  const version = req.get('x-app-version');
  if (app.forceUpdate && version && (platform === 'ios' || platform === 'android')) {
    const min = platform === 'ios' ? app.minVersionIos : app.minVersionAndroid;
    if (compareSemver(version, min) < 0) {
      throw new ForbiddenError('UPDATE_REQUIRED', { storeUrl: platform === 'ios' ? app.storeUrlIos : app.storeUrlAndroid, minVersion: min });
    }
  }
}

function bearer(req: Request, aud: 'student' | 'admin' | 'any'): string {
  const token = extractBearer(req.get('authorization'));
  if (!token) throw new UnauthorizedError();
  const actual = peekAudience(token);
  if (!actual || (aud !== 'any' && actual !== aud)) throw new UnauthorizedError('TOKEN_INVALID');
  return token;
}

/** Student token, profile may be incomplete (`student*`). */
export async function requireStudentPartial(req: Request, _res: Response, next: NextFunction): Promise<void> {
  await authStudent(req, bearer(req, 'student'));
  await clientGate(req);
  next();
}

/** Student token with completed profile and no pending legal re-acceptance. */
export async function requireStudent(req: Request, _res: Response, next: NextFunction): Promise<void> {
  await authStudent(req, bearer(req, 'student'));
  await clientGate(req);
  const s = req.student!;
  if (!s.profileComplete) throw new ForbiddenError('PROFILE_INCOMPLETE');
  if (s.pendingLegal > 0 && (await settingsStore.get('auth')).requireLegalAcceptance) {
    throw new ForbiddenError('LEGAL_ACCEPTANCE_REQUIRED');
  }
  next();
}

/** While MFA is mandatory and not yet enrolled, admins may only reach their profile / MFA endpoints. */
const MFA_ENROLMENT_ALLOWED = [/\/admin\/me(\/|$)/, /\/auth\//, /\/storage\/signed-upload-url$/];

async function mfaEnrolmentGuard(req: Request): Promise<void> {
  const a = req.admin;
  if (!a || a.mfaEnabled) return;
  if (!(await settingsStore.get('security')).adminMfaMandatory) return;
  const path = req.originalUrl.split('?')[0] ?? '';
  if (!MFA_ENROLMENT_ALLOWED.some((re) => re.test(path))) throw new ForbiddenError('MFA_ENROLLMENT_REQUIRED');
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  await authAdmin(req, bearer(req, 'admin'));
  await mfaEnrolmentGuard(req);
  next();
}

export async function requireAnyUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = bearer(req, 'any');
  if (peekAudience(token) === 'admin') {
    await authAdmin(req, token);
    await mfaEnrolmentGuard(req);
  } else {
    await authStudent(req, token);
    await clientGate(req);
  }
  next();
}

export async function optionalStudent(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearer(req.get('authorization'));
  if (token && peekAudience(token) === 'student') {
    try {
      await authStudent(req, token);
    } catch {
      /* anonymous */
    }
  }
  next();
}
