/**
 * Every job module (side-effect registration via registerJob). Queues live in schema `eduway_platform_pgboss`.
 *   maintenance.ts    — auth data purge (foundation)
 *   notifications.ts  — notification-dispatch, campaign-scheduled-send, expo-push-receipts
 *   ai.ts             — ai-allowance-reset, embeddings-generate
 *   platform.ts       — subscription-expiry, exam-auto-submit, analytics-daily-rollup, settlement-calculation,
 *                       question-import, video-processing-callback, lesson-publish-scheduled, incentive-rule-activate
 *                       (domain functions resolved lazily from their modules — see hooks.ts)
 */
import './maintenance.js';
import './notifications.js';
import './ai.js';
import './platform.js';
