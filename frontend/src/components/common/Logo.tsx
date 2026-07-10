export default function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#C9A227] font-mono-tag text-sm font-semibold text-[#C9A227]">
        A
      </span>
      <span className="font-display text-xl tracking-tight text-[#F3EFE6]">
        Auction<span className="text-[#C9A227]">App</span>
      </span>
    </div>
  );
}