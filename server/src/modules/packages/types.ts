import type { PackageComparison } from '../../common/dto/package.js';
import type { SubjectRef } from '../../common/dto/refs.js';
import type { Localized } from '../../common/i18n/index.js';

/** API_CONTRACT §24 AdminPackage. */
export interface AdminPackage {
  id: string;
  name: Localized;
  description: Localized;
  tagline: Localized;
  subjectIds: string[];
  subjects: SubjectRef[];
  price: number;
  currency: 'IQD' | 'USD';
  taxBehavior: 'inclusive' | 'exclusive' | 'exempt';
  validityType: 'days' | 'months' | 'until_date';
  validityValue: number;
  validUntil: string | null;
  yearlyPrice: number | null;
  yearlyValidityDays: number;
  renewal: 'manual' | 'auto' | 'none';
  accessStart: 'immediate' | 'from_date';
  accessStartDate: string | null;
  status: 'active' | 'draft' | 'archived';
  featured: boolean;
  order: number;
  aiQuota: number | null;
  features: Localized[];
  comparison: PackageComparison;
  subscribers: number;
  createdAt: string;
  updatedAt: string;
}
