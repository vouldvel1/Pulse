/**
 * useScreenShare — P2P трансляция экрана через WS сигналинг.
 *
 * Вызывается ОДИН РАЗ в MainLayout (для WS подписок + функций sharing).
 * Функции startSharing/stopSharing экспортируются через screenShareActions
 * для использования в VoiceOverlay и VoiceMiniPanel без дублирования WS listeners.
 *
 * Шарер:
 *  1. getDisplayMedia() с пресетом качества
 *  2. Создаёт PeerConnection на каждого viewer'а в канале
 *  3. Шлёт screen_share_offer через WS
 *  4. Принимает screen_share_answer + ice_candidate
 *
 * Viewer:
 *  1. Принимает screen_share_offer
 *  2. Создаёт PeerConnection, setRemoteDescription, createAnswer
 *  3. Шлёт screen_share_answer
 *  4. Получает remote video track → выставляет в shareStream
 */

import { useEffect, useRef, useCallback } from 'react';
import { wsClient } from '@/utils/wsClient';
import { useVoiceStore } from '@/stores/voiceStore';

export type ScreenShareQuality = '480p30' | '720p60' | '1080p60' | '1440p60';

interface QualityPreset {
  width: number;
  height: number;
  frameRate: number;
}

const QUALITY_PRESETS: Record<ScreenShareQuality, QualityPreset> = {
  '480p30':  { width: 854,  height: 480,  frameRate: 30 },
  '720p60':  { width: 1280, height: 720,  frameRate: 60 },
  '1080p60': { width: 1920, height: 1080, frameRate: 60 },
  '1440p60': { width: 2560, height: 1440, frameRate: 60 },
};

/**
 * Singleton to expose startSharing/stopSharing to voice components
 * without needing a separate hook instance (which would duplicate WS handlers).
 */
export const screenShareActions = {
  startSharing: (_quality?: ScreenShareQuality): Promise<void> => Promise.resolve(),
  stopSharing: (): void => { /* no-op until initialized */ },
};

// Map from sharer_user_id → PeerConnection (viewer side)
type ViewerPCs = Map<string, RTCPeerConnection>;
// Map from viewer_user_id → PeerConnection (sharer side)
type SharerPCs = Map<string, RTCPeerConnection>;
// ICE candidate queues per peer (for viewer, before remote desc is set)
type CandidateQueues = Map<string, RTCIceCandidateInit[]>;

