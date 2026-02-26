import type { ReactNode, CSSProperties } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'surface';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  style?: CSSProperties;
  icon?: string;
}

const variantStyles: Record<string, CSSProperties> = {
  primary: { background: 'var(--primary)', color: 'var(--on-primary)', fontWeight: 700 },
  ghost: { background: 'rgba(255,255,255,0.05)', color: '#E6E1E5' },
  danger: { background: 'var(--error)', color: 'var(--on-error)', fontWeight: 700 },
  surface: { background: 'var(--surface-variant)', color: '#E6E1E5' },
};

const sizeStyles: Record<string, CSSProperties> = {
  sm: { padding: '6px 14px', fontSize: 13, borderRadius: 12 },
  md: { padding: '10px 20px', fontSize: 14, borderRadius: 14 },
  lg: { padding: '14px 28px', fontSize: 16, borderRadius: 16 },
};

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  fullWidth,
  type = 'button',
  style,
  icon,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        border: 'none',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        width: fullWidth ? '100%' : undefined,
        fontFamily: 'inherit',
        transition: 'opacity 0.15s ease, transform 0.1s ease',
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
    >
      {icon && <span className="icon" style={{ fontSize: size === 'sm' ? 16 : 18 }}>{icon}</span>}
      {loading ? <span className="icon" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>refresh</span> : children}
    </button>
  );
}
