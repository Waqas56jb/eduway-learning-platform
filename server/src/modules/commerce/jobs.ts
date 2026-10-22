/**
 * Job entry points owned by Agent C, for the jobs registry (src/jobs):
 *   subscription-expiry        → expireSubscriptionsAndRemind()   (expire + 7/3/1-day reminders + school code alias cleanup)
 *   settlement-calculation     → calculateSettlements()           (previous period of the active rule, both partner types)
 *   analytics-daily-rollup     → rollupDailyAnalytics(day?)       (00:30, persists yesterday into the rollup table)
 *   incentive-rule-activate    → activateScheduledRules()         (scheduled incentive versions whose effectiveFrom arrived)
 */
export { expireSubscriptionsAndRemind } from '../subscriptions/engine.js';
export { calculateSettlements } from '../settlements/service.js';
export { rollupDailyAnalytics } from '../analytics/metrics.js';
export { activateScheduledRules, activateScheduledRules as activateScheduledIncentiveRules } from '../incentives/service.js';
