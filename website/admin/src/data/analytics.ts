/* Platform activity time series (mock telemetry). Counts that exist as records — students,
   transactions, refunds — should be derived from the stores instead, so UI actions are reflected. */
import { format, subDays } from 'date-fns';
import type { SubjectKey } from '@/types';
import { createRng, MOCK_NOW } from '@/utils/random';

const rng = createRng(9001);

export interface DailyActivity {
  date: string; // yyyy-MM-dd
  dau: number;
  wau: number;
  mau: number;
  watchMinutes: number;
  videoCompletionRate: number; // %
  quizAttempts: number;
  quizCompletionRate: number; // %
  examAttempts: number;
  aiQuestions: number;
  aiActiveUsers: number;
  aiTokens: number;
  aiCostUsd: number;
  aiBySubject: Record<SubjectKey, number>;
  errorRate: number; // % of API requests
}

/** 365 days ending at MOCK_NOW, oldest first. Scaled to the ~120-student mock population. */
export const dailyActivity: DailyActivity[] = Array.from({ length: 365 }, (_, i) => {
  const day = subDays(MOCK_NOW, 364 - i);
  const dow = day.getDay(); // Fri (5) is the quietest day in Iraq
  const growth = 0.45 + (i / 364) * 0.55;
  const weekly = dow === 5 ? 0.62 : dow === 4 ? 0.85 : dow === 6 ? 1.08 : 1;
  // Exam season bump (May–June) and summer dip (Jul–Aug)
  const m = day.getMonth();
  const season = m === 4 || m === 5 ? 1.25 : m === 6 || m === 7 ? 0.55 : 1;
  const dau = Math.max(8, Math.round(70 * growth * weekly * season * (0.9 + rng.next() * 0.2)));
  const ai = Math.round(dau * (1.6 + rng.next() * 1.2));
  const split = [0.31, 0.24, 0.2, 0.15, 0.1].map((p) => p * (0.85 + rng.next() * 0.3));
  const sum = split.reduce((a, b) => a + b, 0);
  const keys: SubjectKey[] = ['math', 'physics', 'chemistry', 'biology', 'english'];
  const tokens = ai * rng.int(820, 1150);
  return {
    date: format(day, 'yyyy-MM-dd'),
    dau,
    wau: Math.min(118, Math.round(dau * 1.55)),
    mau: Math.min(120, Math.round(dau * 1.75)),
    watchMinutes: Math.round(dau * (38 + rng.next() * 22)),
    videoCompletionRate: +(62 + rng.next() * 18 + growth * 6).toFixed(1),
    quizAttempts: Math.round(dau * (1.1 + rng.next() * 0.8)),
    quizCompletionRate: +(70 + rng.next() * 18).toFixed(1),
    examAttempts: Math.round(dau * (0.08 + rng.next() * 0.12) * season),
    aiQuestions: ai,
    aiActiveUsers: Math.round(dau * (0.45 + rng.next() * 0.2)),
    aiTokens: tokens,
    aiCostUsd: +((tokens / 1000) * 0.0042).toFixed(2),
    aiBySubject: Object.fromEntries(keys.map((k, j) => [k, Math.round((ai * split[j]) / sum)])) as Record<SubjectKey, number>,
    errorRate: +(0.05 + rng.next() * 0.35).toFixed(2),
  };
});

/** Slice of daily activity within [from, to] (ISO strings). */
export function activityInRange(from: string, to: string) {
  const f = from.slice(0, 10);
  const t = to.slice(0, 10);
  return dailyActivity.filter((d) => d.date >= f && d.date <= t);
}

/** The equally long period immediately before [from, to] — for "compare to previous". */
export function previousRange(from: string, to: string) {
  const span = new Date(to).getTime() - new Date(from).getTime();
  const pTo = new Date(new Date(from).getTime() - 86_400_000);
  const pFrom = new Date(pTo.getTime() - span);
  return { from: pFrom.toISOString(), to: pTo.toISOString() };
}

/** Percent change helper (safe for zero). */
export const pctChange = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / prev) * 100);

/** Per-topic learning signals (accuracy %, attempts, mistake recurrence). Keys are topic ids. */
export interface TopicSignal {
  topicId: string;
  accuracy: number;
  attempts: number;
  mistakeRecurrence: number; // % of students repeating the same mistake
  avgTimeSec: number;
}

const TOPIC_IDS = ['math', 'phys', 'chem', 'bio', 'eng'].flatMap((s) =>
  [1, 2, 3].flatMap((u) => [1, 2].map((t) => `unit_${s}_${u}_t${t}`)),
);

const HARD = new Set(['unit_math_1_t2', 'unit_math_3_t2', 'unit_phys_2_t1', 'unit_phys_3_t2', 'unit_chem_2_t1', 'unit_chem_3_t1', 'unit_bio_2_t2', 'unit_bio_3_t2']);

export const topicSignals: TopicSignal[] = TOPIC_IDS.map((topicId) => {
  const hard = HARD.has(topicId);
  return {
    topicId,
    accuracy: +(hard ? 38 + rng.next() * 16 : 58 + rng.next() * 30).toFixed(1),
    attempts: rng.int(180, 1400),
    mistakeRecurrence: +(hard ? 28 + rng.next() * 18 : 6 + rng.next() * 16).toFixed(1),
    avgTimeSec: rng.int(35, 140),
  };
});

/** Mock infrastructure health for the dashboard. */
export const systemHealth = {
  uptime30d: 99.98,
  errorRate24h: 0.12,
  apiP95Ms: 182,
  lastBackup: subDays(MOCK_NOW, 0).toISOString().slice(0, 10) + 'T02:00:00+03:00',
  backupSizeGb: 2.4,
  services: [
    { key: 'api', name: 'Core API', status: 'operational' as const, latencyMs: 96 },
    { key: 'video', name: 'Video CDN', status: 'operational' as const, latencyMs: 41 },
    { key: 'payments', name: 'Payment webhooks', status: 'operational' as const, latencyMs: 210 },
    { key: 'sms', name: 'SMS / OTP gateway', status: 'degraded' as const, latencyMs: 1240 },
    { key: 'ai', name: 'AI Tutor provider', status: 'operational' as const, latencyMs: 820 },
  ],
};
