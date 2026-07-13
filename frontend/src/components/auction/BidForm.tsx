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
    <form onSubmit={submit} className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-5 sm:p-6">
      <div className="grid grid-cols-2 gap-4">
        <div><p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Giá hiện tại</p><p className="mt-1 font-display text-2xl text-[var(--color-primary)]">{formatCurrency(currentPrice)}</p></div>
        <div className="text-right"><p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Số dư ví</p><p className="mt-1 font-display text-2xl text-[var(--color-text)]">{formatCurrency(walletBalance)}</p></div>
      </div>
      <p className="mt-4 rounded-md bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)]">Bước giá tối thiểu: {formatCurrency(minimumBidIncrement)} · Giá hợp lệ từ {formatCurrency(minimum)}</p>
      <label className="mt-5 block"><span className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Giá của bạn</span><div className="mt-2 flex overflow-hidden rounded-lg border border-[var(--color-border-strong)] focus-within:border-[var(--color-primary)]"><input type="number" min={minimum} step={minimumBidIncrement} value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="min-w-0 flex-1 bg-[var(--color-bg)] px-4 py-3 text-[var(--color-text)] outline-none" /><span className="flex items-center border-l border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-4 text-sm text-[var(--color-text-muted)]">VND</span></div></label>
      <div className="mt-3 flex flex-wrap gap-2">{[1, 2, 4].map((times) => <button type="button" key={times} onClick={() => setAmount(currentPrice + minimumBidIncrement * times)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono-tag text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">+{formatCurrency(minimumBidIncrement * times).replace('₫', '').trim()}</button>)}</div>
      <Button type="submit" className="mt-5 w-full">Xác nhận trả giá</Button>
      <p className={`mt-3 min-h-5 text-center text-xs ${message.startsWith('Đã') ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>{message}</p>
    </form>
  );
}
