import { useEffect, useCallback, useState } from 'react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/authStore';
import type { DMChannel } from '../../types';
import styles from './DMList.module.css';

interface Props {
  onSelectChannel: (channelId: string) => void;
  activeChannelId: string | null;
}

export function DMList({ onSelectChannel, activeChannelId }: Props) {
  const { channels, loading, fetchChannels, createDM } = useDMStore();
  const { user } = useAuthStore();
  const [showNewDM, setShowNewDM] = useState(false);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchChannels().catch(() => {
      // ignore
    });
  }, [fetchChannels]);

  const getDMDisplayName = useCallback(
    (channel: DMChannel): string => {
      if (channel.is_group && channel.name) {
        return channel.name;
      }
      const other = channel.members.find((m) => m.id !== user?.id);
      return other?.display_name ?? other?.username ?? 'Unknown';
    },
    [user?.id]
  );

  const getDMAvatar = useCallback(
    (channel: DMChannel): string | null => {
      if (channel.is_group) return null;
      const other = channel.members.find((m) => m.id !== user?.id);
      return other?.avatar_url ?? null;
    },
    [user?.id]
  );

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => {
        const ch = n[0];
        return ch ?? '';
      })
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleCreateDM = useCallback(async () => {
    if (!recipientUsername.trim()) return;
    setError('');
    try {
      const channel = await createDM(recipientUsername.trim());
      onSelectChannel(channel.id);
      setShowNewDM(false);
      setRecipientUsername('');
    } catch {
      setError('User not found. Check the username and try again.');
    }
  }, [recipientUsername, createDM, onSelectChannel]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Direct Messages</span>
        <button
          className={styles.newBtn}
          onClick={() => setShowNewDM(!showNewDM)}
          title="New DM"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {showNewDM && (
        <div className={styles.newDMForm}>
          <input
            className={styles.input}
            value={recipientUsername}
            onChange={(e) => setRecipientUsername(e.target.value)}
            placeholder="Enter @username..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateDM().catch(() => {});
              }
            }}
          />
          <button className={styles.createBtn} onClick={() => { handleCreateDM().catch(() => {}); }}>
            Create
          </button>
          {error && <div className={styles.error}>{error}</div>}
        </div>
      )}

      {loading && channels.length === 0 && (
        <div className={styles.loading}>Loading...</div>
      )}

      <div className={styles.list}>
        {channels.map((channel) => (
          <button
            key={channel.id}
            className={`${styles.item} ${activeChannelId === channel.id ? styles.active : ''}`}
            onClick={() => onSelectChannel(channel.id)}
          >
            <div className={styles.avatar}>
              {getDMAvatar(channel) ? (
                <img src={getDMAvatar(channel) ?? ''} alt="" />
              ) : (
                <span>{getInitials(getDMDisplayName(channel))}</span>
              )}
            </div>
            <div className={styles.info}>
              <div className={styles.name}>{getDMDisplayName(channel)}</div>
              {channel.is_group && (
                <div className={styles.memberCount}>
                  {channel.members.length} members
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
