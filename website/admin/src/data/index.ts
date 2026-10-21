/* Core mock dataset. Importing from '@/data' guarantees cross-entity counts below are computed
   once before any store reads the arrays. Module-specific data lives in sibling files. */
import { governorates, governorateById } from './geo';
import { subjects } from './subjects';
import { lessons, teachers, topics, units, teacherById } from './curriculum';
import { packages, packageById } from './packages';
import { marketers, schools, schoolById, marketerById } from './partners';
import { students, studentById } from './students';
import { refunds, transactions } from './transactions';
import { adminUsers, auditLogs, roles, matrix, emptyMatrix } from './security';

/** School tier names; thresholds mirror the active school incentive rule. */
export const SCHOOL_TIERS = [
  { name: 'Bronze', from: 1 },
  { name: 'Silver', from: 5 },
  { name: 'Gold', from: 10 },
  { name: 'Platinum', from: 20 },
] as const;

export const tierFor = (paid: number) =>
  [...SCHOOL_TIERS].reverse().find((t) => paid >= t.from)?.name ?? 'Bronze';

/** Per-student reward (IQD) by tier — used for pending settlement estimates. */
export const TIER_REWARD: Record<string, number> = { Bronze: 5000, Silver: 7500, Gold: 10000, Platinum: 12500 };

for (const p of packages) {
  p.subscribers = students.filter((s) => s.packageId === p.id && s.subscriptionStatus === 'active').length;
}

const paidStudentIds = new Set(
  transactions.filter((t) => t.status === 'paid' || t.status === 'partially_refunded').map((t) => t.studentId),
);

for (const s of schools) {
  const paid = students.filter((st) => st.schoolId === s.id && paidStudentIds.has(st.id)).length;
  s.verifiedPaidStudents = paid;
  s.tier = tierFor(paid);
  s.pendingSettlement = paid * TIER_REWARD[s.tier];
}

for (const m of marketers) {
  const paid = students.filter((st) => st.marketerId === m.id && paidStudentIds.has(st.id)).length;
  m.paidStudents = paid;
  m.milestonesHit = paid >= 25 ? 3 : paid >= 10 ? 2 : paid >= 5 ? 1 : 0;
  m.pendingReward = paid * 3000;
}

export {
  governorates,
  governorateById,
  subjects,
  units,
  topics,
  lessons,
  teachers,
  teacherById,
  packages,
  packageById,
  schools,
  schoolById,
  marketers,
  marketerById,
  students,
  studentById,
  transactions,
  refunds,
  roles,
  adminUsers,
  auditLogs,
  matrix,
  emptyMatrix,
};
