/* Admin auth (contract §4.2) + admin me/profile/inbox (§18). */
import { api } from './client';
import type {
  AdminInboxNotification,
  AdminSessionDto,
  AdminUserDto,
  AuthTokens,
  FileKey,
  ID,
  ISODate,
  Lang,
  Localized,
  MeAdminDto,
  OkDto,
  PageMeta,
} from './types';

export type AdminLoginResult =
  | { mfaRequired: true; mfaToken: string; mfaEnrollmentRequired: boolean }
  | { mfaRequired: false; tokens: AuthTokens; me: MeAdminDto };

export interface MfaSetupDto {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export interface InviteInfoDto {
  email: string;
  name: Localized;
  roleName: Localized;
  expiresAt: ISODate;
}

export const authApi = {
  login: (body: { email: string; password: string; totp?: string; remember?: boolean }) =>
    api.post<AdminLoginResult>('/auth/admin/login', body),
  verifyMfa: (body: { mfaToken: string; code: string; remember?: boolean }) =>
    api.post<{ tokens: AuthTokens; me: MeAdminDto }>('/auth/admin/mfa/verify', body),
  /** During forced enrolment pass the mfaToken as bearer. */
  mfaSetup: (mfaToken?: string) =>
    api.post<MfaSetupDto>('/auth/admin/mfa/setup', {}, mfaToken ? { headers: { Authorization: `Bearer ${mfaToken}` } } : undefined),
  mfaEnable: (code: string, mfaToken?: string) =>
    api.post<{ mfaEnabled: true; recoveryCodes: string[] }>(
      '/auth/admin/mfa/enable',
      { code },
      mfaToken ? { headers: { Authorization: `Bearer ${mfaToken}` } } : undefined,
    ),
  mfaDisable: (body: { code?: string; password?: string }) => api.post<{ mfaEnabled: false }>('/auth/admin/mfa/disable', body),
  forgotPassword: (email: string) => api.post<OkDto>('/auth/admin/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) => api.post<OkDto>('/auth/admin/reset-password', { token, newPassword }),
  invite: (token: string) => api.get<InviteInfoDto>(`/auth/admin/invite/${encodeURIComponent(token)}`),
  acceptInvite: (body: { token: string; password: string; name?: Localized }) =>
    api.post<{ tokens: AuthTokens; me: MeAdminDto; mfaEnrollmentRequired: boolean }>('/auth/admin/accept-invite', body),
  me: () => api.get<MeAdminDto>('/auth/me'),
  logout: (refreshToken?: string) => api.post<OkDto>('/auth/logout', { refreshToken }),
};

export const adminMeApi = {
  get: () => api.get<MeAdminDto>('/admin/me'),
  update: (body: { name?: Localized; email?: string; mobile?: string; avatarFileKey?: FileKey | null }) =>
    api.patch<AdminUserDto>('/admin/me', body),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<OkDto>('/admin/me/password', { currentPassword, newPassword }),
  preferences: (body: { language?: Lang; theme?: 'light' | 'dark' | 'system' }) =>
    api.patch<MeAdminDto['preferences']>('/admin/me/preferences', body),
  sessions: () => api.get<AdminSessionDto[]>('/admin/me/sessions'),
  inbox: async (params: { unread?: boolean; limit?: number } = {}) => {
    const r = await api.list<AdminInboxNotification>('/admin/me/notifications', params);
    return { items: r.items, unreadCount: Number((r.meta as PageMeta & { unreadCount?: number }).unreadCount ?? r.items.filter((n) => !n.read).length) };
  },
  markRead: (id: ID) => api.post<{ unreadCount: number }>(`/admin/me/notifications/${id}/read`),
  markAllRead: () => api.post<{ unreadCount: 0 }>('/admin/me/notifications/read-all'),
};
