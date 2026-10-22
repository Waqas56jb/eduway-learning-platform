/**
 * Multipart uploads held in memory (small files only: CSV/XLSX imports, images). Large media (videos)
 * go straight to Supabase Storage through signed upload URLs (see modules/storage).
 *   route({ ..., middleware: [uploadSingle('file', { maxMb: 10, mimeTypes: ['text/csv'] })] })
 */
import type { Request } from 'express';
import multer from 'multer';
import { AppError } from '../errors/index.js';

export interface UploadOptions {
  maxMb?: number;
  mimeTypes?: string[];
}

export function uploadSingle(field: string, opts: UploadOptions = {}) {
  const maxMb = opts.maxMb ?? 10;
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (_req: Request, file, cb) => {
      if (opts.mimeTypes && !opts.mimeTypes.includes(file.mimetype)) {
        cb(new AppError('VALIDATION_ERROR', 415, { reason: 'FILE_TYPE_NOT_ALLOWED', details: { allowed: opts.mimeTypes, got: file.mimetype } }));
        return;
      }
      cb(null, true);
    },
  }).single(field);
}

export const MIME = {
  csv: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  images: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  pdf: ['application/pdf'],
} as const;
