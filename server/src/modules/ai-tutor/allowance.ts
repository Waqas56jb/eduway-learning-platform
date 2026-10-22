/**
 * AI allowance accounting (pure — unit tested). The persisted state is one `ai_usage` row per user per period
 * (`period_start` unique), so a "reset" is simply the start of a new period: the reset job pre-creates the empty
 * row for the new period and nothing is ever decremented in place.
 *
 * Period rules (API_CONTRACT §1.5 `AiAllowance.cycle`):
 *   calendar → calendar month in the business timezone (Asia/Baghdad), resets on the 1st at 00:00 local time;
 *   billing  → monthly steps anchored on the subscription start (`starts_at`), e.g. started 15 Mar → 15 Apr → …
 * The period maths is shared with /me (common/services/student-summary.ts `allowancePeriod`).
 */
import { allowancePeriod, type AiAllowance } from '../../common/services/student-summary.js';

export type AllowanceCycle = 'calendar' | 'billing';
export type AllowanceDenial = 'AI_GLOBALLY_DISABLED' | 'AI_DISABLED' | 'AI_NOT_INCLUDED' | 'AI_ALLOWANCE_EXHAUSTED';

export interface AllowanceInput {
  globalEnabled: boolean;
  userDisabled: boolean;
  /** Questions per period from the active subscription (0 = package without AI / no subscription). */
  quota: number;
  /** Extra questions granted for this period. */
  bonus?: number;
  used: number;
  cycle: AllowanceCycle;
  /** Subscription start (billing anchor). */
  anchor: Date | null;
  now?: Date;
}

export function periodFor(cycle: AllowanceCycle, anchor: Date | null, now: Date = new Date()): { start: Date; end: Date } {
  return allowancePeriod(cycle, anchor, now);
}

/** Contract `AiAllowance` from raw numbers. */
export function computeAllowance(i: AllowanceInput): AiAllowance {
  const total = Math.max(0, i.quota) + Math.max(0, i.bonus ?? 0);
  const used = Math.max(0, i.used);
  const period = periodFor(i.cycle, i.anchor, i.now);
  const disabledReason: AiAllowance['disabledReason'] = !i.globalEnabled ? 'GLOBAL' : i.userDisabled ? 'USER' : total <= 0 ? 'NOT_INCLUDED' : null;
  return {
    enabled: disabledReason === null,
    disabledReason,
    used,
    quota: total,
    remaining: Math.max(0, total - used),
    cycle: i.cycle,
    resetsAt: period.end.toISOString(),
  };
}

/** Ordered checks of AIT-08: kill switch → per-user disable → package includes AI → remaining allowance. */
export function denialFor(a: AiAllowance): AllowanceDenial | null {
  if (a.disabledReason === 'GLOBAL') return 'AI_GLOBALLY_DISABLED';
  if (a.disabledReason === 'USER') return 'AI_DISABLED';
  if (a.disabledReason === 'NOT_INCLUDED') return 'AI_NOT_INCLUDED';
  if (a.remaining <= 0) return 'AI_ALLOWANCE_EXHAUSTED';
  return null;
}

/** Allowance after one successful answer (only successful completions are counted). */
export function consume(a: AiAllowance, n = 1): AiAllowance {
  const used = a.used + n;
  return { ...a, used, remaining: Math.max(0, a.quota - used) };
}

/** True when `now` is in a different period than `lastUsedAt` (the counter starts again from 0). */
export function isNewPeriod(cycle: AllowanceCycle, anchor: Date | null, lastUsedAt: Date, now: Date = new Date()): boolean {
  return periodFor(cycle, anchor, lastUsedAt).start.getTime() !== periodFor(cycle, anchor, now).start.getTime();
}

/** USD cost of a completion from per-1k token prices (rounded to 6 decimals like the DB column). */
export function costUsd(tokensIn: number, tokensOut: number, per1kIn: number, per1kOut: number): number {
  return Math.round(((tokensIn / 1000) * per1kIn + (tokensOut / 1000) * per1kOut) * 1e6) / 1e6;
}

/** Rough token estimate for providers that do not report usage (≈ 4 chars / token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
