import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from '../../../services/serverless/catalogApi';
import { ServerlessApiError } from '../../../services/serverless/contracts';
import type { PresignedPost } from '../../../services/serverless/mediaUpload';

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({ getIdToken: vi.fn(), logout: vi.fn() }),
}));

vi.mock('../../../config/runtime', () => ({
  runtimeConfig: {
    region: 'ap-southeast-1',
    userPoolId: 'pool',
    userPoolClientId: 'client',
    restApiUrl: 'https://rest.example.test',
    restApiKey: 'api-key',
    websocketUrl: 'wss://ws.example.test',
  },
}));

import AuctionItemEditorPage from './AuctionItemEditorPage';

function createApi() {
  return {
    listSessions: vi.fn(),
    getSession: vi.fn(),
    listItems: vi.fn(),
    getItem: vi.fn(),
    listMyBids: vi.fn(),
    createSession: vi.fn(),
    putRules: vi.fn(),
    listMySessions: vi.fn(),
    scheduleSession: vi.fn(),
    createItem: vi.fn(),
    presignItemImage: vi.fn(),
  } as unknown as CatalogApi;
}

const presign: PresignedPost = {
  url: 'https://media.example.test/upload',
  fields: { key: 'items/seller/item-1/image.png', Policy: 'signed-policy' },
  objectKey: 'items/seller/item-1/image.png',
  expiresIn: 300,
};

