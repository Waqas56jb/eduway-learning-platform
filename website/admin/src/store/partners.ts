import { incentiveRules, milestoneRules, settlements } from '@/data/incentives';
import { createCollection } from './createCollection';

export const useIncentiveRules = createCollection('incentive_rule', incentiveRules, (r) => `${r.name_en} v${r.version}`);
export const useMilestoneRules = createCollection('milestone_rule', milestoneRules, (r) => `${r.label_en} (v${r.version})`);
export const useSettlements = createCollection('settlement', settlements, (s) => `${s.partnerId} · ${s.period}`);
