/** Notification jobs: delivery dispatch (+ retry sweep), scheduled campaigns, Expo push receipts. */
import { logger } from '../config/logger.js';
import { campaignsService } from '../modules/notifications/service.js';
import { checkPushReceipts, dispatchQueued } from '../modules/notifications/dispatch.js';
import { registerJob } from './index.js';

registerJob<{ campaignId?: string; ids?: string[] }>({
  name: 'eduway.notification-dispatch',
  description: 'Send queued push/SMS/WhatsApp/email deliveries; cron sweep picks up retries.',
  cron: '*/2 * * * *',
  handler: async (data) => {
    await dispatchQueued({ campaignId: data.campaignId, ids: data.ids });
  },
});

registerJob({
  name: 'eduway.campaign-scheduled-send',
  description: 'Launch scheduled campaigns that are due.',
  cron: '* * * * *',
  handler: async () => {
    const n = await campaignsService.sendDue();
    if (n) logger.info({ campaigns: n }, 'scheduled campaigns launched');
  },
});

registerJob({
  name: 'eduway.expo-push-receipts',
  description: 'Resolve Expo push tickets into delivered/failed and revoke dead tokens.',
  cron: '*/15 * * * *',
  handler: async () => {
    await checkPushReceipts();
  },
});
