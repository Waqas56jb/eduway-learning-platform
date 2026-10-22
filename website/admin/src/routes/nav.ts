import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  ClipboardCheck,
  CreditCard,
  FileQuestion,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Package,
  School,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleKey } from '@/types';

export interface NavLeaf {
  /** i18n key under `nav.` */
  key: string;
  path: string;
  /** Match the path exactly (no child routes). */
  end?: boolean;
}

export interface NavItem {
  key: string;
  icon: LucideIcon;
  module: ModuleKey;
  path?: string;
  children?: NavLeaf[];
}

export interface NavGroup {
  key: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    key: 'overview',
    items: [{ key: 'dashboard', icon: LayoutDashboard, module: 'dashboard', path: '/' }],
  },
  {
    key: 'people',
    items: [
      { key: 'users', icon: Users, module: 'users', path: '/users' },
      { key: 'supportTickets', icon: LifeBuoy, module: 'users', path: '/support' },
    ],
  },
  {
    key: 'learning',
    items: [
      {
        key: 'content',
        icon: BookOpen,
        module: 'content',
        children: [
          { key: 'subjects', path: '/content/subjects' },
          { key: 'units', path: '/content/units' },
          { key: 'lessons', path: '/content/lessons' },
          { key: 'videos', path: '/content/videos' },
          { key: 'teachers', path: '/content/teachers' },
          { key: 'workflow', path: '/content/workflow' },
        ],
      },
      {
        key: 'questions',
        icon: FileQuestion,
        module: 'questions',
        children: [
          { key: 'questionBank', path: '/questions', end: true },
          { key: 'reviewQueue', path: '/questions/review' },
          { key: 'bulkImport', path: '/questions/import' },
        ],
      },
      {
        key: 'assessments',
        icon: ClipboardCheck,
        module: 'assessments',
        children: [
          { key: 'quizRules', path: '/assessments/quiz-rules' },
          { key: 'blueprints', path: '/assessments/blueprints' },
          { key: 'attempts', path: '/assessments/attempts' },
          { key: 'effectiveRule', path: '/assessments/effective-rule' },
        ],
      },
    ],
  },
  {
    key: 'commerce',
    items: [
      {
        key: 'packages',
        icon: Package,
        module: 'packages',
        children: [
          { key: 'allPackages', path: '/packages', end: true },
          { key: 'promotions', path: '/packages/promotions' },
          { key: 'subscriptions', path: '/packages/subscriptions' },
        ],
      },
      {
        key: 'payments',
        icon: CreditCard,
        module: 'payments',
        children: [
          { key: 'transactions', path: '/payments/transactions' },
          { key: 'refunds', path: '/payments/refunds' },
          { key: 'reconciliation', path: '/payments/reconciliation' },
        ],
      },
    ],
  },
  {
    key: 'partners',
    items: [
      {
        key: 'schools',
        icon: School,
        module: 'schools',
        children: [
          { key: 'allSchools', path: '/schools', end: true },
          { key: 'incentiveRules', path: '/schools/incentive-rules' },
          { key: 'schoolSettlements', path: '/schools/settlements' },
        ],
      },
      {
        key: 'marketers',
        icon: Megaphone,
        module: 'marketers',
        children: [
          { key: 'allMarketers', path: '/marketers', end: true },
          { key: 'milestones', path: '/marketers/milestones' },
          { key: 'marketerSettlements', path: '/marketers/settlements' },
        ],
      },
    ],
  },
  {
    key: 'intelligence',
    items: [
      {
        key: 'aitutor',
        icon: Bot,
        module: 'aitutor',
        children: [
          { key: 'aiUsage', path: '/ai-tutor', end: true },
          { key: 'aiSettings', path: '/ai-tutor/settings' },
          { key: 'aiAbuse', path: '/ai-tutor/abuse' },
        ],
      },
      {
        key: 'analytics',
        icon: BarChart3,
        module: 'analytics',
        children: [
          { key: 'business', path: '/analytics/business' },
          { key: 'learningAnalytics', path: '/analytics/learning' },
          { key: 'dailyMetrics', path: '/analytics/daily' },
          { key: 'exports', path: '/analytics/exports' },
        ],
      },
    ],
  },
  {
    key: 'engagement',
    items: [
      {
        key: 'notifications',
        icon: Bell,
        module: 'notifications',
        children: [
          { key: 'templates', path: '/notifications/templates' },
          { key: 'campaigns', path: '/notifications/campaigns' },
          { key: 'deliveryLog', path: '/notifications/delivery-log' },
        ],
      },
    ],
  },
  {
    key: 'system',
    items: [
      {
        key: 'settings',
        icon: Settings,
        module: 'settings',
        children: [
          { key: 'general', path: '/settings/general' },
          { key: 'otp', path: '/settings/otp' },
          { key: 'featureFlags', path: '/settings/feature-flags' },
          { key: 'legal', path: '/settings/legal' },
          { key: 'support', path: '/settings/support' },
          { key: 'appSettings', path: '/settings/app' },
          { key: 'paymentSettings', path: '/settings/payments' },
          { key: 'learningSettings', path: '/settings/learning' },
          { key: 'marketingSettings', path: '/settings/marketing' },
          { key: 'securitySettings', path: '/settings/security' },
          { key: 'cms', path: '/settings/cms' },
        ],
      },
      {
        key: 'security',
        icon: ShieldCheck,
        module: 'security',
        children: [
          { key: 'roles', path: '/security/roles' },
          { key: 'permissions', path: '/security/permissions' },
          { key: 'admins', path: '/security/admins' },
          { key: 'auditLogs', path: '/security/audit-logs' },
          { key: 'sessions', path: '/security/sessions' },
          { key: 'alerts', path: '/security/alerts' },
        ],
      },
    ],
  },
];

/** Flat list of navigable pages, used by the command palette and breadcrumbs. */
export interface FlatPage {
  key: string;
  parentKey?: string;
  path: string;
  module: ModuleKey;
  icon: LucideIcon;
  group: string;
}

export const FLAT_PAGES: FlatPage[] = NAV.flatMap((g) =>
  g.items.flatMap((item) =>
    item.children
      ? item.children.map((c) => ({ key: c.key, parentKey: item.key, path: c.path, module: item.module, icon: item.icon, group: g.key }))
      : [{ key: item.key, path: item.path!, module: item.module, icon: item.icon, group: g.key }],
  ),
);

/** Best matching nav page for a pathname (longest prefix). */
export function matchPage(pathname: string): FlatPage | undefined {
  if (pathname === '/') return FLAT_PAGES[0];
  return [...FLAT_PAGES]
    .filter((p) => p.path !== '/' && (pathname === p.path || pathname.startsWith(p.path + '/')))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
