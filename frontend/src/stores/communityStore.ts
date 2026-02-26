import { create } from 'zustand';
import { communities as communityApi, channels as channelApi } from '@/utils/api';
import type { Community, CommunityMember, Channel } from '@/types';

interface CommunityState {
  communities: Community[];
  activeCommunityId: string | null;
  channels: Record<string, Channel[]>;
  members: Record<string, CommunityMember[]>;
  isLoading: boolean;
  error: string | null;

  fetchCommunities: () => Promise<void>;
  setActiveCommunity: (id: string | null) => void;
  fetchChannels: (communityId: string) => Promise<void>;
  fetchMembers: (communityId: string) => Promise<void>;
  createCommunity: (name: string, description?: string) => Promise<Community>;
  leaveCommunity: (id: string) => Promise<void>;
  addCommunity: (community: Community) => void;
  updateCommunity: (community: Community) => void;
  removeCommunity: (id: string) => void;
  addChannel: (communityId: string, channel: Channel) => void;
  updateChannel: (channel: Channel) => void;
  removeChannel: (communityId: string, channelId: string) => void;
}

export const useCommunityStore = create<CommunityState>((set, get) => ({
  communities: [],
  activeCommunityId: null,
  channels: {},
  members: {},
  isLoading: false,
  error: null,

  fetchCommunities: async () => {
    set({ isLoading: true, error: null });
    try {
      const list = await communityApi.list();
      set({ communities: list, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  setActiveCommunity: (id) => {
    set({ activeCommunityId: id });
    if (id) {
      void get().fetchChannels(id);
      void get().fetchMembers(id);
    }
  },

  fetchChannels: async (communityId) => {
    try {
      const list = await channelApi.list(communityId);
      set((s) => ({ channels: { ...s.channels, [communityId]: list } }));
    } catch { /* ignore */ }
  },

  fetchMembers: async (communityId) => {
    try {
      const list = await communityApi.members(communityId);
      set((s) => ({ members: { ...s.members, [communityId]: list } }));
    } catch { /* ignore */ }
  },

  createCommunity: async (name, description) => {
    const community = await communityApi.create(name, description);
    set((s) => ({ communities: [community, ...s.communities] }));
    return community;
  },

  leaveCommunity: async (id) => {
    await communityApi.leave(id);
    set((s) => ({
      communities: s.communities.filter((c) => c.id !== id),
      activeCommunityId: s.activeCommunityId === id ? null : s.activeCommunityId,
    }));
  },

  addCommunity: (community) =>
    set((s) => ({ communities: [community, ...s.communities] })),

  updateCommunity: (community) =>
    set((s) => ({
      communities: s.communities.map((c) => (c.id === community.id ? community : c)),
    })),

  removeCommunity: (id) =>
    set((s) => ({
      communities: s.communities.filter((c) => c.id !== id),
      activeCommunityId: s.activeCommunityId === id ? null : s.activeCommunityId,
    })),

  addChannel: (communityId, channel) =>
    set((s) => ({
      channels: {
        ...s.channels,
        [communityId]: [...(s.channels[communityId] ?? []), channel],
      },
    })),

  updateChannel: (channel) =>
    set((s) => {
      const cid = channel.community_id;
      return {
        channels: {
          ...s.channels,
          [cid]: (s.channels[cid] ?? []).map((c) => (c.id === channel.id ? channel : c)),
        },
      };
    }),

  removeChannel: (communityId, channelId) =>
    set((s) => ({
      channels: {
        ...s.channels,
        [communityId]: (s.channels[communityId] ?? []).filter((c) => c.id !== channelId),
      },
    })),
}));
