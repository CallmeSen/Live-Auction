import { useEffect, useState } from 'react';
import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatCurrency';

interface BidFormProps {
  currentPrice: number;
  minimumBidIncrement: number;
  walletBalance: number;
  onPlaceBid: (amount: number) => void;
}

export default function BidForm({ currentPrice, minimumBidIncrement, walletBalance, onPlaceBid }: BidFormProps) {
  const minimum = currentPrice + minimumBidIncrement;
  const [amount, setAmount] = useState(minimum);
  const [message, setMessage] = useState('');
  useEffect(() => setAmount(minimum), [minimum]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!Number.isFinite(amount) || amount <= 0) return setMessage('Vui lòng nhập số tiền hợp lệ.');
    if (amount < minimum) return setMessage(`Giá tối thiểu là ${formatCurrency(minimum)}.`);
    if (amount > walletBalance) return setMessage('Số dư khả dụng không đủ cho lượt trả giá này.');
    onPlaceBid(amount);
    setMessage('Đã ghi nhận lượt trả giá demo của bạn.');
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#3a4d40] bg-[#16241c] p-5 sm:p-6">
      <div className="grid grid-cols-2 gap-4">
        <div><p className="text-xs uppercase tracking-wider text-[#7d9186]">Giá hiện tại</p><p className="mt-1 font-display text-2xl text-[#C9A227]">{formatCurrency(currentPrice)}</p></div>
        <div className="text-right"><p className="text-xs uppercase tracking-wider text-[#7d9186]">Số dư ví</p><p className="mt-1 font-display text-2xl text-[#F3EFE6]">{formatCurrency(walletBalance)}</p></div>
      </div>
      <p className="mt-4 rounded-md bg-[#0F1B14] px-3 py-2 text-xs text-[#7d9186]">Bước giá tối thiểu: {formatCurrency(minimumBidIncrement)} · Giá hợp lệ từ {formatCurrency(minimum)}</p>
      <label className="mt-5 block"><span className="text-xs uppercase tracking-wider text-[#7d9186]">Giá của bạn</span><div className="mt-2 flex overflow-hidden rounded-lg border border-[#3a4d40] focus-within:border-[#C9A227]"><input type="number" min={minimum} step={minimumBidIncrement} value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="min-w-0 flex-1 bg-[#0F1B14] px-4 py-3 text-[#F3EFE6] outline-none" /><span className="flex items-center border-l border-[#3a4d40] bg-[#1d2d23] px-4 text-sm text-[#7d9186]">VND</span></div></label>
      <div className="mt-3 flex flex-wrap gap-2">{[1, 2, 4].map((times) => <button type="button" key={times} onClick={() => setAmount(currentPrice + minimumBidIncrement * times)} className="rounded-md border border-[#2a3f31] px-3 py-1.5 font-mono-tag text-xs text-[#7d9186] hover:border-[#C9A227] hover:text-[#C9A227]">+{formatCurrency(minimumBidIncrement * times).replace('₫', '').trim()}</button>)}</div>
      <Button type="submit" className="mt-5 w-full">Xác nhận trả giá</Button>
      <p className={`mt-3 min-h-5 text-center text-xs ${message.startsWith('Đã') ? 'text-[#8fb99b]' : 'text-[#ff9a86]'}`}>{message}</p>
    </form>
  );
}
