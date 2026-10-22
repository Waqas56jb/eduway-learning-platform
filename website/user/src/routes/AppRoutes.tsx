import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LogoMark } from '@/components/ui';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { StudentLayout } from '@/components/layout/StudentLayout';
import { ScrollManager } from '@/components/layout/PageTransition';
import { GuestOnlyRoute, ProtectedRoute } from './ProtectedRoute';

// Public
const Landing = lazy(() => import('@/pages/public/Landing'));
const Pricing = lazy(() => import('@/pages/public/Pricing'));
const About = lazy(() => import('@/pages/public/About'));
const Contact = lazy(() => import('@/pages/public/Contact'));
const Terms = lazy(() => import('@/pages/public/Terms'));
const Privacy = lazy(() => import('@/pages/public/Privacy'));
const Login = lazy(() => import('@/pages/public/Login'));
const Register = lazy(() => import('@/pages/public/Register'));
const VerifyOtp = lazy(() => import('@/pages/public/VerifyOtp'));
const NotFound = lazy(() => import('@/pages/public/NotFound'));
const VerifyEmail = lazy(() => import('@/pages/public/VerifyEmail'));

// Student
const Dashboard = lazy(() => import('@/pages/student/Dashboard'));
const Subjects = lazy(() => import('@/pages/student/Subjects'));
const SubjectDetail = lazy(() => import('@/pages/student/SubjectDetail'));
const Lesson = lazy(() => import('@/pages/student/Lesson'));
const QuestionBank = lazy(() => import('@/pages/student/QuestionBank'));
const MyMistakes = lazy(() => import('@/pages/student/MyMistakes'));
const ExamSimulator = lazy(() => import('@/pages/student/ExamSimulator'));
const ExamRoom = lazy(() => import('@/pages/student/ExamRoom'));
const ExamResult = lazy(() => import('@/pages/student/ExamResult'));
const AiTutor = lazy(() => import('@/pages/student/AiTutor'));
const Progress = lazy(() => import('@/pages/student/Progress'));
const Subscription = lazy(() => import('@/pages/student/Subscription'));
const Profile = lazy(() => import('@/pages/student/Profile'));
const Notifications = lazy(() => import('@/pages/student/Notifications'));

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <LogoMark className="h-12 w-12 animate-pulse" />
    </div>
  );
}

/**
 * Route map
 *  /                       Landing
 *  /pricing /about /contact /terms /privacy /verify-email
 *  /login /register /verify-otp            (guests only)
 *  /student/dashboard
 *  /student/subjects, /student/subjects/:subjectId
 *  /student/lesson/:lessonId
 *  /student/question-bank
 *  /student/mistakes
 *  /student/exams, /student/exams/:examId/room (full-screen), /student/exams/result/:attemptId
 *  /student/ai-tutor /student/progress /student/subscription /student/profile /student/notifications
 */
export function AppRoutes() {
  return (
    <>
      <ScrollManager />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Landing />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />
            <Route path="terms" element={<Terms />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="verify-email" element={<VerifyEmail />} />
          </Route>

          <Route element={<GuestOnlyRoute />}>
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="verify-otp" element={<VerifyOtp />} />
          </Route>

          <Route path="student" element={<ProtectedRoute />}>
            <Route path="exams/:examId/room" element={<ExamRoom />} />
            <Route element={<StudentLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="subjects" element={<Subjects />} />
              <Route path="subjects/:subjectId" element={<SubjectDetail />} />
              <Route path="lesson/:lessonId" element={<Lesson />} />
              <Route path="question-bank" element={<QuestionBank />} />
              <Route path="mistakes" element={<MyMistakes />} />
              <Route path="exams" element={<ExamSimulator />} />
              <Route path="exams/result/:attemptId" element={<ExamResult />} />
              <Route path="ai-tutor" element={<AiTutor />} />
              <Route path="progress" element={<Progress />} />
              <Route path="subscription" element={<Subscription />} />
              <Route path="profile" element={<Profile />} />
              <Route path="notifications" element={<Notifications />} />
            </Route>
          </Route>

          <Route element={<PublicLayout />}>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
