import { adminSessions, securityAlerts } from '@/data/securityExtra';
import { createCollection } from './createCollection';

export const useAdminSessions = createCollection('admin_session', adminSessions, (s) => `${s.device} · ${s.ip}`);
export const useSecurityAlerts = createCollection('security_alert', securityAlerts, (a) => `${a.kind} — ${a.subject}`);
