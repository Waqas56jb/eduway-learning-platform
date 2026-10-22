import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/i18n';
import { toast } from '@/components/ui/Toast';
import { toUser } from '@/api/adapters';
import { fetchMe, logoutRequest, sendOtp, verifyOtp as verifyOtpRequest } from '@/api/auth';
import { onSessionExpired } from '@/api/client';
import { normalizeError, toastError, type ApiError } from '@/api/errors';
import { unregisterPushToken } from '@/api/push';
import { queryClient } from '@/api/queryClient';
import { clearTokens, hasSession, loadSession, setTokens } from '@/api/session';
import type { LegalDoc, MeStudentDto, SendOtpDto, SessionDto, StudentUser } from '@/api/types';
import type { User } from '@/types';
import { useLangStore } from './langStore';
import { asyncJSONStorage } from './storage';

export interface RegisterPayload {
  name: string;
  mobile: string;
  governorate: string;
  /** Directory school id (preferred) … */
  schoolId?: string | null;
  /** … or a free-text school name. */
  school?: string;
  referral?: string;
  /** Current legal versions shown in the form (from GET /legal/:doc). */
  acceptedLegal?: { doc: LegalDoc; version: string }[];
}

export type BillingCycle = 'monthly' | 'yearly';

export type VerifyResult = 'ok' | 'invalid' | 'error';

interface AuthState {
  /** App-shaped user (from `StudentUser`). */
  user: User | null;
  /** Full `/auth/me` payload: entitlements, subscription, AI allowance, prefs, unread count. */
  me: MeStudentDto | null;
  isAuthenticated: boolean;
  /** Mobile number awaiting OTP verification. */
  pendingMobile: string | null;
  /** Registration details awaiting OTP verification. */
  pendingRegistration: RegisterPayload | null;
  /** Last send-otp response (code length, resend timer, masked phone). */
  otp: SendOtpDto | null;
  /** Last verify/send error (screens may branch on `reason`). */
  lastError: ApiError | null;
  /** Sessions returned with DEVICE_LIMIT_REACHED so the UI can offer to revoke one. */
  deviceLimitSessions: SessionDto[] | null;
  hydrated: boolean;

  /** Restore tokens from secure storage and refresh `/auth/me` in the background. */
  bootstrap: () => Promise<void>;
  /** POST /auth/send-otp (login). Returns true when the code was sent (errors are toasted). */
  requestOtp: (mobile: string) => Promise<boolean>;
  /** POST /auth/send-otp (register) — keeps the form data for verify-otp. */
  startRegistration: (payload: RegisterPayload) => Promise<boolean>;
  /** Re-send the code for the pending flow. */
  resendOtp: () => Promise<boolean>;
  /** POST /auth/verify-otp (+ `registration`). True on success. */
  verifyOtp: (code: string, revokeSessionId?: string) => Promise<boolean>;
  /** GET /auth/me → store. */
  refreshMe: () => Promise<MeStudentDto | null>;
  applyMe: (me: MeStudentDto) => void;
  applyUser: (user: StudentUser) => void;
  logout: () => Promise<void>;
  /** True when the caller holds an active entitlement for the subject (slug or uuid). */
  hasSubject: (subjectId: string) => boolean;
}

