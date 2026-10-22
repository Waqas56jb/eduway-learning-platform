import { router } from 'expo-router';
import { ApiError, isLockedError, normalizeError, toastError } from './errors';
import type { LockedPayload } from './types';

/** Deep link to the subscription screen for a locked resource (402/403 `details.locked`). */
export function openSubscription(locked?: LockedPayload | null) {
  const params: Record<string, string> = {};
  if (locked?.reason) params.reason = locked.reason;
  if (locked?.subjectSlug) params.subject = locked.subjectSlug;
  router.push({ pathname: '/subscription', params });
}

/**
 * Standard handling for an action error: locked → subscription screen (with a toast explaining why);
 * anything else → localized toast. Returns the normalized error.
 */
export function handleActionError(err: unknown): ApiError {
  const e = normalizeError(err);
  toastError(e);
  if (isLockedError(e)) openSubscription(e.locked);
  return e;
}
