import { useState } from 'react';
import { useVoiceStore } from '../../stores/voiceStore';
import { useChannelStore } from '../../stores/channelStore';
import { ScreenShareControls } from './ScreenShare';
import type { VoiceParticipant } from '../../types';
import styles from './VoicePanel.module.css';

/** Persistent panel shown above the user panel when connected to voice */
export function VoicePanel() {
  const {
    currentChannelId,
    isConnecting,
    isConnected,
    selfMute,
    selfDeaf,
    participants,
    userVolumes,
    speakingUsers,
    pingMs,
    leaveVoice,
    toggleMute,
    toggleDeaf,
    setUserVolume,
  } = useVoiceStore();

  const { channels } = useChannelStore();

  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  if (!currentChannelId && !isConnecting) return null;

  const channel = channels.find((ch) => ch.id === currentChannelId);
  const channelName = channel?.name ?? 'Voice Channel';

  return (
    <div className={styles.voicePanel}>
      {/* Connection bar */}
      <div className={styles.connectionBar}>
        <div className={styles.connectionInfo}>
          <div className={`${styles.connectionStatus} ${isConnecting ? styles.connecting : ''}`}>
            {isConnecting ? 'Connecting...' : 'Voice Connected'}
            {isConnected && pingMs >= 0 && (
              <span className={`${styles.ping} ${pingMs < 80 ? styles.pingGood : pingMs < 150 ? styles.pingWarn : styles.pingBad}`}>
                {pingMs}ms
              </span>
            )}
          </div>
          <div className={styles.channelName}>{channelName}</div>
        </div>
        <button
          className={styles.disconnectBtn}
          onClick={() => { void leaveVoice(); }}
          title="Disconnect"
        >
          <PhoneOffIcon />
        </button>
      </div>

      {/* Participant list */}
      {isConnected && participants.length > 0 && (
        <div className={styles.participantList}>
          {participants.map((p) => (
            <ParticipantRow
              key={p.user_id}
              participant={p}
              isSpeaking={speakingUsers.has(p.user_id)}
              isExpanded={expandedUser === p.user_id}
              volume={userVolumes[p.user_id]?.volume ?? 100}
              onToggleExpand={() =>
                setExpandedUser(expandedUser === p.user_id ? null : p.user_id)
              }
              onVolumeChange={(vol) => setUserVolume(p.user_id, vol)}
            />
          ))}
        </div>
      )}

      {/* Controls */}
      {isConnected && (
        <div className={styles.controls}>
          <button
            className={`${styles.controlBtn} ${selfMute ? styles.active : ''}`}
            onClick={toggleMute}
            title={selfMute ? 'Unmute' : 'Mute'}
          >
            {selfMute ? <MicOffIcon /> : <MicIcon />}
          </button>
          <button
            className={`${styles.controlBtn} ${selfDeaf ? styles.active : ''}`}
            onClick={toggleDeaf}
            title={selfDeaf ? 'Undeafen' : 'Deafen'}
          >
            {selfDeaf ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
          </button>
          <ScreenShareControls />
        </div>
      )}
    </div>
  );
}

// ─── Participant row ────────────────────────────────────────

interface ParticipantRowProps {
  participant: VoiceParticipant;
  isSpeaking: boolean;
  isExpanded: boolean;
  volume: number;
  onToggleExpand: () => void;
  onVolumeChange: (volume: number) => void;
}

function ParticipantRow({ participant, isSpeaking, isExpanded, volume, onToggleExpand, onVolumeChange }: ParticipantRowProps) {
  const initials = participant.username.slice(0, 2).toUpperCase();
  const isMuted = participant.self_mute || participant.server_mute;
  const isDeafened = participant.self_deaf || participant.server_deaf;

  return (
    <div>
      <div className={styles.participant} onClick={onToggleExpand}>
        <div className={`${styles.participantAvatar} ${isSpeaking ? styles.speaking : ''}`}>{initials}</div>
        <span className={styles.participantName}>{participant.username}</span>
        <div className={styles.participantIcons}>
          {isMuted && (
            <span className={`${styles.stateIcon} ${styles.active}`} title="Muted">
              <MicOffIcon />
            </span>
          )}
          {isDeafened && (
            <span className={`${styles.stateIcon} ${styles.active}`} title="Deafened">
              <HeadphonesOffIcon />
            </span>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className={styles.volumeControl}>
          <SpeakerIcon />
          <input
            type="range"
            className={styles.volumeSlider}
            min={0}
            max={200}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            title={`Volume: ${volume}%`}
          />
          <span className={styles.volumeLabel}>{volume}%</span>
        </div>
      )}
    </div>
  );
}

// ─── SVG Icons (inline to avoid deps) ───────────────────────

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .87-.16 1.7-.46 2.46" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function HeadphonesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

function HeadphonesOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-5.33-5.33A19.79 19.79 0 0 1 2.82 4.18 2 2 0 0 1 4.82 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.82 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
