import type { AdminRef } from '../../common/dto/refs.js';

export interface AuditLogDto {
  id: string;
  at: string;
  actor: string;
  actorId: string | null;
  actorType: 'admin' | 'student' | 'system';
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string;
  device: string;
  platform: 'web' | 'ios' | 'android' | 'admin' | null;
  requestId: string | null;
}

export interface SecurityAlertDto {
  id: string;
  kind: 'multiple_devices' | 'otp_bruteforce' | 'unusual_location' | 'payment_fraud' | 'admin_login_failure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  subject: string;
  subjectId: string | null;
  subjectType: 'student' | 'admin' | null;
  detail: string;
  status: 'open' | 'resolved' | 'blocked';
  resolvedBy: AdminRef | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
  createdAt: string;
}
