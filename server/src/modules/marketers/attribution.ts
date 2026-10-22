/**
 * Double-attribution guard (pure, unit-tested) — ADM-SCH-09 / ADM-MKT-09 / ADM-MKT-10.
 * A school has at most ONE active marketer. Re-assigning a school that already has a different marketer
 * requires an override reason (≥3 chars) — otherwise 409 DOUBLE_ATTRIBUTION with details.currentMarketer.
 * Changes affect future attribution only.
 */
export type AttributionAction = 'noop' | 'assign' | 'unassign' | 'override';

export interface AttributionDecision {
  action: AttributionAction;
  /** Audit action name. */
  auditAction: 'school.assign_marketer' | 'school.unassign_marketer' | 'school.attribution_override' | null;
  error: 'DOUBLE_ATTRIBUTION' | null;
}

export function decideAttribution(currentMarketerId: string | null, targetMarketerId: string | null, overrideReason?: string | null): AttributionDecision {
  if (currentMarketerId === targetMarketerId) return { action: 'noop', auditAction: null, error: null };
  if (targetMarketerId === null) return { action: 'unassign', auditAction: 'school.unassign_marketer', error: null };
  if (currentMarketerId === null) return { action: 'assign', auditAction: 'school.assign_marketer', error: null };
  const reason = (overrideReason ?? '').trim();
  if (reason.length < 3) return { action: 'override', auditAction: null, error: 'DOUBLE_ATTRIBUTION' };
  return { action: 'override', auditAction: 'school.attribution_override', error: null };
}
