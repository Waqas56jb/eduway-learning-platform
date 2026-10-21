import { useMarketers, useSchools } from '@/store/core';

/**
 * Move a school's attribution to another marketer (or none), keeping both sides in sync.
 * When `reason` is given the change is logged as an admin override.
 */
export function reassignSchool(schoolId: string, toId: string | null, reason?: string) {
  const schools = useSchools.getState();
  const mk = useMarketers.getState();
  const school = schools.get(schoolId);
  if (!school || school.marketerId === toId) return;
  const fromId = school.marketerId;
  const from = mk.get(fromId);
  const to = mk.get(toId);

  if (fromId) mk.update(fromId, (m) => ({ schoolIds: m.schoolIds.filter((x) => x !== schoolId) }), { silent: true });
  if (toId) mk.update(toId, (m) => ({ schoolIds: [...new Set([...m.schoolIds, schoolId])] }), { silent: true });

  const summary = reason
    ? `Admin override: reassigned ${school.name_en} from ${from?.name_en ?? '—'} to ${to?.name_en ?? '—'}. Reason: ${reason}`
    : toId
      ? `Assigned ${school.name_en} to ${to?.name_en}`
      : `Unassigned ${school.name_en} from ${from?.name_en ?? '—'}`;
  schools.update(schoolId, { marketerId: toId }, { action: reason ? 'school.attribution_override' : toId ? 'school.assign_marketer' : 'school.unassign_marketer', summary });
}
