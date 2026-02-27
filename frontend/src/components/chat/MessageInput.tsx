import { useState, useRef, useEffect, useCallback } from 'react';
import { wsClient } from '@/utils/wsClient';

interface MessageInputProps {
  channelId: string;
  placeholder?: string;
  onSend: (content: string) => Promise<void>;
  replyToId?: string;
  replyToContent?: string;
  onCancelReply?: () => void;
}

export function MessageInput({
  channelId,
  placeholder = 'Написать...',
  onSend,
  replyToId,
  replyToContent,
  onCancelReply,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [content]);

  const handleTyping = useCallback(() => {
    wsClient.sendTyping(channelId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 3000);
  }, [channelId]);

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    const sentContent = trimmed;
    setContent('');
    try {
      await onSend(sentContent);
    } catch {
      setContent(sentContent);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div style={{ margin: 16, flexShrink: 0 }}>
      {/* Reply banner */}
      {replyToId && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 14px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: '14px 14px 0 0',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            fontSize: 12,
            color: 'var(--outline)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
            <span className="icon" style={{ fontSize: 14, color: 'var(--primary)' }}>reply</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Ответ: {replyToContent}
            </span>
          </div>
          <button
            onClick={onCancelReply}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--outline)',
              cursor: 'pointer',
              padding: 2,
              borderRadius: 4,
            }}
          >
            <span className="icon" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      )}

      {/* Input box */}
      <div
        style={{
          background: 'rgba(0,0,0,0.2)',
          borderRadius: replyToId ? '0 0 24px 24px' : 24,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => { setContent(e.target.value); handleTyping(); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'white',
            resize: 'none',
            fontSize: 14,
            lineHeight: 1.5,
            fontFamily: 'inherit',
            overflowY: 'auto',
          }}
        />

        {/* Send button */}
        <button
          onClick={() => void handleSend()}
          disabled={!content.trim() || isSending}
          title="Отправить"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            border: 'none',
            background: content.trim() ? 'var(--primary)' : 'transparent',
            color: content.trim() ? 'var(--on-primary)' : 'var(--outline)',
            cursor: content.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginBottom: 2,
            transition: 'all 0.15s ease',
          }}
        >
          <span className="icon" style={{ fontSize: 20 }}>send</span>
        </button>
      </div>
    </div>
  );
}
