import { Modal } from '@/components/common/Modal';
import { useUIStore } from '@/stores/uiStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const THEMES = [
  { key: 'purple', primary: '#D0BCFF', label: 'Фиолетовый', icon: '🟣' },
  { key: 'green',  primary: '#B4E197', label: 'Зелёный',    icon: '🟢' },
  { key: 'blue',   primary: '#A1CFFF', label: 'Синий',      icon: '🔵' },
] as const;

export function ThemeModal({ open, onClose }: Props) {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <Modal open={open} onClose={onClose} title="Внешний вид" width={380}>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--outline)' }}>
        Выберите цветовую тему приложения
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {THEMES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTheme(t.key)}
            style={{
              aspectRatio: 1,
              borderRadius: 16,
              background: t.primary,
              cursor: 'pointer',
              border: theme === t.key ? '3px solid white' : '3px solid transparent',
              outline: theme === t.key ? `3px solid ${t.primary}` : 'none',
              outlineOffset: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              transition: 'all 0.2s ease',
              transform: theme === t.key ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            <span style={{ fontSize: 24 }}>{t.icon}</span>
          </button>
        ))}
      </div>

      {/* Labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {THEMES.map((t) => (
          <div key={t.key} style={{ textAlign: 'center', fontSize: 12, color: theme === t.key ? 'var(--primary)' : 'var(--outline)', fontWeight: theme === t.key ? 700 : 400 }}>
            {t.label}
          </div>
        ))}
      </div>

      <button
        onClick={onClose}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: 16,
          border: 'none',
          background: 'var(--primary)',
          color: 'var(--on-primary)',
          fontWeight: 700,
          fontSize: 15,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Применить
      </button>
    </Modal>
  );
}
