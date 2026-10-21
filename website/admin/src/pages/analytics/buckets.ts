import { addDays, addMonths, differenceInCalendarDays, parseISO, startOfDay, startOfMonth } from 'date-fns';
import { fmtDate } from '@/utils/format';

export type Grain = 'day' | 'week' | 'month';

/** Pick a chart granularity that keeps ~7–60 points on screen. */
export function grainFor(from: string, to: string): Grain {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
}

const d = (v: string | Date) => (typeof v === 'string' ? parseISO(v) : v);

/** Bucket index of `date` relative to the period start, or -1 when outside [from, to]. */
export function bucketIndex(date: string | Date, from: string, to: string, grain: Grain) {
  const x = d(date);
  const f = startOfDay(d(from));
  if (x < f || x > d(to)) return -1;
  if (grain === 'month') {
    const s = startOfMonth(f);
    return (x.getFullYear() - s.getFullYear()) * 12 + x.getMonth() - s.getMonth();
  }
  const days = differenceInCalendarDays(x, f);
  return grain === 'week' ? Math.floor(days / 7) : days;
}

export function bucketCount(from: string, to: string, grain: Grain) {
  return Math.max(1, bucketIndex(to, from, to, grain) + 1);
}

/** Label for bucket `i` of the period starting at `from`. */
export function bucketLabel(i: number, from: string, grain: Grain) {
  const f = startOfDay(d(from));
  if (grain === 'month') return fmtDate(addMonths(startOfMonth(f), i), 'MMM yy');
  return fmtDate(addDays(f, grain === 'week' ? i * 7 : i), 'd MMM');
}

export const inRange = (iso: string | null | undefined, from: string, to: string) => {
  if (!iso) return false;
  const t = d(iso).getTime();
  return t >= startOfDay(d(from)).getTime() && t <= d(to).getTime();
};

/** Aggregate items into buckets with a value accessor (sum). */
export function bucketize<T>(items: T[], date: (i: T) => string, value: (i: T) => number, from: string, to: string, grain: Grain, count: number) {
  const out = Array<number>(count).fill(0);
  for (const it of items) {
    const i = bucketIndex(date(it), from, to, grain);
    if (i >= 0 && i < count) out[i] += value(it);
  }
  return out;
}
