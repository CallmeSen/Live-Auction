import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type {
  AuctionCategory,
  CatalogApi,
  CreateItemDto,
  ImageMetadataDto,
  RulesDto,
} from '../../../services/serverless/catalogApi';
import type { PresignedPost } from '../../../services/serverless/contracts';
import { ServerlessApiError } from '../../../services/serverless/contracts';
import { uploadPresignedPost } from '../../../services/serverless/mediaUpload';
import { useCatalogApi } from '../../../services/serverless/useCatalogApi';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_MONEY_CENTS = 100_000_000_000n;
const ALLOWED_IMAGE_TYPES = new Set<ImageMetadataDto['content_type']>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type RuleForm = {
  minIncrement: string;
  maxIncrement: string;
  antiSnipeWindowSeconds: string;
  antiSnipeExtendSeconds: string;
  maxExtensions: string;
  publicHistoryLimit: string;
};

type ItemForm = {
  name: string;
  description: string;
  categoryId: string;
  sequenceNumber: string;
  startPrice: string;
  durationValue: string;
  durationUnit: 'minutes' | 'hours';
};

const initialRules: RuleForm = {
  minIncrement: '1',
  maxIncrement: '1000',
  antiSnipeWindowSeconds: '30',
  antiSnipeExtendSeconds: '60',
  maxExtensions: '10',
  publicHistoryLimit: '20',
};

const initialItem: ItemForm = {
  name: '',
  description: '',
  categoryId: '',
  sequenceNumber: '1',
  startPrice: '',
  durationValue: '5',
  durationUnit: 'minutes',
};

type CreateStage = 'session' | 'rules' | 'item' | 'presign' | 'upload';

function moneyCents(value: string): bigint | null {
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const cents = BigInt(match[1]) * 100n + BigInt(fraction || '0');
  return cents <= MAX_MONEY_CENTS ? cents : null;
}

