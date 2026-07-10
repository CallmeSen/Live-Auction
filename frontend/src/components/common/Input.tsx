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
          className="text-xs font-mono-tag uppercase tracking-wider text-[#7d9186]"
        >
          {label}
        </label>
        <input
          id={inputId}
          ref={ref}
          className={`bg-[#16241c] border border-[#2a3f31] rounded-md px-4 py-2.5 text-[#f3efe6] placeholder:text-[#4a5a4f] focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227] transition-colors ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-[#c2452d]">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;