import { campaigns, deliveryLog, templates } from '@/data/messaging';
import { createCollection } from './createCollection';

export const useTemplates = createCollection('notification_template', templates, (t) => t.name);
export const useCampaigns = createCollection('campaign', campaigns, (c) => c.name);
export const useDeliveryLog = createCollection('delivery', deliveryLog, (d) => d.id);
