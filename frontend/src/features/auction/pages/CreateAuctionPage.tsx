import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import useAuth from '../../../hooks/useAuth';
import { createDemoAuction } from '../../../store/auctionStore';

export default function CreateAuctionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ title: '', category: '', startingPrice: '', minimumBidIncrement: '', startTime: '', endTime: '', description: '' });
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (field: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [field]: value }));
  const uploadImages = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 5);
    setPreviews(files.map((file) => URL.createObjectURL(file)));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!form.category) return setError('Vui lòng chọn danh mục.');
    if (Number(form.startingPrice) <= 0 || Number(form.minimumBidIncrement) <= 0) return setError('Giá khởi điểm và bước giá phải lớn hơn 0.');
    if (new Date(form.endTime) <= new Date(form.startTime)) return setError('Thời gian kết thúc phải sau thời gian bắt đầu.');
    if (new Date(form.endTime) <= new Date()) return setError('Không thể tạo phiên đã kết thúc.');
    if (!previews.length) return setError('Vui lòng chọn ít nhất một ảnh.');
    if (!user || user.role !== 'USER') return setError('Bạn cần đăng nhập bằng tài khoản thành viên.');
    setLoading(true);
    window.setTimeout(() => {
      createDemoAuction({
        ...form,
        startingPrice: Number(form.startingPrice),
        minimumBidIncrement: Number(form.minimumBidIncrement),
      }, user);
      setLoading(false);
      navigate('/my-auctions', { replace: true, state: { created: true } });
    }, 650);
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Thành viên · Gửi phiên</span>
      <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="font-display text-4xl">Đăng một vật phẩm mới</h1><p className="mt-2 text-sm text-[var(--color-text-muted)]">Điền đầy đủ thông tin theo UC06. Phiên chỉ công khai sau khi Admin duyệt.</p></div><span className="rounded-full border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-3 py-1 text-xs text-[var(--color-primary-hover)]">Sẽ chuyển sang chờ duyệt</span></div>

      <form onSubmit={submit} className="mt-9 grid gap-8 lg:grid-cols-[1fr_0.72fr]">
        <div className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
          <Input label="Tên vật phẩm" value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Ví dụ: Đồng hồ cơ Thụy Sĩ 1960" required />
          <label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]">Danh mục<select required value={form.category} onChange={(event) => update('category', event.target.value)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3 font-sans text-sm normal-case tracking-normal text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"><option value="">Chọn danh mục</option><option>Đồng hồ</option><option>Máy ảnh</option><option>Âm thanh</option><option>Sưu tầm</option></select></label>
          <div className="grid gap-5 sm:grid-cols-2"><Input label="Giá khởi điểm" type="number" value={form.startingPrice} onChange={(event) => update('startingPrice', event.target.value)} placeholder="10000000" required /><Input label="Bước giá tối thiểu" type="number" value={form.minimumBidIncrement} onChange={(event) => update('minimumBidIncrement', event.target.value)} placeholder="500000" required /></div>
          <div className="grid gap-5 sm:grid-cols-2"><Input label="Thời gian bắt đầu" type="datetime-local" value={form.startTime} onChange={(event) => update('startTime', event.target.value)} required /><Input label="Thời gian kết thúc" type="datetime-local" value={form.endTime} onChange={(event) => update('endTime', event.target.value)} required /></div>
          <label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]">Mô tả vật phẩm<textarea rows={6} required value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Nguồn gốc, tình trạng, phụ kiện đi kèm..." className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3 font-sans text-sm normal-case tracking-normal text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-primary)]" /></label>
        </div>

        <div className="space-y-6">
          <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-center hover:border-[var(--color-primary)]"><span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-2xl text-[var(--color-primary)]">＋</span><strong className="mt-4 text-sm">Chọn tối đa 5 ảnh</strong><span className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">Ảnh đầu tiên là ảnh chính</span><input type="file" accept="image/*" multiple onChange={uploadImages} className="sr-only" /></label>
          {previews.length > 0 && <div className="grid grid-cols-3 gap-2">{previews.map((image, index) => <div key={image} className="relative overflow-hidden rounded-lg border border-[var(--color-border)]"><img src={image} alt={`Xem trước ${index + 1}`} className="aspect-square w-full object-cover" />{index === 0 && <span className="absolute bottom-1 left-1 rounded bg-[var(--color-primary)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-bg)]">Ảnh chính</span>}</div>)}</div>}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-5"><h3 className="font-display text-lg">Quy tắc trạng thái</h3><ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--color-text-muted)]"><li>• Gửi thành công → Chờ Admin duyệt.</li><li>• Chỉ phiên đã duyệt mới xuất hiện công khai.</li><li>• Không cho phép thời gian kết thúc trong quá khứ.</li></ul></div>
          {error && <p className="rounded-md border border-[var(--color-danger-solid)]/40 bg-[var(--color-danger-solid)]/10 px-4 py-3 text-xs text-[var(--color-danger)]">{error}</p>}
          <div className="grid grid-cols-2 gap-3"><Link to="/my-auctions" className="rounded-md border border-[var(--color-border-strong)] px-5 py-2.5 text-center text-sm font-semibold text-[var(--color-text)]">Hủy</Link><Button type="submit" disabled={loading}>{loading ? 'Đang gửi...' : 'Gửi Admin duyệt'}</Button></div>
        </div>
      </form>
    </div>
  );
}
