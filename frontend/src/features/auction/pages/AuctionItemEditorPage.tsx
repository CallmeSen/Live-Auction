import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import type { CategoryResponse } from '../../../interfaces/category';
import { auctionItemService } from '../../../services/auctionItemService';
import { categoryService } from '../../../services/categoryService';
import { getApiErrorMessage } from '../../../services/apiError';

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const initialForm = {
  title: '',
  description: '',
  categoryId: '',
  startingPrice: '',
};

export default function AuctionItemEditorPage() {
  const { sessionId, itemId } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(itemId);
  const [form, setForm] = useState(initialForm);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [existingImageCount, setExistingImageCount] = useState(0);
  const [resolvedSessionId, setResolvedSessionId] = useState(sessionId ?? '');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const remainingImageSlots = useMemo(
    () => MAX_IMAGES - existingImageCount,
    [existingImageCount],
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const categoryResult = await categoryService.getCategories({
          page: 1,
          size: 100,
          status: 'ACTIVE',
        });

        if (!cancelled) {
          setCategories(categoryResult.items);
        }

        if (itemId) {
          const item = await auctionItemService.getItemById(itemId);

          if (item.session.status !== 'PENDING_APPROVAL') {
            throw new Error(
              'Chỉ được sửa vật phẩm khi phiên đang chờ duyệt.',
            );
          }

          if (!cancelled) {
            setResolvedSessionId(item.sessionId);
            setExistingImageCount(item.images.length);
            setForm({
              title: item.title,
              description: item.description ?? '',
              categoryId: item.categoryId ?? '',
              startingPrice: item.startingPrice,
            });
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              loadError,
              'Không thể tải thông tin vật phẩm.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const selectImages = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    setError('');

    if (files.length > remainingImageSlots) {
      event.target.value = '';
      setImageFiles([]);
      setError(
        `Vật phẩm chỉ được có tối đa 5 ảnh. Bạn còn ${remainingImageSlots} vị trí ảnh.`,
      );
      return;
    }

    const invalidFile = files.find(
      (file) =>
        !ALLOWED_IMAGE_TYPES.has(file.type) ||
        file.size > MAX_IMAGE_SIZE_BYTES,
    );

    if (invalidFile) {
      event.target.value = '';
      setImageFiles([]);
      setError(
        `Ảnh "${invalidFile.name}" phải là JPEG, PNG hoặc WEBP và không quá 5 MB.`,
      );
      return;
    }

    setImageFiles(files);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!resolvedSessionId) {
      setError('Không tìm thấy phiên đấu giá.');
      return;
    }

    const startingPrice = Number(form.startingPrice);

    if (!form.categoryId || startingPrice <= 0) {
      setError('Vui lòng chọn danh mục và nhập giá khởi điểm hợp lệ.');
      return;
    }

    if (!editing && imageFiles.length === 0) {
      setError('Vui lòng chọn từ 1 đến 5 ảnh cho vật phẩm.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        categoryId: form.categoryId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        startingPrice,
      };

      const item = itemId
        ? await auctionItemService.updateItem(itemId, payload)
        : await auctionItemService.createItem(
            resolvedSessionId,
            payload,
          );

      if (imageFiles.length > 0) {
        await auctionItemService.uploadImages(item.id, {
          files: imageFiles,
          primaryIndex: existingImageCount === 0 ? 0 : -1,
        });
      }

      navigate(`/auction-sessions/${resolvedSessionId}`, {
        replace: true,
      });
    } catch (saveError) {
      setError(
        getApiErrorMessage(
          saveError,
          editing
            ? 'Không thể cập nhật vật phẩm.'
            : 'Không thể thêm vật phẩm.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-[var(--color-text-muted)]">
        Đang tải thông tin vật phẩm...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Thành viên · Quản lý vật phẩm
      </span>
      <h1 className="mt-3 font-display text-4xl">
        {editing ? 'Sửa vật phẩm' : 'Thêm vật phẩm vào phiên'}
      </h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Chỉ có thể thay đổi vật phẩm trong khi phiên đang chờ duyệt.
      </p>

      <form
        onSubmit={submit}
        className="mt-8 space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8"
      >
        <Input
          label="Tên vật phẩm"
          value={form.title}
          onChange={(event) => update('title', event.target.value)}
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
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <Input
          label="Giá khởi điểm"
          type="number"
          min="1"
          value={form.startingPrice}
          onChange={(event) =>
            update('startingPrice', event.target.value)
          }
          required
        />

        <label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]">
          Mô tả vật phẩm
          <textarea
            rows={5}
            value={form.description}
            onChange={(event) =>
              update('description', event.target.value)
            }
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3 font-sans text-sm normal-case tracking-normal text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
          />
        </label>

        {remainingImageSlots > 0 && (
          <label className="flex flex-col gap-2 text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]">
            {editing ? 'Thêm ảnh' : 'Hình ảnh vật phẩm'}
            <span className="font-sans normal-case tracking-normal">
              {editing
                ? `Đang có ${existingImageCount}/5 ảnh, có thể thêm tối đa ${remainingImageSlots} ảnh.`
                : 'Chọn từ 1 đến 5 ảnh JPEG, PNG hoặc WEBP; mỗi ảnh tối đa 5 MB.'}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              required={!editing}
              onChange={selectImages}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 font-sans normal-case tracking-normal"
            />
          </label>
        )}

        {error && (
          <p className="rounded-md border border-[var(--color-danger-solid)]/40 p-4 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            to={
              resolvedSessionId
                ? `/auction-sessions/${resolvedSessionId}`
                : '/my-auctions'
            }
            className="rounded-md border border-[var(--color-border-strong)] px-5 py-2.5 text-center text-sm font-semibold"
          >
            Hủy
          </Link>
          <Button type="submit" disabled={saving}>
            {saving
              ? 'Đang lưu...'
              : editing
                ? 'Lưu thay đổi'
                : 'Thêm vật phẩm'}
          </Button>
        </div>
      </form>
    </div>
  );
}
