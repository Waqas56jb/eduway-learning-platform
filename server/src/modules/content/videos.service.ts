/**
 * Admin video library (ADM-VID-*). Uploads arrive via STO-01 (signed URL) → ADM-VID-01 registers the asset.
 * No external transcoder is configured: storage MP4 uploads are served progressively, so "processing" completes
 * on the first status poll after the object is confirmed (`finalizeProcessing`). A real transcoder / WHK-02
 * callback can call `markVideoProcessed()` instead. CDN re-sync is a passthrough (pending → synced).
 */
import { randomUUID } from 'node:crypto';
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { ConflictError, NotFoundError } from '../../common/errors/index.js';
import { storage } from '../../common/services/storage.js';
import { orderBy } from '../../common/utils/pagination.js';
import { sqlSearch } from '../learning-core/index.js';
import type { VideoAssetDto } from './types.js';

interface VideoListRow {
  id: string;
  asset_ref: string;
  lesson_id: string | null;
  file_name: string | null;
  size_bytes: number;
  duration_sec: number;
  stream_status: string;
  cdn_status: 'synced' | 'pending' | 'error';
  processing_progress: number | null;
  error: string | null;
  views: number;
  replays: number;
  resolution: string | null;
  renditions: string[];
  uploaded_at: Date;
  l_title_en: string | null;
  l_title_ar: string | null;
  s_id: string | null;
  s_slug: string | null;
  s_name_en: string | null;
  s_name_ar: string | null;
  s_color: string | null;
}

const SELECT = `v.id, v.asset_ref, COALESCE(v.lesson_id, l.id) AS lesson_id, v.file_name, v.size_bytes, v.duration_sec, v.stream_status, v.cdn_status,
  v.processing_progress, v.error, v.views, v.replays, v.resolution, v.renditions, v.uploaded_at,
  l.title_en AS l_title_en, l.title_ar AS l_title_ar, s.id AS s_id, s.slug AS s_slug, s.name_en AS s_name_en, s.name_ar AS s_name_ar, s.color AS s_color`;
const FROM = `${T.video_assets} v
  LEFT JOIN ${T.lessons} l ON l.id = COALESCE(v.lesson_id, (SELECT l2.id FROM ${T.lessons} l2 WHERE l2.video_asset_id = v.id LIMIT 1))
  LEFT JOIN ${T.subjects} s ON s.id = l.subject_id`;
const SORT = { views: 'v.views', replays: 'v.replays', sizeMb: 'v.size_bytes', durationSec: 'v.duration_sec', uploadedAt: 'v.uploaded_at' };

export interface VideoFilter {
  q?: string;
  subjectId?: string;
  streamStatus?: string;
  cdnStatus?: string;
  ids?: string[];
}

function whereOf(f: VideoFilter, params: unknown[]) {
  const conds = ['v.detached_at IS NULL'];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    conds.push(sql.replace('$?', `$${params.length}`));
  };
  if (f.subjectId) add('s.id = $?', f.subjectId);
  if (f.streamStatus) add(`(CASE WHEN v.stream_status = 'uploading' THEN 'processing' ELSE v.stream_status END) = $?`, f.streamStatus);
  if (f.cdnStatus) add('v.cdn_status = $?', f.cdnStatus);
  if (f.ids) add('v.id = ANY($?::uuid[])', f.ids);
  const s = sqlSearch(f.q, ['v.asset_ref', 'l.title_en', 'l.title_ar', 'v.file_name'], params);
  if (s) conds.push(s);
  return conds.join(' AND ');
}

const toDto = (r: VideoListRow): VideoAssetDto => ({
  id: r.id,
  assetId: r.asset_ref,
  lessonId: r.lesson_id ?? '',
  lesson: {
    id: r.lesson_id ?? '',
    title: { en: r.l_title_en ?? '', ar: r.l_title_ar ?? '' },
    subject: { id: r.s_id ?? '', slug: r.s_slug ?? '', name: { en: r.s_name_en ?? '', ar: r.s_name_ar ?? '' }, color: r.s_color ?? '' },
  },
  fileName: r.file_name,
  sizeMb: Math.round((Number(r.size_bytes) / 1048576) * 10) / 10,
  durationSec: r.duration_sec,
  streamStatus: (r.stream_status === 'ready' || r.stream_status === 'failed' ? r.stream_status : 'processing') as VideoAssetDto['streamStatus'],
  cdnStatus: r.cdn_status,
  processingProgress: r.stream_status === 'processing' || r.stream_status === 'uploading' ? (r.processing_progress ?? 0) : null,
  error: r.error,
  views: r.views,
  replays: r.replays,
  resolution: (r.resolution === '1080p' || r.resolution === '4K' ? r.resolution : '720p') as VideoAssetDto['resolution'],
  renditions: r.renditions ?? [],
  uploadedAt: r.uploaded_at.toISOString(),
});

