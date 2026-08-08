import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from '../../../services/serverless/catalogApi';
import { ServerlessApiError } from '../../../services/serverless/contracts';
import type { PresignedPost } from '../../../services/serverless/contracts';

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
    mediaBaseUrl: 'https://media.example.test',
  },
}));

import CreateAuctionPage from './CreateAuctionPage';

const presign: PresignedPost = {
  url: 'https://media.example.test/upload',
  fields: { key: 'items/seller/item-1/image.png', Policy: 'signed-policy' },
  objectKey: 'items/seller/item-1/image.png',
  expiresIn: 300,
};

function createApi() {
  return {
    listSessions: vi.fn(),
    getSession: vi.fn(),
    listItems: vi.fn(),
    getItem: vi.fn(),
    listMyBids: vi.fn(),
    listCategories: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    createSession: vi.fn(),
    putRules: vi.fn(),
    listMySessions: vi.fn(),
    scheduleSession: vi.fn(),
    createItem: vi.fn(),
    presignItemImage: vi.fn(),
  } as unknown as CatalogApi;
}

function renderPage(api: CatalogApi, uploadMedia = vi.fn()) {
  return render(
    <MemoryRouter>
      <CreateAuctionPage catalogApi={api} uploadMedia={uploadMedia} />
    </MemoryRouter>,
  );
}

async function fillRequiredForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Tên phiên'), 'Evening sale');
  await user.type(screen.getByLabelText('Mô tả phiên'), 'Prints and books');
  await user.type(screen.getByLabelText('Tên vật phẩm'), 'Signed print');
  await user.type(screen.getByLabelText('Mô tả vật phẩm'), 'Numbered print');
  await user.selectOptions(screen.getByLabelText('Danh mục'), 'prints');
  await user.type(screen.getByLabelText('Giá khởi điểm'), '100.00');
  await user.clear(screen.getByLabelText('Thời lượng'));
  await user.type(screen.getByLabelText('Thời lượng'), '5');
  await user.selectOptions(screen.getByLabelText('Đơn vị thời lượng'), 'minutes');
  await user.upload(
    screen.getByLabelText('Ảnh vật phẩm'),
    new File(['pixels'], 'print.png', { type: 'image/png' }),
  );
}

function mockCategory(api: CatalogApi) {
  api.listCategories = vi.fn().mockResolvedValue({
    items: [{
      id: 'prints',
      name: 'Prints',
      slug: 'prints',
      status: 'ACTIVE',
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_100,
    }],
    nextCursor: null,
  });
}

