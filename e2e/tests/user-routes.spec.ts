import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { STATE, type Lang } from './support/env';
import { sweepRoute, type RouteCase } from './support/sweep';

/**
 * Every route of website/user (src/routes/AppRoutes.tsx) × EN/AR, on desktop (project user-routes-desktop)
 * and on a 390×844 phone (project user-routes-mobile).
 * The exam room (/student/exams/:examId/room) starts a real, attempt-consuming exam, so it is covered by
 * the exam flow in user-flows.spec.ts rather than by this sweep.
 */
const ids = () => JSON.parse(fs.readFileSync(STATE.ids, 'utf8')) as { student: { subjectId: string; lessonId: string; attemptId: string } };

const routes = (): RouteCase[] => {
  const s = ids().student;
  return [
    // public (guest visitor)
    { name: 'landing', path: '/', auth: false },
    { name: 'pricing', path: '/pricing', auth: false },
    { name: 'about', path: '/about', auth: false },
    { name: 'contact', path: '/contact', auth: false },
    { name: 'terms', path: '/terms', auth: false },
    { name: 'privacy', path: '/privacy', auth: false },
    { name: 'not-found', path: '/this-page-does-not-exist', auth: false },
    // guest-only auth pages
    { name: 'login', path: '/login', auth: false },
    { name: 'register', path: '/register', auth: false },
    // /verify-otp without a pending OTP request sends the visitor back to /login.
    { name: 'verify-otp', path: '/verify-otp', auth: false, expectPath: /^\/(verify-otp|login)$/ },
    // public page while signed in (navbar in its authenticated state)
    { name: 'landing-signed-in', path: '/' },
    // student area
    { name: 'student-index', path: '/student', expectPath: /^\/student\/dashboard$/ },
    { name: 'dashboard', path: '/student/dashboard' },
    { name: 'subjects', path: '/student/subjects' },
    { name: 'subject-detail', path: `/student/subjects/${s.subjectId}` },
    { name: 'lesson', path: `/student/lesson/${s.lessonId}` },
    { name: 'question-bank', path: '/student/question-bank' },
    { name: 'mistakes', path: '/student/mistakes' },
    { name: 'exams', path: '/student/exams' },
    { name: 'exam-result', path: `/student/exams/result/${s.attemptId}` },
    { name: 'ai-tutor', path: '/student/ai-tutor' },
    { name: 'progress', path: '/student/progress' },
    { name: 'subscription', path: '/student/subscription' },
    { name: 'profile', path: '/student/profile' },
    { name: 'notifications', path: '/student/notifications' },
  ];
};

// Route list is resolved lazily (ids are written by the setup project) — names are static.
const NAMES = [
  'landing', 'pricing', 'about', 'contact', 'terms', 'privacy', 'not-found', 'login', 'register', 'verify-otp', 'landing-signed-in',
  'student-index', 'dashboard', 'subjects', 'subject-detail', 'lesson', 'question-bank', 'mistakes', 'exams', 'exam-result',
  'ai-tutor', 'progress', 'subscription', 'profile', 'notifications',
];

for (const lang of ['en', 'ar'] as Lang[]) {
  test.describe(`student site @routes ${lang}`, () => {
    for (const name of NAMES) {
      test(`${lang} ${name}`, async ({ browser }, testInfo) => {
        const rc = routes().find((r) => r.name === name);
        expect(rc, `route case ${name}`).toBeTruthy();
        const mobile = testInfo.project.name.includes('mobile');
        await sweepRoute(browser, testInfo, 'user', lang, rc!, mobile ? 'user-mobile' : 'user');
      });
    }
  });
}
