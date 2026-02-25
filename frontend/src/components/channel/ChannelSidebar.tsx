import { useState, useEffect } from 'react';
import { useChannelStore } from '../../stores/channelStore';
import { useCommunityStore } from '../../stores/communityStore';
import { useMessageStore } from '../../stores/messageStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { CommunitySettings } from '../community/CommunitySettings';
import { CreateChannelModal } from './CreateChannelModal';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import { wsClient } from '../../utils/websocket';
import type { Channel } from '../../types';
import styles from './ChannelSidebar.module.css';

export function ChannelSidebar() {
  const { channels, activeChannelId, setActiveChannel } = useChannelStore();
  const { activeCommunityId } = useCommunityStore();
  const { fetchMessages, clearMessages } = useMessageStore();
  const {
    currentChannelId: voiceChannelId,
    joinVoice,
    channelParticipants,
    fetchChannelParticipants,
    speakingUsers,
    error: voiceError,
  } = useVoiceStore();
  const [showCreate, setShowCreate] = useState(false);
  const [settingsChannel, setSettingsChannel] = useState<Channel | null>(null);
  const [dismissedVoiceError, setDismissedVoiceError] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Auto-dismiss voice error after 5 seconds
  useEffect(() => {
    if (!voiceError) {
      setDismissedVoiceError(false);
      return;
    }
    const timer = setTimeout(() => setDismissedVoiceError(true), 5000);
    return () => clearTimeout(timer);
  }, [voiceError]);

  // Fetch voice channel participants on mount and when channels change
  // Also subscribe to voice channels' WS events to receive join/leave updates
  const voiceChannels = channels.filter((ch) => ch.type === 'voice');
  const voiceChannelIds = voiceChannels.map((ch) => ch.id).join(',');
  useEffect(() => {
    voiceChannels.forEach((ch) => {
      fetchChannelParticipants(ch.id);
      wsClient.send('channel_join', { channel_id: ch.id });
    });

    return () => {
      // Unsubscribe from voice channels we're not actively in
      voiceChannels.forEach((ch) => {
        if (ch.id !== useVoiceStore.getState().currentChannelId) {
          wsClient.send('channel_leave', { channel_id: ch.id });
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceChannelIds, fetchChannelParticipants]);

  const handleSelectChannel = (channel: Channel) => {
    if (channel.type === 'category') return;
    if (channel.type === 'voice') {
      // If already connected to this voice channel, switch to VoiceChannelView
      if (voiceChannelId === channel.id) {
        // Trigger showing VoiceChannelView in AppLayout
        window.dispatchEvent(new CustomEvent('pulse:showVoicePanel'));
        return;
      }
      // Join voice channel
      joinVoice(channel.id).catch(() => {
        // Error is already set in voiceStore.error
      });
      return;
    }
    clearMessages();
    setActiveChannel(channel.id);
    fetchMessages(channel.id);
  };

  // Group channels: categories with their children, then uncategorized
  const categories = channels
    .filter((ch) => ch.type === 'category')
    .sort((a, b) => a.position - b.position);

  const uncategorized = channels
    .filter((ch) => ch.type !== 'category' && !ch.parent_id)
    .sort((a, b) => a.position - b.position);

  const getChannelsByParent = (parentId: string): Channel[] => {
    return channels
      .filter((ch) => ch.parent_id === parentId && ch.type !== 'category')
      .sort((a, b) => a.position - b.position);
  };

  const channelIcon = (type: Channel['type']): string => {
    switch (type) {
      case 'voice':
        return '🔊';
      case 'announcement':
        return '📢';
      default:
        return '#';
    }
  };

  const isActiveChannel = (channel: Channel): boolean => {
    if (channel.type === 'voice') return voiceChannelId === channel.id;
    return activeChannelId === channel.id;
  };

  const renderChannelButton = (channel: Channel, nested: boolean) => {
    const participants = channel.type === 'voice' ? (channelParticipants[channel.id] ?? []) : [];
    return (
      <div key={channel.id} className={styles.channelRow}>
        <button
          className={`${styles.channel} ${nested ? styles.nested : ''} ${isActiveChannel(channel) ? styles.active : ''}`}
          onClick={() => handleSelectChannel(channel)}
        >
          <span className={styles.channelIcon}>{channelIcon(channel.type)}</span>
          <span className={styles.channelName}>{channel.name}</span>
          {channel.is_private && <span className={styles.lockIcon}>🔒</span>}
          {channel.type === 'voice' && participants.length > 0 && (
            <span className={styles.voiceParticipantCount}>{participants.length}</span>
          )}
        </button>
        <button
          className={styles.channelSettingsBtn}
          onClick={(e) => { e.stopPropagation(); setSettingsChannel(channel); }}
          title="Channel settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        {/* Show mini participant list under voice channels with participants */}
        {channel.type === 'voice' && participants.length > 0 && (
          <div className={styles.voiceChannelParticipants}>
            {participants.map((p) => (
              <div key={p.user_id} className={styles.miniParticipant}>
                <span className={`${styles.miniParticipantDot} ${speakingUsers.has(p.user_id) ? styles.speaking : ''}`} />
                <span>{p.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!activeCommunityId) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.header}>Direct Messages</div>
        <div className={styles.empty}>
          <p>Select a community to see channels</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <CommunitySettings communityId={activeCommunityId} />

      <div className={styles.channelList}>
        {/* Uncategorized channels first */}
        {uncategorized.map((channel) => renderChannelButton(channel, false))}

        {/* Categories with their children */}
        {categories.map((category) => {
          const isCollapsed = collapsedCategories.has(category.id);
          return (
            <div key={category.id} className={styles.category}>
              <div
                className={styles.categoryHeader}
                onClick={() => {
                  setCollapsedCategories((prev) => {
                    const next = new Set(prev);
                    if (next.has(category.id)) {
                      next.delete(category.id);
                    } else {
                      next.add(category.id);
                    }
                    return next;
                  });
                }}
                role="button"
                tabIndex={0}
              >
                <svg
                  className={`${styles.categoryArrow} ${isCollapsed ? styles.collapsed : ''}`}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6,9 12,15 18,9" />
                </svg>
                <span className={styles.categoryName}>{category.name}</span>
              </div>
              {!isCollapsed && getChannelsByParent(category.id).map((channel) => renderChannelButton(channel, true))}
            </div>
          );
        })}
      </div>

      <button className={styles.addChannelBtn} onClick={() => setShowCreate(true)}>
        + Create Channel
      </button>

      {voiceError && !dismissedVoiceError && (
        <div className={styles.voiceError}>{voiceError}</div>
      )}

      {showCreate && (
        <CreateChannelModal
          communityId={activeCommunityId}
          onClose={() => setShowCreate(false)}
        />
      )}

      {settingsChannel && (
        <ChannelSettingsModal
          channel={settingsChannel}
          onClose={() => setSettingsChannel(null)}
        />
      )}
    </div>
  );
}
