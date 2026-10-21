import type { ExportRecord } from '@/types';
import { daysAgo } from '@/utils/random';
import { createCollection } from './createCollection';

const seed: ExportRecord[] = [
  { id: 'exp_008', report: 'transactions', format: 'xlsx', range: '1 Oct 2026 – 21 Oct 2026', rows: 31, by: 'Huda Kareem', at: daysAgo(1, 3) },
  { id: 'exp_007', report: 'students', format: 'csv', range: '23 Sep 2026 – 22 Oct 2026', rows: 120, by: 'Ahmed Al-Rikabi', at: daysAgo(2, 6) },
  { id: 'exp_006', report: 'schools', format: 'xlsx', range: '1 Sep 2026 – 30 Sep 2026', rows: 12, by: 'Huda Kareem', at: daysAgo(5, 2) },
  { id: 'exp_005', report: 'learning', format: 'csv', range: '1 Sep 2026 – 30 Sep 2026', rows: 30, by: 'Dr. Sami Al-Hashimi', at: daysAgo(8, 4) },
  { id: 'exp_004', report: 'ai', format: 'csv', range: '1 Sep 2026 – 30 Sep 2026', rows: 30, by: 'Dr. Sami Al-Hashimi', at: daysAgo(12, 1) },
  { id: 'exp_003', report: 'refunds', format: 'xlsx', range: '1 Jul 2026 – 30 Sep 2026', rows: 6, by: 'Huda Kareem', at: daysAgo(19, 5) },
  { id: 'exp_002', report: 'audit', format: 'csv', range: '1 Sep 2026 – 30 Sep 2026', rows: 48, by: 'Ahmed Al-Rikabi', at: daysAgo(24, 2) },
  { id: 'exp_001', report: 'transactions', format: 'csv', range: '1 Aug 2026 – 31 Aug 2026', rows: 9, by: 'Huda Kareem', at: daysAgo(52, 3) },
];

export const useExports = createCollection('export', seed, (e) => `${e.report} (${e.format})`);
