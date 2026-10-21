import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { demoUser, getPackage } from '@/data';
import type { Localized, Session, User } from '@/types';
import { asyncJSONStorage } from './storage';

const TOKEN_KEY = 'eduway.token';
export const MOCK_OTP = '123456';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RegisterPayload {
  name: string;
  mobile: string;
  governorate: string;
  school?: string;
  referral?: string;
}

export type BillingCycle = 'monthly' | 'yearly';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** Mobile number awaiting OTP verification (E.164-ish, e.g. "+964 770 123 4567"). */
  pendingMobile: string | null;
  /** Registration details awaiting OTP verification. */
  pendingRegistration: RegisterPayload | null;
  hydrated: boolean;

  /** Mock "send OTP" — resolves after a short delay. */
  requestOtp: (mobile: string) => Promise<void>;
  startRegistration: (payload: RegisterPayload) => Promise<void>;
  /** Mock verify — succeeds only for MOCK_OTP ("123456"). Returns true on success. */
  verifyOtp: (code: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (patch: { name?: string; governorate?: string; school?: string; avatar?: string }) => void;
  removeSession: (sessionId: string) => void;
  /** Consume one AI tutor question. Returns false if the allowance is exhausted. */
  consumeAi: () => boolean;
  /** Activate/renew a package after a mock checkout. */
  subscribe: (packageId: string, cycle: BillingCycle) => void;
  /** True when the user's package includes the subject. */
  hasSubject: (subjectId: string) => boolean;
}

const sameText = (s: string): Localized => ({ en: s, ar: s });

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      pendingMobile: null,
      pendingRegistration: null,
      hydrated: false,

      requestOtp: async (mobile) => {
        await delay(900);
        set({ pendingMobile: mobile, pendingRegistration: null });
      },
      startRegistration: async (payload) => {
        await delay(900);
        set({ pendingMobile: payload.mobile, pendingRegistration: payload });
      },
      verifyOtp: async (code) => {
        await delay(700);
        if (code !== MOCK_OTP) return false;
        const { pendingMobile, pendingRegistration } = get();
        let user: User = { ...demoUser, mobile: pendingMobile ?? demoUser.mobile };
        if (pendingRegistration) {
          const first = pendingRegistration.name.trim().split(/\s+/)[0] ?? pendingRegistration.name;
          user = {
            ...user,
            name: sameText(pendingRegistration.name.trim()),
            firstName: sameText(first),
            governorate: pendingRegistration.governorate,
            school: pendingRegistration.school ? sameText(pendingRegistration.school) : demoUser.school,
          };
        }
        await SecureStore.setItemAsync(TOKEN_KEY, `mock.${user.id}.${Date.now()}`);
        set({ user, isAuthenticated: true, pendingMobile: null, pendingRegistration: null });
        return true;
      },
      logout: async () => {
        try {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
        } catch {
          // ignore
        }
        set({ user: null, isAuthenticated: false });
      },
      updateProfile: (patch) =>
        set((s) => {
          if (!s.user) return s;
          const u = { ...s.user };
          if (patch.name) {
            u.name = sameText(patch.name);
            u.firstName = sameText(patch.name.trim().split(/\s+/)[0] ?? patch.name);
          }
          if (patch.governorate) u.governorate = patch.governorate;
          if (patch.school !== undefined) u.school = sameText(patch.school);
          if (patch.avatar) u.avatar = patch.avatar;
          return { user: u };
        }),
      removeSession: (sessionId) =>
        set((s) =>
          s.user ? { user: { ...s.user, sessions: s.user.sessions.filter((x: Session) => x.id !== sessionId) } } : s,
        ),
      consumeAi: () => {
        const u = get().user;
        if (!u || u.aiUsed >= u.aiQuota) return false;
        set({ user: { ...u, aiUsed: u.aiUsed + 1 } });
        return true;
      },
      subscribe: (packageId, cycle) =>
        set((s) => {
          if (!s.user) return s;
          const pkg = getPackage(packageId);
          const days = cycle === 'yearly' ? 365 : 30;
          const start = new Date();
          const end = new Date(start.getTime() + days * 86400000);
          return {
            user: {
              ...s.user,
              packageId,
              subscriptionStart: start.toISOString(),
              subscriptionEnd: end.toISOString(),
              daysRemaining: days,
              aiQuota: pkg?.aiQuota ?? s.user.aiQuota,
              aiUsed: 0,
            },
          };
        }),
      hasSubject: (subjectId) => {
        const u = get().user;
        const pkg = getPackage(u?.packageId);
        return !!pkg && pkg.subjects.includes(subjectId as never);
      },
    }),
    {
      name: 'eduway.auth',
      storage: asyncJSONStorage,
      partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
      onRehydrateStorage: () => () => useAuthStore.setState({ hydrated: true }),
    },
  ),
);
