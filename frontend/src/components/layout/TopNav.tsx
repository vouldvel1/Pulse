import { useUIStore } from '@/stores/uiStore';
import { useCommunityStore } from '@/stores/communityStore';

interface TopNavProps {
  onOpenCreateCommunity: () => void;
  onOpenJoinCommunity: () => void;
  onOpenSearchCommunity: () => void;
}

export function TopNav({ onOpenCreateCommunity, onOpenJoinCommunity, onOpenSearchCommunity }: TopNavProps) {
  const view = useUIStore((s) => s.view);
  const setView = useUIStore((s) => s.setView);
  const setShowThemeModal = useUIStore((s) => s.setShowThemeModal);
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
      {/* Left island: DM | Server | [servers...] | Add */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(255,255,255,0.05)',
          padding: 6,
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.03)',
          maxWidth: '60vw',
          overflow: 'hidden',
        }}
      >
        {/* DM */}
        <NavBtn
          icon="person"
          active={view === 'dm'}
          onClick={() => setView('dm')}
          title="Личные сообщения"
        />

        {/* Server icons */}
        {communities.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
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
                  {c.icon_url
                    ? <img src={c.icon_url} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : c.name[0].toUpperCase()
                  }
                </button>
              );
            })}
          </div>
        )}

        {/* Search communities */}
        <NavBtn
          icon="search"
          onClick={onOpenSearchCommunity}
          title="Найти сервер"
        />

        {/* Join community */}
        <NavBtn
          icon="login"
          onClick={onOpenJoinCommunity}
          title="Присоединиться по коду"
        />

        {/* Create server */}
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
        pulse (beta)
      </div>

      {/* Right: palette */}
      <button
        onClick={() => setShowThemeModal(true)}
        title="Внешний вид"
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255,255,255,0.05)',
          color: 'var(--outline)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'white';
          e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--outline)';
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        }}
      >
        <span className="icon">palette</span>
      </button>
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
        flexShrink: 0,
      }}
    >
      <span className="icon">{icon}</span>
    </button>
  );
}
