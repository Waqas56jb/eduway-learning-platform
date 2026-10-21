/* Core entity stores shared across modules. Module-specific stores live in sibling files. */
import {
  adminUsers,
  lessons,
  marketers,
  packages,
  refunds,
  roles,
  schools,
  students,
  subjects,
  topics,
  transactions,
  units,
} from '@/data';
import { createCollection } from './createCollection';

export const useStudents = createCollection('student', students, (s) => s.name_en);
export const useSubjects = createCollection('subject', subjects, (s) => s.name_en);
export const useUnits = createCollection('unit', units, (u) => u.name_en);
export const useTopics = createCollection('topic', topics, (t) => t.name_en);
export const useLessons = createCollection('lesson', lessons, (l) => l.title_en);
export const usePackages = createCollection('package', packages, (p) => p.name_en);
export const useTransactions = createCollection('transaction', transactions, (t) => t.ref);
export const useRefunds = createCollection('refund', refunds, (r) => r.id);
export const useSchools = createCollection('school', schools, (s) => s.name_en);
export const useMarketers = createCollection('marketer', marketers, (m) => m.name_en);
export const useRoles = createCollection('role', roles, (r) => r.name_en);
export const useAdminUsers = createCollection('admin_user', adminUsers, (a) => a.email);
