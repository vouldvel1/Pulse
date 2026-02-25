import { create } from 'zustand';
import type { Community, CommunityMember, CommunitySearchResult, Invite } from '../types';
import { api } from '../utils/api';
import { useChannelStore } from './channelStore';
import { useMessageStore } from './messageStore';

interface CommunityState {
  communities: Community[];
  activeCommunityId: string | null;
  members: CommunityMember[];
  isLoading: boolean;
  error: string | null;

  fetchCommunities: () => Promise<void>;
  createCommunity: (name: string, description?: string, visibility?: 'public' | 'private') => Promise<Community>;
  updateCommunity: (id: string, data: { name?: string; description?: string; icon_url?: string; banner_url?: string; visibility?: 'public' | 'private' }) => Promise<void>;
  deleteCommunity: (id: string) => Promise<void>;
  setActiveCommunity: (id: string | null) => void;
  fetchMembers: (communityId: string) => Promise<void>;
  leaveCommunity: (id: string) => Promise<void>;
  joinCommunity: (inviteCode: string) => Promise<Community>;
  joinPublicCommunity: (communityId: string) => Promise<Community>;
  searchCommunities: (query: string) => Promise<CommunitySearchResult[]>;
  createInvite: (communityId: string, maxUses?: number, expiresIn?: number) => Promise<Invite>;
  clearError: () => void;
}

export const useCommunityStore = create<CommunityState>((set) => ({
  communities: [],
  activeCommunityId: null,
  members: [],
  isLoading: false,
  error: null,

  fetchCommunities: async () => {
    set({ isLoading: true, error: null });
    try {
      const communities = await api.get<Community[]>('/communities');
      set({ communities, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch communities';
      set({ error: message, isLoading: false });
    }
  },

  createCommunity: async (name, description, visibility) => {
    const community = await api.post<Community>('/communities', { name, description, visibility: visibility || 'private' });
    set((state) => ({ communities: [...state.communities, community] }));
    return community;
  },

  updateCommunity: async (id, data) => {
    const updated = await api.patch<Community>(`/communities/${id}`, data);
    set((state) => ({
      communities: state.communities.map((c) => (c.id === id ? updated : c)),
    }));
  },

  deleteCommunity: async (id) => {
    await api.delete(`/communities/${id}`);
    set((state) => ({
      communities: state.communities.filter((c) => c.id !== id),
      activeCommunityId: state.activeCommunityId === id ? null : state.activeCommunityId,
    }));
  },

  setActiveCommunity: (id) => {
    // Reset channel and message state when switching communities
    useChannelStore.getState().setActiveChannel(null);
    useMessageStore.getState().clearMessages();
    set({ activeCommunityId: id, members: [] });
  },

  fetchMembers: async (communityId) => {
    try {
      const response = await api.get<{ data: CommunityMember[]; total: number }>(`/communities/${communityId}/members`);
      set({ members: response.data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch members';
      set({ error: message });
    }
  },

  leaveCommunity: async (id) => {
    await api.delete(`/communities/${id}/members/me`);
    set((state) => ({
      communities: state.communities.filter((c) => c.id !== id),
      activeCommunityId: state.activeCommunityId === id ? null : state.activeCommunityId,
    }));
  },

  joinCommunity: async (inviteCode) => {
    const community = await api.post<Community>(`/invites/${inviteCode}/join`);
    set((state) => {
      const exists = state.communities.some((c) => c.id === community.id);
      return {
        communities: exists ? state.communities : [...state.communities, community],
      };
    });
    return community;
  },

  searchCommunities: async (query) => {
    const results = await api.get<CommunitySearchResult[]>(`/communities/search?q=${encodeURIComponent(query)}`);
    return results;
  },

  joinPublicCommunity: async (communityId) => {
    const community = await api.post<Community>(`/communities/${communityId}/join`);
    set((state) => {
      const exists = state.communities.some((c) => c.id === community.id);
      return {
        communities: exists ? state.communities : [...state.communities, community],
      };
    });
    return community;
  },

  createInvite: async (communityId, maxUses, expiresIn) => {
    const invite = await api.post<Invite>(`/communities/${communityId}/invites`, {
      max_uses: maxUses,
      expires_in: expiresIn,
    });
    return invite;
  },

  clearError: () => set({ error: null }),
}));
