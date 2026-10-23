import type { LockedPayload } from '@/api/types';

/**
 * Checkout deep link on the student subscription page. With a subject the page preselects the cheapest plan
 * that unlocks it; with a package id that plan. Without either it just opens the plans.
 */
export function plansPath(target?: { subjectSlug?: string | null; packageId?: string | null } | null): string {
  if (target?.subjectSlug) return `/student/subscription?subject=${encodeURIComponent(target.subjectSlug)}`;
  if (target?.packageId) return `/student/subscription?package=${encodeURIComponent(target.packageId)}`;
  return '/student/subscription';
}

/** Checkout link for a 402/403 `details.locked` payload. */
export const lockedPlansPath = (locked?: LockedPayload | null) =>
  plansPath({ subjectSlug: locked?.subjectSlug, packageId: locked?.packageIds?.[0] });

/**
 * Where to go after signing in: an in-app path the visitor came from — a student page, or a public page such
 * as the pricing / landing checkout (`/pricing?package=…`) — never an auth page or another origin.
 */
export function safeReturnPath(from: string | null | undefined): string | null {
  if (!from || !from.startsWith('/') || from.startsWith('//')) return null;
  if (/^\/(login|register|verify-otp)(\/|\?|#|$)/.test(from)) return null;
  return from;
}
