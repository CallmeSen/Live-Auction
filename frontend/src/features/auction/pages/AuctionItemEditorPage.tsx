import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  CatalogApi,
  CreateItemDto,
  ImageMetadataDto,
} from '../../../services/serverless/catalogApi';
import type { PresignedPost } from '../../../services/serverless/contracts';
import { ServerlessApiError } from '../../../services/serverless/contracts';
import {
  uploadPresignedPost,
} from '../../../services/serverless/mediaUpload';
import { useCatalogApi } from '../../../services/serverless/useCatalogApi';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_MONEY_CENTS = 100_000_000_000n;
const ALLOWED_IMAGE_TYPES = new Set<ImageMetadataDto['content_type']>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type ItemForm = {
  name: string;
  description: string;
  categoryId: string;
  sequenceNumber: string;
  startPrice: string;
  durationSeconds: string;
};

const initialForm: ItemForm = {
  name: '',
  description: '',
  categoryId: '',
  sequenceNumber: '1',
  startPrice: '',
  durationSeconds: '90',
};

function boundedInteger(value: string, minimum: number, maximum: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function validMoney(value: string): boolean {
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return false;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return cents <= MAX_MONEY_CENTS;
}

function isKnownClientFailure(error: unknown): boolean {
  return error instanceof ServerlessApiError
    && error.status >= 400
    && error.status < 500
    && error.code !== 'INVALID_ENVELOPE';
}

type AuctionItemEditorPageProps = {
  catalogApi?: CatalogApi;
  uploadMedia?: typeof uploadPresignedPost;
};

export default function AuctionItemEditorPage({
  catalogApi,
  uploadMedia = uploadPresignedPost,
}: AuctionItemEditorPageProps) {
  const { sessionId, itemId } = useParams();
  const api = useCatalogApi(catalogApi);
  const inFlight = useRef(false);
  const [form, setForm] = useState(initialForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);
  const [presign, setPresign] = useState<PresignedPost | null>(null);
  const [presignExpiresAt, setPresignExpiresAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState<'create' | 'presign' | null>(null);
  const [error, setError] = useState('');

  if (itemId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="font-mono-tag text-xs uppercase text-[var(--color-primary)]">
          Kênh người bán
        </p>
        <h1 className="mt-3 font-display text-4xl">Chỉnh sửa chưa được hỗ trợ</h1>
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          API serverless hiện chỉ hỗ trợ tạo vật phẩm trong phiên nháp.
        </p>
        <Link to="/my-auctions" className="mt-6 inline-block text-sm text-[var(--color-primary)]">
          Về danh sách phiên
        </Link>
      </main>
    );
  }

  const update = (field: keyof ItemForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    setImageFile(event.target.files?.[0] ?? null);
    setError('');
  };

  const validate = (): CreateItemDto | null => {
    const name = form.name.trim();
    const description = form.description.trim();
    const categoryId = form.categoryId.trim();
    const sequenceNumber = boundedInteger(form.sequenceNumber, 1, 999_999);
    const durationSeconds = boundedInteger(form.durationSeconds, 30, 86_400);

    if (!name || name.length > 200) {
      setError('Tên vật phẩm phải có từ 1 đến 200 ký tự.');
      return null;
    }
    if (description.length > 2_000 || categoryId.length > 100) {
      setError('Mô tả hoặc mã danh mục vượt quá giới hạn cho phép.');
      return null;
    }
    if (sequenceNumber === null || durationSeconds === null || !validMoney(form.startPrice)) {
      setError('Thứ tự, giá khởi điểm hoặc thời lượng không hợp lệ.');
      return null;
    }
    if (!imageFile) {
      setError('Chọn một ảnh JPEG, PNG hoặc WEBP cho vật phẩm.');
      return null;
    }
    if (
      !ALLOWED_IMAGE_TYPES.has(imageFile.type as ImageMetadataDto['content_type'])
      || imageFile.size < 1
      || imageFile.size > MAX_IMAGE_SIZE_BYTES
    ) {
      setError('Ảnh phải là JPEG, PNG hoặc WEBP và có dung lượng từ 1 byte đến 5 MB.');
      return null;
    }

    return {
      name,
      description,
      category_id: categoryId || null,
      sequence_number: sequenceNumber,
      start_price: form.startPrice.trim(),
      duration_s: durationSeconds,
    };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || completed || outcomeUnknown) return;
    const payload = validate();
    if (!payload || !sessionId || !imageFile) return;
    if (presign && presignExpiresAt !== null && Date.now() >= presignExpiresAt) {
      setOutcomeUnknown('presign');
      setError('Liên kết tải ảnh đã hết hạn. Hãy kiểm tra vật phẩm trước khi thao tác tiếp.');
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setError('');
    let stage: 'create' | 'presign' | 'upload' = createdItemId ? 'presign' : 'create';
    try {
      let resolvedItemId = createdItemId;
      if (!resolvedItemId) {
        const item = await api.createItem(sessionId, payload);
        resolvedItemId = item.itemId;
        setCreatedItemId(resolvedItemId);
      }

      stage = 'presign';
      let resolvedPresign = presign;
      if (!resolvedPresign) {
        resolvedPresign = await api.presignItemImage(resolvedItemId, {
          content_type: imageFile.type as ImageMetadataDto['content_type'],
          size_bytes: imageFile.size,
        });
        setPresign(resolvedPresign);
        setPresignExpiresAt(Date.now() + resolvedPresign.expiresIn * 1_000);
      }

      stage = 'upload';
      await uploadMedia(resolvedPresign, imageFile);
      setCompleted(true);
    } catch (requestError) {
      if (stage === 'upload') {
        setError('Tải ảnh thất bại. Hãy thử tải ảnh lại.');
      } else if (isKnownClientFailure(requestError)) {
        setError(stage === 'create' ? 'Không thể tạo vật phẩm.' : 'Không thể chuẩn bị ảnh.');
      } else {
        setOutcomeUnknown(stage);
        setError(
          stage === 'create'
            ? 'Kết quả tạo vật phẩm chưa xác định. Hãy kiểm tra phiên trước khi thử lại.'
            : 'Kết quả chuẩn bị ảnh chưa xác định. Hãy kiểm tra vật phẩm trước khi thử lại.',
        );
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const formLocked = submitting || createdItemId !== null || outcomeUnknown !== null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <p className="font-mono-tag text-xs uppercase text-[var(--color-primary)]">
        Kênh người bán
      </p>
      <h1 className="mt-3 font-display text-4xl">Tạo vật phẩm</h1>

      {error && (
        <div role="alert" className="mt-7 border-y border-[var(--color-danger-solid)]/60 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {outcomeUnknown && (
        <Link
          to={outcomeUnknown === 'create'
            ? '/my-auctions'
            : `/auction-sessions/${encodeURIComponent(sessionId ?? '')}`}
          className="mt-4 inline-block text-sm text-[var(--color-primary)]"
        >
          Kiểm tra trạng thái
        </Link>
      )}

      {completed ? (
        <section
          role="status"
          aria-live="polite"
          className="mt-9 border-y border-[var(--color-success-border)] py-10"
        >
          <h2 className="font-display text-2xl">Vật phẩm và ảnh đã sẵn sàng</h2>
          <Link
            to={`/auction-sessions/${encodeURIComponent(sessionId ?? '')}`}
            className="mt-6 inline-block text-sm text-[var(--color-primary)]"
          >
            Về phiên đấu giá
          </Link>
        </section>
      ) : (
        <form onSubmit={submit} className="mt-9 space-y-5 border-t border-[var(--color-border)] pt-7">
          <FormInput label="Tên vật phẩm" value={form.name} onChange={(value) => update('name', value)} maxLength={200} disabled={formLocked} />
          <label className="block text-sm">
            <span className="text-[var(--color-text-muted)]">Mô tả</span>
            <textarea
              value={form.description}
              onChange={(event) => update('description', event.target.value)}
              maxLength={2_000}
              rows={5}
              disabled={formLocked}
              className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
            />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormInput label="Mã danh mục" value={form.categoryId} onChange={(value) => update('categoryId', value)} maxLength={100} disabled={formLocked} />
            <FormInput label="Thứ tự" value={form.sequenceNumber} onChange={(value) => update('sequenceNumber', value)} inputMode="numeric" disabled={formLocked} />
            <FormInput label="Giá khởi điểm" value={form.startPrice} onChange={(value) => update('startPrice', value)} inputMode="decimal" disabled={formLocked} />
            <FormInput label="Thời lượng (giây)" value={form.durationSeconds} onChange={(value) => update('durationSeconds', value)} inputMode="numeric" disabled={formLocked} />
          </div>
          <label className="block text-sm">
            <span className="text-[var(--color-text-muted)]">Ảnh vật phẩm</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={selectImage}
              disabled={formLocked}
              className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3"
            />
          </label>
          <div className="flex flex-wrap gap-3 pt-2">
            {submitting ? (
              <span
                aria-disabled="true"
                className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm opacity-50"
              >
                Hủy
              </span>
            ) : (
              <Link to={`/auction-sessions/${encodeURIComponent(sessionId ?? '')}`} className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm">
                Hủy
              </Link>
            )}
            <button
              type="submit"
              disabled={submitting || outcomeUnknown !== null}
              className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)] disabled:opacity-50"
            >
              {outcomeUnknown
                ? 'Chờ xác minh'
                : submitting
                  ? 'Đang xử lý...'
                  : presign
                    ? 'Thử tải ảnh lại'
                    : 'Tạo vật phẩm'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

type FormInputProps = {
  label: string;
  value: string;
  onChange(value: string): void;
  maxLength?: number;
  inputMode?: 'decimal' | 'numeric';
  disabled?: boolean;
};

function FormInput({ label, value, onChange, maxLength, inputMode, disabled }: FormInputProps) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        inputMode={inputMode}
        disabled={disabled}
        className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
      />
    </label>
  );
}
