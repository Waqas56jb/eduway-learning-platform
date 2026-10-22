import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/api/auth';
import { currentLang, isApiError, tokenStore } from '@/api/client';
import { apiEvents } from '@/api/events';
import { keys } from '@/api/keys';
import type { LegalDoc, MeStudentDto, OtpPurpose, RegisterDto, SendOtpDto, StudentUser, VerifyOtpDto } from '@/api/types';

const PENDING_KEY = 'eduway.auth.pending';

export interface RegisterPayload {
  name: string;
  mobile: string;
  governorate: string;
  schoolId?: string | null;
  schoolName?: string;
  referral?: string;
  acceptedLegal: { doc: LegalDoc; version: string }[];
}

/** OTP challenge in flight (kept in sessionStorage so a reload of /verify-otp keeps working). */
export interface PendingAuth {
  phone: string; // E.164 as normalized by the server
  maskedPhone: string;
  mode: OtpPurpose;
  registration?: RegisterDto;
  codeLength: number;
  resendInSeconds: number;
  expiresInSeconds: number;
  sentAt: number;
  /** Channel the code was actually delivered on (WhatsApp when the linked number is connected, else SMS). */
  channel?: 'sms' | 'whatsapp';
}

export type AuthStatus = 'loading' | 'authenticated' | 'guest' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  user: StudentUser | null;
  me: MeStudentDto | null;
  isAuthenticated: boolean;
  pending: PendingAuth | null;
  /** AUTH-01 purpose=login. */
  requestOtp: (mobile: string) => Promise<SendOtpDto>;
  /** AUTH-01 purpose=register (registration is sent with AUTH-02). */
  register: (payload: RegisterPayload) => Promise<SendOtpDto>;
  /** AUTH-01 again with the pending purpose. */
  resendOtp: () => Promise<SendOtpDto>;
  /** AUTH-02. Throws ApiError. Does not sign in yet — call `completeSignIn` (lets the UI celebrate first). */
  verifyOtp: (code: string, revokeSessionId?: string) => Promise<VerifyOtpDto>;
  completeSignIn: (res: VerifyOtpDto) => void;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function readPending(): PendingAuth | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingAuth) : null;
  } catch {
    return null;
  }
}
function writePending(p: PendingAuth | null) {
  try {
    if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

const toPending = (res: SendOtpDto, registration?: RegisterDto): PendingAuth => ({
  phone: res.phone,
  maskedPhone: res.maskedPhone,
  mode: res.purpose,
  registration,
  codeLength: res.codeLength,
  resendInSeconds: res.resendInSeconds,
  expiresInSeconds: res.expiresInSeconds,
  sentAt: Date.now(),
  channel: res.channel,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [hasSession, setHasSession] = useState(() => tokenStore.hasSession());
  const [pending, setPendingState] = useState<PendingAuth | null>(readPending);

  const setPending = useCallback((p: PendingAuth | null) => {
    setPendingState(p);
    writePending(p);
  }, []);

  const meQuery = useQuery({
    queryKey: keys.me,
    queryFn: authApi.me,
    enabled: hasSession,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => !(isApiError(err) && err.status >= 400 && err.status < 500) && count < 2,
    meta: { silent: true },
  });

  const endSession = useCallback(() => {
    tokenStore.clear();
    setHasSession(false);
    qc.removeQueries({ predicate: (q) => !['public', 'legal'].includes(String(q.queryKey[0])) });
  }, [qc]);

  // The client announces when the refresh token is rejected / the account is locked.
  useEffect(() => apiEvents.on('sessionEnded', () => endSession()), [endSession]);

  // /auth/me answered 401 → the stored session is unusable.
  useEffect(() => {
    if (meQuery.error && isApiError(meQuery.error) && meQuery.error.status === 401) endSession();
  }, [meQuery.error, endSession]);

  const sendOtp = useCallback(
    async (mobile: string, purpose: OtpPurpose, registration?: RegisterDto) => {
      const res = await authApi.sendOtp(mobile, purpose);
      setPending(toPending(res, registration));
      return res;
    },
    [setPending],
  );

  const requestOtp = useCallback((mobile: string) => sendOtp(mobile, 'login'), [sendOtp]);

  const register = useCallback(
    (p: RegisterPayload) => {
      const registration: RegisterDto = {
        name: p.name,
        governorateId: p.governorate,
        schoolId: p.schoolId ?? null,
        schoolName: p.schoolId ? null : p.schoolName || null,
        referralCode: p.referral || null,
        acceptTerms: true,
        acceptedLegal: p.acceptedLegal,
        language: currentLang(),
      };
      return sendOtp(p.mobile, 'register', registration);
    },
    [sendOtp],
  );

  const resendOtp = useCallback(async () => {
    if (!pending) throw new Error('no pending challenge');
    const res = await authApi.sendOtp(pending.phone, pending.mode);
    setPending({ ...toPending(res, pending.registration) });
    return res;
  }, [pending, setPending]);

  const verifyOtp = useCallback(
    async (code: string, revokeSessionId?: string) => {
      if (!pending) throw new Error('no pending challenge');
      return authApi.verifyOtp({
        phone: pending.phone,
        code,
        purpose: pending.mode,
        registration: pending.mode === 'register' ? pending.registration : undefined,
        revokeSessionId,
      });
    },
    [pending],
  );

  const completeSignIn = useCallback(
    (res: VerifyOtpDto) => {
      const tokens = res.tokens ?? { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn };
      tokenStore.set(tokens);
      // Drop anonymous caches (catalog/packages gain per-user fields once signed in).
      qc.removeQueries({ predicate: (q) => !['public', 'legal'].includes(String(q.queryKey[0])) });
      qc.setQueryData(keys.me, res.me);
      setHasSession(true);
      setPending(null);
    },
    [qc, setPending],
  );

  const refreshMe = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: keys.me });
  }, [qc]);

  const logout = useCallback(async () => {
    try {
      if (tokenStore.hasSession()) await authApi.logout();
    } catch {
      /* best effort — the local session is dropped regardless */
    }
    endSession();
  }, [endSession]);

  const me = hasSession ? (meQuery.data ?? null) : null;
  let status: AuthStatus;
  if (!hasSession) status = 'guest';
  else if (me) status = 'authenticated';
  else if (meQuery.isError) status = isApiError(meQuery.error) && meQuery.error.status === 401 ? 'guest' : 'error';
  else status = 'loading';

  const { refetch } = meQuery;
  const retry = useCallback(() => void refetch(), [refetch]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: me?.user ?? null,
      me,
      isAuthenticated: status === 'authenticated',
      pending,
      requestOtp,
      register,
      resendOtp,
      verifyOtp,
      completeSignIn,
      refreshMe,
      logout,
      retry,
    }),
    [status, me, pending, requestOtp, register, resendOtp, verifyOtp, completeSignIn, refreshMe, logout, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
