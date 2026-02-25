import { useEffect, useRef } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import type { Message } from '../../types';
import styles from './PinnedMessagesPanel.module.css';

interface Props {
  channelId: string;
  onClose: () => void;
}

export function PinnedMessagesPanel({ channelId, onClose }: Props) {
  const { pinnedMessages, fetchPinned, unpinMessage } = useMessageStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPinned(channelId);
  }, [channelId, fetchPinned]);

  // Close on outside click
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleUnpin = async (messageId: string) => {
    await unpinMessage(channelId, messageId);
  };

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.panel} ref={panelRef}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Pinned Messages</span>
        <button className={styles.closeBtn} onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      <div className={styles.body}>
        {pinnedMessages.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📌</div>
            <div className={styles.emptyText}>No pinned messages yet.</div>
            <div className={styles.emptyHint}>
              Pin important messages so they are easy to find.
            </div>
          </div>
        ) : (
          pinnedMessages.map((msg: Message) => (
            <PinnedMessageItem
              key={msg.id}
              message={msg}
              onUnpin={handleUnpin}
              formatTime={formatTime}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PinnedMessageItem({
  message,
  onUnpin,
  formatTime,
}: {
  message: Message;
  onUnpin: (id: string) => Promise<void>;
  formatTime: (dateStr: string) => string;
}) {
  const authorName = message.author?.display_name ?? message.author?.username ?? 'Unknown';
  const authorInitials = authorName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className={styles.pinnedItem}>
      <div className={styles.pinnedAvatar}>
        {message.author?.avatar_url ? (
          <img src={message.author.avatar_url} alt={authorName} />
        ) : (
          authorInitials
        )}
      </div>
      <div className={styles.pinnedBody}>
        <div className={styles.pinnedMeta}>
          <span className={styles.pinnedAuthor}>{authorName}</span>
          <span className={styles.pinnedTime}>{formatTime(message.created_at)}</span>
        </div>
        <div className={styles.pinnedContent}>{message.content}</div>
      </div>
      <button
        className={styles.unpinBtn}
        onClick={() => onUnpin(message.id)}
        title="Unpin message"
      >
        &times;
      </button>
    </div>
  );
}
