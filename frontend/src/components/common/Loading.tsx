export default function Loading() {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-[var(--color-text-muted)]">
      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" />
      Đang tải dữ liệu...
    </div>
  );
}
