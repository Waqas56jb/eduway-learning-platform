import { create } from 'zustand';
import { auditLogs } from '@/data/security';
import type { AuditLog } from '@/types';
import { uid } from '@/utils/id';

type Actor = { actor: string; actorRole: string };

/* The auth store registers the resolver at init. Keeping the dependency one-directional
   avoids an import cycle (auth → roles → collection → audit). */
let resolveActor: () => Actor = () => ({ actor: 'System', actorRole: 'System' });
export const setAuditActorResolver = (fn: () => Actor) => {
  resolveActor = fn;
};

const DEVICE = (() => {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Linux';
  return `${browser} · ${os}`;
})();

export type AuditInput = Pick<AuditLog, 'action' | 'entity' | 'entityId' | 'summary'> &
  Partial<Pick<AuditLog, 'before' | 'after'>>;

interface AuditState {
  items: AuditLog[];
  log: (entry: AuditInput) => void;
}

export const useAudit = create<AuditState>()((set) => ({
  items: auditLogs,
  log: (entry) =>
    set((s) => ({
      items: [
        {
          id: uid('aud'),
          at: new Date().toISOString(),
          ip: '185.81.140.22',
          device: DEVICE,
          before: null,
          after: null,
          ...resolveActor(),
          ...entry,
        },
        ...s.items,
      ],
    })),
}));

/** Write an audit entry from anywhere (stores, event handlers). */
export const logAudit = (entry: AuditInput) => useAudit.getState().log(entry);

/** Shallow diff of changed keys, for before/after audit payloads. */
export function diff<T extends object>(before: T, patch: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(patch[k])) {
      b[k as string] = before[k];
      a[k as string] = patch[k];
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
