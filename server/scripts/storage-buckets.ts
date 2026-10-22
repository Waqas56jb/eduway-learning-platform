/**
 * npm run buckets — creates the 4 prefixed Storage buckets if missing (private, size + MIME limits).
 * Touches ONLY buckets named in BUCKETS (all `eduway-platform-*`); never lists/updates/deletes other buckets.
 */
import { BUCKETS, BUCKET_PREFIX, type BucketName } from '../src/config/constants.js';
import { supabaseService } from '../src/config/supabase.js';

const MB = 1024 * 1024;
const CONFIG: Record<BucketName, { fileSizeLimit: number; allowedMimeTypes: string[] }> = {
  [BUCKETS.thumbnails]: { fileSizeLimit: 5 * MB, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] },
  [BUCKETS.resources]: { fileSizeLimit: 50 * MB, allowedMimeTypes: ['application/pdf', 'text/vtt', 'application/x-subrip', 'text/plain', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', 'image/png', 'image/jpeg', 'image/webp'] },
  [BUCKETS.questionImages]: { fileSizeLimit: 5 * MB, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] },
  [BUCKETS.videos]: { fileSizeLimit: 5 * 1024 * MB, allowedMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'application/vnd.apple.mpegurl', 'video/mp2t'] },
};

async function main() {
  let failures = 0;
  for (const name of Object.values(BUCKETS)) {
    if (!name.startsWith(BUCKET_PREFIX)) throw new Error(`refusing to touch unprefixed bucket ${name}`);
    const existing = await supabaseService.storage.getBucket(name);
    if (!existing.error && existing.data) {
      console.log(`= ${name} exists (public: ${existing.data.public})`);
      continue;
    }
    const cfg = CONFIG[name];
    let { error } = await supabaseService.storage.createBucket(name, { public: false, fileSizeLimit: cfg.fileSizeLimit, allowedMimeTypes: cfg.allowedMimeTypes });
    if (error && /maximum allowed size|exceeded/i.test(error.message)) {
      // Plan-level object size cap is lower than ours — create without an explicit limit.
      ({ error } = await supabaseService.storage.createBucket(name, { public: false, allowedMimeTypes: cfg.allowedMimeTypes }));
    }
    if (error) {
      failures++;
      console.error(`✗ ${name}: ${error.message}`);
    } else console.log(`+ ${name} created (private)`);
  }
  if (failures) process.exitCode = 1;
}

void main();
