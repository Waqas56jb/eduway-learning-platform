import type { ClientPlatform, Locale } from '../../config/constants.js';

export interface StudentPrincipal {
  kind: 'student';
  userId: string;
  sessionId: string;
  phone: string | null;
  platform: ClientPlatform;
  deviceId: string | null;
  /** /auth/register completed (`student*` routes are allowed before). */
  profileComplete: boolean;
  /** Published legal documents not yet accepted. */
  pendingLegal: number;
}

export interface AdminPrincipal {
  kind: 'admin';
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  /** Role keys, e.g. ['super_admin'] */
  roles: string[];
  /** Human role name for audit entries (first role). */
  roleName: string;
  permissions: ReadonlySet<string>;
  isSuperAdmin: boolean;
  /** TOTP enrolled (used by the forced-enrolment guard). */
  mfaEnabled: boolean;
}

export type Principal = StudentPrincipal | AdminPrincipal;

/** Captured by the audit middleware / set explicitly by handlers. */
export interface AuditContext {
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

export interface RequestContext {
  requestId: string;
  locale: Locale;
  platform: ClientPlatform | null;
  deviceId: string | null;
  ip: string;
  userAgent: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      locale: Locale;
      clientPlatform: ClientPlatform | null;
      deviceId: string | null;
      student?: StudentPrincipal;
      admin?: AdminPrincipal;
      /** Raw request body (Buffer) — available for webhook signature verification. */
      rawBody?: Buffer;
      /** Set by the audit middleware/handlers; flushed to audit_logs after a successful response. */
      audit?: AuditContext;
      /** True once an audit entry has been written for this request. */
      auditWritten?: boolean;
    }
  }
}

export {};
