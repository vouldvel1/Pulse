import { useState, useCallback } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import type { Message, Embed } from '../../types';
import styles from './MessageItem.module.css';

interface Props {
  message: Message;
  isOwn: boolean;
  channelId: string;
  isGrouped?: boolean;
  isGroupStart?: boolean;
}

export function MessageItem({ message, isOwn, channelId, isGrouped = false, isGroupStart = false }: Props) {
  const { editMessage, deleteMessage, addReaction, removeReaction, pinMessage, unpinMessage } = useMessageStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);

  const authorName = message.author?.display_name ?? message.author?.username ?? 'Unknown';
  const authorInitials = authorName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleEdit = useCallback(async () => {
    if (editContent.trim() && editContent !== message.content) {
      await editMessage(channelId, message.id, editContent.trim());
    }
    setIsEditing(false);
  }, [editContent, message.content, message.id, channelId, editMessage]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEdit();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditContent(message.content);
    }
  }, [handleEdit, message.content]);

  const handleDelete = useCallback(async () => {
    if (confirm('Delete this message?')) {
      await deleteMessage(channelId, message.id);
    }
  }, [channelId, message.id, deleteMessage]);

  const handlePin = useCallback(async () => {
    if (message.pinned) {
      await unpinMessage(channelId, message.id);
    } else {
      await pinMessage(channelId, message.id);
    }
  }, [channelId, message.id, message.pinned, pinMessage, unpinMessage]);

  const handleReaction = useCallback(async (emoji: string, hasReacted: boolean) => {
    if (hasReacted) {
      await removeReaction(channelId, message.id, emoji);
    } else {
      await addReaction(channelId, message.id, emoji);
    }
  }, [channelId, message.id, addReaction, removeReaction]);

  const isImage = (mime: string): boolean => mime.startsWith('image/');

  const formatShortTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className={`${styles.message} ${isGrouped ? styles.grouped : ''} ${isGroupStart ? styles.groupStart : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {isGrouped && (
        <span className={styles.groupedTime}>{formatShortTime(message.created_at)}</span>
      )}
      <div className={styles.avatar}>
        {message.author?.avatar_url ? (
          <img src={message.author.avatar_url} alt={authorName} />
        ) : (
          authorInitials
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.author}>{authorName}</span>
          <span className={styles.time}>{formatTime(message.created_at)}</span>
          {message.edited_at && <span className={styles.edited}>(edited)</span>}
          {message.pinned && <span className={styles.pinned}>📌</span>}
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
              escape to cancel • enter to save
            </div>
          </div>
        ) : (
          <div className={styles.content}>{message.content}</div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={styles.attachments}>
            {message.attachments.map((att) => (
              <div key={att.id} className={styles.attachment}>
                {isImage(att.mime_type) ? (
                  <img
                    src={att.url}
                    alt={att.file_name}
                    className={styles.attachmentImage}
                  />
                ) : (
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className={styles.attachmentFile}>
                    <span className={styles.fileIcon}>📎</span>
                    <span className={styles.fileName}>{att.file_name}</span>
                    <span className={styles.fileSize}>{formatFileSize(att.file_size)}</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Link embeds */}
        {message.embeds && message.embeds.length > 0 && (
          <div className={styles.embeds}>
            {message.embeds.map((embed) => (
              <EmbedCard key={embed.url} embed={embed} />
            ))}
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={styles.reactions}>
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                className={`${styles.reaction} ${reaction.me ? styles.reactionActive : ''}`}
                onClick={() => handleReaction(reaction.emoji, reaction.me)}
              >
                <span>{reaction.emoji}</span>
                <span className={styles.reactionCount}>{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {showActions && !isEditing && (
        <div className={styles.actions}>
          <button
            className={`${styles.actionBtn} ${message.pinned ? styles.actionBtnActive : ''}`}
            onClick={handlePin}
            title={message.pinned ? 'Unpin message' : 'Pin message'}
          >
            📌
          </button>
          {isOwn && (
            <button className={styles.actionBtn} onClick={() => { setIsEditing(true); setEditContent(message.content); }} title="Edit">
              ✏️
            </button>
          )}
          {isOwn && (
            <button className={styles.actionBtn} onClick={handleDelete} title="Delete">
              🗑️
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EmbedCard({ embed }: { embed: Embed }) {
  const borderColor = embed.color || 'var(--accent-primary)';

  if (embed.type === 'image') {
    return (
      <div className={styles.embedCard}>
        <a href={embed.url} target="_blank" rel="noopener noreferrer">
          <img src={embed.url} alt="Embedded image" className={styles.embedImage} />
        </a>
      </div>
    );
  }

  return (
    <a
      href={embed.url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.embedCard}
      style={{ borderLeftColor: borderColor }}
    >
      {embed.site_name && (
        <div className={styles.embedSite}>{embed.site_name}</div>
      )}
      {embed.title && (
        <div className={styles.embedTitle}>{embed.title}</div>
      )}
      {embed.description && (
        <div className={styles.embedDesc}>{embed.description}</div>
      )}
      {embed.image_url && (
        <img src={embed.image_url} alt="" className={styles.embedThumb} />
      )}
    </a>
  );
}
