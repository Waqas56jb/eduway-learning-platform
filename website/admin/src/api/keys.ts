/* React-query keys per module. Every key starts with the module name so a whole module can be
 * invalidated with `queryClient.invalidateQueries({ queryKey: qk.<module>.all })`.
 *
 * Convention: `qk.<module>.all` → root, `.list(params)` → paged lists, `.detail(id)` → one entity,
 * anything else is a named sub-resource. Params objects are part of the key (react-query hashes them). */
type P = Record<string, unknown> | undefined;

const mod = <M extends string>(m: M) => ({
  all: [m] as const,
  list: (params?: P) => [m, 'list', params ?? {}] as const,
  detail: (id: string | undefined | null) => [m, 'detail', id ?? ''] as const,
  sub: (name: string, ...rest: unknown[]) => [m, name, ...rest] as const,
});

export const qk = {
  me: ['me'] as const,
  inbox: ['me', 'inbox'] as const,
  lookups: ['lookups'] as const,
  search: (q: string, scopes?: string[]) => ['search', q, scopes ?? []] as const,

  // F1 modules
  dashboard: mod('dashboard'),
  students: mod('students'),
  support: mod('support'),
  subjects: mod('subjects'),
  units: mod('units'),
  teachers: mod('teachers'),
  lessons: mod('lessons'),
  videos: mod('videos'),
  questions: mod('questions'),
  tags: mod('tags'),
  imports: mod('imports'),
  quizRules: mod('quizRules'),
  blueprints: mod('blueprints'),
  attempts: mod('attempts'),
  profile: mod('profile'),

  // F2 modules
  packages: mod('packages'),
  promotions: mod('promotions'),
  subscriptions: mod('subscriptions'),
  payments: mod('payments'),
  refunds: mod('refunds'),
  reconciliation: mod('reconciliation'),
  schools: mod('schools'),
  incentiveRules: mod('incentiveRules'),
  settlements: mod('settlements'),
  marketers: mod('marketers'),
  milestones: mod('milestones'),
  ai: mod('ai'),
  analytics: mod('analytics'),
  exports: mod('exports'),
  templates: mod('templates'),
  campaigns: mod('campaigns'),
  deliveries: mod('deliveries'),
  settings: mod('settings'),
  whatsapp: mod('whatsapp'),
  featureFlags: mod('featureFlags'),
  legal: mod('legal'),
  cms: mod('cms'),
  roles: mod('roles'),
  admins: mod('admins'),
  audit: mod('audit'),
  adminSessions: mod('adminSessions'),
  alerts: mod('alerts'),
} as const;

export type QueryKey = readonly unknown[];
