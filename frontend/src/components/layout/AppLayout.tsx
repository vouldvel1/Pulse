import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useRoleStore } from '../../stores/roleStore';
import { useCommunityStore } from '../../stores/communityStore';
import { useChannelStore } from '../../stores/channelStore';
import { useDMStore } from '../../stores/dmStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useMessageStore } from '../../stores/messageStore';
import { CommunityList } from '../community/CommunityList';
import { ChannelSidebar } from '../channel/ChannelSidebar';
import { ChatView } from '../chat/ChatView';
import { VoicePanel } from '../voice/VoicePanel';
import { VoiceChannelView } from '../voice/VoiceChannelView';
import { ScreenShareViewer } from '../voice/ScreenShare';
import { DMList } from '../dm/DMList';
import { DMChatView } from '../dm/DMChatView';
import { NotificationPanel } from '../notifications/NotificationPanel';
import { SearchPanel } from '../search/SearchPanel';
import { ProfileModal } from '../profile/ProfileModal';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useVoicePing } from '../../hooks/useVoicePing';
import { wsClient } from '../../utils/websocket';
import type {
  Role,
  DMChannel,
  DMMessage,
  Notification,
  MessageEmbedsPayload,
  VoiceJoinPayload,
  VoiceLeavePayload,
  VoiceStatePayload,
  ScreenShareOfferPayload,
  ScreenShareAnswerPayload,
  ICECandidatePayload,
} from '../../types';
import styles from './AppLayout.module.css';

