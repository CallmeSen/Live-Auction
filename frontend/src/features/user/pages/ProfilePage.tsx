import { useState } from 'react';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import useAuth from '../../../hooks/useAuth';
import { roleLabel } from '../../../store/authStore';

export default function ProfilePage() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const submit = (event: React.FormEvent) => { event.preventDefault(); setSaved(true); setTimeout(() => setSaved(false), 2500); };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">Tài khoản</span>
      <h1 className="mt-2 font-display text-4xl">Hồ sơ cá nhân</h1>
      <p className="mt-2 text-sm text-[#7d9186]">Thông tin này sẽ được hiển thị trong các giao dịch và phiên đấu giá của bạn.</p>

      <div className="mt-9 grid gap-7 lg:grid-cols-[0.65fr_1.35fr]">
        <aside className="rounded-2xl border border-[#2a3f31] bg-[#14231a] p-6 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#C9A227] bg-[#1b3022] font-display text-3xl text-[#C9A227]">{user?.fullName.split(' ').slice(-2).map((part) => part[0]).join('').toUpperCase() ?? 'U'}</div>
          <h2 className="mt-4 font-display text-2xl">{user?.fullName ?? 'Người dùng demo'}</h2>
          <p className="mt-1 text-sm text-[#7d9186]">Thành viên từ 07/2026</p>
          <span className="mt-4 inline-block rounded-full border border-[#4e8b5e]/40 bg-[#2f6541]/15 px-3 py-1 text-xs text-[#8fc99c]">Đã xác minh</span>
          {user && <p className="mt-3 font-mono-tag text-xs uppercase tracking-wider text-[#C9A227]">{roleLabel[user.role]}</p>}
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-[#2a3f31]">
            <div className="bg-[#16241c] p-4"><dt className="font-display text-2xl">{user?.role === 'ADMIN' ? 18 : user?.role === 'SELLER' ? 4 : 12}</dt><dd className="mt-1 text-[10px] text-[#607468]">{user?.role === 'ADMIN' ? 'Tác vụ quản trị' : user?.role === 'SELLER' ? 'Phiên đã tạo' : 'Phiên tham gia'}</dd></div>
            <div className="bg-[#16241c] p-4"><dt className="font-display text-2xl">{user?.role === 'ADMIN' ? '100%' : '4.9'}</dt><dd className="mt-1 text-[10px] text-[#607468]">{user?.role === 'ADMIN' ? 'Quyền hệ thống' : 'Đánh giá'}</dd></div>
          </dl>
        </aside>

        <form onSubmit={submit} className="rounded-2xl border border-[#2a3f31] bg-[#14231a] p-6 sm:p-8">
          <div className="flex items-center justify-between"><h2 className="font-display text-2xl">Thông tin liên hệ</h2><span className="text-xs text-[#607468]">Dữ liệu mẫu</span></div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Input label="Họ và tên" defaultValue={user?.fullName ?? ''} />
            <Input label="Số điện thoại" defaultValue={user?.phone ?? ''} />
          </div>
          <div className="mt-5"><Input label="Email" type="email" defaultValue={user?.email ?? ''} disabled /></div>
          <div className="mt-5"><Input label="Địa chỉ" defaultValue="Quận 7, TP. Hồ Chí Minh" /></div>
          <div className="mt-7 border-t border-[#2a3f31] pt-6">
            <h3 className="font-display text-lg">Thông báo</h3>
            <div className="mt-4 space-y-3">
              {['Thông báo khi có người vượt giá', 'Nhắc trước khi phiên kết thúc', 'Tin tức và phiên đấu giá nổi bật'].map((label, index) => (
                <label key={label} className="flex items-center justify-between gap-4 text-sm text-[#8ca093]"><span>{label}</span><input type="checkbox" defaultChecked={index < 2} className="h-4 w-4 accent-[#C9A227]" /></label>
              ))}
            </div>
          </div>
          <div className="mt-8 flex items-center justify-end gap-4">
            {saved && <span className="text-xs text-[#8fc99c]">Đã lưu thay đổi</span>}
            <Button type="submit">Lưu thông tin</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
