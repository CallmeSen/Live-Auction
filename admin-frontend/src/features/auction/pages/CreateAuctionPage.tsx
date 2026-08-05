import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { auctionSessionService } from '../../../services/auctionSessionService';
import { auctionItemService } from '../../../services/auctionItemService';
import { categoryService } from '../../../services/categoryService';
import type { CategoryResponse } from '../../../interfaces/category';
import { getApiErrorMessage } from '../../../services/apiError';

const MAX_ITEM_IMAGES = 5;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const formatDateTimeLocal = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
};

const getMinimumStartTime = (): string => {
  const minimum = new Date();
  minimum.setSeconds(0, 0);
  minimum.setMinutes(minimum.getMinutes() + 1);
  return formatDateTimeLocal(minimum);
};

const initialForm = {
  sessionTitle: '',
  sessionDescription: '',
  itemTitle: '',
  itemDescription: '',
  categoryId: '',
  startingPrice: '',
  minimumBidIncrement: '',
  startTime: '',
  endTime: '',
};

export default function CreateAuctionPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [categories, setCategories] = useState<
    CategoryResponse[]
  >([]);
  const [categoryError, setCategoryError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [minimumStartTime] = useState(getMinimumStartTime);

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const result = await categoryService.getCategories({
          page: 1,
          size: 100,
          status: 'ACTIVE',
        });

        if (!cancelled) {
          setCategories(result.items);
        }
      } catch (requestError) {
        if (!cancelled) {
          setCategoryError(
            getApiErrorMessage(
              requestError,
              'Không thể tải danh mục.',
            ),
          );
        }
      }
    };

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  const update = (
    field: keyof typeof form,
    value: string,
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleImageChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    setError('');

    if (files.length === 0) {
      setImageFiles([]);
      return;
    }

    if (files.length > MAX_ITEM_IMAGES) {
      setImageFiles([]);
      event.target.value = '';
      setError('Mỗi vật phẩm chỉ được chọn tối đa 5 ảnh.');
      return;
    }

    const invalidTypeFile = files.find(
      (file) => !ALLOWED_IMAGE_TYPES.has(file.type),
    );

    if (invalidTypeFile) {
      setImageFiles([]);
      event.target.value = '';
      setError(
        `Ảnh "${invalidTypeFile.name}" không phải JPEG, PNG hoặc WEBP.`,
      );
      return;
    }

    const oversizedFile = files.find(
      (file) => file.size > MAX_IMAGE_SIZE_BYTES,
    );

    if (oversizedFile) {
      setImageFiles([]);
      event.target.value = '';
      setError(
        `Ảnh "${oversizedFile.name}" vượt quá dung lượng 5 MB.`,
      );
      return;
    }

    setImageFiles(files);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const startingPrice = Number(form.startingPrice);
    const minimumBidIncrement = Number(
      form.minimumBidIncrement,
    );
    const startTime = new Date(form.startTime);
    const endTime = new Date(form.endTime);

    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime())
    ) {
      setError('Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc.');
      return;
    }

    const currentTime = new Date();

    if (startTime <= currentTime) {
      setError(
        'Thời gian bắt đầu phải sau thời điểm hiện tại.',
      );
      return;
    }
    if (!form.categoryId) {
      setError('Vui lòng chọn danh mục.');
      return;
    }

    if (
      startingPrice <= 0 ||
      minimumBidIncrement <= 0
    ) {
      setError(
        'Giá khởi điểm và bước giá phải lớn hơn 0.',
      );
      return;
    }

    if (endTime <= startTime) {
      setError(
        'Thời gian kết thúc phải sau thời gian bắt đầu.',
      );
      return;
    }

    if (endTime <= new Date()) {
      setError(
        'Không thể tạo phiên có thời gian kết thúc trong quá khứ.',
      );
      return;
    }

    if (imageFiles.length === 0) {
      setError('Vui lòng chọn từ 1 đến 5 ảnh cho vật phẩm.');
      return;
    }

    let createdSessionId = '';
    let createdItemId = '';

    try {
      setLoading(true);

      const session = await auctionSessionService.createSession({
        title: form.sessionTitle.trim(),
        description:
          form.sessionDescription.trim() || null,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        minIncrement: minimumBidIncrement,
      });

      createdSessionId = session.id;

      const createdItem = await auctionItemService.createItem(
        session.id,
        {
          categoryId: form.categoryId,
          title: form.itemTitle.trim(),
          description: form.itemDescription.trim() || null,
          startingPrice,
        },
      );

      createdItemId = createdItem.id;

      await auctionItemService.uploadImages(createdItem.id, {
        files: imageFiles,
        primaryIndex: 0,
      });

      navigate('/my-auctions', {
        replace: true,
        state: { created: true },
      });
    } catch (requestError) {
      const message = getApiErrorMessage(
        requestError,
        'Không thể tạo phiên đấu giá.',
      );

      setError(
        createdItemId
          ? `Phiên và vật phẩm đã được tạo nhưng chưa tải đủ ảnh: ${message}`
          : createdSessionId
            ? `Phiên đã được tạo nhưng chưa tạo được vật phẩm: ${message}`
            : message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Thành viên · Tạo phiên
      </span>

      <div className="mt-3">
        <h1 className="font-display text-4xl">
          Tạo phiên đấu giá mới
        </h1>

        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Tạo thông tin phiên trước, sau đó vật phẩm sẽ
          được thêm vào phiên vừa tạo.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="mt-9 grid gap-8 lg:grid-cols-2"
      >
        <section className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
          <div>
            <span className="font-mono-tag text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Thông tin phiên
            </span>

            <h2 className="mt-2 font-display text-2xl">
              Phiên đấu giá
            </h2>
          </div>

          <Input
            label="Tên phiên"
            value={form.sessionTitle}
            onChange={(event) =>
              update('sessionTitle', event.target.value)
            }
            placeholder="Ví dụ: Phiên đấu giá đồ cổ tháng 7"
            required
          />

          <label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]">
            Mô tả phiên

            <textarea
              rows={4}
              value={form.sessionDescription}
              onChange={(event) =>
                update(
                  'sessionDescription',
                  event.target.value,
                )
              }
              placeholder="Giới thiệu chung về phiên đấu giá..."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3 font-sans text-sm normal-case tracking-normal text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-primary)]"
            />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Thời gian bắt đầu"
              type="datetime-local"
              min={minimumStartTime}
              value={form.startTime}
              onChange={(event) =>
                update('startTime', event.target.value)
              }
              required
            />

            <Input
              label="Thời gian kết thúc"
              type="datetime-local"
              min={form.startTime || minimumStartTime}
              value={form.endTime}
              onChange={(event) =>
                update('endTime', event.target.value)
              }
              required
            />
          </div>

          <Input
            label="Bước giá tối thiểu"
            type="number"
            min="1"
            value={form.minimumBidIncrement}
            onChange={(event) =>
              update(
                'minimumBidIncrement',
                event.target.value,
              )
            }
            placeholder="500000"
            required
          />
        </section>

        <section className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
          <div>
            <span className="font-mono-tag text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Thông tin vật phẩm
            </span>

            <h2 className="mt-2 font-display text-2xl">
              Vật phẩm đầu tiên
            </h2>
          </div>

          <Input
            label="Tên vật phẩm"
            value={form.itemTitle}
            onChange={(event) =>
              update('itemTitle', event.target.value)
            }
            placeholder="Ví dụ: Đồng hồ cơ Thụy Sĩ 1960"
            required
          />

          <label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]">
            Danh mục

            <select
              required
              value={form.categoryId}
              onChange={(event) =>
                update('categoryId', event.target.value)
              }
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3 font-sans text-sm normal-case tracking-normal text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">Chọn danh mục</option>

              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          {categoryError && (
            <p className="text-xs text-[var(--color-danger)]">
              {categoryError}
            </p>
          )}

          <Input
            label="Giá khởi điểm"
            type="number"
            min="1"
            value={form.startingPrice}
            onChange={(event) =>
              update('startingPrice', event.target.value)
            }
            placeholder="10000000"
            required
          />

          <label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]">
            Mô tả vật phẩm

            <textarea
              rows={5}
              required
              value={form.itemDescription}
              onChange={(event) =>
                update(
                  'itemDescription',
                  event.target.value,
                )
              }
              placeholder="Nguồn gốc, tình trạng, phụ kiện đi kèm..."
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3 font-sans text-sm normal-case tracking-normal text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-primary)]"
            />
          </label>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-5">
            <h3 className="font-display text-lg">
              Hình ảnh vật phẩm
            </h3>

            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
              Chọn từ 1 đến 5 ảnh JPEG, PNG hoặc WEBP; mỗi ảnh tối đa
              5 MB. Ảnh đầu tiên sẽ được dùng làm ảnh đại diện.
            </p>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleImageChange}
              required
              className="mt-4 block w-full cursor-pointer rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text-muted)] file:mr-4 file:rounded-md file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-[var(--color-bg)]"
            />

            {imageFiles.length > 0 && (
              <div className="mt-3 space-y-1 text-xs text-[var(--color-success)]">
                <p>Đã chọn {imageFiles.length}/5 ảnh:</p>

                <ul className="list-inside list-decimal text-[var(--color-text-muted)]">
                  {imageFiles.map((file) => (
                    <li key={`${file.name}-${file.lastModified}`} className="truncate">
                      {file.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {error && (
          <p className="rounded-md border border-[var(--color-danger-solid)]/40 bg-[var(--color-danger-solid)]/10 px-4 py-3 text-xs text-[var(--color-danger)] lg:col-span-2">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:ml-auto lg:w-96">
          <Link
            to="/my-auctions"
            className="rounded-md border border-[var(--color-border-strong)] px-5 py-2.5 text-center text-sm font-semibold text-[var(--color-text)]"
          >
            Hủy
          </Link>

          <Button type="submit" disabled={loading}>
            {loading ? 'Đang tạo...' : 'Tạo phiên'}
          </Button>
        </div>
      </form>
    </div>
  );
}