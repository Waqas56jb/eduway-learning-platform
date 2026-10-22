import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { storage, UPLOAD_PURPOSES } from '../../common/services/storage.js';
import { fileKey } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

export const router = Router();
const tags = ['Storage'];

const signedUploadBody = z.object({
  purpose: z.enum(UPLOAD_PURPOSES),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().min(3).max(120),
  sizeBytes: z.number().int().positive(),
});

const signedUploadDto = z.object({
  uploadUrl: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string()),
  fileKey: z.string(),
  expiresAt: z.string(),
  tusEndpoint: z.string().nullable(),
});

defineRoute(
  router,
  { method: 'post', path: '/storage/signed-upload-url', tags, summary: 'Signed upload URL for a prefixed bucket (STO-01)', auth: 'any', rateLimit: rateLimits.upload, body: signedUploadBody, response: signedUploadDto },
  ({ body, student, admin }) => storage.createSignedUpload(body, { student, admin }),
);

defineRoute(
  router,
  { method: 'post', path: '/storage/signed-download-url', tags, summary: 'Re-sign a file by fileKey (STO-02)', auth: 'any', body: z.object({ fileKey }), response: z.object({ url: z.string(), expiresAt: z.string() }) },
  ({ body, student, admin }) => storage.signedUrlForFileKey(body.fileKey, { student, admin }),
);
