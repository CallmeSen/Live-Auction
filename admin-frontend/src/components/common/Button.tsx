import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}

export default function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold tracking-wide transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants: Record<string, string> = {
    primary:
      'bg-[var(--color-primary)] text-[var(--color-bg)] hover:bg-[var(--color-primary-hover)] shadow-[0_0_0_1px_rgba(201,162,39,0.3)] hover:shadow-[0_0_20px_rgba(201,162,39,0.35)]',
    secondary:
      'bg-transparent text-[var(--color-text)] border border-[var(--color-border-strong)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
    ghost: 'bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}