import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/common/Avatar';
import { ServerSidebar } from './ServerSidebar';
import { DMSidebar } from './DMSidebar';
import { VoiceMiniPanel } from '@/components/voice/VoiceMiniPanel';

interface LeftSidebarProps {
  onOpenSettings: () => void;
}

export function LeftSidebar({ onOpenSettings }: LeftSidebarProps) {
  const view = useUIStore((s) => s.view);
  const user = useAuthStore((s) => s.user);

  return (
    <aside
      className="glass-panel"
      style={{ width: 280, flexShrink: 0 }}
    >
      {/* Main nav content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 12 }}>
        {view === 'server' ? <ServerSidebar /> : <DMSidebar />}
      </div>

      {/* Voice mini panel (shown when in a voice call) */}
      <VoiceMiniPanel />

      {/* User bar */}
      <div
        style={{
          background: 'rgba(255,255,255,0.05)',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 20,
          margin: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar
            src={user?.avatar_url}
            name={user?.username}
            size={32}
            radius={10}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.display_name ?? user?.username ?? '...'}
            </div>
            {user?.custom_status && (
              <div style={{ fontSize: 10, color: 'var(--outline)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.custom_status}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onOpenSettings}
          title="Настройки"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            border: 'none',
            background: 'transparent',
            color: 'var(--outline)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="icon" style={{ fontSize: 18 }}>settings</span>
        </button>
      </div>
    </aside>
  );
}
