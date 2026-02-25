import { create } from 'zustand';
import type {
  VoiceParticipant,
  JoinVoiceResponse,
  ScreenShareQuality,
  VoiceJoinPayload,
  VoiceLeavePayload,
  VoiceStatePayload,
  ScreenShareOfferPayload,
  ScreenShareAnswerPayload,
  ICECandidatePayload,
} from '../types';
import { api } from '../utils/api';
import { wsClient } from '../utils/websocket';

// Per-user volume levels (persisted separately from server state)
interface UserVolume {
  volume: number; // 0-200 (100 = default)
}

// Screen share viewer tracking
interface ScreenShareViewer {
  broadcasterId: string;
  peerConnection: RTCPeerConnection | null;
  stream: MediaStream | null;
}

// Screen share broadcaster state
interface ScreenShareBroadcast {
  stream: MediaStream | null;
  quality: ScreenShareQuality;
  hasAudio: boolean;
  // Map of viewerUserId -> RTCPeerConnection
  viewers: Map<string, RTCPeerConnection>;
}

interface VoiceState {
  // Connection state
  currentChannelId: string | null;
  currentCommunityId: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;

  // Local user state
  selfMute: boolean;
  selfDeaf: boolean;
  // Tracks the mute state before deafening so we can restore it on undeaf
  preMuteBeforeDeaf: boolean;
  inputMode: 'vad' | 'push-to-talk';
  isPushToTalkActive: boolean;

  // Participants in current voice channel
  participants: VoiceParticipant[];

  // Per-channel participant lists (for sidebar display of ALL voice channels)
  channelParticipants: Record<string, VoiceParticipant[]>;

  // Volume control per user (userId -> volume)
  userVolumes: Record<string, UserVolume>;

  // LiveKit token & URL (returned from JoinVoice REST call)
  livekitToken: string | null;
  livekitUrl: string | null;

  // Screen share state (as broadcaster)
  screenShareBroadcast: ScreenShareBroadcast | null;

  // Screen shares we're viewing (broadcasterId -> viewer state)
  screenShareViewers: Record<string, ScreenShareViewer>;

  // Screen share audio volume (0-200, 100 = default)
  screenShareVolume: number;
  setScreenShareVolume: (volume: number) => void;

  // Speaking state: set of user IDs currently speaking
  speakingUsers: Set<string>;

  // Ping/latency: rolling average in ms, -1 means not measured yet
  pingMs: number;
  setPing: (ms: number) => void;

  // Actions
  joinVoice: (channelId: string) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => void;
  toggleDeaf: () => void;
  setInputMode: (mode: 'vad' | 'push-to-talk') => void;
  setPushToTalkActive: (active: boolean) => void;
  setUserVolume: (userId: string, volume: number) => void;

  // Screen share actions
  startScreenShare: (quality: ScreenShareQuality) => Promise<void>;
  stopScreenShare: () => void;
  watchScreenShare: (broadcasterId: string) => void;
  stopWatchingScreenShare: (broadcasterId: string) => void;

  // Fetch participants for a voice channel (for sidebar display)
  fetchChannelParticipants: (channelId: string) => Promise<void>;

  // WS event handlers (called from component useEffect)
  handleVoiceJoin: (payload: VoiceJoinPayload) => void;
  handleVoiceLeave: (payload: VoiceLeavePayload) => void;
  handleVoiceState: (payload: VoiceStatePayload) => void;
  handleScreenShareOffer: (payload: ScreenShareOfferPayload) => void;
  handleScreenShareAnswer: (payload: ScreenShareAnswerPayload) => void;
  handleICECandidate: (payload: ICECandidatePayload) => void;

  // Lifecycle
  setSpeaking: (userId: string, speaking: boolean) => void;
  cleanup: () => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  currentChannelId: null,
  currentCommunityId: null,
  isConnecting: false,
  isConnected: false,
  error: null,

  selfMute: false,
  selfDeaf: false,
  preMuteBeforeDeaf: false,
  inputMode: 'vad',
  isPushToTalkActive: false,

