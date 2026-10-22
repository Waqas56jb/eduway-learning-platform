/* Signed-URL uploads (contract §16): STO-01 → PUT bytes with progress → hand `fileKey` to the owning endpoint. */
import axios from 'axios';
import { useState } from 'react';
import { api, ApiError, toastError } from './client';
import type { FileKey, SignedUploadDto, UploadPurpose } from './types';
import i18n from '@/i18n';

export interface UploadResult {
  fileKey: FileKey;
  name: string;
  sizeBytes: number;
  mimeType: string;
}

export const storageApi = {
  signedUploadUrl: (body: { purpose: UploadPurpose; fileName: string; contentType: string; sizeBytes: number }) =>
    api.post<SignedUploadDto>('/storage/signed-upload-url', body),
  signedDownloadUrl: (fileKey: FileKey) => api.post<{ url: string; expiresAt: string }>('/storage/signed-download-url', { fileKey }),
};

/** Upload one file; `onProgress` receives 0–100. Abort with `signal`. */
export async function uploadFile(
  file: File,
  purpose: UploadPurpose,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const contentType = file.type || guessType(file.name);
  const signed = await storageApi.signedUploadUrl({ purpose, fileName: file.name, contentType, sizeBytes: file.size });
  try {
    await axios.request({
      url: signed.uploadUrl,
      method: signed.method ?? 'PUT',
      data: file,
      headers: { 'Content-Type': contentType, ...(signed.headers ?? {}) },
      signal,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      },
    });
  } catch (e) {
    if (axios.isCancel(e)) throw new ApiError('CANCELLED', i18n.t('api.uploadCancelled'), 0);
    throw new ApiError('UPLOAD_FAILED', i18n.t('api.uploadFailed'), 0);
  }
  onProgress?.(100);
  return { fileKey: signed.fileKey, name: file.name, sizeBytes: file.size, mimeType: contentType };
}

function guessType(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pdf: 'application/pdf',
    vtt: 'text/vtt',
    srt: 'application/x-subrip',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return (ext && map[ext]) || 'application/octet-stream';
}

/** Stateful upload with progress for components. */
export function useUpload(purpose: UploadPurpose) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const start = async (file: File): Promise<UploadResult | null> => {
    const c = new AbortController();
    setController(c);
    setError(null);
    setProgress(0);
    try {
      const r = await uploadFile(file, purpose, setProgress, c.signal);
      return r;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('UPLOAD_FAILED', i18n.t('api.uploadFailed'));
      setError(err);
      if (err.code !== 'CANCELLED') toastError(err);
      setProgress(null);
      return null;
    } finally {
      setController(null);
    }
  };
  return {
    start,
    progress,
    uploading: controller !== null,
    error,
    cancel: () => controller?.abort(),
    reset: () => {
      setProgress(null);
      setError(null);
    },
  };
}
