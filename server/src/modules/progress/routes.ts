import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { paged } from '../../common/utils/response.js';
import { activityQuery, calendarQuery, completeBody, dashboardQuery, lessonsQuery, planItemBody, planItemParam, trendQuery, watchBody, weakQuery } from './schemas.js';
import { progressService as s } from './service.js';

export const router = Router();
const tags = ['Progress'];

defineRoute(router, { method: 'put', path: '/progress/watch', tags, summary: 'Watch heartbeat upsert (PRG-01) · ent:subject', auth: 'student', body: watchBody }, ({ student, body }) => s.watch(student.userId, body, student.platform));
defineRoute(router, { method: 'post', path: '/progress/complete', tags, summary: 'Mark lesson complete (PRG-02) · ent:subject', auth: 'student', body: completeBody }, ({ student, body }) => s.complete(student.userId, body.lessonId, student.platform));
defineRoute(router, { method: 'get', path: '/progress/lessons', tags, summary: 'Lesson progress map (PRG-03)', auth: 'student', query: lessonsQuery }, ({ student, query }) => s.lessons(student.userId, query.subjectId));
defineRoute(router, { method: 'get', path: '/progress/dashboard', tags, summary: 'Dashboard composite (PRG-04)', auth: 'student', query: dashboardQuery }, ({ student, query }) => s.dashboard(student.userId, query.tzOffsetMinutes));
defineRoute(router, { method: 'get', path: '/progress/subjects', tags, summary: 'Subject progress (PRG-05)', auth: 'student' }, ({ student }) => s.subjects(student.userId));
defineRoute(router, { method: 'get', path: '/progress/summary', tags, summary: 'Progress summary (PRG-06)', auth: 'student' }, ({ student }) => s.summary(student.userId));
defineRoute(router, { method: 'get', path: '/progress/score-trend', tags, summary: 'Weekly quiz score trend (PRG-07)', auth: 'student', query: trendQuery }, ({ student, query }) => s.scoreTrend(student.userId, query.weeks));
defineRoute(router, { method: 'get', path: '/progress/weak-topics', tags, summary: 'Weak topics (PRG-08)', auth: 'student', query: weakQuery }, ({ student, query }) => s.weakTopics(student.userId, query.limit, query.subjectId));
defineRoute(router, { method: 'get', path: '/progress/streak-calendar', tags, summary: 'Streak calendar (PRG-09)', auth: 'student', query: calendarQuery }, ({ student, query }) => s.streakCalendar(student.userId, query.weeks));
defineRoute(router, { method: 'get', path: '/progress/activity', tags, summary: 'Activity feed (PRG-10)', auth: 'student', query: activityQuery }, async ({ student, query }) => {
  const r = await s.activity(student.userId, query.limit, query.cursor);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'get', path: '/progress/today-plan', tags, summary: 'Today plan (PRG-11)', auth: 'student' }, ({ student }) => s.todayPlan(student.userId));
defineRoute(router, { method: 'patch', path: '/progress/today-plan/:itemId', tags, summary: 'Toggle plan item (PRG-12)', auth: 'student', params: planItemParam, body: planItemBody }, ({ student, params, body }) => s.setPlanItem(student.userId, params.itemId, body.done));
defineRoute(router, { method: 'get', path: '/progress/achievements', tags, summary: 'Achievements / badges (PRG-13)', auth: 'student' }, ({ student }) => s.achievements(student.userId));
