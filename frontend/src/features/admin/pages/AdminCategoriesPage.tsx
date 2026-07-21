import { useEffect, useState } from 'react';
import { categoryService } from '../../../services/categoryService';
import type { CategoryResponse, CategoryStatus } from '../../../interfaces/category';
import { getApiErrorMessage } from '../../../services/apiError';

const toSlug = (text: string) =>
  text
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

const formatDate = (value: string) =>
  new Date(value).toLocaleString('vi-VN');

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [detailCategory, setDetailCategory] =
    useState<CategoryResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [editingCategory, setEditingCategory] =
    useState<CategoryResponse | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editStatus, setEditStatus] =
    useState<CategoryStatus>('ACTIVE');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const data = await categoryService.getCategories({
          page: 1,
          size: 100,
        });

        if (!cancelled) {
          setCategories(data.items);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              loadError,
              'Không thể tải danh sách danh mục.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  const addCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();

    if (normalizedName.length < 2) {
      setError('Tên danh mục phải có ít nhất 2 ký tự.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const createdCategory =
        await categoryService.createCategory({
          name: normalizedName,
        });

      setCategories((current) => [
        ...current,
        createdCategory,
      ]);
      setName('');
    } catch (createError) {
      setError(
        getApiErrorMessage(
          createError,
          'Không thể tạo danh mục.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (categoryId: string) => {
    setDetailCategory(null);
    setDetailError('');
    setDetailLoading(true);

    try {
      const category =
        await categoryService.getCategoryById(categoryId);
      setDetailCategory(category);
    } catch (requestError) {
      setDetailError(
        getApiErrorMessage(
          requestError,
          'Không thể tải chi tiết danh mục.',
        ),
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailCategory(null);
    setDetailError('');
  };

  const openEdit = (category: CategoryResponse) => {
    setEditingCategory(category);
    setEditName(category.name);
    setEditSlug(category.slug);
    setEditStatus(category.status);
    setEditError('');
  };

  const closeEdit = () => {
    setEditingCategory(null);
    setEditError('');
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!editingCategory) return;

    const normalizedName = editName.trim();
    const normalizedSlug = editSlug.trim() || toSlug(normalizedName);

    if (normalizedName.length < 2) {
      setEditError('Tên danh mục phải có ít nhất 2 ký tự.');
      return;
    }

    setEditSaving(true);
    setEditError('');

    try {
      const updatedCategory =
        await categoryService.updateCategory(
          editingCategory.id,
          {
            name: normalizedName,
            slug: normalizedSlug,
            status: editStatus,
          },
        );

      setCategories((current) =>
        current.map((category) =>
          category.id === updatedCategory.id
            ? updatedCategory
            : category,
        ),
      );
      closeEdit();
    } catch (updateError) {
      setEditError(
        getApiErrorMessage(
          updateError,
          'Không thể cập nhật danh mục.',
        ),
      );
    } finally {
      setEditSaving(false);
    }
  };

  const toggleCategoryStatus = async (
    category: CategoryResponse,
  ) => {
    setError('');

    try {
      if (category.status === 'ACTIVE') {
        const confirmed = window.confirm(
          `Bạn có chắc muốn vô hiệu hóa danh mục "${category.name}"?`,
        );

        if (!confirmed) return;

        await categoryService.deleteCategory(category.id);

        setCategories((current) =>
          current.map((item) =>
            item.id === category.id
              ? { ...item, status: 'INACTIVE' }
              : item,
          ),
        );
        return;
      }

      const updatedCategory =
        await categoryService.updateCategory(category.id, {
          status: 'ACTIVE',
        });

      setCategories((current) =>
        current.map((item) =>
          item.id === updatedCategory.id
            ? updatedCategory
            : item,
        ),
      );
    } catch (updateError) {
      setError(
        getApiErrorMessage(
          updateError,
          'Không thể cập nhật trạng thái danh mục.',
        ),
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Admin · Danh mục
      </span>
      <h1 className="mt-2 font-display text-4xl">
        Quản lý danh mục
      </h1>

      <form onSubmit={addCategory} className="mt-7 flex gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Tên danh mục mới"
          disabled={saving}
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)] disabled:opacity-60"
        >
          {saving ? 'Đang thêm...' : 'Thêm danh mục'}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-[var(--color-danger-border)] p-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {loading && (
        <p className="mt-6 text-sm text-[var(--color-text-muted)]">
          Đang tải danh mục...
        </p>
      )}

      {!loading && categories.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border-strong)] py-14 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Chưa có danh mục nào
          </p>
        </div>
      )}

      {!loading && categories.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {categories.map((category) => (
            <div
              key={category.id}
              className="grid gap-4 border-b border-[var(--color-border)] p-4 last:border-0 sm:grid-cols-[1fr_100px_auto] sm:items-center"
            >
              <button
                type="button"
                onClick={() => void openDetail(category.id)}
                className="text-left"
              >
                <p className="text-sm hover:underline">
                  {category.name}
                </p>
                <p className="mt-1 font-mono-tag text-[10px] text-[var(--color-text-dim)]">
                  /{category.slug}
                </p>
              </button>

              <span
                className={`text-xs ${
                  category.status === 'ACTIVE'
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-text-dim)]'
                }`}
              >
                {category.status}
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openEdit(category)}
                  className="text-xs text-[var(--color-primary)]"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => void toggleCategoryStatus(category)}
                  className={`text-xs ${
                    category.status === 'ACTIVE'
                      ? 'text-[var(--color-danger)]'
                      : 'text-[var(--color-primary)]'
                  }`}
                >
                  {category.status === 'ACTIVE'
                    ? 'Vô hiệu hóa'
                    : 'Kích hoạt'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(detailLoading || detailCategory || detailError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">
                Chi tiết danh mục
              </h2>
              <button
                type="button"
                onClick={closeDetail}
                className="text-sm text-[var(--color-text-muted)]"
              >
                Đóng
              </button>
            </div>

            {detailLoading && (
              <p className="mt-4 text-sm text-[var(--color-text-muted)]">
                Đang tải...
              </p>
            )}
            {detailError && (
              <p className="mt-4 text-sm text-[var(--color-danger)]">
                {detailError}
              </p>
            )}
            {detailCategory && !detailLoading && (
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-[var(--color-text-dim)]">ID</dt>
                  <dd className="font-mono-tag text-xs">
                    {detailCategory.id}
                  </dd>
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
                  <dt className="text-[var(--color-text-dim)]">
                    Trạng thái
                  </dt>
                  <dd>{detailCategory.status}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-dim)]">
                    Ngày tạo
                  </dt>
                  <dd>{formatDate(detailCategory.createdAt)}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>
      )}

      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <form
            onSubmit={submitEdit}
            className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Sửa danh mục</h2>
              <button
                type="button"
                onClick={closeEdit}
                className="text-sm text-[var(--color-text-muted)]"
              >
                Đóng
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs text-[var(--color-text-dim)]">
                  Tên danh mục
                </span>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </label>

              <label className="block">
                <span className="text-xs text-[var(--color-text-dim)]">
                  Slug
                </span>
                <input
                  value={editSlug}
                  onChange={(event) => setEditSlug(event.target.value)}
                  placeholder="Để trống sẽ tự tạo từ tên"
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </label>

              <label className="block">
                <span className="text-xs text-[var(--color-text-dim)]">
                  Trạng thái
                </span>
                <select
                  value={editStatus}
                  onChange={(event) =>
                    setEditStatus(event.target.value as CategoryStatus)
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
            </div>

            {editError && (
              <p className="mt-3 text-sm text-[var(--color-danger)]">
                {editError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)] disabled:opacity-60"
              >
                {editSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