/** Passthrough "transcoding": a confirmed storage object becomes ready; pending CDN syncs complete. */
async function finalizeProcessing(ids?: string[]) {
  const params: unknown[] = [];
  const scope = ids ? (params.push(ids), `AND id = ANY($1::uuid[])`) : '';
  await db.query(
    `UPDATE ${T.video_assets} SET stream_status = 'ready', processing_progress = 100, cdn_status = 'synced', error = NULL,
            renditions = CASE WHEN cardinality(renditions) = 0 THEN ARRAY[COALESCE(resolution, '720p')] ELSE renditions END
      WHERE stream_status IN ('processing', 'uploading') AND updated_at < now() - interval '3 seconds' ${scope}`,
    params,
  );
  await db.query(`UPDATE ${T.video_assets} SET cdn_status = 'synced' WHERE cdn_status = 'pending' AND stream_status = 'ready' AND updated_at < now() - interval '3 seconds' ${scope}`, params);
}

export const videosService = {
  async list(f: VideoFilter, sort: string | undefined, limit: number, offset: number) {
    await finalizeProcessing();
    const params: unknown[] = [];
    const w = whereOf(f, params);
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${FROM} WHERE ${w}`, params)) ?? 0;
    params.push(limit, offset);
    const rows = await db.many<VideoListRow>(`SELECT ${SELECT} FROM ${FROM} WHERE ${w} ORDER BY ${orderBy(sort, SORT, '-views')}, v.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { items: rows.map(toDto), total };
  },

  async get(id: string): Promise<VideoAssetDto> {
    await finalizeProcessing([id]);
    const r = await db.maybeOne<VideoListRow>(`SELECT ${SELECT} FROM ${FROM} WHERE v.id = $1`, [id]);
    if (!r) throw new NotFoundError('video');
    return toDto(r);
  },

  async stats() {
    const r = await db.one<{ count: number; bytes: number; views: number; replays: number; ready: number; issues: number }>(
      `SELECT count(*)::int AS count, COALESCE(sum(size_bytes), 0)::bigint AS bytes, COALESCE(sum(views), 0)::int AS views, COALESCE(sum(replays), 0)::int AS replays,
              count(*) FILTER (WHERE stream_status = 'ready')::int AS ready,
              count(*) FILTER (WHERE stream_status = 'failed' OR cdn_status = 'error')::int AS issues
         FROM ${T.video_assets} WHERE detached_at IS NULL`,
    );
    return {
      count: r.count,
      totalStorageMb: Math.round((Number(r.bytes) / 1048576) * 10) / 10,
      totalViews: r.views,
      totalReplays: r.replays,
      ready: r.ready,
      readyPct: r.count ? Math.round((r.ready / r.count) * 1000) / 10 : 0,
      issues: r.issues,
    };
  },

  async register(b: { lessonId: string; fileKey: string; replace?: boolean }, adminId: string) {
    const lesson = await db.maybeOne<{ id: string; video_asset_id: string | null; duration_sec: number }>(`SELECT id, video_asset_id, duration_sec FROM ${T.lessons} WHERE id = $1 AND deleted_at IS NULL`, [b.lessonId]);
    if (!lesson) throw new NotFoundError('lesson');
    if (lesson.video_asset_id && !b.replace) throw new ConflictError('ALREADY_EXISTS', { videoId: lesson.video_asset_id });
    const id = randomUUID();
    await tx(async (c) => {
      const up = await storage.attachUpload(b.fileKey, { purpose: 'lesson_video', entityType: 'video', entityId: id }, c);
      await db.query(
        `INSERT INTO ${T.video_assets} (id, asset_ref, provider, storage_bucket, storage_path, size_bytes, duration_sec, resolution, stream_status, cdn_status,
                                        uploaded_by, lesson_id, file_name, processing_progress)
         VALUES ($1,$2,'storage',$3,$4,$5,$6,'720p','processing','pending',$7,$8,$9,0)`,
        [id, `vid_${id.slice(0, 12)}`, up.bucket, up.path, up.size_bytes, lesson.duration_sec, adminId, lesson.id, up.file_name],
        c,
      );
      if (lesson.video_asset_id) await db.query(`UPDATE ${T.video_assets} SET detached_at = now() WHERE id = $1`, [lesson.video_asset_id], c);
      await db.query(`UPDATE ${T.lessons} SET video_asset_id = $2 WHERE id = $1`, [lesson.id, id], c);
    });
    return this.get(id);
  },

  async cdnResync(ids: string[]) {
    const rows = await db.many<{ id: string }>(`UPDATE ${T.video_assets} SET cdn_status = 'pending' WHERE id = ANY($1::uuid[]) AND detached_at IS NULL RETURNING id`, [ids]);
    const ok = new Set(rows.map((r) => r.id));
    return { succeeded: [...ok], failed: ids.filter((i) => !ok.has(i)).map((id) => ({ id, code: 'NOT_FOUND', message: 'video not found' })) };
  },

  async reprocess(id: string) {
    const n = await db.exec(`UPDATE ${T.video_assets} SET stream_status = 'processing', processing_progress = 0, error = NULL WHERE id = $1`, [id]);
    if (!n) throw new NotFoundError('video');
    const r = await db.maybeOne<VideoListRow>(`SELECT ${SELECT} FROM ${FROM} WHERE v.id = $1`, [id]);
    return toDto(r as VideoListRow);
  },

  /** ADM-VID-08: detach (asset kept 30 days — purge is a maintenance concern). */
  async detach(lessonId: string) {
    const l = await db.maybeOne<{ video_asset_id: string | null }>(`SELECT video_asset_id FROM ${T.lessons} WHERE id = $1 AND deleted_at IS NULL`, [lessonId]);
    if (!l) throw new NotFoundError('lesson');
    await tx(async (c) => {
      await db.query(`UPDATE ${T.lessons} SET video_asset_id = NULL WHERE id = $1`, [lessonId], c);
      if (l.video_asset_id) await db.query(`UPDATE ${T.video_assets} SET detached_at = now() WHERE id = $1`, [l.video_asset_id], c);
    });
  },
};