function buildRegistration(p: RegisterPayload) {
  return {
    name: p.name.trim(),
    governorateId: p.governorate,
    schoolId: p.schoolId ?? null,
    schoolName: p.schoolId ? null : p.school?.trim() || null,
    referralCode: p.referral ? p.referral.trim().toUpperCase() : null,
    acceptTerms: true as const,
    acceptedLegal: p.acceptedLegal ?? [],
    language: useLangStore.getState().lang,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      me: null,
      isAuthenticated: false,
      pendingMobile: null,
      pendingRegistration: null,
      otp: null,
      lastError: null,
      deviceLimitSessions: null,
      hydrated: false,

      bootstrap: async () => {
        await loadSession();
        if (!hasSession()) {
          set({ isAuthenticated: false, user: null, me: null });
          return;
        }
        set({ isAuthenticated: true });
        void get().refreshMe();
      },

      requestOtp: async (mobile) => {
        try {
          const otp = await sendOtp(mobile, 'login');
          set({ pendingMobile: otp.phone || mobile, pendingRegistration: null, otp, lastError: null });
          return true;
        } catch (err) {
          set({ lastError: toastError(err) });
          return false;
        }
      },

      startRegistration: async (payload) => {
        try {
          const otp = await sendOtp(payload.mobile, 'register');
          set({ pendingMobile: otp.phone || payload.mobile, pendingRegistration: payload, otp, lastError: null });
          return true;
        } catch (err) {
          set({ lastError: toastError(err) });
          return false;
        }
      },

      resendOtp: async () => {
        const { pendingRegistration, pendingMobile } = get();
        if (!pendingMobile) return false;
        return pendingRegistration ? get().startRegistration(pendingRegistration) : get().requestOtp(pendingMobile);
      },

      verifyOtp: async (code, revokeSessionId) => {
        const { pendingMobile, pendingRegistration } = get();
        if (!pendingMobile) return false;
        try {
          const res = await verifyOtpRequest({
            phone: pendingMobile,
            code,
            purpose: pendingRegistration ? 'register' : 'login',
            registration: pendingRegistration ? buildRegistration(pendingRegistration) : undefined,
            revokeSessionId,
          });
          await setTokens(res.tokens ?? res);
          queryClient.clear();
          const me = res.me;
          set({
            user: toUser(me?.user ?? res.user),
            me: me ?? null,
            isAuthenticated: true,
            pendingMobile: null,
            pendingRegistration: null,
            otp: null,
            lastError: null,
            deviceLimitSessions: null,
          });
          if (!me) void get().refreshMe();
          return true;
        } catch (err) {
          const e = normalizeError(err);
          const sessions = e.reason === 'DEVICE_LIMIT_REACHED' ? (e.details.sessions as SessionDto[] | undefined) : undefined;
          set({ lastError: e, deviceLimitSessions: sessions ?? null });
          // Wrong/expired code → the OTP input shakes; everything else is explained by a toast.
          if (e.reason !== 'OTP_INVALID') toastError(e);
          return false;
        }
      },

      refreshMe: async () => {
        try {
          const me = await fetchMe();
          get().applyMe(me);
          return me;
        } catch {
          // 401 after a failed refresh is handled by onSessionExpired; offline keeps the cached profile.
          return null;
        }
      },

      applyMe: (me) => set({ me, user: toUser(me.user), isAuthenticated: true }),
      applyUser: (user) => set((s) => ({ user: toUser(user), me: s.me ? { ...s.me, user } : s.me })),

      logout: async () => {
        if (hasSession()) {
          await unregisterPushToken();
          try {
            await logoutRequest();
          } catch {
            // revoke best-effort; local sign-out always succeeds
          }
        }
        await clearTokens();
        queryClient.clear();
        set({ user: null, me: null, isAuthenticated: false, pendingMobile: null, pendingRegistration: null, otp: null });
      },

      hasSubject: (subjectId) => {
        const ents = get().me?.entitlements;
        if (!ents) return false;
        const now = Date.now();
        return ents.some(
          (e) =>
            (e.subjectSlug === subjectId || e.subjectId === subjectId) &&
            new Date(e.startsAt).getTime() <= now &&
            now < new Date(e.expiresAt).getTime(),
        );
      },
    }),
    {
      name: 'eduway.auth.v2',
      storage: asyncJSONStorage,
      partialize: (s) => ({ user: s.user, me: s.me, isAuthenticated: s.isAuthenticated }),
      onRehydrateStorage: () => () => {
        void useAuthStore
          .getState()
          .bootstrap()
          .finally(() => useAuthStore.setState({ hydrated: true }));
      },
    },
  ),
);

// Refresh token rejected → sign out locally and explain why.
onSessionExpired(() => {
  if (!useAuthStore.getState().isAuthenticated) return;
  queryClient.clear();
  useAuthStore.setState({ user: null, me: null, isAuthenticated: false });
  toast.info(i18n.t('common:errors.sessionExpired'));
});
