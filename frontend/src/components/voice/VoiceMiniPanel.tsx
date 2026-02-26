import { useVoiceStore } from '@/stores/voiceStore';

export function VoiceMiniPanel() {
  const channelId = useVoiceStore((s) => s.channelId);
  const channelName = useVoiceStore((s) => s.channelName);
  const communityName = useVoiceStore((s) => s.communityName);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfDeaf = useVoiceStore((s) => s.selfDeaf);
  const leaveChannel = useVoiceStore((s) => s.leaveChannel);
  const toggleMute = useVoiceStore((s) => s.toggleMute);
  const toggleDeaf = useVoiceStore((s) => s.toggleDeaf);
  const setOverlay = useVoiceStore((s) => s.setOverlay);

  if (!channelId) return null;

  return (
    <div
      className="animate-slide-up"
      style={{
        background: 'var(--surface-variant)',
        margin: 8,
        borderRadius: 24,
        padding: 12,
        border: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}
    >
      {/* Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div>
          <div
            style={{
              color: 'var(--success)',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span className="icon" style={{ fontSize: 13 }}>sensors</span>
            В эфире
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
            {channelName} / {communityName}
          </div>
        </div>
        <button
          onClick={() => setOverlay(true)}
          title="Развернуть"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            border: 'none',
            background: 'rgba(255,255,255,0.08)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="icon" style={{ fontSize: 16 }}>open_in_full</span>
        </button>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        <VBtn
          icon={selfDeaf ? 'headset_off' : 'headset'}
          title={selfDeaf ? 'Отключить заглушение' : 'Заглушить звук'}
          active={selfDeaf}
          onClick={toggleDeaf}
        />
        <VBtn
          icon={selfMute ? 'mic_off' : 'mic'}
          title={selfMute ? 'Включить микрофон' : 'Выключить микрофон'}
          active={selfMute}
          onClick={toggleMute}
        />
        <VBtn
          icon="call_end"
          title="Покинуть канал"
          hangup
          onClick={() => void leaveChannel()}
        />
      </div>
    </div>
  );
}

function VBtn({
  icon,
  title,
  active,
  hangup,
  onClick,
}: {
  icon: string;
  title: string;
  active?: boolean;
  hangup?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        border: 'none',
        background: hangup
          ? 'var(--error)'
          : active
          ? 'var(--primary-container)'
          : 'rgba(255,255,255,0.08)',
        color: hangup ? 'var(--on-error)' : active ? 'var(--primary)' : 'white',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
      }}
    >
      <span className="icon" style={{ fontSize: 18 }}>{icon}</span>
    </button>
  );
}
