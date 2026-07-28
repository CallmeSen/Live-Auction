import type { FormEvent } from 'react';

export type BidFormProps = {
  amount: string;
  currentPrice: string | null;
  minimumAmount: string;
  disabled?: boolean;
  onAmountChange(amount: string): void;
  onSubmit(): void;
};

export default function BidForm({
  amount,
  currentPrice,
  minimumAmount,
  disabled = false,
  onAmountChange,
  onSubmit,
}: BidFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form
      onSubmit={submit}
      className="min-w-0 border-t border-[var(--color-border)] pt-5"
    >
      <div>
        <p className="text-xs text-[var(--color-text-muted)]">Giá hiện tại</p>
        <p className="mt-1 break-words font-display text-2xl text-[var(--color-primary)]">
          {currentPrice ?? '---'}
        </p>
      </div>

      <p className="mt-4 text-xs text-[var(--color-text-muted)]">
        Giá hợp lệ từ {minimumAmount}
      </p>

      <label className="mt-4 block min-w-0">
        <span className="text-xs text-[var(--color-text-muted)]">Giá của bạn</span>
        <div className="mt-2 flex min-w-0 overflow-hidden rounded-md border border-[var(--color-border-strong)] focus-within:border-[var(--color-primary)]">
          <input
            aria-label="Giá của bạn"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            disabled={disabled}
            className="min-w-0 flex-1 bg-[var(--color-bg)] px-4 py-3 text-[var(--color-text)] outline-none"
          />
          <span className="flex shrink-0 items-center border-l border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-4 text-sm text-[var(--color-text-muted)]">
            VND
          </span>
        </div>
      </label>

      <button
        type="submit"
        disabled={disabled}
        className="mt-5 w-full rounded-md border border-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? 'Đang xử lý...' : 'Xác nhận trả giá'}
      </button>
    </form>
  );
}
