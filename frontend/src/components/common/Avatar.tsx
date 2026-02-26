import type { CSSProperties } from 'react';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  radius?: number;
  style?: CSSProperties;
  className?: string;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h},40%,45%)`;
}

export function Avatar({ src, name, size = 36, radius = 10, style, className }: AvatarProps) {
  const letter = name ? name[0].toUpperCase() : '?';
  const bg = name ? stringToColor(name) : '#666';

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: src ? undefined : bg,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 700,
        color: '#fff',
        overflow: 'hidden',
        ...style,
      }}
    >
      {src ? (
        <img src={src} alt={name ?? 'avatar'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        letter
      )}
    </div>
  );
}
