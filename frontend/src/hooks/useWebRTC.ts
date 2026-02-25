import { useEffect, useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  RemoteTrackPublication,
  ConnectionState,
  type Participant,
} from 'livekit-client';
import { useVoiceStore } from '../stores/voiceStore';
import { wsClient } from '../utils/websocket';
import type {
  ICECandidatePayload,
  ScreenShareOfferPayload,
  ScreenShareAnswerPayload,
  VoiceJoinPayload,
} from '../types';

/**
 * useWebRTC manages:
 *  1. LiveKit Room connection for voice audio (mic -> LiveKit SFU -> speakers)
 *  2. P2P peer connections for screen share signaling relay (unchanged)
 *
 * Call this hook in a component that is mounted while the user is in a voice channel.
 */
export function useWebRTC() {
  const {
    currentChannelId,
    isConnected,
    selfMute,
    selfDeaf,
    inputMode,
    userVolumes,
    screenShareBroadcast,
    livekitToken,
    livekitUrl,
  } = useVoiceStore();

  const roomRef = useRef<Room | null>(null);
  // Map of remote participant audio: participantIdentity -> { audioElement, gainNode }
  const remoteAudioRef = useRef<Map<string, RemoteAudio>>(new Map());
  // P2P screen share connections: peerId -> RTCPeerConnection
  const screenPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);

  // ─── Connect to LiveKit room when joining voice ───────────

  const connectToLiveKit = useCallback(async () => {
    if (!livekitToken || !livekitUrl || !currentChannelId) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    roomRef.current = room;

    // Handle remote track subscriptions (other participants' audio)
    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        attachRemoteAudio(participant.identity, track.mediaStream);
      }
    });

    // Handle track unsubscription
    room.on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant) => {
      detachRemoteAudio(participant.identity);
    });

    // Handle active speakers changed (built-in speaking detection)
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const { setSpeaking, speakingUsers } = useVoiceStore.getState();
      const speakingIds = new Set(speakers.map((s) => s.identity));

      // Mark new speakers
      for (const speaker of speakers) {
        if (!speakingUsers.has(speaker.identity)) {
          setSpeaking(speaker.identity, true);
        }
      }

      // Mark speakers who stopped
      for (const userId of speakingUsers) {
        if (!speakingIds.has(userId)) {
          setSpeaking(userId, false);
        }
      }
    });

    // Handle participant disconnect (cleanup)
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      detachRemoteAudio(participant.identity);
    });

    // Connection state logging
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log(`[LiveKit] Connection state: ${state}`);
      if (state === ConnectionState.Disconnected) {
        console.warn('[LiveKit] Disconnected from room');
      }
    });

    try {
      await room.connect(livekitUrl, livekitToken);
      console.log(`[LiveKit] Connected to room for channel ${currentChannelId}`);

      // Publish microphone
      const { selfMute: muted, selfDeaf: deaf, inputMode: mode } = useVoiceStore.getState();
      const shouldPublish = !muted && !deaf && mode !== 'push-to-talk';
      await room.localParticipant.setMicrophoneEnabled(shouldPublish);
    } catch (err) {
      console.error('[LiveKit] Failed to connect:', err);
    }
  }, [livekitToken, livekitUrl, currentChannelId]);

  // ─── Attach remote audio with per-user volume control ─────

  const attachRemoteAudio = useCallback((participantId: string, stream: MediaStream | undefined) => {
    if (!stream) return;

    // Clean up existing audio for this participant
    detachRemoteAudio(participantId);

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;

    // Resume AudioContext if suspended
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const source = ctx.createMediaStreamSource(stream);
    const gainNode = ctx.createGain();
    const vol = useVoiceStore.getState().userVolumes[participantId]?.volume ?? 100;
    const deaf = useVoiceStore.getState().selfDeaf;
    gainNode.gain.value = deaf ? 0 : vol / 100;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    // We also need an HTMLAudioElement to keep the stream alive in some browsers
    const element = new Audio();
    element.srcObject = stream;
    element.autoplay = true;
    element.muted = true; // Muted because we use Web Audio API for actual playback

    remoteAudioRef.current.set(participantId, { element, gainNode, source });
  }, []);

  // ─── Detach remote audio ──────────────────────────────────

  const detachRemoteAudio = useCallback((participantId: string) => {
    const existing = remoteAudioRef.current.get(participantId);
    if (existing) {
      existing.element.pause();
      existing.element.srcObject = null;
      existing.source?.disconnect();
      existing.gainNode?.disconnect();
      remoteAudioRef.current.delete(participantId);
    }
  }, []);

  // ─── Update per-user volume when volumes change ───────────

  useEffect(() => {
    for (const [userId, audio] of remoteAudioRef.current.entries()) {
      const vol = userVolumes[userId]?.volume ?? 100;
      if (audio.gainNode) {
        // When deafened, mute all remote audio; otherwise apply user volume
        audio.gainNode.gain.value = selfDeaf ? 0 : vol / 100;
      }
    }
  }, [userVolumes, selfDeaf]);

  // ─── Sync mute/deaf state to LiveKit ──────────────────────

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isConnected) return;

    if (inputMode === 'push-to-talk') {
      // Push-to-talk is handled separately via setPushToTalkActive
      return;
    }

    const shouldEnable = !selfMute && !selfDeaf;
    void room.localParticipant.setMicrophoneEnabled(shouldEnable);
  }, [selfMute, selfDeaf, inputMode, isConnected]);

  // ─── Sync deafen state: disable all remote audio tracks ───

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isConnected) return;

    // Enable/disable all remote audio track subscriptions
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.audioTrackPublications.values()) {
        if (pub instanceof RemoteTrackPublication) {
          pub.setEnabled(!selfDeaf);
        }
      }
    }
  }, [selfDeaf, isConnected]);

  // ─── P2P Screen share: handle incoming offers ─────────────

  useEffect(() => {
    const unsub = wsClient.on('screen_share_offer', async (raw: unknown) => {
      const payload = raw as ScreenShareOfferPayload;
      if (!currentChannelId) return;

      // Close any existing connection from this broadcaster
      const existingPc = screenPeersRef.current.get(payload.from_user_id);
      if (existingPc) {
        existingPc.close();
        screenPeersRef.current.delete(payload.from_user_id);
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      screenPeersRef.current.set(payload.from_user_id, pc);

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`[WebRTC] Screen share viewer ICE state (from ${payload.from_user_id}): ${state}`);
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          pc.close();
          screenPeersRef.current.delete(payload.from_user_id);
          // Remove from viewer store
          useVoiceStore.setState((s) => {
            const viewers = { ...s.screenShareViewers };
            delete viewers[payload.from_user_id];
            return { screenShareViewers: viewers };
          });
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          wsClient.send('ice_candidate', {
            target_user_id: payload.from_user_id,
            channel_id: currentChannelId,
            candidate: event.candidate.toJSON(),
            target: 'peer',
          });
        }
      };

      pc.ontrack = (event) => {
        // Update the viewer's stream in the voice store
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        useVoiceStore.setState((state) => ({
          screenShareViewers: {
            ...state.screenShareViewers,
            [payload.from_user_id]: {
              broadcasterId: payload.from_user_id,
              peerConnection: pc,
              stream,
            },
          },
        }));
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        wsClient.send('screen_share_answer', {
          target_user_id: payload.from_user_id,
          channel_id: currentChannelId,
          sdp: answer,
        });
      } catch (err) {
        console.error('[WebRTC] Screen share answer failed:', err);
        pc.close();
        screenPeersRef.current.delete(payload.from_user_id);
      }
    });

    return unsub;
  }, [currentChannelId]);

  // ─── P2P Screen share: handle answers to our offers ───────

  useEffect(() => {
    const unsub = wsClient.on('screen_share_answer', async (raw: unknown) => {
      const payload = raw as ScreenShareAnswerPayload;
      const pc = screenPeersRef.current.get(payload.from_user_id);
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } catch (err) {
        console.error('[WebRTC] Failed to set screen share answer:', err);
      }
    });

    return unsub;
  }, []);

  // ─── P2P Screen share: handle ICE candidates ──────────────

  useEffect(() => {
    const unsub = wsClient.on('ice_candidate', async (raw: unknown) => {
      const payload = raw as ICECandidatePayload;
      if (payload.target !== 'peer') return;

      const pc = screenPeersRef.current.get(payload.from_user_id);
      if (!pc) return;

      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (err) {
        console.error('[WebRTC] Failed to add screen share ICE candidate:', err);
      }
    });

    return unsub;
  }, []);

  // ─── Handle remote speaking indicators via WS ──────────────

  useEffect(() => {
    const unsub = wsClient.on('voice:speaking', (raw: unknown) => {
      const payload = raw as { user_id: string; is_speaking: boolean };
      if (!payload.user_id) return;
      // Remote speaking indicators come from WS as a backup.
      // LiveKit's ActiveSpeakersChanged is the primary source.
      useVoiceStore.getState().setSpeaking(payload.user_id, payload.is_speaking);
    });

    return unsub;
  }, []);

  // ─── Track which stream we've already broadcast ────────────
  const broadcastStreamRef = useRef<MediaStream | null>(null);

  // ─── Create P2P screen share offer to a specific viewer ───

  const createScreenShareOffer = useCallback(async (
    targetUserId: string,
    stream: MediaStream,
    channelId: string,
  ) => {
    // Close any existing connection to this peer first
    const existingPc = screenPeersRef.current.get(targetUserId);
    if (existingPc) {
      existingPc.close();
      screenPeersRef.current.delete(targetUserId);
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    screenPeersRef.current.set(targetUserId, pc);

    // Also register the PC in the voiceStore's screenShareBroadcast.viewers
    const broadcast = useVoiceStore.getState().screenShareBroadcast;
    if (broadcast) {
      broadcast.viewers.set(targetUserId, pc);
    }

    // Handle viewer disconnecting — clean up only THIS peer, not the whole broadcast
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] Screen share broadcaster ICE state (to ${targetUserId}): ${state}`);
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        pc.close();
        screenPeersRef.current.delete(targetUserId);
        const bc = useVoiceStore.getState().screenShareBroadcast;
        if (bc) {
          bc.viewers.delete(targetUserId);
        }
      }
    };

    // Add screen share tracks with bandwidth hints
    for (const track of stream.getTracks()) {
      const sender = pc.addTrack(track, stream);

      // Set encoding parameters for video tracks
      if (track.kind === 'video') {
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0]!.maxBitrate = 4_000_000; // 4 Mbps for screen share
          params.encodings[0]!.maxFramerate = 60;
          await sender.setParameters(params);
        } catch (err) {
          console.warn('[WebRTC] Failed to set video encoding params:', err);
        }
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsClient.send('ice_candidate', {
          target_user_id: targetUserId,
          channel_id: channelId,
          candidate: event.candidate.toJSON(),
          target: 'peer',
        });
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      wsClient.send('screen_share_offer', {
        target_user_id: targetUserId,
        channel_id: channelId,
        sdp: offer,
      });
    } catch (err) {
      console.error('[WebRTC] Screen share offer creation failed:', err);
      pc.close();
      screenPeersRef.current.delete(targetUserId);
      const bc = useVoiceStore.getState().screenShareBroadcast;
      if (bc) {
        bc.viewers.delete(targetUserId);
      }
    }
  }, []);

  // ─── Broadcast screen share when it starts ────────────────
  // Use a ref-based approach to avoid tearing down peers on re-render.
  // Only run initial broadcast when the stream itself changes (not on every store update).

  useEffect(() => {
    const stream = screenShareBroadcast?.stream ?? null;
    const prevStream = broadcastStreamRef.current;

    // Stream didn't change — nothing to do
    if (stream === prevStream) return;

    // Previous stream existed — clean up old peer connections
    if (prevStream && !stream) {
      for (const [peerId, pc] of screenPeersRef.current.entries()) {
        pc.close();
        screenPeersRef.current.delete(peerId);
      }
      broadcastStreamRef.current = null;
      return;
    }

    // New stream started — broadcast to all current participants
    if (stream && currentChannelId) {
      broadcastStreamRef.current = stream;
      const participants = useVoiceStore.getState().participants;
      const myUserId = getMyUserId();

      for (const participant of participants) {
        if (!myUserId || participant.user_id === myUserId) continue;
        // Don't re-offer to peers we already have a connection to
        if (screenPeersRef.current.has(participant.user_id)) continue;
        void createScreenShareOffer(participant.user_id, stream, currentChannelId);
      }
    }
  }, [screenShareBroadcast?.stream, currentChannelId, createScreenShareOffer]);

  // ─── Send screen share to newly joined participants ───────
  // When a new participant joins while we're broadcasting, create an offer for them.

  useEffect(() => {
    const unsub = wsClient.on('voice:join', (raw: unknown) => {
      const payload = raw as VoiceJoinPayload;
      const stream = broadcastStreamRef.current;
      const channelId = useVoiceStore.getState().currentChannelId;
      if (!stream || !channelId) return;

      const myUserId = getMyUserId();
      if (!myUserId || payload.user_id === myUserId) return;
      if (screenPeersRef.current.has(payload.user_id)) return;

      void createScreenShareOffer(payload.user_id, stream, channelId);
    });

    return unsub;
  }, [createScreenShareOffer]);

  // ─── Connect to LiveKit on join, disconnect on leave ──────

  useEffect(() => {
    if (isConnected && currentChannelId && livekitToken && livekitUrl) {
      void connectToLiveKit();
    }

    return () => {
      // Disconnect from LiveKit
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      // Cleanup remote audio
      for (const [, audio] of remoteAudioRef.current.entries()) {
        audio.element.pause();
        audio.element.srcObject = null;
        audio.gainNode?.disconnect();
        audio.source?.disconnect();
      }
      remoteAudioRef.current.clear();
      // Cleanup screen share peers
      for (const [, pc] of screenPeersRef.current.entries()) {
        pc.close();
      }
      screenPeersRef.current.clear();
    };
  }, [isConnected, currentChannelId, livekitToken, livekitUrl, connectToLiveKit]);

  return {
    roomRef,
    screenPeersRef,
  };
}

// ─── Helpers ────────────────────────────────────────────────

interface RemoteAudio {
  element: HTMLAudioElement;
  gainNode: GainNode | null;
  source: MediaStreamAudioSourceNode | null;
}

function getMyUserId(): string | null {
  // Read from localStorage — the auth store persists the token there
  const token = localStorage.getItem('access_token');
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const encodedPayload = parts[1];
    if (!encodedPayload) return null;
    const payload = JSON.parse(atob(encodedPayload)) as { user_id?: string };
    return payload.user_id ?? null;
  } catch {
    return null;
  }
}
