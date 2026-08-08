import type { PresignedPost } from './contracts';

export type { PresignedPost } from './contracts';

export class MediaUploadError extends Error {
  readonly code = 'MEDIA_UPLOAD_FAILED';

  constructor() {
    super('The image upload failed.');
    this.name = 'MediaUploadError';
  }
}

export async function uploadPresignedPost(
  presign: PresignedPost,
  file: File,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const body = new FormData();
  for (const [name, value] of Object.entries(presign.fields)) {
    body.append(name, value);
  }
  body.append('file', file);

  try {
    const response = await fetchImpl(presign.url, {
      method: 'POST',
      body,
      credentials: 'omit',
    });
    if (!response.ok) throw new MediaUploadError();
  } catch {
    throw new MediaUploadError();
  }
}
