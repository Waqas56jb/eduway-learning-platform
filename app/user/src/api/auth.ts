import { CLIENT_PLATFORM, DEVICE_NAME } from './config';
import { get, post } from './client';
import { getDeviceId, getRefreshToken } from './session';
import type { LegalDoc, MeStudentDto, OkDto, OtpPurpose, RegisterDto, SendOtpDto, VerifyOtpDto } from './types';

// AUTH-01 — no channel: the server sends by WhatsApp when its linked number is connected, else by SMS
// (the response `channel` says which one was used).
export const sendOtp = (phone: string, purpose: OtpPurpose) =>
  post<SendOtpDto>('/auth/send-otp', { phone, purpose }, { skipAuth: true });

// AUTH-02
export const verifyOtp = (body: {
  phone: string;
  code: string;
  purpose: OtpPurpose;
  registration?: RegisterDto;
  revokeSessionId?: string;
}) =>
  post<VerifyOtpDto>(
    '/auth/verify-otp',
    { ...body, deviceId: getDeviceId(), platform: CLIENT_PLATFORM, deviceName: DEVICE_NAME },
    { skipAuth: true },
  );

// AUTH-03 (profile completion fallback)
export const completeRegistration = (body: RegisterDto) => post<MeStudentDto>('/auth/register', body);

// AUTH-05
export const logoutRequest = () => post<OkDto>('/auth/logout', { refreshToken: getRefreshToken() ?? undefined });

// AUTH-06
export const logoutAll = (keepCurrent = true) => post<{ revoked: number }>('/auth/logout-all', { keepCurrent });

// AUTH-07
export const fetchMe = () => get<MeStudentDto>('/auth/me');

// AUTH-08
export const acceptLegal = (documents: { doc: LegalDoc; version: string }[]) =>
  post<{ pendingLegal: { doc: LegalDoc; version: string }[] }>('/auth/accept-legal', { documents });
