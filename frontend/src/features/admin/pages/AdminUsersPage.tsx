import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import useAuth from '../../../hooks/useAuth';
import { adminService } from '../../../services/adminService';
import { userService } from '../../../services/userService';
import type { CreateAdminUserResponse } from '../../../interfaces/admin';
import type {
  AuthUserRole,
  AuthUserStatus,
} from '../../../interfaces/auth';
import type {
  UserListItemResponse,
  UserListPaginationResponse,
} from '../../../interfaces/user';
import { getApiErrorMessage } from '../../../services/apiError';
import { formatDateTime } from '../../../utils/formatDate';

const initialForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
};

const roleLabel: Record<AuthUserRole, string> = {
  ADMIN: 'Quản trị viên',
  USER: 'Người dùng',
};

const statusLabel: Record<AuthUserStatus, string> = {
  ACTIVE: 'Hoạt động',
  BANNED: 'Đã khóa',
};

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [createdAdmin, setCreatedAdmin] =
    useState<CreateAdminUserResponse | null>(null);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const [users, setUsers] = useState<UserListItemResponse[]>([]);
  const [pagination, setPagination] =
    useState<UserListPaginationResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [listMessage, setListMessage] = useState('');
  const [statusTarget, setStatusTarget] =
    useState<UserListItemResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] =
    useState<AuthUserRole | ''>('');
  const [statusFilter, setStatusFilter] =
    useState<AuthUserStatus | ''>('');

  const loadUsers = useCallback(async () => {
    try {
      setListLoading(true);
      setListError('');

      const result = await userService.getUsers({
        page,
        pageSize: 20,
        keyword: keyword || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      setUsers(result.items);
      setPagination(result.pagination);
    } catch (requestError) {
      setListError(
        getApiErrorMessage(
          requestError,
          'Không thể tải danh sách người dùng.',
        ),
      );
    } finally {
      setListLoading(false);
    }
  }, [keyword, page, roleFilter, statusFilter]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadUsers]);

  const update = (
    field: keyof typeof form,
    value: string,
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const applyFilters = () => {
    setPage(1);
    setKeyword(keywordInput.trim());
  };

  const changeUserStatus = async () => {
    if (!statusTarget) {
      return;
    }

    const nextStatus: AuthUserStatus =
      statusTarget.status === 'ACTIVE' ? 'BANNED' : 'ACTIVE';

    try {
      setStatusLoading(true);
      setListError('');
      setListMessage('');

      const result = await adminService.updateUserStatus(
        statusTarget.id,
        { status: nextStatus },
      );

      setUsers((current) =>
        current.map((item) =>
          item.id === result.id
            ? {
                ...item,
                status: result.status,
                updatedAt: result.updatedAt,
              }
            : item,
        ),
      );
      setListMessage(
        nextStatus === 'BANNED'
          ? 'Đã khóa tài khoản. Người dùng không thể đăng nhập hoặc gọi API cần xác thực.'
          : 'Đã mở khóa tài khoản.',
      );
      setStatusTarget(null);
    } catch (requestError) {
      setListError(
        getApiErrorMessage(
          requestError,
          'Không thể cập nhật trạng thái tài khoản.',
        ),
      );
    } finally {
      setStatusLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setCreatedAdmin(null);

    if (!/^\d{9,15}$/.test(form.phone)) {
      setFormError(
        'Số điện thoại phải có từ 9 đến 15 chữ số.',
      );
      return;
    }

    if (form.password.length < 6) {
      setFormError('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    try {
      setFormLoading(true);

      const result = await adminService.createAdminUser({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone,
        password: form.password,
      });

      setCreatedAdmin(result);
      setForm(initialForm);
      await loadUsers();
    } catch (requestError) {
      setFormError(
        getApiErrorMessage(
          requestError,
          'Không thể tạo tài khoản Admin.',
        ),
      );
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Admin · Người dùng
      </span>

      <h1 className="mt-2 font-display text-4xl">
        Quản lý tài khoản
      </h1>

      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Tìm kiếm, lọc, khóa hoặc mở lại tài khoản vi phạm.
      </p>

      <section className="mt-7 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
        <h2 className="font-display text-2xl">
          Danh sách người dùng
        </h2>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
          <Input
            label="Tìm kiếm"
            value={keywordInput}
            onChange={(event) =>
              setKeywordInput(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyFilters();
              }
            }}
            placeholder="Email, họ tên hoặc số điện thoại"
          />

          <label className="block text-sm">
            <span className="mb-2 block text-[var(--color-text-muted)]">
              Vai trò
            </span>
            <select
              value={roleFilter}
              onChange={(event) => {
                setPage(1);
                setRoleFilter(
                  event.target.value as AuthUserRole | '',
                );
              }}
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">Tất cả</option>
              <option value="USER">Người dùng</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-2 block text-[var(--color-text-muted)]">
              Trạng thái
            </span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(
                  event.target.value as AuthUserStatus | '',
                );
              }}
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">Tất cả</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="BANNED">Đã khóa</option>
            </select>
          </label>

          <Button type="button" onClick={applyFilters}>
            Tìm kiếm
          </Button>
        </div>

        {listMessage && (
          <div className="mt-5 rounded-xl border border-[var(--color-success-border)] px-5 py-4 text-sm text-[var(--color-success)]">
            {listMessage}
          </div>
        )}

        {listError && (
          <div className="mt-5 rounded-xl border border-[var(--color-danger-solid)]/60 px-5 py-4 text-sm text-[var(--color-danger)]">
            {listError}
          </div>
        )}

        {listLoading && (
          <div className="mt-7 rounded-xl border border-[var(--color-border)] py-16 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              Đang tải danh sách người dùng...
            </p>
          </div>
        )}

        {!listLoading && !listError && (
          <>
            <div className="mt-7 overflow-x-auto rounded-xl border border-[var(--color-border)]">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)]/40 text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Họ và tên</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Số điện thoại</th>
                    <th className="px-4 py-3 font-medium">Vai trò</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                    <th className="px-4 py-3 font-medium">Ngày tạo</th>
                    <th className="px-4 py-3 font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length > 0 ? (
                    users.map((account) => {
                      const isCurrentAccount =
                        currentUser?.id === account.id;

                      return (
                        <tr
                          key={account.id}
                          className="border-b border-[var(--color-border)] last:border-b-0"
                        >
                          <td className="px-4 py-4 font-medium">
                            {account.fullName}
                          </td>
                          <td className="px-4 py-4 text-[var(--color-text-muted)]">
                            {account.email}
                          </td>
                          <td className="px-4 py-4 text-[var(--color-text-muted)]">
                            {account.phone}
                          </td>
                          <td className="px-4 py-4">
                            <span className="rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-[10px]">
                              {roleLabel[account.role]}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={
                                'rounded-full border px-2.5 py-1 text-[10px] ' +
                                (account.status === 'ACTIVE'
                                  ? 'border-[var(--color-success-border)] text-[var(--color-success)]'
                                  : 'border-[var(--color-danger-solid)]/60 text-[var(--color-danger)]')
                              }
                            >
                              {statusLabel[account.status]}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-xs text-[var(--color-text-dim)]">
                            {formatDateTime(account.createdAt)}
                          </td>
                          <td className="px-4 py-4">
                            {isCurrentAccount ? (
                              <span className="text-xs text-[var(--color-text-dim)]">
                                Tài khoản hiện tại
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setStatusTarget(account)}
                                className={
                                  'rounded-md border px-3 py-2 text-xs ' +
                                  (account.status === 'ACTIVE'
                                    ? 'border-[var(--color-danger-solid)] text-[var(--color-danger)]'
                                    : 'border-[var(--color-success-border)] text-[var(--color-success)]')
                                }
                              >
                                {account.status === 'ACTIVE'
                                  ? 'Khóa tài khoản'
                                  : 'Mở khóa'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-16 text-center text-[var(--color-text-muted)]"
                      >
                        Không tìm thấy người dùng nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalItems > 0 && (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[var(--color-text-dim)]">
                  Trang {pagination.page} / {pagination.totalPages} ·{' '}
                  {pagination.totalItems} người dùng
                </p>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={!pagination.hasPreviousPage}
                    onClick={() =>
                      setPage((current) => current - 1)
                    }
                  >
                    Trang trước
                  </Button>

                  <Button
                    type="button"
                    disabled={!pagination.hasNextPage}
                    onClick={() =>
                      setPage((current) => current + 1)
                    }
                  >
                    Trang sau
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <form
        onSubmit={submit}
        className="mt-7 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8"
      >
        <h2 className="font-display text-2xl">
          Tạo tài khoản Admin
        </h2>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Input
            label="Họ và tên"
            value={form.fullName}
            onChange={(event) =>
              update('fullName', event.target.value)
            }
            placeholder="Nguyễn Văn Admin"
            required
          />

          <Input
            label="Số điện thoại"
            type="tel"
            value={form.phone}
            onChange={(event) =>
              update('phone', event.target.value)
            }
            placeholder="0901234567"
            required
          />

          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(event) =>
              update('email', event.target.value)
            }
            placeholder="admin@example.com"
            required
          />

          <Input
            label="Mật khẩu"
            type="password"
            value={form.password}
            onChange={(event) =>
              update('password', event.target.value)
            }
            placeholder="Tối thiểu 6 ký tự"
            required
          />
        </div>

        {formError && (
          <p className="mt-5 rounded-md border border-[var(--color-danger-solid)]/40 bg-[var(--color-danger-solid)]/10 px-4 py-3 text-xs text-[var(--color-danger)]">
            {formError}
          </p>
        )}

        {createdAdmin && (
          <div className="mt-5 rounded-md border border-[var(--color-success-border)] bg-[var(--color-success-bg)]/15 px-4 py-3 text-sm text-[var(--color-success)]">
            <p>
              Đã tạo Admin <strong>{createdAdmin.fullName}</strong> thành công.
            </p>
            <p className="mt-1 text-xs">Email: {createdAdmin.email}</p>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={formLoading}>
            {formLoading ? 'Đang tạo tài khoản...' : 'Tạo Admin'}
          </Button>
        </div>
      </form>

      {statusTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-status-title"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <h2 id="user-status-title" className="font-display text-2xl">
              {statusTarget.status === 'ACTIVE'
                ? 'Khóa tài khoản'
                : 'Mở khóa tài khoản'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
              {statusTarget.status === 'ACTIVE'
                ? 'Sau khi khóa, tài khoản này không thể đăng nhập hoặc sử dụng chức năng cần xác thực.'
                : 'Tài khoản sẽ có thể đăng nhập và sử dụng hệ thống trở lại.'}
            </p>
            <p className="mt-3 text-sm font-semibold">
              {statusTarget.fullName} · {statusTarget.email}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={statusLoading}
                onClick={() => setStatusTarget(null)}
                className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-sm disabled:opacity-50"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={statusLoading}
                onClick={() => void changeUserStatus()}
                className={
                  'rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-50 ' +
                  (statusTarget.status === 'ACTIVE'
                    ? 'bg-[var(--color-danger-solid)] text-white'
                    : 'bg-[var(--color-primary)] text-[#0F1B14]')
                }
              >
                {statusLoading
                  ? 'Đang xử lý...'
                  : statusTarget.status === 'ACTIVE'
                    ? 'Xác nhận khóa'
                    : 'Xác nhận mở khóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