describe('CreateAuctionPage', () => {
  it('creates the session, rules, item, presign, and image in order', async () => {
    const user = userEvent.setup();
    const api = createApi();
    const uploadMedia = vi.fn().mockResolvedValue(undefined);
    mockCategory(api);
    api.createSession = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      status: 'DRAFT',
    });
    api.putRules = vi.fn().mockResolvedValue({ sessionId: 'session-1', version: 2 });
    api.createItem = vi.fn().mockResolvedValue({
      itemId: 'item-1',
      status: 'WAITING',
      version: 1,
    });
    api.presignItemImage = vi.fn().mockResolvedValue(presign);
    renderPage(api, uploadMedia);

    await fillRequiredForm(user);
    await user.click(screen.getByRole('button', { name: 'Tạo phiên' }));

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(1));
    expect(api.createSession).toHaveBeenCalledWith({
      title: 'Evening sale',
      description: 'Prints and books',
    });
    expect(api.putRules).toHaveBeenCalledWith('session-1', {
      min_increment: '1',
      max_increment: '1000',
      anti_snipe_window_s: 30,
      anti_snipe_extend_s: 60,
      max_extensions: 10,
      public_history_limit: 20,
    });
    expect(api.createItem).toHaveBeenCalledWith('session-1', {
      name: 'Signed print',
      description: 'Numbered print',
      category_id: 'prints',
      sequence_number: 1,
      start_price: '100.00',
      duration_s: 300,
    });
    expect(api.presignItemImage).toHaveBeenCalledWith('item-1', {
      content_type: 'image/png',
      size_bytes: 6,
    });
    expect(uploadMedia).toHaveBeenCalledWith(presign, expect.any(File));
    expect(vi.mocked(api.createSession).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.putRules).mock.invocationCallOrder[0]);
    expect(vi.mocked(api.putRules).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.createItem).mock.invocationCallOrder[0]);
    expect(vi.mocked(api.createItem).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.presignItemImage).mock.invocationCallOrder[0]);
    expect(await screen.findByRole('status')).toHaveTextContent(/sẵn sàng/i);
  });

  it('converts an hour-based duration to seconds before creating the item', async () => {
    const user = userEvent.setup();
    const api = createApi();
    mockCategory(api);
    api.createSession = vi.fn().mockResolvedValue({ sessionId: 'session-1', status: 'DRAFT' });
    api.putRules = vi.fn().mockResolvedValue({ sessionId: 'session-1', version: 2 });
    api.createItem = vi.fn().mockResolvedValue({ itemId: 'item-1', status: 'WAITING', version: 1 });
    api.presignItemImage = vi.fn().mockResolvedValue(presign);
    renderPage(api);

    await fillRequiredForm(user);
    await user.clear(screen.getByLabelText('Thời lượng'));
    await user.type(screen.getByLabelText('Thời lượng'), '2');
    await user.selectOptions(screen.getByLabelText('Đơn vị thời lượng'), 'hours');
    await user.click(screen.getByRole('button', { name: 'Tạo phiên' }));

    await waitFor(() => expect(api.createItem).toHaveBeenCalled());
    expect(api.createItem).toHaveBeenCalledWith('session-1', expect.objectContaining({
      duration_s: 7_200,
    }));
  });

  it('replaces the selected image when the same file input is used again', async () => {
    const user = userEvent.setup();
    const api = createApi();
    const uploadMedia = vi.fn().mockResolvedValue(undefined);
    mockCategory(api);
    api.createSession = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      status: 'DRAFT',
    });
    api.putRules = vi.fn().mockResolvedValue({ sessionId: 'session-1', version: 2 });
    api.createItem = vi.fn().mockResolvedValue({
      itemId: 'item-1',
      status: 'WAITING',
      version: 1,
    });
    api.presignItemImage = vi.fn().mockResolvedValue(presign);
    renderPage(api, uploadMedia);

    await fillRequiredForm(user);
    const input = screen.getByLabelText('Ảnh vật phẩm');
    const replacement = new File(
      ['replacement'],
      'replacement.webp',
      { type: 'image/webp' },
    );
    const changes = vi.fn();
    input.addEventListener('change', changes);

    await user.upload(input, replacement);
    await user.upload(input, replacement);

    expect(changes).toHaveBeenCalledTimes(2);
    expect(input).toHaveValue('');
    expect(screen.getByRole('status', { name: 'Ảnh đã chọn' }))
      .toHaveTextContent('replacement.webp');

    await user.click(screen.getByRole('button', { name: 'Tạo phiên' }));

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(1));
    expect(api.presignItemImage).toHaveBeenCalledWith('item-1', {
      content_type: 'image/webp',
      size_bytes: replacement.size,
    });
    expect(uploadMedia).toHaveBeenCalledWith(presign, replacement);
  });

  it('retries a rules failure without creating another session', async () => {
    const user = userEvent.setup();
    const api = createApi();
    const uploadMedia = vi.fn().mockResolvedValue(undefined);
    mockCategory(api);
    api.createSession = vi.fn().mockResolvedValue({ sessionId: 'session-1', status: 'DRAFT' });
    api.putRules = vi.fn()
      .mockRejectedValueOnce(new ServerlessApiError(400, 'INVALID_RULES', 'Rules are invalid.'))
      .mockResolvedValueOnce({ sessionId: 'session-1', version: 2 });
    api.createItem = vi.fn().mockResolvedValue({ itemId: 'item-1', status: 'WAITING', version: 1 });
    api.presignItemImage = vi.fn().mockResolvedValue(presign);
    renderPage(api, uploadMedia);

    await fillRequiredForm(user);
    await user.click(screen.getByRole('button', { name: 'Tạo phiên' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/chưa lưu được quy tắc/i);
    await user.click(screen.getByRole('button', { name: /thử lưu lại quy tắc/i }));

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(1));
    expect(api.createSession).toHaveBeenCalledTimes(1);
    expect(api.putRules).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid item image before creating the session', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const api = createApi();
    mockCategory(api);
    renderPage(api);

    await fillRequiredForm(user);
    await user.upload(
      screen.getByLabelText('Ảnh vật phẩm'),
      new File(['text'], 'notes.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Tạo phiên' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG hoặc WEBP/i);
    expect(api.createSession).not.toHaveBeenCalled();
    expect(api.createItem).not.toHaveBeenCalled();
  });

  it('rejects an invalid increment range before making a request', async () => {
    const user = userEvent.setup();
    const api = createApi();
    mockCategory(api);
    renderPage(api);

    await fillRequiredForm(user);
    await user.clear(screen.getByLabelText('Bước giá tối thiểu'));
    await user.type(screen.getByLabelText('Bước giá tối thiểu'), '100');
    await user.clear(screen.getByLabelText('Bước giá tối đa'));
    await user.type(screen.getByLabelText('Bước giá tối đa'), '50');
    await user.click(screen.getByRole('button', { name: 'Tạo phiên' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/bước giá tối đa phải lớn hơn hoặc bằng/i);
    expect(api.createSession).not.toHaveBeenCalled();
    expect(api.putRules).not.toHaveBeenCalled();
  });

  it('blocks a duplicate session attempt after an unknown create outcome', async () => {
    const user = userEvent.setup();
    const api = createApi();
    mockCategory(api);
    api.createSession = vi.fn().mockRejectedValue(
      new ServerlessApiError(0, 'NETWORK_ERROR', 'The request could not be completed.'),
    );
    renderPage(api);

    await fillRequiredForm(user);
    await user.click(screen.getByRole('button', { name: 'Tạo phiên' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/kết quả tạo phiên chưa xác định/i);
    expect(screen.getByRole('button', { name: /chờ xác minh/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /chờ xác minh/i }));
    expect(api.createSession).toHaveBeenCalledTimes(1);
  });
});
