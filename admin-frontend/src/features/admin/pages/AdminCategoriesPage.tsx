import { FormEvent, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import Loading from '../../../components/common/Loading';
import { getApiErrorMessage } from '../../../services/apiError';
import {
  adminApi,
  type AdminCategory,
  type AdminCategoryStatus,
} from '../../../services/serverless/adminApi';

type CategoryForm = { name: string; slug: string };

const emptyForm: CategoryForm = { name: '', slug: '' };

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [status, setStatus] = useState<AdminCategoryStatus | ''>('');
  const [keyword, setKeyword] = useState('');
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadCategories = async (paginationToken?: string) => {
    setLoading(true);
    try {
      const page = await adminApi.listAdminCategories({
        pageSize: 100,
        ...(status ? { status } : {}),
        ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
        ...(paginationToken ? { paginationToken } : {}),
      });
      setCategories(page.items);
      setNextToken(page.next_token);
      setError('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to load categories.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCategories(); }, 0);
    return () => window.clearTimeout(timer);
    // Filters are intentionally submitted through the form to avoid request storms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusyId(editingId ?? 'new');
    setError('');
    setMessage('');
    try {
      const updated = editingId
        ? await adminApi.updateAdminCategory(editingId, {
          name: form.name.trim(),
          ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        })
        : await adminApi.createAdminCategory({
          name: form.name.trim(),
          ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        });
      setCategories((current) => editingId
        ? current.map((category) => category.category_id === updated.category_id ? updated : category)
        : [updated, ...current]);
      setForm(emptyForm);
      setEditingId(null);
      setMessage(editingId ? 'Category updated.' : 'Category created.');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to save category.'));
    } finally {
      setBusyId('');
    }
  };

  const archive = async (category: AdminCategory) => {
    if (category.status === 'INACTIVE' || busyId) return;
    if (!window.confirm(`Archive category "${category.name}"? Existing item history will remain readable.`)) return;
    setBusyId(category.category_id);
    setError('');
    setMessage('');
    try {
      const updated = await adminApi.archiveAdminCategory(category.category_id);
      setCategories((current) => current.map((item) => item.category_id === updated.category_id ? updated : item));
      setMessage('Category archived.');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to archive category.'));
    } finally {
      setBusyId('');
    }
  };

  const startEdit = (category: AdminCategory) => {
    setEditingId(category.category_id);
    setForm({ name: category.name, slug: category.slug });
    setMessage('');
    setError('');
  };

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin console</span>
      <div className="mt-2 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h1 className="font-display text-4xl">Category management</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Create, edit, and archive the catalog taxonomy.</p>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">{categories.length} categories</p>
      </div>

      <form className="mt-8 grid gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:grid-cols-[1fr_1fr_12rem_auto] lg:items-end" onSubmit={submit}>
        <Input label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Fine Art" maxLength={150} />
        <Input label="Slug (optional)" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="fine-art" maxLength={150} />
        <label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]" htmlFor="category-status">
          Filter
          <select id="category-status" value={status} onChange={(event) => setStatus(event.target.value as AdminCategoryStatus | '')} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-2.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <Button type="submit" disabled={busyId === 'new' || !form.name.trim()}>{editingId ? 'Update' : 'Create'}</Button>
      </form>

      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void loadCategories(); }}>
        <Input label="Search categories" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Name or slug" />
        <Button type="submit" variant="secondary" className="sm:self-end">Search</Button>
        {editingId && <Button type="button" variant="ghost" className="sm:self-end" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel edit</Button>}
      </form>

      {error && <p className="mt-6 rounded-xl border border-[var(--color-danger-solid)]/60 px-5 py-4 text-sm text-[var(--color-danger)]">{error}</p>}
      {message && <p className="mt-6 rounded-xl border border-[var(--color-success-border)] px-5 py-4 text-sm text-[var(--color-success)]">{message}</p>}

      <section className="mt-8 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {loading ? <Loading /> : categories.length === 0 ? <p className="px-6 py-16 text-center text-sm text-[var(--color-text-muted)]">No categories found.</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                <tr><th className="px-5 py-4 font-normal">Category</th><th className="px-5 py-4 font-normal">Slug</th><th className="px-5 py-4 font-normal">Status</th><th className="px-5 py-4 font-normal">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {categories.map((category) => (
                  <tr key={category.category_id}>
                    <td className="px-5 py-4"><p>{category.name}</p><p className="mt-1 text-xs text-[var(--color-text-dim)]">{category.category_id}</p></td>
                    <td className="px-5 py-4 text-xs text-[var(--color-text-muted)]">{category.slug}</td>
                    <td className="px-5 py-4"><span className={category.status === 'ACTIVE' ? 'text-[var(--color-success)]' : 'text-[var(--color-text-dim)]'}>{category.status}</span></td>
                    <td className="px-5 py-4"><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => startEdit(category)}>Edit</Button><Button type="button" variant="ghost" disabled={category.status === 'INACTIVE' || busyId === category.category_id} onClick={() => void archive(category)}>Archive</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="mt-5 flex justify-end">{nextToken && <Button type="button" variant="secondary" disabled={loading} onClick={() => void loadCategories(nextToken)}>Next page</Button>}</div>
    </section>
  );
}
