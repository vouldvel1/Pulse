import { useState, useRef, useEffect, useCallback } from 'react';
import { useVoiceStore } from '../../stores/voiceStore';
import { useChannelStore } from '../../stores/channelStore';
import type { VoiceParticipant, ScreenShareQuality } from '../../types';
import styles from './VoiceChannelView.module.css';

const QUALITY_OPTIONS: { value: ScreenShareQuality; label: string }[] = [
  { value: '480p30', label: '480p 30fps' },
  { value: '720p60', label: '720p 60fps' },
  { value: '1080p60', label: '1080p 60fps' },
  { value: '1440p60', label: '1440p 60fps' },
];

interface VoiceChannelViewProps {
  onShowChat?: () => void;
}

/**
 * VoiceChannelView is a full-panel view shown in the main content area
 * when the user is connected to a voice channel. Inspired by Discord's
 * voice channel UI with participant grid, screen share tile, and bottom toolbar.
 */
export function VoiceChannelView({ onShowChat }: VoiceChannelViewProps) {
  const {
    currentChannelId,
    isConnected,
    isConnecting,
    selfMute,
    selfDeaf,
    participants,
    speakingUsers,
    pingMs,
    screenShareBroadcast,
    screenShareViewers,
    screenShareVolume,
    setScreenShareVolume,
    leaveVoice,
    toggleMute,
    toggleDeaf,
    startScreenShare,
    stopScreenShare,
    stopWatchingScreenShare,
  } = useVoiceStore();

  const { channels } = useChannelStore();

  const [showQualityMenu, setShowQualityMenu] = useState(false);

  if (!currentChannelId && !isConnecting) return null;

  const channel = channels.find((ch) => ch.id === currentChannelId);
  const channelName = channel?.name ?? 'Voice Channel';

  const isSharing = screenShareBroadcast !== null;
  const viewerEntries = Object.entries(screenShareViewers);
  const hasScreenShare = isSharing || viewerEntries.length > 0;

  const handleStartShare = (quality: ScreenShareQuality) => {
    setShowQualityMenu(false);
    void startScreenShare(quality);
  };

  return (
    <div className={styles.voiceView}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <VoiceIcon />
          <span className={styles.headerTitle}>{channelName}</span>
          <span className={styles.headerParticipants}>{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
        </div>
        <div className={styles.headerRight}>
          {onShowChat && (
            <button
              className={styles.headerBtn}
              onClick={onShowChat}
              title="Show Chat"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          )}
          {isConnected && pingMs >= 0 && (
            <span className={`${styles.pingBadge} ${pingMs < 80 ? styles.pingGood : pingMs < 150 ? styles.pingWarn : styles.pingBad}`}>
              {pingMs}ms
            </span>
          )}
          {isConnecting && <span className={styles.connectingBadge}>Connecting...</span>}
        </div>
      </div>

      {/* Main area: screen share (if any) + participant grid */}
      <div className={styles.mainArea}>
        {/* Broadcaster self-preview */}
        {isSharing && screenShareBroadcast?.stream && (
          <div className={styles.screenShareTile}>
            <div className={styles.screenShareHeader}>
              <ScreenShareIcon />
              <span>You are sharing your screen</span>
              <button className={styles.stopSharingBtn} onClick={stopScreenShare}>
                Stop Sharing
              </button>
            </div>
            <div className={styles.screenShareVideo}>
              <SelfPreviewPlayer stream={screenShareBroadcast.stream} />
            </div>
          </div>
        )}

        {/* Viewer screen share tiles */}
        {!isSharing && viewerEntries.length > 0 && (
          <ScreenShareTile
            viewerEntries={viewerEntries}
            participants={participants}
            onStopWatching={stopWatchingScreenShare}
            volume={screenShareVolume}
            onVolumeChange={setScreenShareVolume}
          />
        )}

        <div className={`${styles.participantGrid} ${hasScreenShare ? styles.compact : ''}`}>
          {participants.map((p) => (
            <ParticipantTile
              key={p.user_id}
              participant={p}
              isSpeaking={speakingUsers.has(p.user_id)}
            />
          ))}
          {participants.length === 0 && isConnected && (
            <div className={styles.emptyParticipants}>
              <VoiceIcon large />
              <span>Waiting for others to join...</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom toolbar */}
      {isConnected && (
        <div className={styles.toolbar}>
          <div className={styles.toolbarGroup}>
            <button
              className={`${styles.toolbarBtn} ${selfMute ? styles.destructive : ''}`}
              onClick={toggleMute}
              title={selfMute ? 'Unmute' : 'Mute'}
            >
              {selfMute ? <MicOffIcon /> : <MicIcon />}
              <span className={styles.toolbarLabel}>{selfMute ? 'Unmute' : 'Mute'}</span>
            </button>
            <button
              className={`${styles.toolbarBtn} ${selfDeaf ? styles.destructive : ''}`}
              onClick={toggleDeaf}
              title={selfDeaf ? 'Undeafen' : 'Deafen'}
            >
              {selfDeaf ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
              <span className={styles.toolbarLabel}>{selfDeaf ? 'Undeafen' : 'Deafen'}</span>
            </button>
            <div className={styles.screenShareWrapper}>
              <button
                className={`${styles.toolbarBtn} ${isSharing ? styles.destructive : ''}`}
                onClick={() => {
                  if (isSharing) {
                    stopScreenShare();
                  } else {
                    setShowQualityMenu(!showQualityMenu);
                  }
                }}
                title={isSharing ? 'Stop Screen Share' : 'Share Screen'}
              >
                {isSharing ? <ScreenShareOffIcon /> : <ScreenShareIcon />}
                <span className={styles.toolbarLabel}>{isSharing ? 'Stop Share' : 'Screen'}</span>
              </button>
              {showQualityMenu && (
                <div className={styles.qualityDropdown}>
                  <div className={styles.qualityTitle}>Stream Quality</div>
                  {QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={styles.qualityOption}
                      onClick={() => handleStartShare(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            className={`${styles.toolbarBtn} ${styles.leaveBtn}`}
            onClick={() => { void leaveVoice(); }}
            title="Leave Voice"
          >
            <PhoneOffIcon />
            <span className={styles.toolbarLabel}>Leave</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Screen share large tile ────────────────────────────────

interface ScreenShareTileProps {
  viewerEntries: [string, { broadcasterId: string; peerConnection: RTCPeerConnection | null; stream: MediaStream | null }][];
  participants: VoiceParticipant[];
  onStopWatching: (userId: string) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
}

function ScreenShareTile({ viewerEntries, participants, onStopWatching, volume, onVolumeChange }: ScreenShareTileProps) {
  const [activeViewerId, setActiveViewerId] = useState<string | null>(null);

  useEffect(() => {
    if (viewerEntries.length > 0 && !activeViewerId) {
      const first = viewerEntries[0];
      if (first) setActiveViewerId(first[0]);
    }
    if (viewerEntries.length === 0) {
      setActiveViewerId(null);
    }
  }, [viewerEntries.length, activeViewerId, viewerEntries]);

  const activeViewer = activeViewerId ? viewerEntries.find(([id]) => id === activeViewerId) : null;
  const broadcasterName = activeViewerId
    ? participants.find((p) => p.user_id === activeViewerId)?.username ?? 'Unknown'
    : '';

  return (
    <div className={styles.screenShareTile}>
      <div className={styles.screenShareHeader}>
        <ScreenShareIcon />
        <span>{broadcasterName}&apos;s screen</span>
        {viewerEntries.length > 1 && (
          <div className={styles.screenShareTabs}>
            {viewerEntries.map(([userId]) => {
              const name = participants.find((p) => p.user_id === userId)?.username ?? '?';
              return (
                <button
                  key={userId}
                  className={`${styles.screenShareTab} ${activeViewerId === userId ? styles.active : ''}`}
                  onClick={() => setActiveViewerId(userId)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}
        <div className={styles.screenShareControls}>
          <VolumeControl volume={volume} onChange={onVolumeChange} />
          {activeViewerId && (
            <button className={styles.stopWatchingBtn} onClick={() => onStopWatching(activeViewerId)}>
              Stop Watching
            </button>
          )}
        </div>
      </div>
      <div className={styles.screenShareVideo}>
        {activeViewer?.[1]?.stream ? (
          <ScreenShareVideoPlayer stream={activeViewer[1].stream} volume={volume} />
        ) : (
          <div className={styles.noStream}>Waiting for stream...</div>
        )}
      </div>
    </div>
  );
}

// ─── Participant tile ───────────────────────────────────────

interface ParticipantTileProps {
  participant: VoiceParticipant;
  isSpeaking: boolean;
}

function ParticipantTile({ participant, isSpeaking }: ParticipantTileProps) {
  const initials = participant.username.slice(0, 2).toUpperCase();
  const isMuted = participant.self_mute || participant.server_mute;
  const isDeafened = participant.self_deaf || participant.server_deaf;

  return (
    <div className={`${styles.participantTile} ${isSpeaking ? styles.speaking : ''}`}>
      <div className={styles.avatarContainer}>
        <div className={`${styles.avatar} ${isSpeaking ? styles.speaking : ''}`}>
          {initials}
        </div>
        {(isMuted || isDeafened) && (
          <div className={styles.statusBadge}>
            {isDeafened ? <HeadphonesOffSmallIcon /> : <MicOffSmallIcon />}
          </div>
        )}
      </div>
      <span className={styles.participantUsername}>{participant.username}</span>
    </div>
  );
}

// ─── Screen share video player with Web Audio API for audio ─

interface ScreenShareVideoPlayerProps {
  stream: MediaStream;
  volume: number; // 0-200
}

function ScreenShareVideoPlayer({ stream, volume }: ScreenShareVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Attach video (muted — audio is handled by Web Audio API)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  // Attach audio via Web Audio API so we get volume control and avoid autoplay issues
  const setupAudio = useCallback(() => {
    // Clean up previous audio nodes
    sourceRef.current?.disconnect();
    gainRef.current?.disconnect();

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    // Create an audio-only stream to avoid re-triggering video
    const audioStream = new MediaStream(audioTracks);
    const source = ctx.createMediaStreamSource(audioStream);
    const gain = ctx.createGain();
    gain.gain.value = volume / 100;

    source.connect(gain);
    gain.connect(ctx.destination);

    sourceRef.current = source;
    gainRef.current = gain;
  }, [stream, volume]);

  useEffect(() => {
    setupAudio();
    return () => {
      sourceRef.current?.disconnect();
      gainRef.current?.disconnect();
      sourceRef.current = null;
      gainRef.current = null;
    };
  // Only re-setup when stream changes, not volume
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // Update gain when volume changes (without re-creating the audio pipeline)
  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = volume / 100;
    }
  }, [volume]);

  return (
    <video
      ref={videoRef}
      className={styles.videoElement}
      autoPlay
      playsInline
      muted
    />
  );
}

// ─── Self-preview player (muted, no audio needed) ───────────

function SelfPreviewPlayer({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={styles.videoElement}
      autoPlay
      playsInline
      muted
    />
  );
}

// ─── Volume control slider ──────────────────────────────────

interface VolumeControlProps {
  volume: number;
  onChange: (volume: number) => void;
}

function VolumeControl({ volume, onChange }: VolumeControlProps) {
  const [showSlider, setShowSlider] = useState(false);
  const isMuted = volume === 0;

  return (
    <div
      className={styles.volumeControl}
      onMouseEnter={() => setShowSlider(true)}
      onMouseLeave={() => setShowSlider(false)}
    >
      <button
        className={styles.volumeBtn}
        onClick={() => onChange(isMuted ? 100 : 0)}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <VolumeOffIcon /> : volume < 50 ? <VolumeLowIcon /> : <VolumeHighIcon />}
      </button>
      {showSlider && (
        <div className={styles.volumeSliderPopup}>
          <input
            type="range"
            min="0"
            max="200"
            value={volume}
            onChange={(e) => onChange(Number(e.target.value))}
            className={styles.volumeSlider}
          />
          <span className={styles.volumeLabel}>{volume}%</span>
        </div>
      )}
    </div>
  );
}

// ─── SVG Icons ──────────────────────────────────────────────

function VoiceIcon({ large }: { large?: boolean }) {
  const size = large ? 48 : 18;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

function HeadphonesOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-5.33-5.33A19.79 19.79 0 0 1 2.82 4.18 2 2 0 0 1 4.82 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.82 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

function ScreenShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ScreenShareOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function MicOffSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    </svg>
  );
}

function HeadphonesOffSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function VolumeHighIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function VolumeLowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function VolumeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
