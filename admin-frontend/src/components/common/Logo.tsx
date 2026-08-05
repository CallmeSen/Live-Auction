export default function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--color-primary)] font-mono-tag text-sm font-semibold text-[var(--color-primary)]">
        A
      </span>
      <span className="font-display text-xl tracking-tight text-[var(--color-text)]">
        Live<span className="text-[var(--color-primary)]">Auction</span>
      </span>
    </div>
  );
}