/** Provider callback hook (WHK-02 / video-processing job): update processing state of an asset by id or asset ref. */
export async function markVideoProcessed(assetIdOrRef: string, r: { status: 'ready' | 'failed' | 'processing'; progress?: number; durationSec?: number; renditions?: string[]; hlsPath?: string; error?: string }) {
  await db.query(
    `UPDATE ${T.video_assets} SET stream_status = $2, processing_progress = COALESCE($3, processing_progress), duration_sec = COALESCE($4, duration_sec),
            renditions = COALESCE($5, renditions), hls_path = COALESCE($6, hls_path), error = $7
      WHERE id::text = $1 OR asset_ref = $1`,
    [assetIdOrRef, r.status, r.progress ?? null, r.durationSec ?? null, r.renditions ?? null, r.hlsPath ?? null, r.error ?? null],
  );
}

/**
 * Job hook (`video-processing-callback`, data `{ provider, payload }`): applies a transcoder / CDN callback.
 * Accepted payload keys: assetId | assetRef | id, status ('ready'|'failed'|'processing'), progress, durationSec,
 * renditions, hlsPath, error.
 */
export async function processVideoCallback(data: { provider?: string; payload?: Record<string, unknown> } = {}): Promise<boolean> {
  const p = data.payload ?? {};
  const ref = String(p.assetId ?? p.assetRef ?? p.id ?? '');
  const status = p.status === 'ready' || p.status === 'failed' || p.status === 'processing' ? p.status : null;
  if (!ref || !status) return false;
  await markVideoProcessed(ref, {
    status,
    progress: typeof p.progress === 'number' ? p.progress : undefined,
    durationSec: typeof p.durationSec === 'number' ? p.durationSec : undefined,
    renditions: Array.isArray(p.renditions) ? p.renditions.map(String) : undefined,
    hlsPath: typeof p.hlsPath === 'string' ? p.hlsPath : undefined,
    error: typeof p.error === 'string' ? p.error : undefined,
  });
  return true;
}
