import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AdminUser, ModuleKey, PermAction, Role } from '@/types';
import { logAudit, setAuditActorResolver } from './audit';
import { useAdminUsers, useRoles } from './core';

export const DEMO_EMAIL = 'admin@eduway.iq';
export const DEMO_PASSWORD = 'Admin@123';
export const DEMO_2FA = '123456';

type Stage = 'anon' | '2fa' | 'auth';

interface AuthState {
  stage: Stage;
  adminId: string | null;
  remember: boolean;
  /** Dev helper: preview the portal as another role without changing the account. */
  previewRoleId: string | null;
  login: (email: string, password: string, remember: boolean) => boolean;
  verify2fa: (code: string) => boolean;
  logout: () => void;
  setPreviewRole: (roleId: string | null) => void;
}

/* "Remember me" decides between localStorage and sessionStorage. */
const KEY = 'eduway.admin.auth';
const storage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k) ?? sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      const remember = JSON.parse(v)?.state?.remember;
      (remember ? localStorage : sessionStorage).setItem(k, v);
      (remember ? sessionStorage : localStorage).removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      stage: 'anon',
      adminId: null,
      remember: true,
      previewRoleId: null,

      login: (email, password, remember) => {
        const admin = useAdminUsers
          .getState()
          .items.find((a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.status === 'active');
        // Mock: the demo account uses the documented password; other active admins accept it too.
        if (!admin || password !== DEMO_PASSWORD) return false;
        set({ stage: '2fa', adminId: admin.id, remember });
        return true;
      },

      verify2fa: (code) => {
        if (code !== DEMO_2FA || get().stage !== '2fa') return false;
        set({ stage: 'auth' });
        const id = get().adminId;
        if (id) useAdminUsers.getState().update(id, { lastLogin: new Date().toISOString() }, { silent: true });
        logAudit({ action: 'auth.login', entity: 'session', entityId: id ?? '—', summary: 'Signed in with 2FA' });
        return true;
      },

      logout: () => {
        if (get().stage === 'auth') {
          logAudit({ action: 'auth.logout', entity: 'session', entityId: get().adminId ?? '—', summary: 'Signed out' });
        }
        set({ stage: 'anon', adminId: null, previewRoleId: null });
      },

      setPreviewRole: (roleId) => set({ previewRoleId: roleId }),
    }),
    {
      name: KEY,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ stage: s.stage === 'auth' ? 'auth' : 'anon', adminId: s.stage === 'auth' ? s.adminId : null, remember: s.remember, previewRoleId: s.previewRoleId }) as AuthState,
    },
  ),
);

/** Current admin record (reactive). */
export function useCurrentAdmin(): AdminUser | undefined {
  const id = useAuth((s) => s.adminId);
  return useAdminUsers((s) => s.items.find((a) => a.id === id));
}

/** Effective role — the preview role if set, otherwise the admin's own role (reactive). */
export function useCurrentRole(): Role | undefined {
  const admin = useCurrentAdmin();
  const preview = useAuth((s) => s.previewRoleId);
  return useRoles((s) => s.items.find((r) => r.id === (preview ?? admin?.roleId)));
}

/** Permission check hook: `const can = useCan(); can('content', 'approve')`. */
export function useCan() {
  const role = useCurrentRole();
  return (module: ModuleKey, action: PermAction = 'view') => !!role?.permissions[module]?.[action];
}

/** Non-reactive permission check for use inside handlers. */
export function canNow(module: ModuleKey, action: PermAction = 'view') {
  const { adminId, previewRoleId } = useAuth.getState();
  const admin = useAdminUsers.getState().items.find((a) => a.id === adminId);
  const role = useRoles.getState().items.find((r) => r.id === (previewRoleId ?? admin?.roleId));
  return !!role?.permissions[module]?.[action];
}

setAuditActorResolver(() => {
  const { adminId, previewRoleId } = useAuth.getState();
  const admin = useAdminUsers.getState().items.find((a) => a.id === adminId);
  const role = useRoles.getState().items.find((r) => r.id === (previewRoleId ?? admin?.roleId));
  return { actor: admin?.name ?? 'System', actorRole: role?.name_en ?? 'System' };
});
