import { useState, useEffect } from 'react';
import { useCommunityStore } from '@/stores/communityStore';
import { useMessageStore } from '@/stores/messageStore';
import { useUIStore } from '@/stores/uiStore';
import { useVoiceStore } from '@/stores/voiceStore';
import { wsClient } from '@/utils/wsClient';
import { invites as invitesApi } from '@/utils/api';
import type { Channel } from '@/types';

export function ServerSidebar() {
  const communities = useCommunityStore((s) => s.communities);
  const activeCommunityId = useCommunityStore((s) => s.activeCommunityId);
  const channels = useCommunityStore((s) => s.channels);
  const setActiveChannel = useMessageStore((s) => s.setActiveChannel);
  const activeChannelId = useMessageStore((s) => s.activeChannelId);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const setShowCreateCommunityModal = useUIStore((s) => s.setShowCreateCommunityModal);
  const setShowCreateChannelModal = useUIStore((s) => s.setShowCreateChannelModal);

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const activeCommunity = communities.find((c) => c.id === activeCommunityId) ?? null;
  const communityChannels = activeCommunityId ? (channels[activeCommunityId] ?? []) : [];

  const textChannels = communityChannels.filter((c) => c.type === 'text' || c.type === 'announcement');
  const voiceChannels = communityChannels.filter((c) => c.type === 'voice');

  // Reset invite panel when community changes
  useEffect(() => {
    setInviteCode(null);
    setInviteCopied(false);
  }, [activeCommunityId]);

  const handleGenerateInvite = async () => {
    if (!activeCommunityId) return;
    setInviteLoading(true);
    try {
      const invite = await invitesApi.create(activeCommunityId);
      setInviteCode(invite.code);
      setInviteCopied(false);
    } catch { /* ignore — likely no permission */ }
    finally { setInviteLoading(false); }
  };

  const handleCopyInvite = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleChannelClick = async (channel: Channel) => {
    if (channel.type === 'voice') return;
    if (activeChannelId === channel.id) return;
    if (activeChannelId) wsClient.leaveChannel(activeChannelId);
    setActiveChannel(channel.id);
    wsClient.joinChannel(channel.id);
    if (!useMessageStore.getState().messages[channel.id]) {
      await fetchMessages(channel.id);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Channel list for active community */}
      {activeCommunity && (
        <>
          {/* Community header with invite */}
          <div
            style={{
              padding: '4px 12px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {activeCommunity.name}
            </div>
            <button
              onClick={() => void handleGenerateInvite()}
              disabled={inviteLoading}
              title="Пригласить"
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: 10,
                border: 'none',
                background: 'rgba(255,255,255,0.07)',
                color: 'var(--outline)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="icon" style={{ fontSize: 16 }}>
                {inviteLoading ? 'progress_activity' : 'person_add'}
              </span>
            </button>
          </div>

          {/* Invite code panel */}
          {inviteCode && (
            <div
              style={{
                margin: '0 8px 12px',
                background: 'var(--surface-variant)',
                borderRadius: 16,
                padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--outline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
                Код приглашения
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontFamily: 'monospace',
                    background: 'rgba(0,0,0,0.3)',
                    padding: '5px 10px',
                    borderRadius: 8,
                    color: 'var(--primary)',
                    letterSpacing: '1px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {inviteCode}
                </code>
                <button
                  onClick={() => void handleCopyInvite()}
                  title={inviteCopied ? 'Скопировано!' : 'Копировать'}
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: 'none',
                    background: inviteCopied ? 'var(--primary-container)' : 'rgba(255,255,255,0.07)',
                    color: inviteCopied ? 'var(--primary)' : 'var(--outline)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span className="icon" style={{ fontSize: 16 }}>
                    {inviteCopied ? 'check' : 'content_copy'}
                  </span>
                </button>
                <button
                  onClick={() => setInviteCode(null)}
                  title="Закрыть"
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--outline)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span className="icon" style={{ fontSize: 16 }}>close</span>
                </button>
              </div>
            </div>
          )}

          {/* Text channels */}
          {textChannels.length > 0 && (
            <>
              <SectionLabel>
                Каналы
                <button
                  onClick={() => setShowCreateChannelModal(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--outline)', cursor: 'pointer', padding: 2, borderRadius: 4 }}
                  title="Создать канал"
                >
                  <span className="icon" style={{ fontSize: 14 }}>add</span>
                </button>
              </SectionLabel>
              {textChannels.map((ch) => (
                <ChannelItem
                  key={ch.id}
                  icon={ch.type === 'announcement' ? 'campaign' : 'tag'}
                  label={ch.name}
                  active={activeChannelId === ch.id}
                  onClick={() => void handleChannelClick(ch)}
                />
              ))}
            </>
          )}

          {/* Voice channels */}
          {voiceChannels.length > 0 && (
            <>
              <SectionLabel>Голос</SectionLabel>
              {voiceChannels.map((ch) => (
                <VoiceChannelItem key={ch.id} channel={ch} />
              ))}
            </>
          )}

          {/* Empty */}
          {textChannels.length === 0 && voiceChannels.length === 0 && (
            <div style={{ padding: '12px 16px', color: 'var(--outline)', fontSize: 13 }}>
              Нет каналов
              <br />
              <button
                onClick={() => setShowCreateChannelModal(true)}
                style={{
                  marginTop: 8,
                  background: 'var(--primary-container)',
                  color: 'var(--primary)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '6px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Создать канал
              </button>
            </div>
          )}
        </>
      )}

      {/* No community selected */}
      {!activeCommunity && (
        <div style={{ padding: 16, color: 'var(--outline)', fontSize: 13, textAlign: 'center', marginTop: 24 }}>
          <span className="icon" style={{ fontSize: 40, opacity: 0.3, display: 'block', marginBottom: 8 }}>grid_view</span>
          {communities.length === 0 ? 'Нет серверов' : 'Выберите сервер'}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 6px', fontSize: 10, color: 'var(--outline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
      {children}
    </div>
  );
}

function ChannelItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 14, cursor: 'pointer', fontSize: 14, color: active ? 'var(--primary)' : 'var(--outline)', background: active ? 'var(--primary-container)' : 'transparent', margin: '2px 8px', transition: 'all 0.15s ease' }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'white'; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--outline)'; } }}
    >
      <span className="icon" style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

function VoiceChannelItem({ channel }: { channel: Channel }) {
  const voiceChannelId = useVoiceStore((s) => s.channelId);
  const participants = useVoiceStore((s) => s.participants);
  const joinChannel = useVoiceStore((s) => s.joinChannel);
  const leaveChannel = useVoiceStore((s) => s.leaveChannel);
  const communities = useCommunityStore((s) => s.communities);
  const activeCommunityId = useCommunityStore((s) => s.activeCommunityId);
  const community = communities.find((c) => c.id === activeCommunityId);
  const isActive = voiceChannelId === channel.id;

  const handleClick = async () => {
    if (isActive) await leaveChannel();
    else await joinChannel(channel.id, channel.name, community?.name ?? 'Pulse');
  };

  return (
    <div style={{ margin: '2px 8px' }}>
      <div
        onClick={() => void handleClick()}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 14, cursor: 'pointer', fontSize: 14, color: isActive ? 'var(--primary)' : 'var(--outline)', background: isActive ? 'var(--primary-container)' : 'transparent', transition: 'all 0.15s ease' }}
        onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'white'; } }}
        onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--outline)'; } }}
      >
        <span className="icon" style={{ fontSize: 18 }}>volume_up</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{channel.name}</span>
        {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />}
      </div>
      {isActive && participants.map((p) => (
        <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px 4px 44px', fontSize: 12, color: p.is_speaking ? 'var(--primary)' : 'var(--outline)' }}>
          <div style={{ width: 18, height: 18, borderRadius: 5, background: p.is_speaking ? 'var(--primary)' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
            {p.username[0].toUpperCase()}
          </div>
          {p.username}
          {p.self_mute && <span className="icon" style={{ fontSize: 12 }}>mic_off</span>}
        </div>
      ))}
    </div>
  );
}
