/**
 * Jobs that run domain logic owned by other modules (via ./hooks — no static imports, guarded when missing):
 *   subscription expiry + reminders (C), exam auto-submit (B), daily analytics rollup (C), settlement calculation (C),
 *   question import processing (B), video processing callback (B), scheduled lesson publishing (B),
 *   scheduled incentive-rule activation (C).
 * Schedules follow API_CONTRACT §33 (platform timezone Asia/Baghdad where the contract names local times).
 */
import { logger } from '../config/logger.js';
import { callHook } from './hooks.js';
import { registerJob } from './index.js';

const TZ = 'Asia/Baghdad';

function hookJob(o: { name: string; hook: string; preferred: string[]; cron?: string; tz?: string; description: string; passData?: boolean }) {
  registerJob<Record<string, unknown>>({
    name: o.name,
    cron: o.cron,
    tz: o.tz,
    description: o.description,
    handler: async (data) => {
      const r = o.passData ? await callHook(o.hook, o.preferred, data) : await callHook(o.hook, o.preferred);
      if (r.ran && r.result !== undefined && r.result !== null) logger.debug({ job: o.name, result: r.result }, 'job hook finished');
    },
  });
}

hookJob({ name: 'eduway.subscription-expiry', hook: 'expireSubscriptionsAndRemind', preferred: ['subscriptions', 'commerce', 'packages'], cron: '*/15 * * * *', description: 'Expire subscriptions + 7/3/1-day reminders' });
hookJob({ name: 'eduway.exam-auto-submit', hook: 'autoSubmitExpiredAttempts', preferred: ['exams', 'assessments', 'quizzes', 'learning-core'], cron: '* * * * *', description: 'Auto-submit exam attempts past endsAt + grace' });
hookJob({ name: 'eduway.analytics-daily-rollup', hook: 'rollupDailyAnalytics', preferred: ['analytics', 'commerce'], cron: '30 0 * * *', tz: TZ, description: 'Daily analytics rollups (00:30 Baghdad)' });
hookJob({ name: 'eduway.settlement-calculation', hook: 'calculateSettlements', preferred: ['settlements', 'incentives', 'schools', 'marketers', 'commerce'], cron: '15 0 1 * *', tz: TZ, description: 'Monthly pending settlements (1st, 00:15 Baghdad)' });
hookJob({ name: 'eduway.question-import', hook: 'processQuestionImport', preferred: ['questions', 'content'], description: 'Parse/validate a bulk question import ({ importId })', passData: true });
hookJob({ name: 'eduway.video-processing-callback', hook: 'processVideoCallback', preferred: ['content', 'videos'], description: 'Apply a transcoding callback ({ provider, payload })', passData: true });
hookJob({ name: 'eduway.lesson-publish-scheduled', hook: 'publishScheduledLessons', preferred: ['content'], cron: '* * * * *', description: 'Publish lessons whose publishAt has passed' });
hookJob({ name: 'eduway.incentive-rule-activate', hook: 'activateScheduledIncentiveRules', preferred: ['incentives', 'schools', 'marketers'], cron: '5 0 * * *', tz: TZ, description: 'Activate scheduled incentive-rule versions' });
