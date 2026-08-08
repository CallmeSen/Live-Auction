import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]"
        >
          {label}
        </label>
        <input
          id={inputId}
          ref={ref}
          className={`bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-md px-4 py-2.5 text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-[var(--color-danger-solid)]">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;