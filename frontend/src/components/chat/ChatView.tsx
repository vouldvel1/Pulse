import { useEffect, useRef, useState } from 'react';
import { useMessageStore } from '@/stores/messageStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { wsClient } from '@/utils/wsClient';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import { VoiceOverlay } from '@/components/voice/VoiceOverlay';
import { useVoiceStore } from '@/stores/voiceStore';
import type { Message } from '@/types';

export function ChatView() {
  const activeChannelId = useMessageStore((s) => s.activeChannelId);
  const messages = useMessageStore((s) => s.messages);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const sendMessage = useMessageStore((s) => s.sendMessage);
  const hasMore = useMessageStore((s) => s.hasMore);

  const activeCommunityId = useCommunityStore((s) => s.activeCommunityId);
  const channels = useCommunityStore((s) => s.channels);

  const typingUsers = useUIStore((s) => s.typingUsers);
  const currentUser = useAuthStore((s) => s.user);
  const showOverlay = useVoiceStore((s) => s.showOverlay);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const channelMessages = activeChannelId ? (messages[activeChannelId] ?? []) : [];
  const channelTypingUsers = (activeChannelId ? typingUsers[activeChannelId] : null) ?? [];
  const typingOthers = channelTypingUsers.filter((u) => u.userId !== currentUser?.id);

  // Find channel name
  const allChannels = Object.values(channels).flat();
  const activeChannel = allChannels.find((c) => c.id === activeChannelId);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages.length]);

  // Load more on scroll to top
  const handleScroll = async () => {
    if (!scrollRef.current || !activeChannelId) return;
    const { scrollTop } = scrollRef.current;
    if (scrollTop < 100 && hasMore[activeChannelId] && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      const oldest = channelMessages[0];
      if (oldest) {
        await fetchMessages(activeChannelId, oldest.id);
      }
      loadingMoreRef.current = false;
    }
  };

  const handleSend = async (content: string) => {
    if (!activeChannelId) return;
    await sendMessage(activeChannelId, content, replyTo?.id);
    setReplyTo(null);
  };

  // Empty state
  if (!activeChannelId) {
    return (
      <main className="glass-panel" style={{ flex: 1 }}>
        {showOverlay && <VoiceOverlay />}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            opacity: 0.3,
          }}
        >
          <span className="icon" style={{ fontSize: 80 }}>waves</span>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Выберите канал</div>
        </div>
      </main>
    );
  }

  return (
    <main className="glass-panel" style={{ flex: 1, minWidth: 0 }}>
      {showOverlay && <VoiceOverlay />}

      {/* Channel title bar */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span className="icon" style={{ fontSize: 20, color: 'var(--outline)' }}>tag</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          {activeChannel?.name ?? activeChannelId}
        </span>
        {activeChannel?.topic && (
          <>
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: 13, color: 'var(--outline)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeChannel.topic}
            </span>
          </>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={() => void handleScroll()}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 0',
        }}
      >
        {hasMore[activeChannelId] && (
          <div style={{ textAlign: 'center', padding: 12, fontSize: 13, color: 'var(--outline)' }}>
            <button
              onClick={() => void fetchMessages(activeChannelId, channelMessages[0]?.id)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                borderRadius: 10,
                padding: '6px 14px',
                color: 'var(--outline)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Загрузить предыдущие
            </button>
          </div>
        )}

        {channelMessages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.3,
            }}
          >
            <span className="icon" style={{ fontSize: 60 }}>chat_bubble</span>
            <div style={{ fontSize: 14, marginTop: 8 }}>Нет сообщений</div>
          </div>
        ) : (
          channelMessages.map((msg, i) => (
            <MessageItem
              key={msg.id}
              message={msg}
              channelId={activeChannelId}
              prevAuthorId={channelMessages[i - 1]?.author_id}
              prevTimestamp={channelMessages[i - 1]?.created_at}
            />
          ))
        )}

        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {typingOthers.length > 0 && (
        <div
          style={{
            padding: '4px 24px',
            fontSize: 12,
            color: 'var(--outline)',
            flexShrink: 0,
            height: 24,
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {typingOthers.map((u) => u.username).join(', ')}
          </span>
          {' '}
          {typingOthers.length === 1 ? 'печатает...' : 'печатают...'}
        </div>
      )}

      {/* Message input */}
      <MessageInput
        channelId={activeChannelId}
        placeholder={`Написать в #${activeChannel?.name ?? '...'}`}
        onSend={handleSend}
        replyToId={replyTo?.id}
        replyToContent={replyTo?.content}
        onCancelReply={() => setReplyTo(null)}
      />
    </main>
  );
}
