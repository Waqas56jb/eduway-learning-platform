/**
 * Shared-database prefix policy (docs/ENGINEERING.md §1).
 * EVERY table / view / function / trigger / enum / index / constraint / policy we create starts with TABLE_PREFIX.
 * Code references tables only through `t()` or the typed `T` map — never a raw name (enforced by ESLint
 * rule `eduway/no-unprefixed-sql` and `npm run check-prefix`).
 *
 * This module reads `process.env.TEST` directly (not env.ts) so pure unit tests and scripts can import it
 * without a full environment.
 */
export const PROD_PREFIX = 'eduway_platform_' as const;
export const TEST_PREFIX = 'eduway_platform_test_' as const;


/** Strictly `TEST=1` (vitest itself sets TEST='true' for every run — that must NOT switch the prefix). */
export const IS_TEST_PREFIX = process.env.TEST === '1';

/** `eduway_platform_` normally, `eduway_platform_test_` when TEST=1. */
export const TABLE_PREFIX: string = IS_TEST_PREFIX ? TEST_PREFIX : PROD_PREFIX;

/** Every table of the platform (logical, unprefixed names). Keep in sync with src/db/migrations. */
export const TABLES = [
  // identity & access
  'users', 'student_profiles', 'admin_users', 'roles', 'permissions', 'role_permissions', 'admin_roles',
  'sessions', 'devices', 'otp_codes', 'auth_lockouts', 'admin_invites', 'password_resets', 'admin_notifications', 'legal_documents', 'legal_acceptances',
  'governorates', 'entity_notes',
  // content
  'subjects', 'teachers', 'units', 'topics', 'lessons', 'lesson_versions', 'video_assets', 'lesson_resources',
  'content_workflow_log', 'lesson_caption_tracks',
  // questions & assessment
  'tags', 'questions', 'question_options', 'question_tags', 'question_imports', 'question_reviews',
  'quiz_rules', 'quiz_sets', 'quiz_attempts', 'quiz_attempt_answers', 'practice_sessions', 'practice_answers',
  'bookmarks', 'mistake_records', 'mistake_history',
  'exam_blueprints', 'exam_blueprint_sections', 'exam_attempts', 'exam_attempt_answers',
  // commerce
  'packages', 'package_subjects', 'package_features', 'promotions', 'promotion_packages', 'promotion_redemptions',
  'subscriptions', 'entitlements', 'entitlement_logs', 'payments', 'payment_events', 'refunds', 'receipts',
  'idempotency_keys', 'reconciliation_records', 'gateway_settlements',
  // partners
  'schools', 'school_students', 'marketers', 'marketer_schools', 'incentive_rules', 'incentive_rule_tiers',
  'milestone_sets', 'milestone_items', 'marketer_milestone_awards', 'settlements', 'settlement_items',
  // AI tutor
  'ai_settings', 'ai_conversations', 'ai_messages', 'ai_usage', 'ai_flags', 'ai_warnings', 'embeddings', 'kb_index_runs',
  // learning activity
  'watch_progress', 'lesson_completions', 'streaks', 'daily_activity', 'achievements', 'user_achievements',
  'lesson_notes', 'today_plan_items',
  // notifications
  'notification_templates', 'notifications', 'notification_deliveries', 'campaigns', 'push_tokens',
  // platform
  'settings', 'feature_flags', 'app_settings', 'audit_logs', 'suspicious_events', 'exports_log',
  'analytics_daily_rollups', 'cms_testimonials', 'cms_faq', 'uploads', 'support_tickets', 'support_ticket_messages',
  'rate_limits', 'whatsapp_auth', 'whatsapp_sessions', 'email_verifications',
  // infrastructure (migration ledger)
  'schema_migrations',
] as const;

export type TableName = (typeof TABLES)[number];

/** `t('users')` → `eduway_platform_users`. Only accepts known logical names (compile-time checked). */
export function t(name: TableName): string {
  return `${TABLE_PREFIX}${name}`;
}

/** Typed map of every prefixed table: `T.users` → `eduway_platform_users`. Use inside SQL template strings. */
export const T: { readonly [K in TableName]: string } = Object.freeze(
  Object.fromEntries(TABLES.map((n) => [n, `${TABLE_PREFIX}${n}`])) as { [K in TableName]: string },
);

/** Prefixed name for non-table objects (views, functions, enums…): `obj('fn_set_updated_at')`. */
export function obj(name: string): string {
  return `${TABLE_PREFIX}${name}`;
}

/** True when a database object name complies with the prefix policy. */
export function isPrefixed(name: string): boolean {
  return name.toLowerCase().replace(/^"|"$/g, '').startsWith(PROD_PREFIX);
}

/** Supabase Storage buckets — all prefixed `eduway-platform-`. */
export const BUCKETS = Object.freeze({
  thumbnails: 'eduway-platform-thumbnails',
  resources: 'eduway-platform-resources',
  questionImages: 'eduway-platform-question-images',
  videos: 'eduway-platform-videos',
} as const);
export type BucketKey = keyof typeof BUCKETS;
export type BucketName = (typeof BUCKETS)[BucketKey];
export const BUCKET_PREFIX = 'eduway-platform-' as const;
export const BUCKET_NAMES: readonly BucketName[] = Object.values(BUCKETS);
export const isOurBucket = (name: string): name is BucketName => (BUCKET_NAMES as readonly string[]).includes(name);

/** pg-boss schema (never the default `pgboss`). */
export const PGBOSS_SCHEMA: string = IS_TEST_PREFIX ? 'eduway_platform_test_pgboss' : 'eduway_platform_pgboss';

/** Supabase Auth app_metadata marker set on every auth user we create. */
export const AUTH_APP_MARKER = 'eduway_platform' as const;

/** JWT audiences. */
export const AUDIENCE = Object.freeze({
  student: 'eduway-student',
  admin: 'eduway-admin',
  registration: 'eduway-register',
  mfa: 'eduway-admin-mfa',
} as const);

/** RBAC modules × actions (permission key = `<module>.<action>`). Mirrors website/admin MODULES/ACTIONS. */
export const RBAC_MODULES = [
  'dashboard', 'users', 'content', 'questions', 'assessments', 'packages', 'payments', 'schools', 'marketers',
  'aitutor', 'analytics', 'notifications', 'settings', 'security',
] as const;
export const RBAC_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const;
export type RbacModule = (typeof RBAC_MODULES)[number];
export type RbacAction = (typeof RBAC_ACTIONS)[number];
export type PermissionKey = `${RbacModule}.${RbacAction}`;
export const ALL_PERMISSIONS: readonly PermissionKey[] = RBAC_MODULES.flatMap((m) =>
  RBAC_ACTIONS.map((a) => `${m}.${a}` as PermissionKey),
);
export const SUPER_ADMIN_ROLE = 'super_admin' as const;

export const CLIENT_PLATFORMS = ['web', 'ios', 'android', 'admin'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];
export const STUDENT_PLATFORMS = ['web', 'ios', 'android'] as const;
export type StudentPlatform = (typeof STUDENT_PLATFORMS)[number];

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ar';

export const API_VERSION_PREFIX = '/api/v1' as const;
