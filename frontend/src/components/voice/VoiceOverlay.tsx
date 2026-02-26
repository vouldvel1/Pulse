import { useVoiceStore } from '@/stores/voiceStore';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/common/Avatar';

export function VoiceOverlay() {
  const channelName = useVoiceStore((s) => s.channelName);
  const participants = useVoiceStore((s) => s.participants);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfDeaf = useVoiceStore((s) => s.selfDeaf);
  const leaveChannel = useVoiceStore((s) => s.leaveChannel);
  const toggleMute = useVoiceStore((s) => s.toggleMute);
  const toggleDeaf = useVoiceStore((s) => s.toggleDeaf);
  const setOverlay = useVoiceStore((s) => s.setOverlay);
  const currentUser = useAuthStore((s) => s.user);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg-base)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        padding: 40,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{channelName}</h2>
          <div style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <span className="icon" style={{ fontSize: 14 }}>sensors</span>
            В эфире · {participants.length} участник{participants.length !== 1 ? 'а' : ''}
          </div>
        </div>
        <button
          onClick={() => setOverlay(false)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            border: 'none',
            background: 'rgba(255,255,255,0.08)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Свернуть"
        >
          <span className="icon">close_fullscreen</span>
        </button>
      </div>

      {/* Participant grid */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
          alignContent: 'center',
          overflowY: 'auto',
        }}
      >
        {participants.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', opacity: 0.3 }}>
            <span className="icon" style={{ fontSize: 60 }}>group</span>
            <div style={{ marginTop: 8 }}>Никого нет в голосовом канале</div>
          </div>
        ) : (
          participants.map((p) => (
            <ParticipantBox key={p.user_id} participant={p} />
          ))
        )}
      </div>

      {/* Floating controls */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          background: 'var(--surface)',
          padding: '12px 24px',
          borderRadius: 24,
          alignSelf: 'center',
          marginTop: 30,
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <VBtn
          icon={selfDeaf ? 'headset_off' : 'headset'}
          title={selfDeaf ? 'Включить звук' : 'Заглушить'}
          active={selfDeaf}
          onClick={toggleDeaf}
        />
        <VBtn
          icon={selfMute ? 'mic_off' : 'mic'}
          title={selfMute ? 'Включить микрофон' : 'Выключить'}
          active={selfMute}
          onClick={toggleMute}
        />
        <VBtn
          icon="call_end"
          title="Покинуть"
          hangup
          onClick={() => void leaveChannel()}
        />
      </div>
    </div>
  );
}

function ParticipantBox({ participant }: { participant: import('@/types').VoiceParticipant }) {
  return (
    <div
      style={{
        aspectRatio: '16/10',
        background: 'var(--surface-variant)',
        borderRadius: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: `2px solid ${participant.is_speaking ? 'var(--primary)' : 'transparent'}`,
        boxShadow: participant.is_speaking ? '0 0 24px rgba(208,188,255,0.25)' : 'none',
        position: 'relative',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <Avatar
        src={participant.avatar_url}
        name={participant.display_name ?? participant.username}
        size={72}
        radius={36}
      />

      {/* Name badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 16,
          fontSize: 12,
          background: 'rgba(0,0,0,0.6)',
          padding: '4px 10px',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {participant.username}
        {participant.self_mute && (
          <span className="icon" style={{ fontSize: 13, color: 'var(--error)' }}>mic_off</span>
        )}
        {participant.self_deaf && (
          <span className="icon" style={{ fontSize: 13, color: 'var(--error)' }}>headset_off</span>
        )}
      </div>

      {participant.is_speaking && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--primary)',
            animation: 'pulse 1s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}

function VBtn({ icon, title, active, hangup, onClick }: {
  icon: string; title: string; active?: boolean; hangup?: boolean; onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 52,
        height: 52,
        borderRadius: 16,
        border: 'none',
        background: hangup
          ? 'var(--error)'
          : active
          ? 'var(--primary-container)'
          : 'rgba(255,255,255,0.05)',
        color: hangup ? 'var(--on-error)' : active ? 'var(--primary)' : 'white',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
      }}
    >
      <span className="icon" style={{ fontSize: 22 }}>{icon}</span>
    </button>
  );
}
