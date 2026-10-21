import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import { demoUser } from '@/data';
import { readStore, writeStore } from '@/lib/storage';
import type { Localized, User } from '@/types';

const USER_KEY = 'eduway.user';
const PENDING_KEY = 'eduway.pending';
export const DEMO_OTP = '123456';

export interface RegisterPayload {
  name: string;
  mobile: string;
  governorate: string;
  school?: string;
  referral?: string;
}

export interface PendingAuth {
  mobile: string;
  mode: 'login' | 'register';
  profile?: RegisterPayload;
}

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  pending: PendingAuth | null;
  /** Mock: "sends" an OTP to the number. */
  requestOtp: (mobile: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  /** Mock: only DEMO_OTP succeeds. */
  verifyOtp: (code: string) => Promise<boolean>;
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const same = (s: string): Localized => ({ en: s, ar: s });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStore<User | null>(USER_KEY, null));
  const [pending, setPending] = useState<PendingAuth | null>(() =>
    readStore<PendingAuth | null>(PENDING_KEY, null),
  );

  const savePending = (p: PendingAuth | null) => {
    setPending(p);
    writeStore(PENDING_KEY, p);
  };

  const requestOtp = useCallback(async (mobile: string) => {
    await wait(700);
    savePending({ mobile, mode: 'login' });
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    await wait(800);
    savePending({ mobile: payload.mobile, mode: 'register', profile: payload });
  }, []);

  const verifyOtp = useCallback(
    async (code: string) => {
      await wait(900);
      if (code !== DEMO_OTP) return false;
      let next: User = { ...demoUser, mobile: pending?.mobile || demoUser.mobile };
      const p = pending?.profile;
      if (p) {
        const first = p.name.trim().split(/\s+/)[0] ?? p.name;
        next = {
          ...next,
          name: same(p.name.trim()),
          firstName: same(first),
          governorate: p.governorate,
          school: p.school ? same(p.school) : next.school,
        };
      }
      setUser(next);
      writeStore(USER_KEY, next);
      savePending(null);
      return true;
    },
    [pending],
  );

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      writeStore(USER_KEY, next);
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    writeStore(USER_KEY, null);
  }, []);

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, pending, requestOtp, register, verifyOtp, updateUser, logout }),
    [user, pending, requestOtp, register, verifyOtp, updateUser, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
