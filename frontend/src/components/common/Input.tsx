import type { CSSProperties, InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
  containerStyle?: CSSProperties;
}

export function Input({ label, error, fullWidth, containerStyle, style, ...props }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: fullWidth ? '100%' : undefined, ...containerStyle }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </label>
      )}
      <input
        {...props}
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: `1px solid ${error ? 'var(--error)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 14,
          padding: '10px 14px',
          color: '#E6E1E5',
          outline: 'none',
          width: '100%',
          transition: 'border-color 0.2s ease',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = error ? 'var(--error)' : 'var(--primary)';
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? 'var(--error)' : 'rgba(255,255,255,0.1)';
          props.onBlur?.(e);
        }}
      />
      {error && (
        <span style={{ fontSize: 12, color: 'var(--error)' }}>{error}</span>
      )}
    </div>
  );
}
