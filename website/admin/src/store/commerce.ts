import { promotions } from '@/data/promotions';
import { createCollection } from './createCollection';

export const usePromotions = createCollection('promotion', promotions, (p) => p.code);
