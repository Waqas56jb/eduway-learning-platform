import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { processWebhook, applyWebhookEvent } from './webhook.service.js';
export { computeQuote, prorationCredit } from './pricing.js';
export { getProvider, mockGateway, signMock } from './providers.js';
export { buildReceipt, renderReceiptPdf } from './receipt.js';

export const paymentsModule: ModuleDefinition = { name: 'payments', router };
