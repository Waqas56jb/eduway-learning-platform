import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { ModuleKey } from '@/types';
import { AppLayout, PageFallback } from '@/components/layout/AppLayout';
import { GuestRoute, ProtectedRoute, RequirePermission } from './guards';

const p = (factory: () => Promise<{ default: ComponentType }>) => lazy(factory);

// Auth
const Login = p(() => import('@/pages/auth/Login'));
const Verify2FA = p(() => import('@/pages/auth/Verify2FA'));
const ForgotPassword = p(() => import('@/pages/auth/ForgotPassword'));
// Core
const Dashboard = p(() => import('@/pages/dashboard/Dashboard'));
const UsersList = p(() => import('@/pages/users/UsersList'));
const UserDetail = p(() => import('@/pages/users/UserDetail'));
// Content
const Subjects = p(() => import('@/pages/content/Subjects'));
const Units = p(() => import('@/pages/content/Units'));
const Lessons = p(() => import('@/pages/content/Lessons'));
const LessonEditor = p(() => import('@/pages/content/LessonEditor'));
const Videos = p(() => import('@/pages/content/Videos'));
const ContentWorkflow = p(() => import('@/pages/content/ContentWorkflow'));
// Questions
const QuestionBank = p(() => import('@/pages/questions/QuestionBank'));
const QuestionEditor = p(() => import('@/pages/questions/QuestionEditor'));
const BulkImport = p(() => import('@/pages/questions/BulkImport'));
const ReviewQueue = p(() => import('@/pages/questions/ReviewQueue'));
// Assessments
const QuizRules = p(() => import('@/pages/assessments/QuizRules'));
const ExamBlueprints = p(() => import('@/pages/assessments/ExamBlueprints'));
const BlueprintEditor = p(() => import('@/pages/assessments/BlueprintEditor'));
const Attempts = p(() => import('@/pages/assessments/Attempts'));
// Packages
const Packages = p(() => import('@/pages/packages/Packages'));
const Promotions = p(() => import('@/pages/packages/Promotions'));
// Payments
const Transactions = p(() => import('@/pages/payments/Transactions'));
const TransactionDetail = p(() => import('@/pages/payments/TransactionDetail'));
const Refunds = p(() => import('@/pages/payments/Refunds'));
const Reconciliation = p(() => import('@/pages/payments/Reconciliation'));
// Schools
const Schools = p(() => import('@/pages/schools/Schools'));
const SchoolDetail = p(() => import('@/pages/schools/SchoolDetail'));
const IncentiveRules = p(() => import('@/pages/schools/IncentiveRules'));
const SchoolSettlements = p(() => import('@/pages/schools/SchoolSettlements'));
// Marketers
const Marketers = p(() => import('@/pages/marketers/Marketers'));
const MarketerDetail = p(() => import('@/pages/marketers/MarketerDetail'));
const MilestoneRewards = p(() => import('@/pages/marketers/MilestoneRewards'));
const MarketerSettlements = p(() => import('@/pages/marketers/MarketerSettlements'));
// AI tutor
const AiUsageDashboard = p(() => import('@/pages/aitutor/AiUsageDashboard'));
const AiSettings = p(() => import('@/pages/aitutor/AiSettings'));
const AiAbuseControls = p(() => import('@/pages/aitutor/AiAbuseControls'));
// Analytics
const BusinessAnalytics = p(() => import('@/pages/analytics/BusinessAnalytics'));
const LearningAnalytics = p(() => import('@/pages/analytics/LearningAnalytics'));
const Exports = p(() => import('@/pages/analytics/Exports'));
// Notifications
const Templates = p(() => import('@/pages/notifications/Templates'));
const TemplateEditor = p(() => import('@/pages/notifications/TemplateEditor'));
const SendCampaign = p(() => import('@/pages/notifications/SendCampaign'));
const DeliveryLog = p(() => import('@/pages/notifications/DeliveryLog'));
// Settings
const General = p(() => import('@/pages/settings/General'));
const Otp = p(() => import('@/pages/settings/Otp'));
const FeatureFlags = p(() => import('@/pages/settings/FeatureFlags'));
const LegalDocuments = p(() => import('@/pages/settings/LegalDocuments'));
const SupportContacts = p(() => import('@/pages/settings/SupportContacts'));
const AppSettings = p(() => import('@/pages/settings/AppSettings'));
// Security
const Roles = p(() => import('@/pages/security/Roles'));
const RoleEditor = p(() => import('@/pages/security/RoleEditor'));
const Permissions = p(() => import('@/pages/security/Permissions'));
const AdminUsers = p(() => import('@/pages/security/AdminUsers'));
const AuditLogs = p(() => import('@/pages/security/AuditLogs'));
const Sessions = p(() => import('@/pages/security/Sessions'));
const SuspiciousActivity = p(() => import('@/pages/security/SuspiciousActivity'));
// Other
const Profile = p(() => import('@/pages/profile/Profile'));
const NotFound = p(() => import('@/pages/NotFound'));

