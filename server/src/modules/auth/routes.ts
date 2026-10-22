import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { okDto } from '../../common/validation/schemas.js';
import { meStudentDto } from '../users/schemas.js';
import { authController as c } from './controller.js';
import {
  acceptInviteBody,
  acceptLegalBody,
  adminLoginBody,
  authTokensDto,
  forgotBody,
  inviteTokenParam,
  logoutAllBody,
  logoutBody,
  mfaCodeBody,
  mfaDisableBody,
  mfaVerifyBody,
  refreshBody,
  registerDto,
  resetBody,
  sendOtpBody,
  sendOtpDto,
  verifyOtpBody,
} from './schemas.js';

export const router = Router();
const tags = ['Auth · Students'];
const adminTags = ['Auth · Admins'];

// ── students (§4.1) ──
defineRoute(router, { method: 'post', path: '/auth/send-otp', tags, summary: 'Send OTP (AUTH-01)', auth: 'public', rateLimit: rateLimits.otpSend, body: sendOtpBody, response: sendOtpDto }, ({ req, body }) => c.sendOtp(req, body));
defineRoute(router, { method: 'post', path: '/auth/verify-otp', tags, summary: 'Verify OTP → tokens; creates the account when `registration` is sent (AUTH-02)', auth: 'public', rateLimit: rateLimits.otpVerify, body: verifyOtpBody }, ({ req, body }) => c.verifyOtp(req, body));
defineRoute(router, { method: 'post', path: '/auth/register', tags, summary: 'Complete profile (AUTH-03)', auth: 'student*', rateLimit: rateLimits.auth, body: registerDto, response: meStudentDto }, ({ req, student, body }) => c.register(req, student, body));
defineRoute(router, { method: 'post', path: '/auth/refresh', tags, summary: 'Rotate refresh token (AUTH-04, students & admins)', auth: 'public', rateLimit: rateLimits.auth, body: refreshBody, response: authTokensDto }, ({ req, body }) => c.refresh(req, body.refreshToken));
defineRoute(router, { method: 'post', path: '/auth/logout', tags, summary: 'Logout current session (AUTH-05)', auth: 'any', body: logoutBody, response: okDto }, ({ req, body }) => c.logout(req, body.refreshToken));
defineRoute(router, { method: 'post', path: '/auth/logout-all', tags, summary: 'Logout all sessions (AUTH-06)', auth: 'any', body: logoutAllBody }, ({ req, body }) => c.logoutAll(req, body.keepCurrent));
defineRoute(router, { method: 'get', path: '/auth/me', tags, summary: 'Current principal: MeStudentDto or MeAdminDto (AUTH-07)', auth: 'any' }, ({ req }) => c.me(req));
defineRoute(router, { method: 'post', path: '/auth/accept-legal', tags, summary: 'Accept legal documents (AUTH-08)', auth: 'student*', body: acceptLegalBody }, ({ req, student, body }) => c.acceptLegal(req, student, body.documents));

// ── admins (§4.2) ──
defineRoute(router, { method: 'post', path: '/auth/admin/login', tags: adminTags, summary: 'Admin login (AUTH-10)', auth: 'public', rateLimit: rateLimits.adminLogin, body: adminLoginBody }, ({ req, body }) => c.adminLogin(req, body));
defineRoute(router, { method: 'post', path: '/auth/admin/mfa/verify', tags: adminTags, summary: 'Complete login with TOTP (AUTH-11)', auth: 'public', rateLimit: rateLimits.adminLogin, body: mfaVerifyBody }, ({ req, body }) => c.adminMfaVerify(req, body));
defineRoute(router, { method: 'post', path: '/auth/admin/mfa/setup', tags: adminTags, summary: 'Start TOTP enrolment (AUTH-12) — admin token or mfaToken bearer', auth: 'public', rateLimit: rateLimits.auth }, ({ req }) => c.mfaSetup(req));
defineRoute(router, { method: 'post', path: '/auth/admin/mfa/enable', tags: adminTags, summary: 'Confirm TOTP enrolment (AUTH-13)', auth: 'public', rateLimit: rateLimits.auth, body: mfaCodeBody }, ({ req, body }) => c.mfaEnable(req, body.code));
defineRoute(router, { method: 'post', path: '/auth/admin/mfa/disable', tags: adminTags, summary: 'Disable TOTP (AUTH-14)', auth: 'admin', body: mfaDisableBody }, ({ req, admin, body }) => c.mfaDisable(req, admin, body));
defineRoute(router, { method: 'post', path: '/auth/admin/forgot-password', tags: adminTags, summary: 'Email a reset link (AUTH-15)', auth: 'public', rateLimit: rateLimits.passwordReset, body: forgotBody, response: okDto }, ({ req, body }) => c.forgotPassword(req, body.email));
defineRoute(router, { method: 'post', path: '/auth/admin/reset-password', tags: adminTags, summary: 'Reset password (AUTH-16)', auth: 'public', rateLimit: rateLimits.passwordReset, body: resetBody, response: okDto }, ({ body }) => c.resetPassword(body.token, body.newPassword));
defineRoute(router, { method: 'get', path: '/auth/admin/invite/:token', tags: adminTags, summary: 'Invitation details (AUTH-17)', auth: 'public', rateLimit: rateLimits.auth, params: inviteTokenParam }, ({ params }) => c.inviteInfo(params.token));
defineRoute(router, { method: 'post', path: '/auth/admin/accept-invite', tags: adminTags, summary: 'Accept invitation (AUTH-18)', auth: 'public', rateLimit: rateLimits.auth, body: acceptInviteBody }, ({ req, body }) => c.acceptInvite(req, body));
