/**
 * Supabase Storage access — ONLY the prefixed buckets in BUCKETS (shared project).
 *
 * Upload flow (API_CONTRACT §16): `createSignedUpload()` registers an `eduway_platform_uploads` row and returns
 * a signed PUT URL + opaque `fileKey` ("upl_<uuid>"). The owning endpoint later calls
 * `attachUpload(fileKey, { purpose, entityType, entityId })`, which verifies the object exists and links it.
 * Read access: `signedUrl(bucket, path)` / `signedUrlForFileKey(fileKey)` — raw paths are never exposed.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { BUCKETS, T, isOurBucket, type BucketName, type PermissionKey } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { supabaseService } from '../../config/supabase.js';
import { AppError, BusinessRuleError, ForbiddenError, NotFoundError } from '../errors/index.js';
import { hasAnyPermission } from '../middleware/rbac.js';
import type { AdminPrincipal, StudentPrincipal } from '../types/index.js';

export const UPLOAD_PURPOSES = [
  'lesson_video', 'lesson_thumbnail', 'lesson_resource', 'lesson_captions', 'subject_image', 'question_image', 'question_import',
  'teacher_avatar', 'logo', 'admin_avatar', 'student_avatar', 'ai_attachment', 'reconciliation_import', 'testimonial_avatar',
] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

interface PurposeRule {
  bucket: BucketName;
  folder: string;
  maxBytes: number;
  types: RegExp;
  /** Admin permissions (any). Empty = any admin. */
  adminPerms?: PermissionKey[];
  student?: boolean;
  /** Any admin may upload for themselves (admin_avatar). */
  adminSelf?: boolean;
}

