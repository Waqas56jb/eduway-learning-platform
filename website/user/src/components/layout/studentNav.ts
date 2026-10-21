import {
  Bell,
  BookOpen,
  Bot,
  CreditCard,
  LayoutDashboard,
  Library,
  LineChart,
  NotebookPen,
  Timer,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export interface StudentNavItem {
  to: string;
  key: string;
  icon: LucideIcon;
  group: 'learn' | 'practice' | 'account';
}

export const STUDENT_NAV: StudentNavItem[] = [
  { to: '/student/dashboard', key: 'dashboard', icon: LayoutDashboard, group: 'learn' },
  { to: '/student/subjects', key: 'subjects', icon: BookOpen, group: 'learn' },
  { to: '/student/ai-tutor', key: 'aiTutor', icon: Bot, group: 'learn' },
  { to: '/student/question-bank', key: 'questionBank', icon: Library, group: 'practice' },
  { to: '/student/mistakes', key: 'mistakes', icon: NotebookPen, group: 'practice' },
  { to: '/student/exams', key: 'exams', icon: Timer, group: 'practice' },
  { to: '/student/progress', key: 'progress', icon: LineChart, group: 'practice' },
  { to: '/student/subscription', key: 'subscription', icon: CreditCard, group: 'account' },
  { to: '/student/notifications', key: 'notifications', icon: Bell, group: 'account' },
  { to: '/student/profile', key: 'profile', icon: UserRound, group: 'account' },
];

/** Items shown in the mobile bottom tab bar (the rest live under "More"). */
export const BOTTOM_TABS = ['dashboard', 'subjects', 'aiTutor', 'exams'];
