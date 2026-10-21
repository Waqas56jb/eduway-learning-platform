import { create } from 'zustand';
import { diff, logAudit } from './audit';

export interface AuditMeta {
  /** Audit action name, defaults to `<entity>.create|update|delete`. */
  action?: string;
  /** Human summary for the audit log. */
  summary?: string;
  /** Skip writing an audit entry (e.g. purely cosmetic changes). */
  silent?: boolean;
}

type Patch<T> = Partial<T> | ((prev: T) => Partial<T>);

export interface CollectionState<T extends { id: string }> {
  items: T[];
  get: (id: string | null | undefined) => T | undefined;
  add: (item: T, meta?: AuditMeta) => T;
  update: (id: string, patch: Patch<T>, meta?: AuditMeta) => void;
  updateMany: (ids: string[], patch: Patch<T>, meta?: AuditMeta) => void;
  remove: (id: string, meta?: AuditMeta) => void;
  removeMany: (ids: string[], meta?: AuditMeta) => void;
  /** Replace the full list (used for drag-and-drop reorders). */
  setItems: (items: T[], meta?: AuditMeta) => void;
}

/**
 * Zustand store for one entity collection. Every mutation writes to the audit log so
 * admins can see their mock actions reflected in Security → Audit Logs.
 */
export function createCollection<T extends { id: string }>(
  entity: string,
  initial: T[],
  label: (item: T) => string,
) {
  return create<CollectionState<T>>()((set, get) => ({
    items: initial,
    get: (id) => (id ? get().items.find((i) => i.id === id) : undefined),

    add: (item, meta) => {
      set((s) => ({ items: [item, ...s.items] }));
      if (!meta?.silent) {
        logAudit({
          action: meta?.action ?? `${entity}.create`,
          entity,
          entityId: item.id,
          summary: meta?.summary ?? `Created ${entity.replace(/_/g, ' ')} “${label(item)}”`,
          after: item as unknown as Record<string, unknown>,
        });
      }
      return item;
    },

    update: (id, patch, meta) => {
      const prev = get().items.find((i) => i.id === id);
      if (!prev) return;
      const p = typeof patch === 'function' ? patch(prev) : patch;
      set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
      if (!meta?.silent) {
        const d = diff(prev, p);
        logAudit({
          action: meta?.action ?? `${entity}.update`,
          entity,
          entityId: id,
          summary: meta?.summary ?? `Updated ${entity.replace(/_/g, ' ')} “${label(prev)}”`,
          before: d.before,
          after: d.after,
        });
      }
    },

    updateMany: (ids, patch, meta) => {
      const set_ = new Set(ids);
      set((s) => ({
        items: s.items.map((i) => (set_.has(i.id) ? { ...i, ...(typeof patch === 'function' ? patch(i) : patch) } : i)),
      }));
      if (!meta?.silent) {
        logAudit({
          action: meta?.action ?? `${entity}.bulk_update`,
          entity,
          entityId: ids.length === 1 ? ids[0] : `${ids.length} records`,
          summary: meta?.summary ?? `Bulk updated ${ids.length} ${entity.replace(/_/g, ' ')} records`,
          after: typeof patch === 'function' ? null : (patch as Record<string, unknown>),
        });
      }
    },

    remove: (id, meta) => {
      const prev = get().items.find((i) => i.id === id);
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
      if (prev && !meta?.silent) {
        logAudit({
          action: meta?.action ?? `${entity}.delete`,
          entity,
          entityId: id,
          summary: meta?.summary ?? `Deleted ${entity.replace(/_/g, ' ')} “${label(prev)}”`,
          before: prev as unknown as Record<string, unknown>,
        });
      }
    },

    removeMany: (ids, meta) => {
      const set_ = new Set(ids);
      set((s) => ({ items: s.items.filter((i) => !set_.has(i.id)) }));
      if (!meta?.silent) {
        logAudit({
          action: meta?.action ?? `${entity}.bulk_delete`,
          entity,
          entityId: `${ids.length} records`,
          summary: meta?.summary ?? `Deleted ${ids.length} ${entity.replace(/_/g, ' ')} records`,
        });
      }
    },

    setItems: (items, meta) => {
      set({ items });
      if (meta && !meta.silent) {
        logAudit({ action: meta.action ?? `${entity}.reorder`, entity, entityId: '—', summary: meta.summary ?? `Reordered ${entity}` });
      }
    },
  }));
}
