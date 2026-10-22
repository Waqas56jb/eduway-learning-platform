import { get, getDeviceId, post, tokenStore } from './client';
import type { MeStudentDto, OtpPurpose, SendOtpDto, VerifyOtpBody, VerifyOtpDto } from './types';

/** Student auth (AUTH-01…07). Hooks live in `context/AuthContext` (session state is app-wide). */
export const authApi = {
  sendOtp: (phone: string, purpose: OtpPurpose, channel?: 'sms' | 'whatsapp') =>
    post<SendOtpDto>('/auth/send-otp', { phone, purpose, channel }, { skipAuth: true }),

  verifyOtp: (body: Omit<VerifyOtpBody, 'deviceId' | 'platform'>) =>
    post<VerifyOtpDto>(
      '/auth/verify-otp',
      { ...body, deviceId: getDeviceId(), platform: 'web', deviceName: navigator.userAgent.slice(0, 120) },
      { skipAuth: true },
    ),

  me: () => get<MeStudentDto>('/auth/me'),

  logout: () => post<{ ok: true }>('/auth/logout', { refreshToken: tokenStore.getRefresh() ?? undefined }),

  logoutAll: (keepCurrent = true) => post<{ revoked: number }>('/auth/logout-all', { keepCurrent }),
};
