import { describe, expect, it, vi } from 'vitest';
import {
  MediaUploadError,
  uploadPresignedPost,
  type PresignedPost,
} from './mediaUpload';

const presign: PresignedPost = {
  url: 'https://media.example.test/upload',
  fields: {
    key: 'items/seller/item-1/image.png',
    Policy: 'signed-policy',
    'X-Amz-Credential': 'scoped-credential',
    'Content-Type': 'image/png',
  },
  objectKey: 'items/seller/item-1/image.png',
  expiresIn: 300,
};

describe('uploadPresignedPost', () => {
  it('copies every signed field and uploads with no auth headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 204,
    } as Response);
    const file = new File(['pixels'], 'print.png', { type: 'image/png' });

    await uploadPresignedPost(presign, file, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(presign.url);
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit' });
    expect(init).not.toHaveProperty('headers');
    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    for (const [name, value] of Object.entries(presign.fields)) {
      expect(body.get(name)).toBe(value);
    }
    expect(body.get('file')).toBe(file);
  });

  it('returns a sanitized typed error and never logs signed values', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 403,
    } as Response);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = await uploadPresignedPost(
      presign,
      new File(['pixels'], 'print.png', { type: 'image/png' }),
      fetchImpl,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MediaUploadError);
    expect(error).toMatchObject({
      code: 'MEDIA_UPLOAD_FAILED',
      message: 'The image upload failed.',
    });
    expect(String(error)).not.toContain(presign.url);
    expect(String(error)).not.toContain('signed-policy');
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
