import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useCommunityStore } from '@/stores/communityStore';

interface TopNavProps {
  onOpenCreateCommunity: () => void;
}

export function TopNav({ onOpenCreateCommunity }: TopNavProps) {
  const view = useUIStore((s) => s.view);
  const setView = useUIStore((s) => s.setView);
  const setShowThemeModal = useUIStore((s) => s.setShowThemeModal);
  const setShowSettingsModal = useUIStore((s) => s.setShowSettingsModal);
  const user = useAuthStore((s) => s.user);
  const communities = useCommunityStore((s) => s.communities);
  const activeCommunityId = useCommunityStore((s) => s.activeCommunityId);
  const setActiveCommunity = useCommunityStore((s) => s.setActiveCommunity);

  const handleServerClick = (id: string) => {
    if (view !== 'server') setView('server');
    setActiveCommunity(id);
  };

  return (
    <nav
      style={{
        height: 72,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'relative',
        zIndex: 1100,
        flexShrink: 0,
      }}
    >
      {/* Left island: DM + servers + add */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(255,255,255,0.05)',
          padding: 6,
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.03)',
          overflow: 'hidden',
          maxWidth: '60vw',
        }}
      >
        {/* DM button */}
        <NavBtn
          icon="chat"
          active={view === 'dm'}
          onClick={() => setView('dm')}
          title="Сообщения"
        />

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Server icon pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {communities.map((c) => {
            const isActive = view === 'server' && activeCommunityId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => handleServerClick(c.id)}
                title={c.name}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: isActive ? 14 : 22,
                  border: 'none',
                  background: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                  color: isActive ? 'var(--on-primary)' : '#E6E1E5',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  overflow: 'hidden',
                  transition: 'border-radius 0.2s ease, background 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderRadius = '14px';
                    e.currentTarget.style.background = 'var(--primary-container)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderRadius = '22px';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  }
                }}
              >
                {c.icon_url ? (
                  <img src={c.icon_url} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  c.name[0].toUpperCase()
                )}
              </button>
            );
          })}
        </div>

        {/* Add server */}
        <NavBtn
          icon="add"
          onClick={onOpenCreateCommunity}
          title="Создать сервер"
        />
      </div>

      {/* Center brand */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontWeight: 700,
          color: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 24,
          pointerEvents: 'none',
        }}
      >
        <span className="icon" style={{ fontSize: 28 }}>bolt</span>
        pulse
        <span style={{ fontSize: 13, color: 'var(--outline)', fontWeight: 400, marginTop: 4 }}>(beta)</span>
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <NavBtn icon="palette" onClick={() => setShowThemeModal(true)} title="Внешний вид" />
        <NavBtn icon="settings" onClick={() => setShowSettingsModal(true)} title="Настройки" />
        {user && (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--on-primary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title={user.username}
          >
            {user.username[0].toUpperCase()}
          </div>
        )}
      </div>
    </nav>
  );
}

function NavBtn({
  icon,
  active,
  onClick,
  title,
}: {
  icon: string;
  active?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        border: 'none',
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? 'var(--on-primary)' : 'var(--outline)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease',
        flexShrink: 0,
      }}
    >
      <span className="icon">{icon}</span>
    </button>
  );
}
