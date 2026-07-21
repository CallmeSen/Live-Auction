import { useState } from 'react';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import {
  adminService,
  type CreateAdminUserResponse,
} from '../../../services/adminService';
import { getApiErrorMessage } from '../../../services/apiError';

const initialForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
};

export default function AdminUsersPage() {
  const [form, setForm] = useState(initialForm);
  const [createdAdmin, setCreatedAdmin] =
    useState<CreateAdminUserResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (
    field: keyof typeof form,
    value: string,
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setCreatedAdmin(null);

    if (!/^\d{9,15}$/.test(form.phone)) {
      setError(
        'Số điện thoại phải có từ 9 đến 15 chữ số.',
      );
      return;
    }

    if (form.password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    try {
      setLoading(true);

      const result = await adminService.createAdminUser({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone,
        password: form.password,
      });

      setCreatedAdmin(result);
      setForm(initialForm);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          'Không thể tạo tài khoản Admin.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Admin · Người dùng
      </span>

      <h1 className="mt-2 font-display text-4xl">
        Quản lý tài khoản
      </h1>

      <div className="mt-7 rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-5 py-4 text-sm leading-6 text-[var(--color-primary-hover)]">
        Backend hiện chưa có API xem danh sách, khóa hoặc mở
        khóa người dùng. Hiện tại Admin chỉ có thể tạo thêm
        tài khoản Admin mới.
      </div>

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

        {error && (
          <p className="mt-5 rounded-md border border-[var(--color-danger-solid)]/40 bg-[var(--color-danger-solid)]/10 px-4 py-3 text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}

        {createdAdmin && (
          <div className="mt-5 rounded-md border border-[var(--color-success-border)] bg-[var(--color-success-bg)]/15 px-4 py-3 text-sm text-[var(--color-success)]">
            <p>
              Đã tạo Admin{' '}
              <strong>{createdAdmin.fullName}</strong> thành
              công.
            </p>

            <p className="mt-1 text-xs">
              Email: {createdAdmin.email}
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={loading}>
            {loading
              ? 'Đang tạo tài khoản...'
              : 'Tạo Admin'}
          </Button>
        </div>
      </form>
    </div>
  );
}