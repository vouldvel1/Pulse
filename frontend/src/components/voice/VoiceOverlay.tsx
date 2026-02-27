import { useState, useRef, useEffect } from 'react';
import { useVoiceStore } from '@/stores/voiceStore';
import { screenShareActions, type ScreenShareQuality } from '@/hooks/useScreenShare';
import { Avatar } from '@/components/common/Avatar';
import type { VoiceParticipant } from '@/types';

export function VoiceOverlay() {
  const channelName = useVoiceStore((s) => s.channelName);
  const participants = useVoiceStore((s) => s.participants);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfDeaf = useVoiceStore((s) => s.selfDeaf);
  const isSharing = useVoiceStore((s) => s.isSharing);
  const shareStream = useVoiceStore((s) => s.shareStream);
  const leaveChannel = useVoiceStore((s) => s.leaveChannel);
  const toggleMute = useVoiceStore((s) => s.toggleMute);
  const toggleDeaf = useVoiceStore((s) => s.toggleDeaf);
  const setOverlay = useVoiceStore((s) => s.setOverlay);

  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<ScreenShareQuality>('720p60');

  const handleScreenShare = () => {
    if (isSharing) {
      screenShareActions.stopSharing();
    } else {
      setShowQualityPicker(true);
    }
  };

  const handleStartWithQuality = (q: ScreenShareQuality) => {
    setSelectedQuality(q);
    setShowQualityPicker(false);
    void screenShareActions.startSharing(q);
  };

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{channelName}</h2>
          <div style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <span className="icon" style={{ fontSize: 14 }}>sensors</span>
            В эфире · {participants.length} участник{participants.length === 1 ? '' : participants.length < 5 ? 'а' : 'ов'}
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

      {/* Screen share viewer (incoming stream when not sharing yourself) */}
      {!isSharing && shareStream && (
        <ScreenViewer stream={shareStream} />
      )}

      {/* Participant grid */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          alignContent: 'start',
          overflowY: 'auto',
        }}
      >
        {participants.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', opacity: 0.3, paddingTop: 60 }}>
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
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: 24 }}>
        {/* Quality picker popup */}
        {showQualityPicker && (
          <QualityPicker
            selected={selectedQuality}
            onSelect={handleStartWithQuality}
            onClose={() => setShowQualityPicker(false)}
          />
        )}

        <div
          style={{
            display: 'flex',
            gap: 12,
            background: 'var(--surface)',
            padding: '12px 24px',
            borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <VBtn
            icon={isSharing ? 'stop_screen_share' : 'screen_share'}
            title={isSharing ? 'Остановить трансляцию' : 'Поделиться экраном'}
            active={isSharing}
            onClick={handleScreenShare}
          />
          <VBtn
            icon={selfMute ? 'mic_off' : 'mic'}
            title={selfMute ? 'Включить микрофон' : 'Выключить микрофон'}
            active={selfMute}
            onClick={toggleMute}
          />
          <VBtn
            icon={selfDeaf ? 'headset_off' : 'headset'}
            title={selfDeaf ? 'Включить звук' : 'Заглушить всё'}
            active={selfDeaf}
            onClick={toggleDeaf}
          />
          <VBtn
            icon="call_end"
            title="Покинуть канал"
            hangup
            onClick={() => void leaveChannel()}
          />
        </div>
      </div>
    </div>
  );
}

// ── Participant card with volume slider ────────────────────────────────────────

function ParticipantBox({ participant }: { participant: VoiceParticipant }) {
  const [showVolume, setShowVolume] = useState(false);
  const participantVolumes = useVoiceStore((s) => s.participantVolumes);
  const setParticipantVolume = useVoiceStore((s) => s.setParticipantVolume);

  const volume = participantVolumes[participant.user_id] ?? 1;

  return (
    <div
      style={{
        aspectRatio: '16/10',
        background: 'var(--surface-variant)',
        borderRadius: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: `2px solid ${participant.is_speaking ? 'var(--primary)' : 'transparent'}`,
        boxShadow: participant.is_speaking ? '0 0 20px rgba(208,188,255,0.2)' : 'none',
        position: 'relative',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        cursor: 'pointer',
      }}
      onClick={() => setShowVolume((v) => !v)}
      title="Нажмите для регулировки громкости"
    >
      <Avatar
        src={participant.avatar_url}
        name={participant.display_name ?? participant.username}
        size={64}
        radius={32}
      />

      {/* Name badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 12,
          fontSize: 11,
          background: 'rgba(0,0,0,0.65)',
          padding: '3px 8px',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        {participant.display_name ?? participant.username}
        {participant.self_mute && (
          <span className="icon" style={{ fontSize: 12, color: 'var(--error)' }}>mic_off</span>
        )}
        {participant.self_deaf && (
          <span className="icon" style={{ fontSize: 12, color: 'var(--error)' }}>headset_off</span>
        )}
      </div>

      {/* Speaking indicator */}
      {participant.is_speaking && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: 'var(--primary)',
            animation: 'pulse 1s ease-in-out infinite',
          }}
        />
      )}

      {/* Volume slider popup */}
      {showVolume && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 12,
            background: 'var(--surface)',
            borderRadius: 12,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 10,
            border: '1px solid rgba(255,255,255,0.15)',
            minWidth: 140,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="icon" style={{ fontSize: 16, opacity: 0.7 }}>volume_up</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) =>
              setParticipantVolume(participant.user_id, parseFloat(e.target.value))
            }
            style={{ flex: 1, accentColor: 'var(--primary)' }}
          />
          <span style={{ fontSize: 11, minWidth: 28, textAlign: 'right', opacity: 0.7 }}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ── Incoming screen share viewer ───────────────────────────────────────────────

function ScreenViewer({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      style={{
        width: '100%',
        maxHeight: '40vh',
        background: '#000',
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 16,
        position: 'relative',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 14,
          fontSize: 11,
          background: 'rgba(0,0,0,0.6)',
          padding: '3px 8px',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          color: 'var(--primary)',
        }}
      >
        <span className="icon" style={{ fontSize: 13 }}>screen_share</span>
        Трансляция
      </div>
    </div>
  );
}

// ── Quality picker ─────────────────────────────────────────────────────────────

const QUALITY_LABELS: Record<ScreenShareQuality, string> = {
  '480p30':  '480p · 30fps',
  '720p60':  '720p · 60fps',
  '1080p60': '1080p · 60fps',
  '1440p60': '1440p · 60fps',
};

function QualityPicker({
  selected,
  onSelect,
  onClose,
}: {
  selected: ScreenShareQuality;
  onSelect: (q: ScreenShareQuality) => void;
  onClose: () => void;
}) {
  const qualities: ScreenShareQuality[] = ['480p30', '720p60', '1080p60', '1440p60'];

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '110%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--surface)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 16,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 180,
        zIndex: 20,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--outline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
        Качество трансляции
      </div>
      {qualities.map((q) => (
        <button
          key={q}
          onClick={() => onSelect(q)}
          style={{
            background: q === selected ? 'var(--primary-container)' : 'transparent',
            color: q === selected ? 'var(--primary)' : 'white',
            border: 'none',
            borderRadius: 10,
            padding: '8px 12px',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 13,
            fontWeight: q === selected ? 700 : 400,
          }}
        >
          {QUALITY_LABELS[q]}
        </button>
      ))}
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          color: 'var(--outline)',
          border: 'none',
          borderRadius: 10,
          padding: '6px 12px',
          cursor: 'pointer',
          fontSize: 12,
          marginTop: 4,
        }}
      >
        Отмена
      </button>
    </div>
  );
}

// ── Control button ─────────────────────────────────────────────────────────────

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
