import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import useAuth from '../../../hooks/useAuth';
import { roleLabel } from '../../../store/authStore';
import { useTheme } from '../../../contexts/ThemeContext';
import { userService } from '../../../services/userService';
import { getApiErrorMessage } from '../../../services/apiError';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout, updateProfile } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingProfile, setLoadingProfile] =
    useState(true);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [form, setForm] = useState(() => ({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
  }));

  const [pendingDestination, setPendingDestination] = useState<string | null>(
    null,
  );
  const [pendingLogout, setPendingLogout] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        setProfileError('');

        const profile = await userService.getProfile();

        if (cancelled) return;

        updateProfile({
          fullName: profile.fullName,
          phone: profile.phone,
        });
        setForm({
          fullName: profile.fullName,
          phone: profile.phone,
        });
      } catch (requestError) {
        if (!cancelled) {
          setProfileError(
            getApiErrorMessage(
              requestError,
              'Không thể tải hồ sơ từ hệ thống.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id, updateProfile]);

  const isDirty =
    form.fullName !== (user?.fullName ?? '') ||
    form.phone !== (user?.phone ?? '');

  const resetForm = () => {
    setForm({
      fullName: user?.fullName ?? '',
      phone: user?.phone ?? '',
    });
  };

  const updateField = (
    field: 'fullName' | 'phone',
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setSaved(false);
  };

  const saveChanges = async (): Promise<boolean> => {
    const fullName = form.fullName.trim();
    const phone = form.phone.replace(/[\s-]/g, '');

    if (!isEditing || !fullName) return false;

    if (!/^\+?\d{9,15}$/.test(phone)) {
      setProfileError(
        'Số điện thoại phải có từ 9 đến 15 chữ số và có thể bắt đầu bằng +.',
      );
      return false;
    }

    try {
      setSaving(true);
      setProfileError('');

      const profile = await userService.updateProfile({
        fullName,
        phone,
      });
      const updatedUser = updateProfile({
        fullName: profile.fullName,
        phone: profile.phone,
      });

      if (!updatedUser) return false;

      setForm({
        fullName: updatedUser.fullName,
        phone: updatedUser.phone,
      });
      setIsEditing(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);

      return true;
    } catch (requestError) {
      setProfileError(
        getApiErrorMessage(
          requestError,
          'Không thể cập nhật hồ sơ.',
        ),
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void saveChanges();
  };

  const handleLogout = () => {
    if (isEditing && isDirty) {
      setPendingLogout(true);
      return;
    }

    logout();
    window.location.replace('/auctions');
  };

  const closeUnsavedModal = () => {
    setPendingDestination(null);
    setPendingLogout(false);
  };

  const runPendingAction = () => {
    const destination = pendingDestination;
    const shouldLogout = pendingLogout;

    setPendingDestination(null);
    setPendingLogout(false);

    if (shouldLogout) {
      logout();
      window.location.replace('/auctions');
      return;
    }

    if (destination) {
      navigate(destination);
    }
  };

  const leaveWithoutSaving = () => {
    resetForm();
    setIsEditing(false);
    setSaved(false);
    runPendingAction();
  };

  const saveAndContinue = async () => {
    if (await saveChanges()) {
      runPendingAction();
    }
  };

  const handleEditButton = () => {
    if (isEditing) {
      if (isDirty) {
        setPendingDestination('/profile');
        return;
      }

      setIsEditing(false);
      return;
    }

    resetForm();
    setSaved(false);
    setIsEditing(true);
  };

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isEditing || !isDirty) return;

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isEditing, isDirty]);

  useEffect(() => {
    if (!isEditing || !isDirty) return;

    const handlePageClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (!(event.target instanceof Element)) return;

      const logoutButton = event.target.closest('button');

      if (logoutButton?.textContent?.trim() === 'Đăng xuất') {
        event.preventDefault();
        event.stopPropagation();
        setPendingLogout(true);
        return;
      }

      const link = event.target.closest('a[href]');

      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target === '_blank') return;

      const url = new URL(link.href, window.location.href);

      if (url.origin !== window.location.origin) return;

      event.preventDefault();
      event.stopPropagation();

      setPendingDestination(
        `${url.pathname}${url.search}${url.hash}`,
      );
    };

    document.addEventListener('click', handlePageClick, true);

    return () => {
      document.removeEventListener('click', handlePageClick, true);
    };
  }, [isEditing, isDirty]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Tài khoản
      </span>

      <h1 className="mt-2 font-display text-4xl">
        Hồ sơ cá nhân
      </h1>

      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Thông tin này sẽ được hiển thị trong các giao dịch và phiên đấu giá
        của bạn.
      </p>

      <div className="mt-9 grid gap-7 lg:grid-cols-[0.65fr_1.35fr]">
        <aside className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-surface-raised)] font-display text-3xl text-[var(--color-primary)]">
            {user?.fullName
              .split(' ')
              .slice(-2)
              .map((part) => part[0])
              .join('')
              .toUpperCase() ?? 'U'}
          </div>

          <h2 className="mt-4 font-display text-2xl">
            {user?.fullName ?? 'Người dùng demo'}
          </h2>

          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Thành viên từ 07/2026
          </p>

          <span className="mt-4 inline-block rounded-full border border-[var(--color-success-border)]/40 bg-[var(--color-success-bg)]/15 px-3 py-1 text-xs text-[var(--color-success)]">
            Đã xác minh
          </span>

          {user && (
            <p className="mt-3 font-mono-tag text-xs uppercase tracking-wider text-[var(--color-primary)]">
              {roleLabel[user.role]}
            </p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-[var(--color-border)]">
            <div className="bg-[var(--color-surface-alt)] p-4">
              <dt className="font-display text-2xl">
                {user?.role === 'ADMIN' ? 18 : 4}
              </dt>

              <dd className="mt-1 text-[10px] text-[var(--color-text-dim)]">
                {user?.role === 'ADMIN'
                  ? 'Tác vụ quản trị'
                  : 'Phiên đã tạo'}
              </dd>
            </div>

            <div className="bg-[var(--color-surface-alt)] p-4">
              <dt className="font-display text-2xl">
                {user?.role === 'ADMIN' ? '100%' : '4.9'}
              </dt>

              <dd className="mt-1 text-[10px] text-[var(--color-text-dim)]">
                {user?.role === 'ADMIN'
                  ? 'Quyền hệ thống'
                  : 'Đánh giá'}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-5 inline-flex w-full items-center justify-center rounded-md border border-[var(--color-danger-border)] px-5 py-2.5 text-sm font-semibold text-[var(--color-danger)] transition hover:border-[var(--color-danger)] hover:bg-[var(--color-danger-border)]/15"
          >
            Đăng xuất
          </button>
        </aside>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">
              Thông tin liên hệ
            </h2>

            <span className="text-xs text-[var(--color-text-dim)]">
              {loadingProfile ? 'Đang tải hồ sơ...' : ''}
            </span>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Input
              label="Họ và tên"
              value={form.fullName}
              onChange={(event) =>
                updateField('fullName', event.target.value)
              }
              disabled={!isEditing}
              required
            />

            <Input
              label="Số điện thoại"
              type="tel"
              value={form.phone}
              onChange={(event) =>
                updateField('phone', event.target.value)
              }
              disabled={!isEditing}
              pattern="\+?[0-9\s-]{9,18}"
              required
            />
          </div>

          <div className="mt-5">
            <Input
              label="Email"
              type="email"
              value={user?.email ?? ''}
              disabled
            />
          </div>

          <div className="mt-7 border-t border-[var(--color-border)] pt-6">
            <h3 className="font-display text-lg">
              Thông báo
            </h3>

            <div className="mt-4 space-y-3">
              {[
                'Thông báo khi có người vượt giá',
                'Nhắc trước khi phiên kết thúc',
                'Tin tức và phiên đấu giá nổi bật',
              ].map((label, index) => (
                <label
                  key={label}
                  className="flex items-center justify-between gap-4 text-sm text-[var(--color-text-soft)]"
                >
                  <span>{label}</span>

                  <input
                    type="checkbox"
                    defaultChecked={index < 2}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-7 border-t border-[var(--color-border)] pt-6">
            <div className="flex items-center justify-between gap-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4 sm:p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-xl text-[var(--color-primary)]">
                  {isDark ? '☾' : '☀'}
                </div>

                <div>
                  <h3 className="font-display text-lg text-[var(--color-text)]">
                    Giao diện
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                    {isDark
                      ? 'Đang sử dụng giao diện tối mặc định.'
                      : 'Đang sử dụng giao diện sáng màu vàng kem.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  isDark
                    ? 'Bật giao diện sáng'
                    : 'Bật giao diện tối'
                }
                aria-pressed={!isDark}
                className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${
                  isDark
                    ? 'border-[var(--color-border-strong)] bg-[var(--color-bg)]'
                    : 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                }`}
              >
                <span
                  className={`absolute top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-xs shadow-md transition-transform ${
                    isDark ? 'translate-x-1' : 'translate-x-7'
                  }`}
                >
                  {isDark ? '☾' : '☀'}
                </span>
              </button>
            </div>
          </div>

          {profileError && (
            <p className="mt-6 rounded-md border border-[var(--color-danger-solid)]/40 bg-[var(--color-danger-solid)]/10 px-4 py-3 text-xs text-[var(--color-danger)]">
              {profileError}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
            {saved && (
              <span className="mr-auto text-xs text-[var(--color-success)]">
                Đã lưu thay đổi
              </span>
            )}

            {isEditing && !isDirty && (
              <span className="mr-auto text-xs text-[var(--color-text-muted)]">
                Chưa có thay đổi mới
              </span>
            )}

            <button
              type="button"
              onClick={handleEditButton}
              className="rounded-md border border-[var(--color-border-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              {isEditing
                ? 'Hủy chỉnh sửa'
                : 'Cập nhật thông tin'}
            </button>

            <Button
              type="submit"
              disabled={
                loadingProfile ||
                saving ||
                !isEditing ||
                !isDirty ||
                !form.fullName.trim() ||
                !/^\+?\d{9,15}$/.test(
                  form.phone.replace(/[\s-]/g, ''),
                )
              }
            >
              {saving ? 'Đang lưu...' : 'Lưu thông tin'}
            </Button>
          </div>
        </form>
      </div>

      <Modal
        open={pendingDestination !== null || pendingLogout}
        title="Thông tin chưa được lưu"
        onClose={closeUnsavedModal}
      >
        <p className="text-sm leading-6 text-[var(--color-text-soft)]">
          Bạn đã thay đổi thông tin cá nhân nhưng chưa lưu. Bạn muốn lưu
          thay đổi trước khi rời khỏi trang không?
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={closeUnsavedModal}
            className="rounded-md border border-[var(--color-border-strong)] px-4 py-2.5 text-sm text-[var(--color-text)]"
          >
            Ở lại trang
          </button>

          <button
            type="button"
            onClick={leaveWithoutSaving}
            className="rounded-md border border-[var(--color-danger-border)] px-4 py-2.5 text-sm text-[var(--color-danger)]"
          >
            Giữ nguyên
          </button>

          <Button
            type="button"
            onClick={() => void saveAndContinue()}
            disabled={
              saving ||
              !form.fullName.trim() ||
              !/^\+?\d{9,15}$/.test(
                form.phone.replace(/[\s-]/g, ''),
              )
            }
          >
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}