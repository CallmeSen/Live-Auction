import { useEffect, useState } from 'react';
import categoryService from '../../../service/categoryService';

type Category = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  items?: number;
};

type CategoryDetail = Category;

/**
 * Chuyển chuỗi tiếng Việt (có dấu, hoa/thường) thành slug hợp lệ
 * theo đúng quy tắc backend: chỉ gồm a-z, 0-9, dấu gạch ngang.
 * Ví dụ: "Đồng Hồ Cổ" -> "dong-ho-co"
 */
function toSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as { response?: { data?: { message?: string } } };
  return anyErr?.response?.data?.message ?? fallback;
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('vi-VN');
  } catch {
    return value;
  }
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- state cho modal xem chi tiết ---
  const [detailCategory, setDetailCategory] = useState<CategoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // --- state cho modal sửa ---
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await categoryService.getAll({ page: 1, size: 100 });
      setCategories(response.data.data.items);
    } catch (loadError) {
      setError(extractErrorMessage(loadError, 'Không tải được danh mục. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const slug = toSlug(trimmedName);
      const response = await categoryService.create({ name: trimmedName, slug });
      setCategories((current) => [...current, { ...response.data.data, items: 0 }]);
      setName('');
    } catch (createError) {
      setError(
        extractErrorMessage(createError, 'Không tạo được danh mục. Vui lòng kiểm tra dữ liệu và thử lại.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const hide = async (category: Category) => {
    const confirmed = window.confirm(`Bạn có chắc muốn ẩn danh mục "${category.name}"?`);
    if (!confirmed) return;

    setError(null);

    try {
      // Backend chỉ soft-delete (đổi status sang INACTIVE), không xoá vĩnh viễn
      await categoryService.delete(category.id);
      setCategories((current) =>
        current.map((item) => (item.id === category.id ? { ...item, status: 'INACTIVE' } : item)),
      );
    } catch (hideError) {
      setError(extractErrorMessage(hideError, 'Không ẩn được danh mục. Vui lòng thử lại.'));
    }
  };

  // ----- Xem chi tiết -----
  const openDetail = async (categoryId: string) => {
    setDetailCategory(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const response = await categoryService.getById(categoryId);
      setDetailCategory(response.data.data);
    } catch (fetchError) {
      setDetailError(extractErrorMessage(fetchError, 'Không tải được chi tiết danh mục.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailCategory(null);
    setDetailError(null);
  };

  // ----- Sửa -----
  const openEdit = (category: Category) => {
    setEditingCategory(category);
    setEditName(category.name);
    setEditSlug(category.slug);
    setEditStatus(category.status);
    setEditError(null);
  };

  const closeEdit = () => {
    setEditingCategory(null);
    setEditError(null);
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingCategory) return;

    const trimmedName = editName.trim();
    const trimmedSlug = editSlug.trim();

    if (!trimmedName) {
      setEditError('Tên danh mục không được để trống.');
      return;
    }

    setEditSubmitting(true);
    setEditError(null);

    try {
      const payload: { name?: string; slug?: string; status?: string } = {};

      if (trimmedName !== editingCategory.name) payload.name = trimmedName;
      if (trimmedSlug !== editingCategory.slug) payload.slug = trimmedSlug || toSlug(trimmedName);
      if (editStatus !== editingCategory.status) payload.status = editStatus;

      const response = await categoryService.update(editingCategory.id, payload);
      const updated = response.data.data;

      setCategories((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );

      closeEdit();
    } catch (updateError) {
      setEditError(
        extractErrorMessage(updateError, 'Không cập nhật được danh mục. Vui lòng kiểm tra dữ liệu và thử lại.'),
      );
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin · Danh mục</span>
      <h1 className="mt-2 font-display text-4xl">Quản lý danh mục</h1>

      <form onSubmit={add} className="mt-7 flex gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Tên danh mục mới"
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        <button
          disabled={submitting}
          className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)] disabled:opacity-60"
        >
          {submitting ? 'Đang thêm...' : 'Thêm danh mục'}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-[var(--color-danger)]">{error}</p>}
      {loading && <p className="mt-4 text-sm text-[var(--color-text-muted)]">Đang tải danh mục...</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {categories.length === 0 && !loading ? (
          <div className="p-6 text-sm text-[var(--color-text-muted)]">Không có danh mục nào.</div>
        ) : (
          categories.map((category) => (
            <div
              key={category.id}
              className="grid grid-cols-[1fr_100px_90px_auto] items-center gap-4 border-b border-[var(--color-border)] p-4 last:border-0"
            >
              <button type="button" onClick={() => void openDetail(category.id)} className="text-left">
                <p className="text-sm hover:underline">{category.name}</p>
                <p className="mt-1 font-mono-tag text-[10px] text-[var(--color-text-dim)]">/{category.slug}</p>
              </button>
              <span className="text-xs text-[var(--color-text-muted)]">{category.items ?? 0} vật phẩm</span>
              <span className="text-xs text-[var(--color-success)]">{category.status}</span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => openEdit(category)} className="text-xs text-[var(--color-primary)]">
                  Sửa
                </button>
                <button type="button" onClick={() => void hide(category)} className="text-xs text-[var(--color-danger)]">
                  Ẩn
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ----- Modal xem chi tiết ----- */}
      {(detailLoading || detailCategory || detailError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Chi tiết danh mục</h2>
              <button type="button" onClick={closeDetail} className="text-sm text-[var(--color-text-muted)]">
                Đóng
              </button>
            </div>

            {detailLoading && <p className="mt-4 text-sm text-[var(--color-text-muted)]">Đang tải...</p>}

            {detailError && <p className="mt-4 text-sm text-[var(--color-danger)]">{detailError}</p>}

            {detailCategory && !detailLoading && (
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-[var(--color-text-dim)]">ID</dt>
                  <dd className="font-mono-tag text-xs">{detailCategory.id}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-dim)]">Tên</dt>
                  <dd>{detailCategory.name}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-dim)]">Slug</dt>
                  <dd>/{detailCategory.slug}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-dim)]">Trạng thái</dt>
                  <dd>{detailCategory.status}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-dim)]">Ngày tạo</dt>
                  <dd>{formatDate(detailCategory.createdAt)}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>
      )}

      {/* ----- Modal sửa ----- */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <form
            onSubmit={submitEdit}
            className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Sửa danh mục</h2>
              <button type="button" onClick={closeEdit} className="text-sm text-[var(--color-text-muted)]">
                Đóng
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs text-[var(--color-text-dim)]">Tên danh mục</label>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="text-xs text-[var(--color-text-dim)]">Slug</label>
                <input
                  value={editSlug}
                  onChange={(event) => setEditSlug(event.target.value)}
                  placeholder="Để trống sẽ tự sinh từ tên"
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="text-xs text-[var(--color-text-dim)]">Trạng thái</label>
                <select
                  value={editStatus}
                  onChange={(event) => setEditStatus(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            </div>

            {editError && <p className="mt-3 text-sm text-[var(--color-danger)]">{editError}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeEdit} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm">
                Huỷ
              </button>
              <button
                disabled={editSubmitting}
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)] disabled:opacity-60"
              >
                {editSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}