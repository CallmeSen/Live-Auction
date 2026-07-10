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
      'bg-[#C9A227] text-[#0F1B14] hover:bg-[#e0c15a] shadow-[0_0_0_1px_rgba(201,162,39,0.3)] hover:shadow-[0_0_20px_rgba(201,162,39,0.35)]',
    secondary:
      'bg-transparent text-[#F3EFE6] border border-[#3a4d40] hover:border-[#C9A227] hover:text-[#C9A227]',
    ghost: 'bg-transparent text-[#7d9186] hover:text-[#F3EFE6]',
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}