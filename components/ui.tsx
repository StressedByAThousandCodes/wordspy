import { forwardRef } from 'react'

// ── Button ────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none'

    const sizes = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2.5 text-sm gap-2',
      lg: 'px-5 py-3 text-sm gap-2 w-full',
    }

    const variants: Record<ButtonVariant, string> = {
      primary:   'text-white active:scale-[0.98]',
      secondary: 'active:scale-[0.98]',
      ghost:     'active:scale-[0.98]',
      danger:    'active:scale-[0.98]',
      success:   'text-white active:scale-[0.98]',
    }

    const styles: Record<ButtonVariant, React.CSSProperties> = {
      primary:   { background: 'var(--accent)', color: 'white' },
      secondary: { background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-2)' },
      ghost:     { background: 'transparent', color: 'var(--text-2)' },
      danger:    { background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' },
      success:   { background: 'var(--success)', color: 'white' },
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
        style={styles[variant]}
        {...props}
      >
        {loading && (
          <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin shrink-0" />
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

// ── Card ──────────────────────────────────────────────────────
export function Card({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}
      {...props}
    >
      {children}
    </div>
  )
}

// ── Input ─────────────────────────────────────────────────────
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all ${className}`}
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
      }}
      onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-bg)' }}
      onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
      {...props}
    />
  )
)
Input.displayName = 'Input'

// ── Badge ─────────────────────────────────────────────────────
type BadgeVariant = 'default' | 'accent' | 'success' | 'danger' | 'warning'

export function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  const styles: Record<BadgeVariant, React.CSSProperties> = {
    default:  { background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' },
    accent:   { background: 'var(--accent-bg)', color: 'var(--accent-text)', border: '1px solid var(--accent)' },
    success:  { background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' },
    danger:   { background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' },
    warning:  { background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' },
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold" style={styles[variant]}>
      {children}
    </span>
  )
}

// ── Divider ───────────────────────────────────────────────────
export function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      {label && <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>{label}</span>}
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size]
  return (
    <div className={`${s} border-2 rounded-full animate-spin`}
      style={{ borderColor: 'var(--border-2)', borderTopColor: 'var(--accent)' }} />
  )
}