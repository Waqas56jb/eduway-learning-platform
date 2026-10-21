import type { VideoAsset } from '@/types';
import { createRng, daysAgo } from '@/utils/random';
import { lessons } from './curriculum';

const rng = createRng(3131);

/** One encoded asset per lesson that has a video in the pipeline. */
export const videos: VideoAsset[] = lessons
  .filter((l) => l.videoState === 'ready' || l.videoState === 'processing')
  .map((l, i) => {
    const processing = l.videoState === 'processing';
    const resolution = rng.weighted<VideoAsset['resolution']>([['1080p', 7], ['720p', 2], ['4K', 1]]);
    const mbPerMin = resolution === '4K' ? 95 : resolution === '1080p' ? 42 : 24;
    const published = l.status === 'published';
    const views = published ? l.views : rng.int(0, 40);
    return {
      id: `vid_${String(i + 1).padStart(3, '0')}`,
      assetId: `vod-${l.subjectId.slice(4)}-${(48211 + i * 97).toString(36)}`,
      lessonId: l.id,
      sizeMb: Math.round((l.durationSec / 60) * mbPerMin * (0.9 + rng.next() * 0.2)),
      durationSec: l.durationSec,
      streamStatus: processing ? 'processing' : rng.bool(0.04) ? 'failed' : 'ready',
      cdnStatus: processing ? 'pending' : rng.weighted<VideoAsset['cdnStatus']>([['synced', 18], ['pending', 1], ['error', 1]]),
      views,
      replays: Math.round(views * (0.18 + rng.next() * 0.35)),
      resolution,
      uploadedAt: daysAgo(rng.int(3, 120)),
    };
  });
