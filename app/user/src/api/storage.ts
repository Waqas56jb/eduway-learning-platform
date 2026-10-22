import { post } from './client';
import type { SignedUploadDto, UploadPurpose } from './types';

// STO-01 + direct PUT to storage. Returns the opaque `fileKey` to hand to the owning endpoint.
export async function uploadFile(opts: {
  purpose: UploadPurpose;
  uri: string;
  fileName: string;
  contentType: string;
}): Promise<string> {
  const blob = await (await fetch(opts.uri)).blob();
  const signed = await post<SignedUploadDto>('/storage/signed-upload-url', {
    purpose: opts.purpose,
    fileName: opts.fileName,
    contentType: opts.contentType,
    sizeBytes: blob.size,
  });
  const res = await fetch(signed.uploadUrl, {
    method: signed.method,
    headers: { 'Content-Type': opts.contentType, ...signed.headers },
    body: blob,
  });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  return signed.fileKey;
}

// STO-02
export const signedDownloadUrl = (fileKey: string) =>
  post<{ url: string; expiresAt: string }>('/storage/signed-download-url', { fileKey });
