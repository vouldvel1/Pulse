import { useState, useRef, useEffect } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAuthStore } from '@/stores/authStore';
import { useMessageStore } from '@/stores/messageStore';
import { messages as messagesApi } from '@/utils/api';
import { Avatar } from '@/components/common/Avatar';
import type { Message } from '@/types';

interface MessageItemProps {
  message: Message;
  channelId: string;
  prevAuthorId?: string;
  prevTimestamp?: string;
}

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return `Вчера в ${format(date, 'HH:mm')}`;
  return format(date, 'd MMM в HH:mm', { locale: ru });
}

export function MessageItem({ message, channelId, prevAuthorId, prevTimestamp }: MessageItemProps) {
  const currentUser = useAuthStore((s) => s.user);
  const editMessage = useMessageStore((s) => s.editMessage);
  const deleteMessage = useMessageStore((s) => s.deleteMessage);

  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const isOwnMessage = currentUser?.id === message.author_id;
  const prevTs = prevTimestamp ? new Date(prevTimestamp) : null;
  const curTs = new Date(message.created_at);
  const timeDiff = prevTs ? (curTs.getTime() - prevTs.getTime()) / 1000 / 60 : 999;
  const isGrouped = prevAuthorId === message.author_id && timeDiff < 7;

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [isEditing]);

  const handleEdit = async () => {
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false);
      return;
    }
    try {
      await editMessage(channelId, message.id, editContent.trim());
      setIsEditing(false);
    } catch { /* ignore */ }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить сообщение?')) return;
    try {
      await deleteMessage(channelId, message.id);
    } catch { /* ignore */ }
  };

  const handleReaction = async (emoji: string) => {
    try {
      const hasReacted = message.reactions?.find((r) => r.emoji === emoji && r.me);
      if (hasReacted) {
        await messagesApi.removeReaction(channelId, message.id, emoji);
      } else {
        await messagesApi.addReaction(channelId, message.id, emoji);
      }
    } catch { /* ignore */ }
    setShowEmojiPicker(false);
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setShowEmojiPicker(false); }}
      style={{
        display: 'flex',
        gap: 12,
        padding: isGrouped ? '2px 16px' : '8px 16px',
        borderRadius: 12,
        position: 'relative',
        background: isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
        transition: 'background 0.1s ease',
      }}
    >
      {/* Avatar column */}
      <div style={{ width: 36, flexShrink: 0 }}>
        {!isGrouped ? (
          <Avatar
            src={message.author?.avatar_url}
            name={message.author?.display_name ?? message.author?.username}
            size={36}
            radius={10}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isHovered && (
              <span style={{ fontSize: 9, color: 'var(--outline)', whiteSpace: 'nowrap' }}>
                {format(new Date(message.created_at), 'HH:mm')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!isGrouped && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#E6E1E5' }}>
              {message.author?.display_name ?? message.author?.username ?? 'Unknown'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--outline)' }}>
              {formatTimestamp(message.created_at)}
            </span>
            {message.edited_at && (
              <span style={{ fontSize: 10, color: 'var(--outline)', opacity: 0.7 }}>(изменено)</span>
            )}
          </div>
        )}

        {/* Reply */}
        {message.reply_to && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--outline)',
              marginBottom: 4,
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.04)',
              borderLeft: '2px solid var(--outline)',
              borderRadius: '0 8px 8px 0',
            }}
          >
            <span className="icon" style={{ fontSize: 14 }}>reply</span>
            <span style={{ fontWeight: 600 }}>
              {message.reply_to.author?.username ?? 'Unknown'}:
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {message.reply_to.content}
            </span>
          </div>
        )}

        {/* Message content / edit mode */}
        {isEditing ? (
          <div>
            <textarea
              ref={editRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleEdit(); }
                if (e.key === 'Escape') { setIsEditing(false); setEditContent(message.content); }
              }}
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--primary)',
                borderRadius: 10,
                padding: '8px 12px',
                color: '#E6E1E5',
                outline: 'none',
                resize: 'none',
                fontSize: 14,
                fontFamily: 'inherit',
                lineHeight: 1.5,
                minHeight: 60,
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 4 }}>
              Enter — сохранить · Esc — отмена
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word', color: '#E6E1E5' }}>
            {message.content}
          </div>
        )}

        {/* Attachments */}
        {message.attachments?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {message.attachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} />
            ))}
          </div>
        )}

        {/* Embeds */}
        {message.embeds?.map((embed, i) => (
          <div
            key={i}
            style={{
              marginTop: 8,
              padding: 12,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 12,
              borderLeft: '3px solid var(--primary)',
              maxWidth: 400,
            }}
          >
            {embed.site_name && (
              <div style={{ fontSize: 11, color: 'var(--outline)', marginBottom: 4 }}>{embed.site_name}</div>
            )}
            {embed.title && (
              <a href={embed.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)', display: 'block', marginBottom: 4 }}>
                {embed.title}
              </a>
            )}
            {embed.description && (
              <div style={{ fontSize: 13, color: 'var(--outline)', lineHeight: 1.4 }}>{embed.description}</div>
            )}
            {embed.image && (
              <img
                src={embed.image}
                alt={embed.title ?? ''}
                style={{ marginTop: 8, maxWidth: '100%', borderRadius: 8, display: 'block' }}
              />
            )}
          </div>
        ))}

        {/* Reactions */}
        {message.reactions?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => void handleReaction(r.emoji)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 12,
                  border: `1px solid ${r.me ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`,
                  background: r.me ? 'var(--primary-container)' : 'rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: r.me ? 'var(--primary)' : '#E6E1E5',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{r.emoji}</span>
                <span style={{ fontSize: 11 }}>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover action bar */}
      {isHovered && !isEditing && (
        <div
          style={{
            position: 'absolute',
            top: -16,
            right: 16,
            display: 'flex',
            gap: 4,
            background: '#232229',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            padding: '4px 6px',
            zIndex: 10,
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {/* Reaction */}
          <div style={{ position: 'relative' }}>
            <ActionBtn
              icon="add_reaction"
              title="Реакция"
              onClick={() => setShowEmojiPicker((v) => !v)}
            />
            {showEmojiPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  background: '#232229',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 16,
                  padding: 8,
                  display: 'flex',
                  gap: 4,
                  zIndex: 20,
                  animation: 'scaleIn 0.15s ease',
                }}
              >
                {COMMON_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => void handleReaction(emoji)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isOwnMessage && (
            <ActionBtn icon="edit" title="Редактировать" onClick={() => setIsEditing(true)} />
          )}
          {isOwnMessage && (
            <ActionBtn icon="delete" title="Удалить" onClick={() => void handleDelete()} danger />
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ icon, title, onClick, danger }: { icon: string; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        border: 'none',
        background: 'transparent',
        color: danger ? 'var(--error)' : 'var(--outline)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? 'rgba(242,184,181,0.1)' : 'rgba(255,255,255,0.1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="icon" style={{ fontSize: 16 }}>{icon}</span>
    </button>
  );
}

function AttachmentPreview({ attachment }: { attachment: import('@/types').Attachment }) {
  const isImage = attachment.mime_type.startsWith('image/');
  const isVideo = attachment.mime_type.startsWith('video/');

  if (isImage) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer">
        <img
          src={attachment.url}
          alt={attachment.file_name}
          style={{
            maxWidth: 300,
            maxHeight: 200,
            borderRadius: 12,
            display: 'block',
            objectFit: 'cover',
          }}
        />
      </a>
    );
  }

  if (isVideo) {
    return (
      <video
        src={attachment.url}
        controls
        style={{ maxWidth: 300, borderRadius: 12 }}
      />
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        color: 'var(--primary)',
        textDecoration: 'none',
        fontSize: 13,
      }}
    >
      <span className="icon">attach_file</span>
      <span>{attachment.file_name}</span>
      <span style={{ fontSize: 11, color: 'var(--outline)' }}>
        {(attachment.file_size / 1024).toFixed(0)} KB
      </span>
    </a>
  );
}
