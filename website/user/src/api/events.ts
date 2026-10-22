import type { Localized } from './types';

/**
 * Tiny typed event bus that lets the (React-agnostic) API client talk to the UI:
 * session end → logout + redirect, maintenance → maintenance screen, legal → re-acceptance prompt.
 */
export interface ApiEventMap {
  sessionEnded: { reason: 'refresh_failed' | 'unauthorized' | 'locked' | 'logout' };
  maintenance: { message: Localized | null };
  legalRequired: Record<string, never>;
}

type Handler<K extends keyof ApiEventMap> = (payload: ApiEventMap[K]) => void;

const handlers = new Map<keyof ApiEventMap, Set<(payload: unknown) => void>>();

export const apiEvents = {
  on<K extends keyof ApiEventMap>(event: K, fn: Handler<K>): () => void {
    let set = handlers.get(event);
    if (!set) handlers.set(event, (set = new Set()));
    const h = fn as (payload: unknown) => void;
    set.add(h);
    return () => {
      set.delete(h);
    };
  },
  emit<K extends keyof ApiEventMap>(event: K, payload: ApiEventMap[K]) {
    handlers.get(event)?.forEach((fn) => fn(payload));
  },
};
