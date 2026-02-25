import { useEffect, useRef, useCallback, useState } from 'react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/authStore';
import { wsClient } from '../../utils/websocket';
import type { DMChannel, DMMessage } from '../../types';
import styles from './DMChatView.module.css';

interface Props {
  channelId: string;
  channel: DMChannel;
}

export function DMChatView({ channelId, channel }: Props) {
  const { messages, messagesLoading, hasMore, fetchMessages, loadMoreMessages, sendMessage, error, clearError } =
    useDMStore();
  const { user } = useAuthStore();
  const [input, setInput] = useState('');
  const [wsConnected, setWsConnected] = useState(wsClient.connected);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  const channelMessages = messages[channelId] ?? [];

  useEffect(() => {
    fetchMessages(channelId).catch(() => {
      // error is set in store
    });
  }, [channelId, fetchMessages]);

  // Track WebSocket connectivity
  useEffect(() => {
    const onConnected = () => setWsConnected(true);
    const onDisconnected = () => setWsConnected(false);
    const unsubs = [
      wsClient.on('connected', onConnected),
      wsClient.on('disconnected', onDisconnected),
    ];
    setWsConnected(wsClient.connected);
    return () => { unsubs.forEach((u) => u()); };
  }, []);

  // Auto-clear error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => clearError(), 5000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (channelMessages.length > prevLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = channelMessages.length;
  }, [channelMessages.length]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content) return;
    setInput('');
    try {
      await sendMessage(channelId, content);
    } catch {
      setInput(content); // Restore on failure
    }
  }, [input, channelId, sendMessage]);

  const handleLoadMore = useCallback(() => {
    loadMoreMessages(channelId).catch(() => {
      // ignore
    });
  }, [channelId, loadMoreMessages]);

  const getDisplayName = (): string => {
    if (channel.is_group && channel.name) return channel.name;
    const other = channel.members.find((m) => m.id !== user?.id);
    return other?.display_name ?? other?.username ?? 'DM';
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.channelName}>{getDisplayName()}</span>
        {channel.is_group && (
          <span className={styles.memberCount}>{channel.members.length} members</span>
        )}
      </div>

      <div className={styles.messages} ref={containerRef}>
        {hasMore[channelId] && (
          <div className={styles.loadMore}>
            <button
              className={styles.loadMoreBtn}
              onClick={handleLoadMore}
              disabled={messagesLoading}
            >
              {messagesLoading ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}

        {channelMessages.map((msg: DMMessage) => (
          <DMMessageItem
            key={msg.id}
            msg={msg}
            channelId={channelId}
            isOwn={msg.author_id === user?.id}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className={styles.errorBar}>
          <span>{error}</span>
          <button className={styles.errorCloseBtn} onClick={clearError}>&times;</button>
        </div>
      )}

      <div className={styles.inputArea}>
        {!wsConnected && (
          <div className={styles.connectingLabel}>
            Connecting...
          </div>
        )}
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${getDisplayName()}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend().catch(() => {});
            }
          }}
        />
        <button
          className={styles.sendBtn}
          onClick={() => { handleSend().catch(() => {}); }}
          disabled={!input.trim()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22,2 15,22 11,13 2,9" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ─── Individual DM message with edit/delete support ─── */

interface DMMessageItemProps {
  msg: DMMessage;
  channelId: string;
  isOwn: boolean;
}

function DMMessageItem({ msg, channelId, isOwn }: DMMessageItemProps) {
  const { editMessage, deleteMessage } = useDMStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [showActions, setShowActions] = useState(false);

  const authorName = msg.author?.display_name ?? msg.author?.username ?? 'Unknown';

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

  const formatTime = (dateStr: string): string => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleEdit = useCallback(async () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== msg.content) {
      try {
        await editMessage(channelId, msg.id, trimmed);
      } catch {
        // Restore on failure
        setEditContent(msg.content);
      }
    }
    setIsEditing(false);
  }, [editContent, msg.content, msg.id, channelId, editMessage]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEdit().catch(() => {});
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditContent(msg.content);
    }
  }, [handleEdit, msg.content]);

  const handleDelete = useCallback(async () => {
    if (confirm('Delete this message?')) {
      try {
        await deleteMessage(channelId, msg.id);
      } catch {
        // ignore
      }
    }
  }, [channelId, msg.id, deleteMessage]);

  return (
    <div
      className={styles.message}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={styles.messageAvatar}>
        {msg.author?.avatar_url ? (
          <img src={msg.author.avatar_url} alt="" />
        ) : (
          <span>{getInitials(authorName)}</span>
        )}
      </div>
      <div className={styles.messageBody}>
        <div className={styles.messageHeader}>
          <span className={`${styles.authorName} ${isOwn ? styles.isMe : ''}`}>
            {authorName}
          </span>
          <span className={styles.timestamp}>{formatTime(msg.created_at)}</span>
          {msg.edited_at && <span className={styles.edited}>(edited)</span>}
        </div>

        {isEditing ? (
          <div className={styles.editBox}>
            <textarea
              className={styles.editInput}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              autoFocus
            />
            <div className={styles.editHint}>
              escape to cancel &bull; enter to save
            </div>
          </div>
        ) : (
          <div className={styles.messageContent}>{msg.content}</div>
        )}
      </div>

      {showActions && !isEditing && isOwn && (
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={() => { setIsEditing(true); setEditContent(msg.content); }}
            title="Edit"
          >
            &#9998;
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => { handleDelete().catch(() => {}); }}
            title="Delete"
          >
            &#128465;
          </button>
        </div>
      )}
    </div>
  );
}
