/**
 * useLiveKit — голосовые каналы через LiveKit SFU.
 *
 * При joinChannel в voiceStore сохраняются livekitToken + livekitUrl.
 * Этот хук подключается к LiveKit, публикует микрофон и подписывается
 * на аудио-треки остальных участников.
 *
 * Управление:
 *  - selfMute  → localParticipant.setMicrophoneEnabled(false)
 *  - selfDeaf  → mute/unmute все remote audio elements (через voiceStore)
 *  - volume    → setParticipantVolume() в voiceStore
 */

import { useEffect, useRef } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type LocalParticipant,
} from 'livekit-client';
import { useVoiceStore } from '@/stores/voiceStore';
import { voice as voiceApi, type ICEServer } from '@/utils/api';

export function useLiveKit() {
  const roomRef = useRef<Room | null>(null);
  const iceServersRef = useRef<ICEServer[]>([]);

  const channelId = useVoiceStore((s) => s.channelId);
  const livekitToken = useVoiceStore((s) => s.livekitToken);
  const livekitUrl = useVoiceStore((s) => s.livekitUrl);
  const selfMute = useVoiceStore((s) => s.selfMute);

  const setSpeaking = useVoiceStore((s) => s.setSpeaking);
  const setAudioElement = useVoiceStore((s) => s.setAudioElement);
  const removeAudioElement = useVoiceStore((s) => s.removeAudioElement);

  // ── Fetch ICE servers once on mount ────────────────────────────────────────
  useEffect(() => {
    voiceApi.iceServers()
      .then((servers) => { iceServersRef.current = servers; })
      .catch(() => { /* fall back to LiveKit's embedded ICE servers */ });
  }, []);

  // ── Connect to LiveKit when channelId + token become available ─────────────
  useEffect(() => {
    if (!channelId || !livekitToken || !livekitUrl) {
      // No active channel — disconnect any existing room
      const existing = roomRef.current;
      if (existing) {
        roomRef.current = null;
        void existing.disconnect();
      }
      return;
    }

    // Guard: if a room is already connecting/connected for this exact channel,
    // don't create a duplicate (can happen on StrictMode double-invoke).
    if (roomRef.current) {
      return;
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    // ── Track subscribed: wire up an <audio> element ────────────────────────
    const onTrackSubscribed = (
      track: RemoteTrack,
      _pub: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind !== Track.Kind.Audio) return;

      const userId = participant.identity; // identity = user UUID set by backend
      const mediaTrack = track.mediaStreamTrack;
      if (!mediaTrack) return;

      const stream = new MediaStream([mediaTrack]);
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;
      setAudioElement(userId, audio);

      // Voice activity via Web Audio API
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let speaking = false;

        const check = () => {
          // Stop loop if this room is no longer active
          if (roomRef.current !== room) { void ctx.close(); return; }
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          const isSpeaking = avg > 8;
          if (isSpeaking !== speaking) {
            speaking = isSpeaking;
            setSpeaking(userId, isSpeaking);
          }
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      } catch { /* AudioContext not available */ }
    };

    const onTrackUnsubscribed = (
      _track: RemoteTrack,
      _pub: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      setSpeaking(participant.identity, false);
      removeAudioElement(participant.identity);
    };

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);

    // Speaking events from LiveKit (server-side VAD)
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const speakingIds = new Set(speakers.map((s) => s.identity));
      room.remoteParticipants.forEach((p) => {
        setSpeaking(p.identity, speakingIds.has(p.identity));
      });
    });

    let cancelled = false;

    const connect = async () => {
      try {
        // Pass rtcConfig via connect options so LiveKit uses our TURN server.
        // iceServersRef may still be empty if the fetch hasn't resolved yet;
        // in that case LiveKit falls back to its own embedded ICE config.
        const rtcConfig: RTCConfiguration | undefined =
          iceServersRef.current.length > 0
            ? { iceServers: iceServersRef.current, iceTransportPolicy: 'all' }
            : undefined;

        await room.connect(livekitUrl, livekitToken, { rtcConfig });
        // After await: check if effect was cleaned up while connecting
        if (cancelled) {
          void room.disconnect();
          return;
        }
        const localMute = useVoiceStore.getState().selfMute;
        await room.localParticipant.setMicrophoneEnabled(!localMute);
      } catch (err) {
        if (!cancelled) {
          console.error('[LiveKit] connect error:', err);
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      // Only clear ref and disconnect if this room is still the active one
      if (roomRef.current === room) {
        roomRef.current = null;
        void room.disconnect();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, livekitToken, livekitUrl]);

  // ── Mic mute/unmute ────────────────────────────────────────────────────────
  useEffect(() => {
    const local = roomRef.current?.localParticipant as LocalParticipant | undefined;
    if (!local) return;
    void local.setMicrophoneEnabled(!selfMute);
  }, [selfMute]);

  // Deaf is handled entirely in voiceStore.toggleDeaf() + setAudioElement()
  // by muting/unmuting the HTMLAudioElement for each participant.
  // No additional LiveKit API calls needed for deaf.
}
