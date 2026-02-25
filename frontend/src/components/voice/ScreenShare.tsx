import { useState, useRef, useEffect, useCallback } from 'react';
import { useVoiceStore } from '../../stores/voiceStore';
import type { ScreenShareQuality } from '../../types';
import styles from './ScreenShare.module.css';

const QUALITY_OPTIONS: { value: ScreenShareQuality; label: string }[] = [
  { value: '480p30', label: '480p 30fps' },
  { value: '720p60', label: '720p 60fps' },
  { value: '1080p60', label: '1080p 60fps' },
  { value: '1440p60', label: '1440p 60fps' },
];

/** ScreenShareViewer displays incoming screen shares from other participants */
export function ScreenShareViewer() {
  const { screenShareViewers, stopWatchingScreenShare, participants, screenShareVolume, setScreenShareVolume } = useVoiceStore();

  const viewerEntries = Object.entries(screenShareViewers);
  const [activeViewerId, setActiveViewerId] = useState<string | null>(null);

  // Auto-select first viewer if none selected
  useEffect(() => {
    const entries = Object.entries(screenShareViewers);
    if (entries.length > 0 && !activeViewerId) {
      const firstEntry = entries[0];
      if (firstEntry) {
        setActiveViewerId(firstEntry[0]);
      }
    }
    if (entries.length === 0) {
      setActiveViewerId(null);
    }
  }, [viewerEntries.length, activeViewerId, screenShareViewers]);

  if (viewerEntries.length === 0) return null;

  const activeViewer = activeViewerId ? screenShareViewers[activeViewerId] : null;
  const broadcasterName = activeViewerId
    ? participants.find((p) => p.user_id === activeViewerId)?.username ?? 'Unknown'
    : '';

  return (
    <div className={styles.screenShareContainer}>
      {/* Tabs for multiple simultaneous screen shares */}
      {viewerEntries.length > 1 && (
        <div className={styles.viewerTabs}>
          {viewerEntries.map(([userId]) => {
            const name = participants.find((p) => p.user_id === userId)?.username ?? 'Unknown';
            return (
              <button
                key={userId}
                className={`${styles.viewerTab} ${activeViewerId === userId ? styles.active : ''}`}
                onClick={() => setActiveViewerId(userId)}
              >
                {name}
                <span
                  className={styles.closeViewerBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    stopWatchingScreenShare(userId);
                  }}
                >
                  x
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>
          {broadcasterName}&apos;s screen
        </span>
        <div className={styles.toolbarControls}>
          <VolumeControl volume={screenShareVolume} onChange={setScreenShareVolume} />
          {activeViewerId && (
            <button
              className={`${styles.toolbarBtn} ${styles.danger}`}
              onClick={() => stopWatchingScreenShare(activeViewerId)}
            >
              Stop Watching
            </button>
          )}
        </div>
      </div>

      {/* Video */}
      <div className={styles.videoArea}>
        {activeViewer?.stream ? (
          <VideoPlayer stream={activeViewer.stream} volume={screenShareVolume} />
        ) : (
          <div className={styles.noStream}>Waiting for stream...</div>
        )}
      </div>
    </div>
  );
}

/** ScreenShareControls is a button group added to VoicePanel controls */
export function ScreenShareControls() {
  const {
    isConnected,
    screenShareBroadcast,
    startScreenShare,
    stopScreenShare,
  } = useVoiceStore();

  const [showQuality, setShowQuality] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<ScreenShareQuality>('720p60');

  if (!isConnected) return null;

  const isSharing = screenShareBroadcast !== null;

  const handleStartShare = (quality: ScreenShareQuality) => {
    setSelectedQuality(quality);
    setShowQuality(false);
    void startScreenShare(quality);
  };

  return (
    <>
      {isSharing ? (
        <button
          className={`${styles.startShareBtn} ${styles.active}`}
          onClick={stopScreenShare}
          title="Stop Screen Share"
        >
          <ScreenShareOffIcon />
        </button>
      ) : (
        <div className={styles.qualityMenu}>
          <button
            className={styles.startShareBtn}
            onClick={() => setShowQuality(!showQuality)}
            title="Share Screen"
          >
            <ScreenShareIcon />
          </button>
          {showQuality && (
            <div className={styles.qualityDropdown}>
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`${styles.qualityOption} ${selectedQuality === opt.value ? styles.selected : ''}`}
                  onClick={() => handleStartShare(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Video Player with Web Audio API for screen share audio ─

function VideoPlayer({ stream, volume }: { stream: MediaStream; volume: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Attach video (muted — audio routed through Web Audio API)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  // Setup Web Audio API for audio tracks
  const setupAudio = useCallback(() => {
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
  // Only re-setup when stream changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // Update gain when volume changes
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

// ─── Volume Control ─────────────────────────────────────────

function VolumeControl({ volume, onChange }: { volume: number; onChange: (v: number) => void }) {
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

function ScreenShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ScreenShareOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function VolumeHighIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function VolumeLowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function VolumeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