const guard = (module: ModuleKey, C: LazyExoticComponent<ComponentType>) => (
  <RequirePermission module={module}>
    <C />
  </RequirePermission>
);

const page = (path: string, module: ModuleKey, C: LazyExoticComponent<ComponentType>) => ({ path, element: guard(module, C) });

export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      { path: '/login', element: <Suspense fallback={null}><Login /></Suspense> },
      { path: '/forgot-password', element: <Suspense fallback={null}><ForgotPassword /></Suspense> },
    ],
  },
  { path: '/verify-2fa', element: <Suspense fallback={null}><Verify2FA /></Suspense> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          page('/', 'dashboard', Dashboard),

          page('/users', 'users', UsersList),
          page('/users/:id', 'users', UserDetail),

          { path: '/content', element: <Navigate to="/content/subjects" replace /> },
          page('/content/subjects', 'content', Subjects),
          page('/content/units', 'content', Units),
          page('/content/lessons', 'content', Lessons),
          page('/content/lessons/new', 'content', LessonEditor),
          page('/content/lessons/:id', 'content', LessonEditor),
          page('/content/videos', 'content', Videos),
          page('/content/workflow', 'content', ContentWorkflow),

          page('/questions', 'questions', QuestionBank),
          page('/questions/new', 'questions', QuestionEditor),
          page('/questions/review', 'questions', ReviewQueue),
          page('/questions/import', 'questions', BulkImport),
          page('/questions/:id', 'questions', QuestionEditor),

          { path: '/assessments', element: <Navigate to="/assessments/quiz-rules" replace /> },
          page('/assessments/quiz-rules', 'assessments', QuizRules),
          page('/assessments/blueprints', 'assessments', ExamBlueprints),
          page('/assessments/blueprints/new', 'assessments', BlueprintEditor),
          page('/assessments/blueprints/:id', 'assessments', BlueprintEditor),
          page('/assessments/attempts', 'assessments', Attempts),

          page('/packages', 'packages', Packages),
          page('/packages/promotions', 'packages', Promotions),

          { path: '/payments', element: <Navigate to="/payments/transactions" replace /> },
          page('/payments/transactions', 'payments', Transactions),
          page('/payments/transactions/:id', 'payments', TransactionDetail),
          page('/payments/refunds', 'payments', Refunds),
          page('/payments/reconciliation', 'payments', Reconciliation),

          page('/schools', 'schools', Schools),
          page('/schools/incentive-rules', 'schools', IncentiveRules),
          page('/schools/settlements', 'schools', SchoolSettlements),
          page('/schools/:id', 'schools', SchoolDetail),

          page('/marketers', 'marketers', Marketers),
          page('/marketers/milestones', 'marketers', MilestoneRewards),
          page('/marketers/settlements', 'marketers', MarketerSettlements),
          page('/marketers/:id', 'marketers', MarketerDetail),

          page('/ai-tutor', 'aitutor', AiUsageDashboard),
          page('/ai-tutor/settings', 'aitutor', AiSettings),
          page('/ai-tutor/abuse', 'aitutor', AiAbuseControls),

          { path: '/analytics', element: <Navigate to="/analytics/business" replace /> },
          page('/analytics/business', 'analytics', BusinessAnalytics),
          page('/analytics/learning', 'analytics', LearningAnalytics),
          page('/analytics/exports', 'analytics', Exports),

          { path: '/notifications', element: <Navigate to="/notifications/templates" replace /> },
          page('/notifications/templates', 'notifications', Templates),
          page('/notifications/templates/new', 'notifications', TemplateEditor),
          page('/notifications/templates/:id', 'notifications', TemplateEditor),
          page('/notifications/campaigns', 'notifications', SendCampaign),
          page('/notifications/delivery-log', 'notifications', DeliveryLog),

          { path: '/settings', element: <Navigate to="/settings/general" replace /> },
          page('/settings/general', 'settings', General),
          page('/settings/otp', 'settings', Otp),
          page('/settings/feature-flags', 'settings', FeatureFlags),
          page('/settings/legal', 'settings', LegalDocuments),
          page('/settings/support', 'settings', SupportContacts),
          page('/settings/app', 'settings', AppSettings),

          { path: '/security', element: <Navigate to="/security/roles" replace /> },
          page('/security/roles', 'security', Roles),
          page('/security/roles/new', 'security', RoleEditor),
          page('/security/roles/:id', 'security', RoleEditor),
          page('/security/permissions', 'security', Permissions),
          page('/security/admins', 'security', AdminUsers),
          page('/security/audit-logs', 'security', AuditLogs),
          page('/security/sessions', 'security', Sessions),
          page('/security/alerts', 'security', SuspiciousActivity),

          { path: '/profile', element: <Profile /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
  { path: '*', element: <Suspense fallback={<PageFallback />}><NotFound /></Suspense> },
], {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});
