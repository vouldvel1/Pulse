import { useEffect, useRef, useState } from 'react';
import { useDMStore } from '@/stores/dmStore';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/common/Avatar';
import type { DMMessage } from '@/types';
import { format, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return `Вчера в ${format(date, 'HH:mm')}`;
  return format(date, 'd MMM в HH:mm', { locale: ru });
}

export function DMChatView() {
  const activeChannelId = useDMStore((s) => s.activeChannelId);
  const channels = useDMStore((s) => s.channels);
  const messages = useDMStore((s) => s.messages);
  const hasMore = useDMStore((s) => s.hasMore);
  const fetchMessages = useDMStore((s) => s.fetchMessages);
  const sendMessage = useDMStore((s) => s.sendMessage);
  const currentUser = useAuthStore((s) => s.user);

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const channel = channels.find((c) => c.id === activeChannelId);
  const channelMessages = activeChannelId ? (messages[activeChannelId] ?? []) : [];

  const channelName = (() => {
    if (!channel) return '';
    if (channel.is_group) return channel.name ?? 'Группа';
    const other = channel.members.find((m) => m.id !== currentUser?.id);
    return other?.display_name ?? other?.username ?? 'Пользователь';
  })();

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages.length]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeChannelId || isSending) return;

    setIsSending(true);
    setInput('');
    try {
      await sendMessage(activeChannelId, trimmed);
    } catch {
      setInput(trimmed);
    } finally {
      setIsSending(false);
    }
  };

  if (!activeChannelId) {
    return (
      <main className="glass-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
        <div style={{ textAlign: 'center' }}>
          <span className="icon" style={{ fontSize: 80 }}>chat</span>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 12 }}>Выберите диалог</div>
        </div>
      </main>
    );
  }

  return (
    <main className="glass-panel" style={{ flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        {channel && (
          <Avatar
            src={channel.is_group ? null : channel.members.find((m) => m.id !== currentUser?.id)?.avatar_url}
            name={channelName}
            size={36}
            radius={channel?.is_group ? 10 : 18}
          />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{channelName}</div>
          {channel?.is_group && (
            <div style={{ fontSize: 11, color: 'var(--outline)' }}>
              {channel.members.length} участников
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}
      >
        {channelMessages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.3 }}>
            <div style={{ textAlign: 'center' }}>
              <span className="icon" style={{ fontSize: 60 }}>mark_chat_unread</span>
              <div style={{ fontSize: 14, marginTop: 8 }}>Начните переписку!</div>
            </div>
          </div>
        ) : (
          channelMessages.map((msg, i) => (
            <DMMessageItem
              key={msg.id}
              message={msg}
              isOwn={msg.author_id === currentUser?.id}
              prevAuthorId={channelMessages[i - 1]?.author_id}
              prevTimestamp={channelMessages[i - 1]?.created_at}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ margin: 16, flexShrink: 0 }}>
        <div
          style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 24,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
            placeholder={`Написать ${channelName}...`}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'white',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || isSending}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: 'none',
              background: input.trim() ? 'var(--primary)' : 'transparent',
              color: input.trim() ? 'var(--on-primary)' : 'var(--outline)',
              cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <span className="icon">send</span>
          </button>
        </div>
      </div>
    </main>
  );
}

function DMMessageItem({
  message,
  isOwn,
  prevAuthorId,
  prevTimestamp,
}: {
  message: DMMessage;
  isOwn: boolean;
  prevAuthorId?: string;
  prevTimestamp?: string;
}) {
  const prevTs = prevTimestamp ? new Date(prevTimestamp) : null;
  const curTs = new Date(message.created_at);
  const timeDiff = prevTs ? (curTs.getTime() - prevTs.getTime()) / 1000 / 60 : 999;
  const isGrouped = prevAuthorId === message.author_id && timeDiff < 7;

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: isGrouped ? '2px 16px' : '8px 16px',
        flexDirection: 'row',
      }}
    >
      <div style={{ width: 36, flexShrink: 0 }}>
        {!isGrouped ? (
          <Avatar
            src={message.author?.avatar_url}
            name={message.author?.display_name ?? message.author?.username}
            size={36}
            radius={18}
          />
        ) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {!isGrouped && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: isOwn ? 'var(--primary)' : '#E6E1E5' }}>
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
        <div style={{ fontSize: 14, lineHeight: 1.5, color: '#E6E1E5', wordBreak: 'break-word' }}>
          {message.content}
        </div>
      </div>
    </div>
  );
}