function boundedInteger(value: string, minimum: number, maximum: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function validMoney(value: string): boolean {
  return moneyCents(value) !== null;
}

function itemDurationSeconds(
  value: string,
  unit: ItemForm['durationUnit'],
): number | null {
  const maximum = unit === 'hours' ? 24 : 1_440;
  const amount = boundedInteger(value, 1, maximum);
  if (amount === null) return null;

  const seconds = amount * (unit === 'hours' ? 3_600 : 60);
  return seconds >= 30 && seconds <= 86_400 ? seconds : null;
}

function conflictCode(error: unknown): string {
  return error instanceof ServerlessApiError ? ` (${error.code})` : '';
}

function isKnownClientFailure(error: unknown): boolean {
  return error instanceof ServerlessApiError
    && error.status >= 400
    && error.status < 500
    && error.code !== 'INVALID_ENVELOPE';
}

type CreateAuctionPageProps = {
  catalogApi?: CatalogApi;
  uploadMedia?: typeof uploadPresignedPost;
};

export default function CreateAuctionPage({
  catalogApi,
  uploadMedia = uploadPresignedPost,
}: CreateAuctionPageProps) {
  const api = useCatalogApi(catalogApi);
  const inFlight = useRef(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<RuleForm>(initialRules);
  const [item, setItem] = useState<ItemForm>(initialItem);
  const [categories, setCategories] = useState<AuctionCategory[]>([]);
  const [categoryError, setCategoryError] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);
  const [presign, setPresign] = useState<PresignedPost | null>(null);
  const [presignExpiresAt, setPresignExpiresAt] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState<CreateStage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void api.listCategories({ pageSize: 100 })
      .then((page) => {
        if (!cancelled) setCategories(page.items.filter((category) => category.status === 'ACTIVE'));
      })
      .catch(() => {
        if (!cancelled) setCategoryError('Không thể tải danh mục. Bạn có thể bỏ qua danh mục nếu chưa cần chọn.');
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const updateRule = (field: keyof RuleForm, value: string) => {
    setRules((current) => ({ ...current, [field]: value }));
  };

  const updateItem = (field: keyof ItemForm, value: string) => {
    setItem((current) => ({ ...current, [field]: value }));
  };

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    setImageFile(event.target.files?.[0] ?? null);
    event.target.value = '';
    setError('');
  };

  const validatedRules = (): RulesDto | null => {
    const minIncrement = moneyCents(rules.minIncrement);
    const maxIncrement = moneyCents(rules.maxIncrement);
    if (minIncrement === null || minIncrement <= 0n) {
      setError('Bước giá tối thiểu phải lớn hơn 0 và có tối đa 2 chữ số thập phân.');
      return null;
    }
    if (maxIncrement === null || maxIncrement <= 0n) {
      setError('Bước giá tối đa không hợp lệ.');
      return null;
    }
    if (maxIncrement < minIncrement) {
      setError('Bước giá tối đa phải lớn hơn hoặc bằng bước giá tối thiểu.');
      return null;
    }

    const antiSnipeWindow = boundedInteger(rules.antiSnipeWindowSeconds, 0, 3600);
    const antiSnipeExtend = boundedInteger(rules.antiSnipeExtendSeconds, 0, 3600);
    const maxExtensions = boundedInteger(rules.maxExtensions, 0, 100);
    const publicHistoryLimit = boundedInteger(rules.publicHistoryLimit, 0, 100);
    if (
      antiSnipeWindow === null
      || antiSnipeExtend === null
      || maxExtensions === null
      || publicHistoryLimit === null
    ) {
      setError('Giới hạn thời gian hoặc số lần gia hạn không hợp lệ.');
      return null;
    }

    return {
      min_increment: rules.minIncrement.trim(),
      max_increment: rules.maxIncrement.trim(),
      anti_snipe_window_s: antiSnipeWindow,
      anti_snipe_extend_s: antiSnipeExtend,
      max_extensions: maxExtensions,
      public_history_limit: publicHistoryLimit,
    };
  };

  const validatedItem = (): CreateItemDto | null => {
    const name = item.name.trim();
    const itemDescription = item.description.trim();
    const categoryId = item.categoryId.trim();
    const sequenceNumber = boundedInteger(item.sequenceNumber, 1, 999_999);
    const durationSeconds = itemDurationSeconds(item.durationValue, item.durationUnit);

    if (!name || name.length > 200) {
      setError('Tên vật phẩm phải có từ 1 đến 200 ký tự.');
      return null;
    }
    if (itemDescription.length > 2_000 || categoryId.length > 100) {
      setError('Mô tả hoặc mã danh mục vượt quá giới hạn cho phép.');
      return null;
    }
    if (sequenceNumber === null || durationSeconds === null || !validMoney(item.startPrice)) {
      setError('Thứ tự, giá khởi điểm hoặc thời lượng không hợp lệ. Chọn từ 1 phút đến 24 giờ.');
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
      description: itemDescription,
      category_id: categoryId || null,
      sequence_number: sequenceNumber,
      start_price: item.startPrice.trim(),
      duration_s: durationSeconds,
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || completed || outcomeUnknown) return;

    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    if (!normalizedTitle || normalizedTitle.length > 200) {
      setError('Tên phiên phải có từ 1 đến 200 ký tự.');
      return;
    }
    if (normalizedDescription.length > 2_000) {
      setError('Mô tả phiên không được vượt quá 2000 ký tự.');
      return;
    }
    const rulesPayload = validatedRules();
    if (!rulesPayload) return;
    const itemPayload = validatedItem();
    if (!itemPayload || !imageFile) return;
    if (presign && presignExpiresAt !== null && Date.now() >= presignExpiresAt) {
      setOutcomeUnknown('presign');
      setError('Liên kết tải ảnh đã hết hạn. Hãy kiểm tra vật phẩm trước khi thao tác tiếp.');
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setError('');
    let sessionId = createdSessionId;
    let stage: CreateStage = createdItemId ? (presign ? 'upload' : 'presign') : rulesSaved ? 'item' : 'session';

    try {
      if (!sessionId) {
        stage = 'session';
        const created = await api.createSession({
          title: normalizedTitle,
          description: normalizedDescription,
        });
        sessionId = created.sessionId;
        setCreatedSessionId(sessionId);
      }

      if (!rulesSaved) {
        stage = 'rules';
        await api.putRules(sessionId, rulesPayload);
        setRulesSaved(true);
      }

      let itemId = createdItemId;
      if (!itemId) {
        stage = 'item';
        const created = await api.createItem(sessionId, itemPayload);
        itemId = created.itemId;
        setCreatedItemId(itemId);
      }

      stage = 'presign';
      let resolvedPresign = presign;
      if (!resolvedPresign) {
        resolvedPresign = await api.presignItemImage(itemId, {
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
        const code = conflictCode(requestError);
        if (stage === 'session') setError(`Không thể tạo phiên.${code}`);
        else if (stage === 'rules') setError(`Phiên ${sessionId} đã tạo nhưng chưa lưu được quy tắc.${code}`);
        else if (stage === 'item') setError(`Phiên và quy tắc đã tạo nhưng chưa tạo được vật phẩm.${code}`);
        else setError(`Không thể chuẩn bị ảnh cho vật phẩm.${code}`);
      } else {
        setOutcomeUnknown(stage);
        if (stage === 'session') {
          setError('Kết quả tạo phiên chưa xác định. Hãy kiểm tra danh sách phiên trước khi thử lại.');
        } else if (stage === 'rules') {
          setError('Kết quả lưu quy tắc chưa xác định. Hãy kiểm tra phiên trước khi thao tác tiếp.');
        } else if (stage === 'item') {
          setError('Kết quả tạo vật phẩm chưa xác định. Hãy kiểm tra phiên trước khi thử lại.');
        } else {
          setError('Kết quả chuẩn bị ảnh chưa xác định. Hãy kiểm tra vật phẩm trước khi thử lại.');
        }
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const formLocked = submitting || createdItemId !== null || outcomeUnknown !== null;
  const submitLabel = outcomeUnknown
    ? 'Chờ xác minh'
    : submitting
      ? 'Đang tạo...'
      : createdSessionId && !rulesSaved
        ? 'Thử lưu lại quy tắc'
        : createdSessionId && !createdItemId
          ? 'Thử tạo lại vật phẩm'
          : createdItemId && !presign
            ? 'Thử chuẩn bị ảnh lại'
            : createdItemId
              ? 'Thử tải ảnh lại'
              : 'Tạo phiên';

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <p className="font-mono-tag text-xs uppercase text-[var(--color-primary)]">
        Kênh người bán
      </p>
      <h1 className="mt-3 font-display text-4xl">Tạo phiên đấu giá mới</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Tạo phiên và vật phẩm đầu tiên trong cùng một biểu mẫu.
      </p>

      {error && (
        <div role="alert" className="mt-7 border-y border-[var(--color-danger-solid)]/60 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {categoryError && (
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">{categoryError}</p>
      )}

      {outcomeUnknown && (
        <Link
          to={createdSessionId ? `/auction-sessions/${encodeURIComponent(createdSessionId)}` : '/my-auctions'}
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
          <h2 className="font-display text-2xl">Phiên và vật phẩm đã sẵn sàng</h2>
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">Mã phiên: {createdSessionId}</p>
          <Link
            to={`/auction-sessions/${encodeURIComponent(createdSessionId ?? '')}`}
            className="mt-6 inline-block text-sm text-[var(--color-primary)]"
          >
            Xem phiên đấu giá
          </Link>
        </section>
      ) : (
        <form onSubmit={handleSubmit} className="mt-9 grid gap-8 lg:grid-cols-2">
          <section className="space-y-5 border-t border-[var(--color-border)] pt-6">
            <h2 className="font-display text-2xl">Thông tin phiên</h2>
            <FormInput label="Tên phiên" value={title} onChange={setTitle} maxLength={200} disabled={formLocked} />
            <label className="block text-sm">
              <span className="text-[var(--color-text-muted)]">Mô tả phiên</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2_000}
                rows={5}
                disabled={formLocked}
                className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
              />
            </label>

            <h2 className="border-t border-[var(--color-border)] pt-6 font-display text-2xl">Quy tắc trả giá</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <RuleInput label="Bước giá tối thiểu" value={rules.minIncrement} onChange={(value) => updateRule('minIncrement', value)} disabled={formLocked} />
              <RuleInput label="Bước giá tối đa" value={rules.maxIncrement} onChange={(value) => updateRule('maxIncrement', value)} disabled={formLocked} />
              <RuleInput label="Cửa sổ chống sniping (giây)" value={rules.antiSnipeWindowSeconds} onChange={(value) => updateRule('antiSnipeWindowSeconds', value)} disabled={formLocked} />
              <RuleInput label="Thời gian gia hạn (giây)" value={rules.antiSnipeExtendSeconds} onChange={(value) => updateRule('antiSnipeExtendSeconds', value)} disabled={formLocked} />
              <RuleInput label="Số lần gia hạn tối đa" value={rules.maxExtensions} onChange={(value) => updateRule('maxExtensions', value)} disabled={formLocked} />
              <RuleInput label="Giới hạn lịch sử công khai" value={rules.publicHistoryLimit} onChange={(value) => updateRule('publicHistoryLimit', value)} disabled={formLocked} />
            </div>
          </section>

          <section className="space-y-5 border-t border-[var(--color-border)] pt-6">
            <h2 className="font-display text-2xl">Vật phẩm đầu tiên</h2>
            <FormInput label="Tên vật phẩm" value={item.name} onChange={(value) => updateItem('name', value)} maxLength={200} disabled={formLocked} />
            <label className="block text-sm">
              <span className="text-[var(--color-text-muted)]">Mô tả vật phẩm</span>
              <textarea
                value={item.description}
                onChange={(event) => updateItem('description', event.target.value)}
                maxLength={2_000}
                rows={5}
                disabled={formLocked}
                className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-text-muted)]">Danh mục</span>
              <select
                value={item.categoryId}
                onChange={(event) => updateItem('categoryId', event.target.value)}
                disabled={formLocked}
                className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
              >
                <option value="">Không chọn danh mục</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FormInput label="Thứ tự" value={item.sequenceNumber} onChange={(value) => updateItem('sequenceNumber', value)} inputMode="numeric" disabled={formLocked} />
              <FormInput label="Giá khởi điểm" value={item.startPrice} onChange={(value) => updateItem('startPrice', value)} inputMode="decimal" disabled={formLocked} />
              <FormInput label="Thời lượng" value={item.durationValue} onChange={(value) => updateItem('durationValue', value)} inputMode="numeric" disabled={formLocked} />
              <label className="block text-sm">
                <span className="text-[var(--color-text-muted)]">Đơn vị thời lượng</span>
                <select
                  aria-label="Đơn vị thời lượng"
                  value={item.durationUnit}
                  onChange={(event) => updateItem('durationUnit', event.target.value as ItemForm['durationUnit'])}
                  disabled={formLocked}
                  className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
                >
                  <option value="minutes">Phút</option>
                  <option value="hours">Giờ</option>
                </select>
              </label>
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
            {imageFile && (
              <span
                role="status"
                aria-label="Ảnh đã chọn"
                className="block text-xs text-[var(--color-text-muted)]"
              >
                Đã chọn: {imageFile.name}
              </span>
            )}
          </section>

          <div className="flex flex-wrap gap-3 lg:col-span-2">
            <Link
              to="/my-auctions"
              className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm"
            >
              Hủy
            </Link>
            <button
              type="submit"
              disabled={submitting || outcomeUnknown !== null}
              className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)] disabled:opacity-50"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

type RuleInputProps = {
  label: string;
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
};

function RuleInput({ label, value, onChange, disabled }: RuleInputProps) {
  return (
    <FormInput
      label={label}
      value={value}
      onChange={onChange}
      inputMode={label.includes('Bước giá') ? 'decimal' : 'numeric'}
      disabled={disabled}
    />
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
        required={label === 'Tên phiên' || label === 'Tên vật phẩm' || label === 'Giá khởi điểm' || label === 'Thời lượng'}
        className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
      />
    </label>
  );
}