export function AppLayout() {
  const { user, fetchMe } = useAuthStore();
  const activeCommunityId = useCommunityStore((s) => s.activeCommunityId);
  const screenShareViewers = useVoiceStore((s) => s.screenShareViewers);
  const voiceConnected = useVoiceStore((s) => s.isConnected);
  const voiceConnecting = useVoiceStore((s) => s.isConnecting);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const hasScreenShare = Object.keys(screenShareViewers).length > 0;
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const cleanupVoice = useVoiceStore((s) => s.cleanup);

  // Activate WebRTC at the layout level so it stays active regardless of which view is shown
  useWebRTC();

  // Measure voice latency with application-level ping/pong
  useVoicePing();

  const {
    handleRoleCreate,
    handleRoleUpdate,
    handleRoleDelete,
  } = useRoleStore();

  const {
    activeChannelId: activeDMChannelId,
    channels: dmChannels,
    setActiveChannel: setActiveDMChannel,
    handleDMMessage,
    handleDMMessageEdit,
    handleDMMessageDelete,
    handleDMChannelCreate,
  } = useDMStore();

  const {
    fetchUnreadCount: fetchNotifUnreadCount,
    handleNotification,
  } = useNotificationStore();

  const { handleMessageEmbeds } = useMessageStore();

  const isHomeView = activeCommunityId === null;
  const activeDMChannel = dmChannels.find((c) => c.id === activeDMChannelId) ?? null;

  useEffect(() => {
    if (!user) {
      fetchMe().catch(() => {
        // If fetchMe fails, the store will set isAuthenticated to false
      });
    }
  }, [user, fetchMe]);

  // Fetch notification unread count on mount
  useEffect(() => {
    fetchNotifUnreadCount();
  }, [fetchNotifUnreadCount]);

  // Clean up voice state only on full AppLayout unmount (e.g., logout)
  useEffect(() => {
    return () => {
      cleanupVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to voice-related WS events
  useEffect(() => {
    const unsubs = [
      wsClient.on('voice_join', (payload) => useVoiceStore.getState().handleVoiceJoin(payload as VoiceJoinPayload)),
      wsClient.on('voice_leave', (payload) => useVoiceStore.getState().handleVoiceLeave(payload as VoiceLeavePayload)),
      wsClient.on('voice_state', (payload) => useVoiceStore.getState().handleVoiceState(payload as VoiceStatePayload)),
      wsClient.on('screen_share_offer', (payload) => useVoiceStore.getState().handleScreenShareOffer(payload as ScreenShareOfferPayload)),
      wsClient.on('screen_share_answer', (payload) => useVoiceStore.getState().handleScreenShareAnswer(payload as ScreenShareAnswerPayload)),
      wsClient.on('ice_candidate', (payload) => useVoiceStore.getState().handleICECandidate(payload as ICECandidatePayload)),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  // Subscribe to role-related WS events
  useEffect(() => {
    const unsubs = [
      wsClient.on('role_create', (payload) => handleRoleCreate(payload as Role)),
      wsClient.on('role_update', (payload) => handleRoleUpdate(payload as Role)),
      wsClient.on('role_delete', (payload) => handleRoleDelete(payload as { id: string; community_id: string })),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [handleRoleCreate, handleRoleUpdate, handleRoleDelete]);

  // Subscribe to DM-related WS events
  useEffect(() => {
    const unsubs = [
      wsClient.on('dm_message', (payload) => handleDMMessage(payload as DMMessage)),
      wsClient.on('dm_message_edit', (payload) => handleDMMessageEdit(payload as DMMessage)),
      wsClient.on('dm_message_delete', (payload) => handleDMMessageDelete(payload as { id: string; channel_id: string })),
      wsClient.on('dm_channel_create', (payload) => handleDMChannelCreate(payload as DMChannel)),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [handleDMMessage, handleDMMessageEdit, handleDMMessageDelete, handleDMChannelCreate]);

  // Subscribe to notification WS events
  useEffect(() => {
    const unsub = wsClient.on('notification', (payload) => handleNotification(payload as Notification));
    return () => {
      unsub();
    };
  }, [handleNotification]);

  // Subscribe to message_embeds WS events
  useEffect(() => {
    const unsub = wsClient.on('message_embeds', (payload) => handleMessageEmbeds(payload as MessageEmbedsPayload));
    return () => {
      unsub();
    };
  }, [handleMessageEmbeds]);

  // Re-subscribe the active text channel and voice channels when WS (re)connects
  useEffect(() => {
    const unsub = wsClient.on('connected', () => {
      // Re-subscribe active text channel
      const channelId = useChannelStore.getState().activeChannelId;
      if (channelId) {
        wsClient.send('channel_join', { channel_id: channelId });
      }

      // Re-subscribe all voice channels so we receive voice join/leave events
      const channels = useChannelStore.getState().channels;
      for (const ch of channels) {
        if (ch.type === 'voice') {
          wsClient.send('channel_join', { channel_id: ch.id });
        }
      }
    });
    return unsub;
  }, []);

  // Keyboard shortcut: Ctrl+K for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={styles.layout}>
      {/* Community sidebar (icon bar) */}
      <CommunityList />

      {/* Sidebar: Channel sidebar or DM list depending on view */}
      <div className={styles.sidebarContainer}>
        {isHomeView ? (
          <DMList
            onSelectChannel={setActiveDMChannel}
            activeChannelId={activeDMChannelId}
          />
        ) : (
          <>
            <ChannelSidebar />
            <VoicePanel />
          </>
        )}

        {/* User Panel - extends to connect with CommunityList */}
        <div className={styles.userPanel}>
          <div className={styles.avatarWrapper}>
            <div className={styles.avatar}>
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} />
              ) : (
                getInitials(user?.display_name ?? '??')
              )}
            </div>
            <div className={styles.statusIndicator} />
          </div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{user?.display_name}</div>
            <div className={styles.userStatus}>@{user?.username}</div>
          </div>
          <div className={styles.userControls}>
            <button
              className={styles.controlBtn}
              onClick={() => useVoiceStore.getState().toggleMute()}
              title="Mute"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <button
              className={styles.controlBtn}
              onClick={() => useVoiceStore.getState().toggleDeaf()}
              title="Deafen"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </button>
            <button
              className={styles.controlBtn}
              onClick={() => setShowProfile(true)}
              title="User Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Notification panel overlay */}
      {showNotifications && (
        <NotificationPanel onClose={() => setShowNotifications(false)} />
      )}

      {/* Search panel overlay */}
      {showSearch && (
        <SearchPanel onClose={() => setShowSearch(false)} />
      )}

      {/* Profile modal overlay */}
      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}

      {/* Main content area */}
      <div className={styles.mainContent}>
        {isHomeView ? (
          activeDMChannel ? (
            <div className={styles.chatPanel}>
              <DMChatView channelId={activeDMChannel.id} channel={activeDMChannel} />
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>Your Direct Messages</h3>
              <p className={styles.emptyText}>
                Select a conversation or start a new one
              </p>
            </div>
          )
        ) : (voiceConnected || voiceConnecting) && !activeChannelId ? (
          <VoiceChannelView />
        ) : (
          <>
            {hasScreenShare && (
              <div className={styles.screenSharePanel}>
                <ScreenShareViewer />
              </div>
            )}
            <div className={hasScreenShare ? styles.chatPanelCompact : styles.chatPanel}>
              <ChatView />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
