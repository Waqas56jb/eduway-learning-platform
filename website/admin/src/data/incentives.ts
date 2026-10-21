import type { IncentiveRule, IncentiveTier, MilestoneRule, Settlement } from '@/types';
import { createRng, daysAgo } from '@/utils/random';
import { marketers, schools, tierFor, TIER_REWARD } from '@/data';

const rng = createRng(31337);

export const incentiveRules: IncentiveRule[] = [
  {
    id: 'inc_school_v2',
    version: 2,
    name_en: 'School Partner Incentive',
    name_ar: 'حوافز المدارس الشريكة',
    partnerType: 'school',
    qualificationThreshold: 1,
    tiers: [
      { id: 't_s2_1', from: 1, to: 4, rewardType: 'per_student', amount: 5000, label: 'Bronze' },
      { id: 't_s2_2', from: 5, to: 9, rewardType: 'per_student', amount: 7500, label: 'Silver' },
      { id: 't_s2_3', from: 10, to: 19, rewardType: 'per_student', amount: 10000, label: 'Gold' },
      { id: 't_s2_4', from: 20, to: null, rewardType: 'per_student', amount: 12500, label: 'Platinum' },
    ],
    period: 'monthly',
    effectiveFrom: daysAgo(140),
    effectiveTo: null,
    status: 'active',
    createdBy: 'Ahmed Al-Rikabi',
    createdAt: daysAgo(145),
  },
  {
    id: 'inc_school_v1',
    version: 1,
    name_en: 'School Partner Incentive',
    name_ar: 'حوافز المدارس الشريكة',
    partnerType: 'school',
    qualificationThreshold: 3,
    tiers: [
      { id: 't_s1_1', from: 3, to: 9, rewardType: 'per_student', amount: 5000, label: 'Standard' },
      { id: 't_s1_2', from: 10, to: null, rewardType: 'per_student', amount: 8000, label: 'Premium' },
    ],
    period: 'quarterly',
    effectiveFrom: daysAgo(400),
    effectiveTo: daysAgo(141),
    status: 'superseded',
    createdBy: 'Ahmed Al-Rikabi',
    createdAt: daysAgo(405),
  },
  {
    id: 'inc_mkt_v1',
    version: 1,
    name_en: 'Marketer Commission',
    name_ar: 'عمولة المسوّقين',
    partnerType: 'marketer',
    qualificationThreshold: 1,
    tiers: [{ id: 't_m1_1', from: 1, to: null, rewardType: 'per_student', amount: 3000, label: 'Standard' }],
    period: 'monthly',
    effectiveFrom: daysAgo(320),
    effectiveTo: null,
    status: 'active',
    createdBy: 'Huda Kareem',
    createdAt: daysAgo(322),
  },
];

const ms = (
  id: string,
  version: number,
  threshold: number,
  reward: number,
  label_en: string,
  label_ar: string,
  status: MilestoneRule['status'],
  from: number,
): MilestoneRule => ({ id, version, threshold, reward, label_en, label_ar, status, effectiveFrom: daysAgo(from) });

export const milestoneRules: MilestoneRule[] = [
  ms('ms_v2_1', 2, 5, 50000, 'First Five', 'الخمسة الأوائل', 'active', 120),
  ms('ms_v2_2', 2, 10, 125000, 'Double Digits', 'العشرة الأولى', 'active', 120),
  ms('ms_v2_3', 2, 25, 400000, 'Champion Partner', 'الشريك البطل', 'active', 120),
  ms('ms_v1_1', 1, 10, 75000, 'Starter', 'البداية', 'superseded', 320),
  ms('ms_v1_2', 1, 30, 300000, 'Elite', 'النخبة', 'superseded', 320),
];

const PERIODS = ['2026-07', '2026-08', '2026-09', '2026-10'];
const statusFor = (pi: number): Settlement['status'] =>
  pi <= 1 ? 'paid' : pi === 2 ? rng.weighted<Settlement['status']>([['approved', 2], ['pending', 1]]) : 'pending';

let sIdx = 0;
const schoolSettlements: Settlement[] = schools
  .filter((s) => s.status !== 'pending')
  .flatMap((s) =>
    PERIODS.map((period, pi) => {
      const base = Math.max(1, s.verifiedPaidStudents);
      const qualified = Math.max(1, Math.round(base * (0.35 + pi * 0.2) + rng.int(-1, 1)));
      const status = s.status === 'suspended' && pi > 1 ? 'pending' : statusFor(pi);
      sIdx++;
      return {
        id: `set_s_${String(sIdx).padStart(2, '0')}`,
        partnerType: 'school' as const,
        partnerId: s.id,
        period,
        qualifiedStudents: qualified,
        amount: qualified * TIER_REWARD[tierFor(qualified)],
        currency: 'IQD' as const,
        status,
        approvedBy: status === 'pending' ? null : 'Huda Kareem',
        paidAt: status === 'paid' ? daysAgo((3 - pi) * 30 + rng.int(3, 9)) : null,
      };
    }),
  );

let mIdx = 0;
const marketerSettlements: Settlement[] = marketers
  .filter((m) => m.status === 'active')
  .flatMap((m) =>
    PERIODS.map((period, pi) => {
      const qualified = Math.max(1, Math.round(Math.max(1, m.paidStudents) * (0.3 + pi * 0.22) + rng.int(-1, 1)));
      const status = statusFor(pi);
      mIdx++;
      return {
        id: `set_m_${String(mIdx).padStart(2, '0')}`,
        partnerType: 'marketer' as const,
        partnerId: m.id,
        period,
        qualifiedStudents: qualified,
        amount: qualified * 3000,
        currency: 'IQD' as const,
        status,
        approvedBy: status === 'pending' ? null : 'Huda Kareem',
        paidAt: status === 'paid' ? daysAgo((3 - pi) * 30 + rng.int(3, 9)) : null,
      };
    }),
  );

export const settlements: Settlement[] = [...schoolSettlements, ...marketerSettlements].sort((a, b) =>
  b.period.localeCompare(a.period),
);

// ─── Rule engine helpers ────────────────────────────────────────────────────

export interface IncentiveResult {
  qualified: boolean;
  tier: IncentiveTier | null;
  amount: number;
}

/** Tier-based payout: every student in the period earns the rate of the tier reached. */
export function calcIncentive(rule: Pick<IncentiveRule, 'qualificationThreshold' | 'tiers'>, students: number): IncentiveResult {
  if (students < rule.qualificationThreshold || students <= 0) return { qualified: false, tier: null, amount: 0 };
  const tier = rule.tiers.find((t) => students >= t.from && (t.to === null || students <= t.to)) ?? null;
  if (!tier) return { qualified: true, tier: null, amount: 0 };
  return { qualified: true, tier, amount: tier.rewardType === 'per_student' ? tier.amount * students : tier.amount };
}

/** Next tier above the student count, if any. */
export const nextTier = (tiers: IncentiveTier[], students: number) =>
  [...tiers].sort((a, b) => a.from - b.from).find((t) => t.from > students) ?? null;