function renderCreate(api: CatalogApi, uploadMedia = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/auction-sessions/session-1/items/create']}>
      <Routes>
        <Route
          path="/auction-sessions/:sessionId/items/create"
          element={(
            <AuctionItemEditorPage
              catalogApi={api}
              uploadMedia={uploadMedia}
            />
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
  return uploadMedia;
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Tên vật phẩm'), 'Signed print');
  await user.type(screen.getByLabelText('Mô tả'), 'Numbered print');
  await user.type(screen.getByLabelText('Mã danh mục'), 'prints');
  await user.clear(screen.getByLabelText('Giá khởi điểm'));
  await user.type(screen.getByLabelText('Giá khởi điểm'), '100.00');
}

describe('AuctionItemEditorPage', () => {
  it('creates, presigns, then directly uploads the selected image', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createItem = vi.fn().mockResolvedValue({
      itemId: 'item-1',
      status: 'WAITING',
      version: 1,
    });
    api.presignItemImage = vi.fn().mockResolvedValue(presign);
    const uploadMedia = vi.fn().mockResolvedValue(undefined);
    renderCreate(api, uploadMedia);

    await fillForm(user);
    const file = new File(['pixels'], 'print.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Ảnh vật phẩm'), file);
    await user.click(screen.getByRole('button', { name: 'Tạo vật phẩm' }));

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(1));
    expect(api.createItem).toHaveBeenCalledWith('session-1', {
      name: 'Signed print',
      description: 'Numbered print',
      category_id: 'prints',
      sequence_number: 1,
      start_price: '100.00',
      duration_s: 90,
    });
    expect(api.presignItemImage).toHaveBeenCalledWith('item-1', {
      content_type: 'image/png',
      size_bytes: file.size,
    });
    expect(uploadMedia).toHaveBeenCalledWith(presign, file);
    expect(vi.mocked(api.createItem).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.presignItemImage).mock.invocationCallOrder[0]);
    expect(vi.mocked(api.presignItemImage).mock.invocationCallOrder[0])
      .toBeLessThan(uploadMedia.mock.invocationCallOrder[0]);
    expect(await screen.findByText(/vật phẩm và ảnh đã sẵn sàng/i)).toBeVisible();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('rejects invalid image metadata before any request', async () => {
    const user = userEvent.setup();
    const api = createApi();
    const uploadMedia = renderCreate(api);
    await fillForm(user);
    await user.upload(
      screen.getByLabelText('Ảnh vật phẩm'),
      new File(['data'], 'notes.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Tạo vật phẩm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/jpeg, png hoặc webp/i);
    expect(api.createItem).not.toHaveBeenCalled();
    expect(api.presignItemImage).not.toHaveBeenCalled();
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('retries the same presigned upload without creating or presigning again', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createItem = vi.fn().mockResolvedValue({
      itemId: 'item-1',
      status: 'WAITING',
      version: 1,
    });
    api.presignItemImage = vi.fn().mockResolvedValue(presign);
    const uploadMedia = vi.fn()
      .mockRejectedValueOnce(new Error('signed-policy-private'))
      .mockResolvedValueOnce(undefined);
    renderCreate(api, uploadMedia);
    await fillForm(user);
    await user.upload(
      screen.getByLabelText('Ảnh vật phẩm'),
      new File(['pixels'], 'print.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Tạo vật phẩm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/tải ảnh thất bại/i);
    expect(screen.queryByText(/signed-policy-private/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /thử tải ảnh lại/i }));

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(2));
    expect(api.createItem).toHaveBeenCalledTimes(1);
    expect(api.presignItemImage).toHaveBeenCalledTimes(1);
  });

  it('locks the selected file after an item has been created', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createItem = vi.fn().mockResolvedValue({
      itemId: 'item-1',
      status: 'WAITING',
      version: 1,
    });
    api.presignItemImage = vi.fn().mockResolvedValue(presign);
    const uploadMedia = vi.fn().mockRejectedValue(new Error('private upload error'));
    renderCreate(api, uploadMedia);
    await fillForm(user);
    await user.upload(
      screen.getByLabelText('Ảnh vật phẩm'),
      new File(['pixels'], 'print.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Tạo vật phẩm' }));

    await screen.findByRole('button', { name: /thử tải ảnh lại/i });
    expect(screen.getByLabelText('Ảnh vật phẩm')).toBeDisabled();
  });

  it('locks the selected file while item creation is in flight', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createItem = vi.fn().mockReturnValue(new Promise(() => undefined));
    renderCreate(api);
    await fillForm(user);
    await user.upload(
      screen.getByLabelText('Ảnh vật phẩm'),
      new File(['pixels'], 'print.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Tạo vật phẩm' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Ảnh vật phẩm')).toBeDisabled();
    });
    expect(screen.queryByRole('link', { name: 'Hủy' })).not.toBeInTheDocument();
    expect(screen.getByText('Hủy')).toHaveAttribute('aria-disabled', 'true');
  });

  it('locks retries when the create-item outcome is unknown', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createItem = vi.fn().mockRejectedValue(
      new ServerlessApiError(0, 'NETWORK_ERROR', 'The request could not be completed.'),
    );
    renderCreate(api);
    await fillForm(user);
    await user.upload(
      screen.getByLabelText('Ảnh vật phẩm'),
      new File(['pixels'], 'print.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Tạo vật phẩm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/kết quả tạo vật phẩm chưa xác định/i);
    const lockedButton = screen.getByRole('button', { name: /chờ xác minh/i });
    expect(lockedButton).toBeDisabled();
    await user.click(lockedButton);
    expect(api.createItem).toHaveBeenCalledTimes(1);
  });

  it('locks retries when the presign outcome is unknown', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createItem = vi.fn().mockResolvedValue({
      itemId: 'item-1',
      status: 'WAITING',
      version: 1,
    });
    api.presignItemImage = vi.fn().mockRejectedValue(
      new ServerlessApiError(502, 'INVALID_ENVELOPE', 'The server returned an invalid response.'),
    );
    renderCreate(api);
    await fillForm(user);
    await user.upload(
      screen.getByLabelText('Ảnh vật phẩm'),
      new File(['pixels'], 'print.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Tạo vật phẩm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/kết quả chuẩn bị ảnh chưa xác định/i);
    expect(screen.getByRole('button', { name: /chờ xác minh/i })).toBeDisabled();
    expect(api.createItem).toHaveBeenCalledTimes(1);
    expect(api.presignItemImage).toHaveBeenCalledTimes(1);
  });

  it('locks item metadata after create succeeds', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createItem = vi.fn().mockResolvedValue({
      itemId: 'item-1',
      status: 'WAITING',
      version: 1,
    });
    api.presignItemImage = vi.fn().mockRejectedValue(
      new ServerlessApiError(409, 'CONFLICT', 'Known conflict.'),
    );
    renderCreate(api);
    await fillForm(user);
    await user.upload(
      screen.getByLabelText('Ảnh vật phẩm'),
      new File(['pixels'], 'print.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Tạo vật phẩm' }));

    await screen.findByRole('alert');
    expect(screen.getByLabelText('Tên vật phẩm')).toBeDisabled();
    expect(screen.getByLabelText('Mô tả')).toBeDisabled();
    expect(screen.getByLabelText('Mã danh mục')).toBeDisabled();
    expect(screen.getByLabelText('Giá khởi điểm')).toBeDisabled();
  });

  it('does not consume another image slot after a presign expires', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const user = userEvent.setup();
    const api = createApi();
    api.createItem = vi.fn().mockResolvedValue({
      itemId: 'item-1',
      status: 'WAITING',
      version: 1,
    });
    const expiringPresign = { ...presign, expiresIn: 1 };
    api.presignItemImage = vi.fn().mockResolvedValue(expiringPresign);
    const uploadMedia = vi.fn().mockRejectedValue(new Error('private upload error'));
    renderCreate(api, uploadMedia);
    await fillForm(user);
    const file = new File(['pixels'], 'print.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Ảnh vật phẩm'), file);
    await user.click(screen.getByRole('button', { name: 'Tạo vật phẩm' }));
    await screen.findByRole('button', { name: /thử tải ảnh lại/i });

    now.mockReturnValue(2_001);
    await user.click(screen.getByRole('button', { name: /thử tải ảnh lại/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/liên kết tải ảnh đã hết hạn/i);
    expect(screen.getByRole('button', { name: /chờ xác minh/i })).toBeDisabled();
    expect(api.presignItemImage).toHaveBeenCalledTimes(1);
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it('shows edit routes as unsupported without calling legacy mutations', async () => {
    const api = createApi();
    const uploadMedia = vi.fn();
    render(
      <MemoryRouter initialEntries={['/auction-items/item-1/edit']}>
        <Routes>
          <Route
            path="/auction-items/:itemId/edit"
            element={<AuctionItemEditorPage catalogApi={api} uploadMedia={uploadMedia} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /chỉnh sửa chưa được hỗ trợ/i }))
      .toBeVisible();
    expect(api.createItem).not.toHaveBeenCalled();
    expect(api.presignItemImage).not.toHaveBeenCalled();
    expect(uploadMedia).not.toHaveBeenCalled();
  });
});
