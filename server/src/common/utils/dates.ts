import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export { dayjs, type Dayjs };

/** Business timezone (Iraq, UTC+3, no DST). Day boundaries for streaks/rollups use this zone. */
export const BUSINESS_TZ = 'Asia/Baghdad';

export const now = (): Date => new Date();

export function toIso(d: Date | string | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function addSeconds(d: Date, s: number): Date {
  return new Date(d.getTime() + s * 1000);
}
export function addMinutes(d: Date, m: number): Date {
  return addSeconds(d, m * 60);
}
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
export function addMonths(d: Date, months: number): Date {
  return dayjs(d).add(months, 'month').toDate();
}

/** Whole days remaining until `end` (ceil, never negative). */
export function daysRemaining(end: Date | string | null | undefined, from: Date = new Date()): number {
  if (!end) return 0;
  const ms = new Date(end).getTime() - from.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/** `YYYY-MM-DD` of `d` in the business timezone. */
export function businessDate(d: Date = new Date()): string {
  return dayjs(d).tz(BUSINESS_TZ).format('YYYY-MM-DD');
}

/** Start of the calendar month (business TZ) containing `d`, as a UTC Date. */
export function startOfBusinessMonth(d: Date = new Date()): Date {
  return dayjs(d).tz(BUSINESS_TZ).startOf('month').toDate();
}

export function secondsBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 1000);
}
