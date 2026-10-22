import { post } from './client';
import type { SignedUploadDto, UploadPurpose } from './types';

/** Signed-URL uploads (STO-01): request URL → PUT bytes straight to storage → hand `fileKey` to the owning endpoint. */
export const storageApi = {
  signedUploadUrl: (body: { purpose: UploadPurpose; fileName: string; contentType: string; sizeBytes: number }) =>
    post<SignedUploadDto>('/storage/signed-upload-url', body),
};

export async function uploadFile(file: File, purpose: UploadPurpose, onProgress?: (pct: number) => void): Promise<string> {
  const signed = await storageApi.signedUploadUrl({
    purpose,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(signed.method || 'PUT', signed.uploadUrl);
    for (const [k, v] of Object.entries(signed.headers ?? {})) xhr.setRequestHeader(k, v);
    if (!signed.headers?.['Content-Type'] && !signed.headers?.['content-type']) xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('upload failed'));
    xhr.send(file);
  });
  return signed.fileKey;
}
