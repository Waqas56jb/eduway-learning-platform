import { videos } from '@/data/videos';
import { createCollection } from './createCollection';

export const useVideos = createCollection('video', videos, (v) => v.assetId);
