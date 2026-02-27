import { useEffect } from 'react';
import { useDMStore } from '@/stores/dmStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { Avatar } from '@/components/common/Avatar';
import type { DMChannel } from '@/types';

export function DMSidebar() {
  const channels = useDMStore((s) => s.channels);
  const activeChannelId = useDMStore((s) => s.activeChannelId);
  const fetchChannels = useDMStore((s) => s.fetchChannels);
  const setActiveChannel = useDMStore((s) => s.setActiveChannel);
  const currentUser = useAuthStore((s) => s.user);
  const setShowFindUserModal = useUIStore((s) => s.setShowFindUserModal);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  const getChannelName = (ch: DMChannel): string => {
    if (ch.is_group) return ch.name ?? 'Группа';
    const other = ch.members.find((m) => m.id !== currentUser?.id);
    return other?.display_name ?? other?.username ?? 'Пользователь';
  };

  const getChannelAvatar = (ch: DMChannel): string | null => {
    if (ch.is_group) return null;
    const other = ch.members.find((m) => m.id !== currentUser?.id);
    return other?.avatar_url ?? null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Add friend button — accent style */}
      <div
        onClick={() => setShowFindUserModal(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderRadius: 16,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 700,
          background: 'var(--primary)',
          color: 'var(--on-primary)',
          margin: '2px 8px 12px',
        }}
      >
        <span className="icon" style={{ fontSize: 18 }}>person_add</span>
        Добавить друга
      </div>

      {/* Section header */}
      <div
        style={{
          padding: '0 16px 8px',
          fontSize: 10,
          color: 'var(--outline)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}
      >
        Сообщения
      </div>

      {channels.length === 0 ? (
        <div
          style={{
            padding: '20px 16px',
            color: 'var(--outline)',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          <span className="icon" style={{ fontSize: 36, opacity: 0.3, display: 'block', marginBottom: 8 }}>chat</span>
          Нет сообщений
        </div>
      ) : (
        channels.map((ch) => {
          const name = getChannelName(ch);
          const avatarUrl = getChannelAvatar(ch);
          const isActive = activeChannelId === ch.id;

          return (
            <div
              key={ch.id}
              onClick={() => setActiveChannel(ch.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 16px',
                borderRadius: 14,
                cursor: 'pointer',
                margin: '2px 8px',
                background: isActive ? 'var(--primary-container)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--outline)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = 'white';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--outline)';
                }
              }}
            >
              <Avatar
                src={avatarUrl}
                name={name}
                size={32}
                radius={ch.is_group ? 10 : 16}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                </div>
                {ch.last_message && (
                  <div style={{ fontSize: 11, color: 'var(--outline)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ch.last_message.content}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
