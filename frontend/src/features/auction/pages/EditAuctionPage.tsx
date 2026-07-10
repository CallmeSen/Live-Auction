import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { mockAuctions } from '../../../mocks/auctions';

export default function EditAuctionPage() {
  const { id } = useParams(); const navigate = useNavigate();
  const auction = mockAuctions.find((item) => item.id === Number(id));
  const [title, setTitle] = useState(auction?.title ?? ''); const [description, setDescription] = useState(auction?.description ?? ''); const [saved, setSaved] = useState(false);
  if (!auction) return <div className="mx-auto max-w-4xl px-6 py-20"><h1 className="font-display text-3xl">Không tìm thấy phiên</h1></div>;
  const submit = (event: React.FormEvent) => { event.preventDefault(); setSaved(true); window.setTimeout(() => navigate('/my-auctions'), 700); };
  return <div className="mx-auto max-w-4xl px-6 py-10 sm:py-14"><Link to="/my-auctions" className="text-sm text-[#7d9186]">← Quay lại phiên của tôi</Link><span className="mt-7 block font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">Seller · Chỉnh sửa</span><h1 className="mt-2 font-display text-4xl">Cập nhật phiên đấu giá</h1><p className="mt-2 text-sm text-[#7d9186]">Trong bản demo, seller có thể sửa thông tin mô tả trước khi phiên kết thúc.</p><form onSubmit={submit} className="mt-8 space-y-6 rounded-2xl border border-[#2a3f31] bg-[#14231a] p-6 sm:p-8"><Input label="Tên vật phẩm" value={title} onChange={(event) => setTitle(event.target.value)} required /><label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[#7d9186]">Mô tả<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={7} className="rounded-md border border-[#2a3f31] bg-[#16241c] px-4 py-3 font-sans text-sm normal-case tracking-normal text-[#F3EFE6] outline-none focus:border-[#C9A227]" /></label><div className="grid gap-5 sm:grid-cols-2"><Input label="Giá khởi điểm" value={String(auction.startingPrice)} disabled /><Input label="Bước giá" value={String(auction.minimumBidIncrement)} disabled /></div>{saved && <p className="text-sm text-[#8fc99c]">Đã lưu thay đổi demo.</p>}<div className="flex justify-end gap-3"><Link to="/my-auctions" className="rounded-md border border-[#3a4d40] px-5 py-2.5 text-sm">Hủy</Link><Button type="submit">Lưu thay đổi</Button></div></form></div>;
}