  participants: [],
  channelParticipants: {},
  userVolumes: {},

  livekitToken: null,
  livekitUrl: null,

  screenShareBroadcast: null,
  screenShareViewers: {},
  screenShareVolume: 100,
  setScreenShareVolume: (volume) => set({ screenShareVolume: Math.max(0, Math.min(200, volume)) }),
  speakingUsers: new Set<string>(),
  pingMs: -1,
  setPing: (ms) => set({ pingMs: ms }),

  // ─── REST API calls ────────────────────────────────────────

  joinVoice: async (channelId: string) => {
    const state = get();
    if (state.isConnecting || state.currentChannelId === channelId) return;

    // If already in a voice channel, leave first
    if (state.currentChannelId) {
      await get().leaveVoice();
    }

    set({ isConnecting: true, error: null });
    try {
      const data = await api.post<JoinVoiceResponse>(`/voice/channels/${channelId}/join`);
      set({
        currentChannelId: channelId,
        participants: data.participants,
        isConnecting: false,
        isConnected: true,
        selfMute: false,
        selfDeaf: false,
        preMuteBeforeDeaf: false,
        livekitToken: data.token,
        livekitUrl: data.livekit_url,
        channelParticipants: {
          ...get().channelParticipants,
          [channelId]: data.participants,
        },
      });

      // Subscribe to the voice channel's WS events
      wsClient.send('channel_join', { channel_id: channelId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join voice channel';
      set({ error: message, isConnecting: false, isConnected: false });
      throw err;
    }
  },

  leaveVoice: async () => {
    const state = get();
    if (!state.currentChannelId) return;

    const channelId = state.currentChannelId;

    try {
      await api.post('/voice/leave');
    } catch {
      // Best effort — clean up locally regardless
    }

    // Stop screen share if active
    if (state.screenShareBroadcast) {
      get().stopScreenShare();
    }

    // Stop watching any screen shares
    for (const broadcasterId of Object.keys(state.screenShareViewers)) {
      get().stopWatchingScreenShare(broadcasterId);
    }

    // Unsubscribe from WS channel events
    wsClient.send('channel_leave', { channel_id: channelId });

    set({
      currentChannelId: null,
      currentCommunityId: null,
      isConnected: false,
      isConnecting: false,
      participants: [],
      livekitToken: null,
      livekitUrl: null,
      screenShareBroadcast: null,
      screenShareViewers: {},
      selfMute: false,
      selfDeaf: false,
      preMuteBeforeDeaf: false,
    });
    // Note: We do NOT clear channelParticipants here — the leave WS event will handle it
  },

  toggleMute: () => {
    const state = get();
    const newMute = !state.selfMute;

    set({ selfMute: newMute });

    // Notify server via WS
    wsClient.send('voice_state', {
      self_mute: newMute,
      self_deaf: state.selfDeaf,
    });
  },

  toggleDeaf: () => {
    const state = get();
    const newDeaf = !state.selfDeaf;
    // If deafening, save current mute state and force mute
    // If undeafening, restore the pre-deaf mute state
    const newMute = newDeaf ? true : state.preMuteBeforeDeaf;
    const newPreMute = newDeaf ? state.selfMute : state.preMuteBeforeDeaf;

    set({ selfDeaf: newDeaf, selfMute: newMute, preMuteBeforeDeaf: newPreMute });

    // Notify server via WS
    wsClient.send('voice_state', {
      self_mute: newMute,
      self_deaf: newDeaf,
    });
  },

  setInputMode: (mode) => {
    set({ inputMode: mode });
  },

  setPushToTalkActive: (active) => {
    const state = get();
    if (state.inputMode !== 'push-to-talk') return;
    set({ isPushToTalkActive: active });
  },

  setUserVolume: (userId, volume) => {
    set((state) => ({
      userVolumes: {
        ...state.userVolumes,
        [userId]: { volume: Math.max(0, Math.min(200, volume)) },
      },
    }));
  },

  // ─── Screen share ─────────────────────────────────────────

  startScreenShare: async (quality) => {
    const state = get();
    if (!state.currentChannelId || !state.isConnected) return;

    // Get screen share quality constraints
    const constraints = getScreenShareConstraints(quality);

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: constraints.video,
        audio: true,
      });

      const hasAudio = stream.getAudioTracks().length > 0;

      const broadcast: ScreenShareBroadcast = {
        stream,
        quality,
        hasAudio,
        viewers: new Map(),
      };

      set({ screenShareBroadcast: broadcast });

      // Listen for the user stopping the share via browser UI
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        get().stopScreenShare();
      });
    } catch (err) {
      // User cancelled or error
      if (err instanceof Error && err.name !== 'NotAllowedError') {
        set({ error: `Screen share failed: ${err.message}` });
      }
    }
  },

  stopScreenShare: () => {
    const state = get();
    if (!state.screenShareBroadcast) return;

    // Stop all tracks
    state.screenShareBroadcast.stream?.getTracks().forEach((track) => track.stop());

    // Close all viewer peer connections
    state.screenShareBroadcast.viewers.forEach((pc) => pc.close());

    set({ screenShareBroadcast: null });
  },

  watchScreenShare: (broadcasterId) => {
    set((state) => ({
      screenShareViewers: {
        ...state.screenShareViewers,
        [broadcasterId]: {
          broadcasterId,
          peerConnection: null,
          stream: null,
        },
      },
    }));
  },

  stopWatchingScreenShare: (broadcasterId) => {
    const viewer = get().screenShareViewers[broadcasterId];
    if (viewer?.peerConnection) {
      viewer.peerConnection.close();
    }

    set((state) => {
      const viewers = { ...state.screenShareViewers };
      delete viewers[broadcasterId];
      return { screenShareViewers: viewers };
    });
  },

  fetchChannelParticipants: async (channelId) => {
    try {
      const data = await api.get<{ participants: VoiceParticipant[] }>(`/voice/channels/${channelId}/participants`);
      set((state) => ({
        channelParticipants: {
          ...state.channelParticipants,
          [channelId]: data.participants,
        },
      }));
    } catch {
      // Silently fail — channel may not have participants
    }
  },

  // ─── WS event handlers ────────────────────────────────────

  handleVoiceJoin: (payload) => {
    set((state) => {
      // Update channelParticipants for sidebar display (all channels)
      const channelParts = state.channelParticipants[payload.channel_id] ?? [];
      const alreadyInChannel = channelParts.some((p) => p.user_id === payload.user_id);
      const newParticipant: VoiceParticipant = {
        user_id: payload.user_id,
        username: payload.username,
        self_mute: payload.self_mute,
        self_deaf: payload.self_deaf,
        server_mute: false,
        server_deaf: false,
        joined_at: new Date().toISOString(),
      };
      const updatedChannelParticipants = alreadyInChannel
        ? state.channelParticipants
        : {
            ...state.channelParticipants,
            [payload.channel_id]: [...channelParts, newParticipant],
          };

      // Also update local participants if it's our current channel
      if (state.currentChannelId !== payload.channel_id) {
        return { channelParticipants: updatedChannelParticipants };
      }
      if (state.participants.some((p) => p.user_id === payload.user_id)) {
        return { channelParticipants: updatedChannelParticipants };
      }
      return {
        participants: [...state.participants, newParticipant],
        channelParticipants: updatedChannelParticipants,
      };
    });
  },

  handleVoiceLeave: (payload) => {
    set((state) => {
      // Update channelParticipants for sidebar display
      const channelParts = state.channelParticipants[payload.channel_id] ?? [];
      const filteredParts = channelParts.filter((p) => p.user_id !== payload.user_id);
      const updatedChannelParticipants = {
        ...state.channelParticipants,
        [payload.channel_id]: filteredParts,
      };
      // Remove the key entirely if empty
      if (filteredParts.length === 0) {
        delete updatedChannelParticipants[payload.channel_id];
      }

      // Also update local participants if it's our channel
      if (state.currentChannelId !== payload.channel_id) {
        return { channelParticipants: updatedChannelParticipants };
      }
      return {
        participants: state.participants.filter((p) => p.user_id !== payload.user_id),
        channelParticipants: updatedChannelParticipants,
      };
    });

    // Clean up screen share viewer if they were sharing
    const viewer = get().screenShareViewers[payload.user_id];
    if (viewer) {
      get().stopWatchingScreenShare(payload.user_id);
    }
  },

  handleVoiceState: (payload) => {
    set((state) => {
      // Update channelParticipants for sidebar
      const channelParts = state.channelParticipants[payload.channel_id] ?? [];
      const updatedChannelParticipants = {
        ...state.channelParticipants,
        [payload.channel_id]: channelParts.map((p) =>
          p.user_id === payload.user_id
            ? { ...p, self_mute: payload.self_mute, self_deaf: payload.self_deaf }
            : p
        ),
      };

      if (state.currentChannelId !== payload.channel_id) {
        return { channelParticipants: updatedChannelParticipants };
      }
      return {
        participants: state.participants.map((p) =>
          p.user_id === payload.user_id
            ? { ...p, self_mute: payload.self_mute, self_deaf: payload.self_deaf }
            : p
        ),
        channelParticipants: updatedChannelParticipants,
      };
    });
  },

  handleScreenShareOffer: (payload) => {
    // Received an SDP offer from a broadcaster for P2P screen share
    // The WebRTC client component will handle creating the answer
    const state = get();
    if (state.currentChannelId !== payload.channel_id) return;

    // Store the offer; the WebRTC hook will pick it up and respond
    set((prev) => ({
      screenShareViewers: {
        ...prev.screenShareViewers,
        [payload.from_user_id]: {
          broadcasterId: payload.from_user_id,
          peerConnection: prev.screenShareViewers[payload.from_user_id]?.peerConnection ?? null,
          stream: prev.screenShareViewers[payload.from_user_id]?.stream ?? null,
        },
      },
    }));
  },

  handleScreenShareAnswer: (_payload) => {
    // Received an SDP answer from a viewer. The WebRTC hook handles this.
    // State update not needed here — the hook sets the remote description directly.
  },

  handleICECandidate: (_payload) => {
    // ICE candidate relay — handled by the WebRTC hook, not the store.
  },

  // ─── Lifecycle ─────────────────────────────────────────────

  setSpeaking: (userId, speaking) => {
    set((state) => {
      const next = new Set(state.speakingUsers);
      if (speaking) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return { speakingUsers: next };
    });
  },

  cleanup: () => {
    const state = get();

    // Stop screen share broadcast
    if (state.screenShareBroadcast) {
      state.screenShareBroadcast.stream?.getTracks().forEach((track) => track.stop());
      state.screenShareBroadcast.viewers.forEach((pc) => pc.close());
    }

    // Close all viewer connections
    for (const viewer of Object.values(state.screenShareViewers)) {
      viewer.peerConnection?.close();
    }

    set({
      currentChannelId: null,
      currentCommunityId: null,
      isConnecting: false,
      isConnected: false,
      error: null,
      selfMute: false,
      selfDeaf: false,
      preMuteBeforeDeaf: false,
      participants: [],
      channelParticipants: {},
      speakingUsers: new Set<string>(),
      pingMs: -1,
      livekitToken: null,
      livekitUrl: null,
      screenShareBroadcast: null,
      screenShareViewers: {},
      screenShareVolume: 100,
    });
  },
}));

// ─── Helper: Screen share quality constraints ──────────────

function getScreenShareConstraints(quality: ScreenShareQuality): {
  video: MediaTrackConstraints;
} {
  switch (quality) {
    case '480p30':
      return {
        video: { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      };
    case '720p60':
      return {
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
      };
    case '1080p60':
      return {
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
      };
    case '1440p60':
      return {
        video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 60 } },
      };
  }
}
