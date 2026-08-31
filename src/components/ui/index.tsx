import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

export * from './Icon';

export function cx(...parts: (string | false | undefined | null)[]) { return parts.filter(Boolean).join(' '); }

// ---- Button -------------------------------------------------------
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md';

const btnBase = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap select-none';
const btnSize: Record<BtnSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm',
};
const btnVariant: Record<BtnVariant, string> = {
  primary:   'bg-ink text-bg hover:opacity-90 border border-ink',
  secondary: 'bg-card text-ink border border-rule2 hover:bg-card2',
  ghost:     'text-ink2 hover:text-ink hover:bg-card2',
  danger:    'text-down hover:bg-card2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }>(
  ({ variant = 'secondary', size = 'md', className, children, ...rest }, ref) => (
    <button ref={ref} className={cx(btnBase, btnSize[size], btnVariant[variant], className)} {...rest}>{children}</button>
  ),
);
Button.displayName = 'Button';

// ---- Field/Input --------------------------------------------------
const fieldBase = 'block w-full bg-card border border-rule rounded-md text-ink text-sm placeholder:text-ink3 outline-none transition-colors focus:border-ink2 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cx(fieldBase, 'h-9 px-3', className)} {...rest} />
  ),
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...rest }, ref) => (
    <select ref={ref} className={cx(fieldBase, 'h-9 pl-3 pr-8 appearance-none bg-[url("data:image/svg+xml;utf8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2016%2016%27%20fill=%27none%27%20stroke=%27currentColor%27%20stroke-width=%271.5%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m4%206%204%204%204-4%27/%3E%3C/svg%3E")] bg-[length:14px_14px] bg-no-repeat bg-[right_10px_center]', className)} {...rest}>{children}</select>
  ),
);
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea ref={ref} className={cx(fieldBase, 'py-2 px-3 resize-y min-h-[72px]', className)} {...rest} />
  ),
);
Textarea.displayName = 'Textarea';

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cx('block text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-1.5', className)}>{children}</label>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-2xs text-ink3 mt-1.5 tabular">{hint}</p>}
    </div>
  );
}

// ---- Delta pill --------------------------------------------------
export function Delta({ value, unit, invert }: { value: number; unit?: string; invert?: boolean }) {
  if (value === 0 || !isFinite(value)) return <span className="text-ink3 font-mono tabular text-2xs">—</span>;
  const isUp = value > 0;
  const good = invert ? !isUp : isUp;
  const color = good ? 'text-up' : 'text-down';
  return (
    <span className={cx('inline-flex items-center gap-0.5 font-mono tabular text-2xs font-semibold', color)}>
      {isUp ? '↑' : '↓'} {Math.abs(value).toFixed(1)}{unit}
    </span>
  );
}

// ---- Empty --------------------------------------------------------
export function Empty({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-rule2 py-16 px-6 text-center">
      <div className="text-md font-semibold text-ink mb-1">{title}</div>
      {description && <div className="text-sm text-ink3 max-w-sm mx-auto">{description}</div>}
      {action && <div className="mt-4 inline-flex">{action}</div>}
    </div>
  );
}

// ---- Card --------------------------------------------------------
export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cx('bg-card border border-rule rounded-lg', padded && 'p-5', className)}>{children}</div>;
}