const MB = 1024 * 1024;
const IMG = /^image\/(png|jpeg|webp)$/;
/** Any raster image — never image/svg+xml (scriptable; SEC-14). */
const RASTER_IMG = /^image\/(png|jpeg|jpg|webp|gif|heic|heif|bmp)$/;
export const PURPOSE_RULES: Record<UploadPurpose, PurposeRule> = {
  lesson_video: { bucket: BUCKETS.videos, folder: 'lessons', maxBytes: 5 * 1024 * MB, types: /^video\//, adminPerms: ['content.edit', 'content.create'] },
  lesson_thumbnail: { bucket: BUCKETS.thumbnails, folder: 'lessons', maxBytes: 5 * MB, types: IMG, adminPerms: ['content.edit', 'content.create'] },
  subject_image: { bucket: BUCKETS.thumbnails, folder: 'subjects', maxBytes: 5 * MB, types: IMG, adminPerms: ['content.edit', 'content.create'] },
  teacher_avatar: { bucket: BUCKETS.thumbnails, folder: 'teachers', maxBytes: 5 * MB, types: IMG, adminPerms: ['content.edit', 'content.create'] },
  testimonial_avatar: { bucket: BUCKETS.thumbnails, folder: 'cms', maxBytes: 5 * MB, types: IMG, adminPerms: ['settings.edit'] },
  logo: { bucket: BUCKETS.thumbnails, folder: 'branding', maxBytes: 2 * MB, types: /^image\/(png|jpeg|webp|svg\+xml)$/, adminPerms: ['settings.edit'] },
  admin_avatar: { bucket: BUCKETS.thumbnails, folder: 'admins', maxBytes: 5 * MB, types: IMG, adminSelf: true },
  student_avatar: { bucket: BUCKETS.thumbnails, folder: 'avatars', maxBytes: 5 * MB, types: RASTER_IMG, student: true },
  lesson_resource: { bucket: BUCKETS.resources, folder: 'lessons', maxBytes: 50 * MB, types: /^application\/pdf$/, adminPerms: ['content.edit', 'content.create'] },
  lesson_captions: { bucket: BUCKETS.resources, folder: 'captions', maxBytes: 2 * MB, types: /^(text\/vtt|application\/x-subrip|text\/plain)$/, adminPerms: ['content.edit'] },
  ai_attachment: { bucket: BUCKETS.resources, folder: 'ai', maxBytes: 8 * MB, types: RASTER_IMG, student: true },
  question_image: { bucket: BUCKETS.questionImages, folder: 'questions', maxBytes: 5 * MB, types: /^image\//, adminPerms: ['questions.create', 'questions.edit'] },
  question_import: { bucket: BUCKETS.resources, folder: 'imports', maxBytes: 10 * MB, types: /^(text\/csv|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/plain|application\/octet-stream)$/, adminPerms: ['questions.create'] },
  reconciliation_import: { bucket: BUCKETS.resources, folder: 'reconciliation', maxBytes: 20 * MB, types: /^(text\/csv|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/plain|application\/octet-stream)$/, adminPerms: ['payments.approve'] },
};

export interface UploadRow {
  id: string;
  file_key: string;
  purpose: UploadPurpose;
  bucket: BucketName;
  path: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  owner_id: string | null;
  owner_kind: 'student' | 'admin' | null;
  status: 'pending' | 'uploaded' | 'attached' | 'deleted';
  entity_type: string | null;
  entity_id: string | null;
}

function assertBucket(bucket: string): asserts bucket is BucketName {
  if (!isOurBucket(bucket)) throw new ForbiddenError(undefined, { bucket: 'not allowed' });
}

function assertPurposeAllowed(rule: PurposeRule, who: { student?: StudentPrincipal; admin?: AdminPrincipal }): void {
  if (who.student) {
    if (!rule.student) throw new ForbiddenError();
    return;
  }
  if (who.admin) {
    if (rule.student && !rule.adminPerms) throw new ForbiddenError();
    if (rule.adminSelf) return;
    if (rule.adminPerms && !hasAnyPermission(who.admin, rule.adminPerms)) throw new ForbiddenError(undefined, { permission: rule.adminPerms[0] });
    return;
  }
  throw new ForbiddenError();
}

const safeName = (name: string) =>
  path
    .basename(name)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80) || 'file';

export const storage = {
  rules: PURPOSE_RULES,

  async createSignedUpload(
    input: { purpose: UploadPurpose; fileName: string; contentType: string; sizeBytes: number },
    who: { student?: StudentPrincipal; admin?: AdminPrincipal },
  ) {
    const rule = PURPOSE_RULES[input.purpose];
    assertPurposeAllowed(rule, who);
    if (!rule.types.test(input.contentType)) throw new AppError('VALIDATION_ERROR', 400, { reason: 'FILE_TYPE_NOT_ALLOWED', details: { contentType: input.contentType } });
    if (input.sizeBytes > rule.maxBytes) throw new AppError('VALIDATION_ERROR', 400, { reason: 'FILE_TOO_LARGE', details: { maxMb: Math.round(rule.maxBytes / MB) } });
    assertBucket(rule.bucket);

    const id = randomUUID();
    const now = new Date();
    const objectPath = `${rule.folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}-${safeName(input.fileName)}`;
    const { data, error } = await supabaseService.storage.from(rule.bucket).createSignedUploadUrl(objectPath);
    if (error || !data) {
      logger.error({ err: error?.message, bucket: rule.bucket }, 'createSignedUploadUrl failed');
      throw new AppError('INTERNAL', 502, { reason: 'STORAGE_ERROR' });
    }
    const fileKey = `upl_${id}`;
    const owner = who.student?.userId ?? who.admin?.userId ?? null;
    await db.query(
      `INSERT INTO ${T.uploads} (id, file_key, purpose, bucket, path, file_name, content_type, size_bytes, owner_id, owner_kind, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + interval '2 hours')`,
      [id, fileKey, input.purpose, rule.bucket, objectPath, input.fileName.slice(0, 200), input.contentType, input.sizeBytes, owner, who.student ? 'student' : 'admin'],
    );
    return {
      uploadUrl: data.signedUrl,
      method: 'PUT' as const,
      headers: { 'Content-Type': input.contentType, 'x-upsert': 'false' },
      fileKey,
      expiresAt: new Date(now.getTime() + 2 * 3600_000).toISOString(),
      tusEndpoint: input.purpose === 'lesson_video' ? `${env.SUPABASE_URL}/storage/v1/upload/resumable` : null,
    };
  },

  async getUpload(fileKey: string, ex?: Executor): Promise<UploadRow> {
    const row = await db.maybeOne<UploadRow>(`SELECT * FROM ${T.uploads} WHERE file_key = $1 AND status <> 'deleted'`, [fileKey], ex);
    if (!row) throw new NotFoundError('file');
    assertBucket(row.bucket);
    return row;
  },

  /** True when the object exists in its bucket. */
  /** Stored object metadata (size / MIME as recorded by Supabase Storage), or null when the object is missing. */
  async objectMeta(bucket: BucketName, objectPath: string): Promise<{ size: number | null; mimetype: string | null } | null> {
    assertBucket(bucket);
    const dir = path.posix.dirname(objectPath);
    const base = path.posix.basename(objectPath);
    const { data, error } = await supabaseService.storage.from(bucket).list(dir, { search: base, limit: 5 });
    if (error) return null;
    const o = (data ?? []).find((x) => x.name === base);
    if (!o) return null;
    const m = (o.metadata ?? {}) as { size?: unknown; mimetype?: unknown };
    return { size: typeof m.size === 'number' ? m.size : null, mimetype: typeof m.mimetype === 'string' ? m.mimetype : null };
  },

  async objectExists(bucket: BucketName, objectPath: string): Promise<boolean> {
    assertBucket(bucket);
    const dir = path.posix.dirname(objectPath);
    const base = path.posix.basename(objectPath);
    const { data, error } = await supabaseService.storage.from(bucket).list(dir, { search: base, limit: 5 });
    if (error) return false;
    return (data ?? []).some((o) => o.name === base);
  },

  /**
   * Link an uploaded file to its entity (verifies purpose, ownership and that the bytes were uploaded).
   * Returns the upload row (bucket/path for storing on the entity).
   */
  async attachUpload(fileKey: string, opts: { purpose: UploadPurpose | UploadPurpose[]; entityType: string; entityId: string; ownerId?: string; skipExistsCheck?: boolean }, ex?: Executor): Promise<UploadRow> {
    const row = await this.getUpload(fileKey, ex);
    const purposes = Array.isArray(opts.purpose) ? opts.purpose : [opts.purpose];
    if (!purposes.includes(row.purpose)) throw new AppError('VALIDATION_ERROR', 400, { reason: 'FILE_TYPE_NOT_ALLOWED', details: { purpose: row.purpose } });
    if (opts.ownerId && row.owner_id && row.owner_id !== opts.ownerId) throw new ForbiddenError();
    if (!opts.skipExistsCheck && row.status === 'pending') {
      const meta = await this.objectMeta(row.bucket, row.path);
      if (!meta) throw new BusinessRuleError('FILE_NOT_UPLOADED');
      // SEC-14: the signed PUT URL does not bind size/type — check what was actually stored against the purpose rule.
      const rule = PURPOSE_RULES[row.purpose];
      if (rule && meta.size !== null && meta.size > rule.maxBytes) {
        throw new AppError('VALIDATION_ERROR', 400, { reason: 'FILE_TOO_LARGE', details: { maxMb: Math.round(rule.maxBytes / MB) } });
      }
      // MIME is enforced for student (untrusted) purposes; resumable admin uploads may be stored as octet-stream.
      if (rule?.student && meta.mimetype && !rule.types.test(meta.mimetype)) {
        throw new AppError('VALIDATION_ERROR', 400, { reason: 'FILE_TYPE_NOT_ALLOWED', details: { contentType: meta.mimetype } });
      }
    }
    await db.query(
      `UPDATE ${T.uploads} SET status = 'attached', entity_type = $2, entity_id = $3, attached_at = now(), uploaded_at = COALESCE(uploaded_at, now()) WHERE id = $1`,
      [row.id, opts.entityType, opts.entityId],
      ex,
    );
    return row;
  },

  async signedUrl(bucket: string, objectPath: string, ttlSec = env.SIGNED_URL_TTL_SEC, download?: string): Promise<{ url: string; expiresAt: string }> {
    assertBucket(bucket);
    const { data, error } = await supabaseService.storage.from(bucket).createSignedUrl(objectPath, ttlSec, download ? { download } : undefined);
    if (error || !data) {
      logger.error({ err: error?.message, bucket }, 'createSignedUrl failed');
      throw new AppError('INTERNAL', 502, { reason: 'STORAGE_ERROR' });
    }
    return { url: data.signedUrl, expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString() };
  },

  /** Signed URL for a stored reference that is either an external URL or `bucket/path` ("storage://bucket/path"). */
  async resolveUrl(ref: string | null | undefined, ttlSec = env.SIGNED_URL_TTL_SEC): Promise<string | null> {
    if (!ref) return null;
    const m = /^storage:\/\/([^/]+)\/(.+)$/.exec(ref);
    if (!m) return ref; // external/CDN URL (e.g. seeded Unsplash / archive.org assets)
    try {
      return (await this.signedUrl(m[1] as string, m[2] as string, ttlSec)).url;
    } catch {
      return null;
    }
  },

  /** Batch version of resolveUrl (one Storage call per bucket). Order preserved. */
  async resolveMany(refs: (string | null | undefined)[], ttlSec = env.SIGNED_URL_TTL_SEC): Promise<(string | null)[]> {
    const out: (string | null)[] = refs.map((r) => (r && !r.startsWith('storage://') ? r : null));
    const byBucket = new Map<string, { idx: number; path: string }[]>();
    refs.forEach((r, idx) => {
      const m = r ? /^storage:\/\/([^/]+)\/(.+)$/.exec(r) : null;
      if (m && isOurBucket(m[1] as string)) byBucket.set(m[1] as string, [...(byBucket.get(m[1] as string) ?? []), { idx, path: m[2] as string }]);
    });
    for (const [bucket, items] of byBucket) {
      const { data } = await supabaseService.storage.from(bucket).createSignedUrls(items.map((i) => i.path), ttlSec);
      items.forEach((it, k) => {
        out[it.idx] = data?.[k]?.signedUrl ?? null;
      });
    }
    return out;
  },

  /** `storage://bucket/path` reference stored in *_url columns for uploaded files. */
  ref(bucket: BucketName, objectPath: string): string {
    return `storage://${bucket}/${objectPath}`;
  },

  async signedUrlForFileKey(fileKey: string, who: { student?: StudentPrincipal; admin?: AdminPrincipal }) {
    const row = await this.getUpload(fileKey);
    const isOwner = row.owner_id && (row.owner_id === who.student?.userId || row.owner_id === who.admin?.userId);
    if (!isOwner) {
      if (who.student) throw new ForbiddenError();
      const rule = PURPOSE_RULES[row.purpose];
      if (who.admin && rule.adminPerms && !hasAnyPermission(who.admin, [...rule.adminPerms, ...rule.adminPerms.map((p) => p.replace(/\.\w+$/, '.view') as PermissionKey)])) {
        throw new ForbiddenError();
      }
    }
    return this.signedUrl(row.bucket, row.path);
  },
};
