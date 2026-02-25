import { useEffect, useRef, useCallback, useState } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useChannelStore } from '../../stores/channelStore';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { wsClient } from '../../utils/websocket';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import { PinnedMessagesPanel } from './PinnedMessagesPanel';
import type { Message } from '../../types';
import styles from './ChatView.module.css';

interface ChatViewProps {
  onShowVoicePanel?: () => void;
}

export function ChatView({ onShowVoicePanel }: ChatViewProps) {
  const { messages, hasMore, isLoading, error, fetchMessages, clearError } = useMessageStore();
  const { handleNewMessage, handleMessageEdit, handleMessageDelete, handleReaction, handleReactionRemove } = useMessageStore();
  const { activeChannelId, channels } = useChannelStore();
  const { user } = useAuthStore();
  const voiceConnected = useVoiceStore((s) => s.isConnected);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);
  const [showPinned, setShowPinned] = useState(false);

  const activeChannel = channels.find((ch) => ch.id === activeChannelId);

  // Close pinned panel when channel changes
  useEffect(() => {
    setShowPinned(false);
  }, [activeChannelId]);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => clearError(), 5000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  // Subscribe to WebSocket events
  useEffect(() => {
    const unsubs = [
      wsClient.on('message', (payload) => {
        const msg = payload as Message;
        // Only handle messages for the currently active channel
        if (msg.channel_id === activeChannelId) {
          handleNewMessage(msg);
        }
      }),
      wsClient.on('message_edit', (payload) => {
        handleMessageEdit(payload as Message);
      }),
      wsClient.on('message_delete', (payload) => {
        handleMessageDelete(payload as { id: string; channel_id: string });
      }),
      wsClient.on('reaction', (payload) => {
        handleReaction(payload as { message_id: string; user_id: string; emoji: string });
      }),
      wsClient.on('reaction_remove', (payload) => {
        handleReactionRemove(payload as { message_id: string; user_id: string; emoji: string });
      }),
    ];
    return () => { unsubs.forEach((unsub) => unsub()); };
  }, [activeChannelId, handleNewMessage, handleMessageEdit, handleMessageDelete, handleReaction, handleReactionRemove]);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  // Load more messages on scroll to top
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || !activeChannelId || isLoading || !hasMore) return;

    const oldest = messages[0];
    if (container.scrollTop < 100 && oldest) {
      fetchMessages(activeChannelId, oldest.id);
    }
  }, [activeChannelId, isLoading, hasMore, messages, fetchMessages]);

  if (!activeChannelId || !activeChannel) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>Welcome to Pulse!</div>
          <p className={styles.emptyText}>Select a channel to start chatting.</p>
        </div>
      </div>
    );
  }

  const GROUP_THRESHOLD_MS = 7 * 60 * 1000; // 7 minutes

  const isGrouped = (index: number): boolean => {
    if (index === 0) return false;
    const prev = messages[index - 1];
    const curr = messages[index];
    if (!prev || !curr) return false;
    if (prev.author_id !== curr.author_id) return false;
    const timeDiff = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
    return timeDiff < GROUP_THRESHOLD_MS;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>#</span>
        <span className={styles.headerName}>{activeChannel.name}</span>
        {activeChannel.topic && (
          <>
            <span className={styles.headerDivider}>|</span>
            <span className={styles.headerTopic}>{activeChannel.topic}</span>
          </>
        )}
        <div className={styles.headerSpacer} />
        {voiceConnected && onShowVoicePanel && (
          <button
            className={styles.headerBtn}
            onClick={onShowVoicePanel}
            title="Show Voice Panel"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        )}
        <button
          className={`${styles.headerBtn} ${showPinned ? styles.headerBtnActive : ''}`}
          onClick={() => setShowPinned((v) => !v)}
          title="Pinned messages"
        >
          📌
        </button>
        {showPinned && (
          <PinnedMessagesPanel
            channelId={activeChannelId}
            onClose={() => setShowPinned(false)}
          />
        )}
      </div>

      {error && (
        <div className={styles.errorBar}>
          <span>{error}</span>
          <button className={styles.errorCloseBtn} onClick={clearError}>&times;</button>
        </div>
      )}

      <div className={styles.messages} ref={messagesContainerRef} onScroll={handleScroll}>
        {isLoading && messages.length === 0 && (
          <div className={styles.loading}>Loading messages...</div>
        )}
        {isLoading && messages.length > 0 && (
          <div className={styles.loadingMore}>Loading earlier messages...</div>
        )}
        {!hasMore && messages.length > 0 && (
          <div className={styles.beginning}>
            This is the beginning of #{activeChannel.name}
          </div>
        )}
        {messages.map((msg, i) => {
          const grouped = isGrouped(i);
          return (
            <MessageItem
              key={msg.id}
              message={msg}
              isOwn={msg.author_id === user?.id}
              channelId={activeChannelId}
              isGrouped={grouped}
              isGroupStart={!grouped && i > 0}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <MessageInput channelId={activeChannelId} />
    </div>
  );
}
