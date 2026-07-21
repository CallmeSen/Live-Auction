import { useState } from 'react';
import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatCurrency';

interface BidFormProps {
  currentPrice: number;
  minimumBidIncrement: number;
  onPlaceBid: (amount: number) => Promise<void>;
}

export default function BidForm({
  currentPrice,
  minimumBidIncrement,
  onPlaceBid,
}: BidFormProps) {
  const minimum = currentPrice + minimumBidIncrement;

  const [amount, setAmount] = useState(minimum);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Vui lòng nhập số tiền hợp lệ.');
      return;
    }

    if (amount < minimum) {
      setMessage(`Giá tối thiểu là ${formatCurrency(minimum)}.`);
      return;
    }

    try {
      setSubmitting(true);
      await onPlaceBid(amount);
      setMessage('Đặt giá thành công.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Không thể đặt giá. Vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-5 sm:p-6"
    >
      <div>
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
          Giá hiện tại
        </p>

        <p className="mt-1 font-display text-2xl text-[var(--color-primary)]">
          {formatCurrency(currentPrice)}
        </p>
      </div>

      <p className="mt-4 rounded-md bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
        Bước giá tối thiểu: {formatCurrency(minimumBidIncrement)} · Giá hợp lệ
        từ {formatCurrency(minimum)}
      </p>

      <label className="mt-5 block">
        <span className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
          Giá của bạn
        </span>

        <div className="mt-2 flex overflow-hidden rounded-lg border border-[var(--color-border-strong)] focus-within:border-[var(--color-primary)]">
          <input
            type="number"
            min={minimum}
            step={minimumBidIncrement}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            className="min-w-0 flex-1 bg-[var(--color-bg)] px-4 py-3 text-[var(--color-text)] outline-none"
          />

          <span className="flex items-center border-l border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-4 text-sm text-[var(--color-text-muted)]">
            VND
          </span>
        </div>
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        {[1, 2, 4].map((times) => (
          <button
            type="button"
            key={times}
            onClick={() =>
              setAmount(currentPrice + minimumBidIncrement * times)
            }
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono-tag text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            +
            {formatCurrency(minimumBidIncrement * times)
              .replace('₫', '')
              .trim()}
          </button>
        ))}
      </div>

      <Button type="submit" disabled={submitting} className="mt-5 w-full">
        {submitting ? 'Đang đặt giá...' : 'Xác nhận trả giá'}
      </Button>

      {message && (
        <p
          className={`mt-3 text-center text-xs ${
            message === 'Đặt giá thành công.'
              ? 'text-[var(--color-success)]'
              : 'text-[var(--color-danger)]'
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}