export function useScreenShare() {
  const setIsSharing = useVoiceStore((s) => s.setIsSharing);
  const setShareStream = useVoiceStore((s) => s.setShareStream);

  // Sharer side: one PC per viewer
  const sharerPCsRef = useRef<SharerPCs>(new Map());
  // Viewer side: one PC per sharer (usually just one)
  const viewerPCsRef = useRef<ViewerPCs>(new Map());
  // ICE candidate queues for viewer PCs (keyed by sharer identity)
  const candidateQueuesRef = useRef<CandidateQueues>(new Map());
  // Remote desc set flags per sharer
  const remoteDescSetRef = useRef<Map<string, boolean>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);

  // ── Helper: create a base PeerConnection with STUN ───────────────────────
  const createPC = (): RTCPeerConnection =>
    new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

  // ── STOP sharing ──────────────────────────────────────────────────────────
  const stopSharing = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    sharerPCsRef.current.forEach((pc) => pc.close());
    sharerPCsRef.current.clear();

    setShareStream(null);
    setIsSharing(false);
  }, [setShareStream, setIsSharing]);

  // ── START sharing ─────────────────────────────────────────────────────────
  const startSharing = useCallback(async (quality: ScreenShareQuality = '720p60') => {
    const currentlySharing = useVoiceStore.getState().isSharing;
    if (currentlySharing) return;

    const preset = QUALITY_PRESETS[quality];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.frameRate },
        },
        audio: false,
      });
    } catch {
      // User cancelled or permission denied
      return;
    }

    localStreamRef.current = stream;
    setShareStream(stream);
    setIsSharing(true);

    // When user stops sharing via browser UI
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      stopSharing();
    });

    // Get participants from voice store to create offers for each
    const participants = useVoiceStore.getState().participants;

    for (const participant of participants) {
      const pc = createPC();
      sharerPCsRef.current.set(participant.user_id, pc);

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          wsClient.send('ice_candidate', {
            candidate: e.candidate.toJSON(),
            target: 'peer',
            target_user_id: participant.user_id,
          });
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsClient.send('screen_share_offer', {
          sdp: offer.sdp,
          type: offer.type,
          target_user_id: participant.user_id,
        });
      } catch { /* ignore */ }
    }
  }, [stopSharing, setShareStream, setIsSharing]);

  // ── Handle incoming screen_share_offer (viewer side) ─────────────────────
  const handleOffer = useCallback(async (payload: Record<string, unknown>) => {
    const { sdp, type, from_user_id } = payload as {
      sdp: string;
      type: RTCSdpType;
      from_user_id: string;
    };

    // Close any previous PC from this sharer
    const existing = viewerPCsRef.current.get(from_user_id);
    if (existing) {
      existing.close();
      viewerPCsRef.current.delete(from_user_id);
    }
    candidateQueuesRef.current.set(from_user_id, []);
    remoteDescSetRef.current.set(from_user_id, false);

    const pc = createPC();
    viewerPCsRef.current.set(from_user_id, pc);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        wsClient.send('ice_candidate', {
          candidate: e.candidate.toJSON(),
          target: 'peer',
          target_user_id: from_user_id,
        });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      useVoiceStore.getState().setShareStream(stream);
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription({ type, sdp }));
      remoteDescSetRef.current.set(from_user_id, true);

      // Flush queued ICE candidates
      const queue = candidateQueuesRef.current.get(from_user_id) ?? [];
      for (const c of queue) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* ignore */ }
      }
      candidateQueuesRef.current.set(from_user_id, []);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsClient.send('screen_share_answer', {
        sdp: answer.sdp,
        type: answer.type,
        target_user_id: from_user_id,
      });
    } catch { /* ignore */ }
  }, []);

  // ── Handle screen_share_answer (sharer side) ─────────────────────────────
  const handleAnswer = useCallback(async (payload: Record<string, unknown>) => {
    const { sdp, type, from_user_id } = payload as {
      sdp: string;
      type: RTCSdpType;
      from_user_id: string;
    };
    const pc = sharerPCsRef.current.get(from_user_id);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription({ type, sdp }));
    } catch { /* ignore */ }
  }, []);

  // ── Handle ICE candidates (both sides, target: 'peer') ───────────────────
  const handleICE = useCallback(async (payload: Record<string, unknown>) => {
    const { candidate, target, from_user_id } = payload as {
      candidate: RTCIceCandidateInit;
      target: string;
      from_user_id: string;
    };
    if (target !== 'peer') return;

    // Try sharer side first (viewer sent us a candidate)
    const sharerPC = sharerPCsRef.current.get(from_user_id);
    if (sharerPC) {
      try { await sharerPC.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ }
      return;
    }

    // Try viewer side (sharer sent us a candidate)
    const viewerPC = viewerPCsRef.current.get(from_user_id);
    if (!viewerPC) return;

    if (!remoteDescSetRef.current.get(from_user_id)) {
      const queue = candidateQueuesRef.current.get(from_user_id) ?? [];
      queue.push(candidate);
      candidateQueuesRef.current.set(from_user_id, queue);
      return;
    }
    try { await viewerPC.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ }
  }, []);

  // ── WS event subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      wsClient.on('screen_share_offer', (p) => void handleOffer(p)),
      wsClient.on('screen_share_answer', (p) => void handleAnswer(p)),
      wsClient.on('ice_candidate', (p) => void handleICE(p)),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [handleOffer, handleAnswer, handleICE]);

  // ── Cleanup on channel leave ───────────────────────────────────────────────
  const channelId = useVoiceStore((s) => s.channelId);
  useEffect(() => {
    if (!channelId) {
      stopSharing();
      viewerPCsRef.current.forEach((pc) => pc.close());
      viewerPCsRef.current.clear();
      candidateQueuesRef.current.clear();
      remoteDescSetRef.current.clear();
    }
  }, [channelId, stopSharing]);

  // ── Expose actions via singleton for voice components ────────────────────
  useEffect(() => {
    screenShareActions.startSharing = startSharing;
    screenShareActions.stopSharing = stopSharing;
    return () => {
      screenShareActions.startSharing = () => Promise.resolve();
      screenShareActions.stopSharing = () => { /* no-op */ };
    };
  }, [startSharing, stopSharing]);

  return { startSharing, stopSharing };
}
