import { create } from 'zustand';
import { api } from '../utils/api';
import type { SearchResult, SearchResponse } from '../types';

interface SearchState {
  query: string;
  results: SearchResult[];
  total: number;
  loading: boolean;
  error: string | null;
  offset: number;
  communityFilter: string | null;
  channelFilter: string | null;

  setQuery: (query: string) => void;
  setCommunityFilter: (id: string | null) => void;
  setChannelFilter: (id: string | null) => void;
  search: () => Promise<void>;
  loadMore: () => Promise<void>;
  clear: () => void;
}

const LIMIT = 25;

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  total: 0,
  loading: false,
  error: null,
  offset: 0,
  communityFilter: null,
  channelFilter: null,

  setQuery: (query) => set({ query }),
  setCommunityFilter: (id) => set({ communityFilter: id }),
  setChannelFilter: (id) => set({ channelFilter: id }),

  search: async () => {
    const { query, communityFilter, channelFilter } = get();
    if (query.length < 2) return;

    set({ loading: true, error: null, offset: 0 });

    const params = new URLSearchParams({ q: query, limit: String(LIMIT), offset: '0' });
    if (communityFilter) params.set('community_id', communityFilter);
    if (channelFilter) params.set('channel_id', channelFilter);

    try {
      const data = await api.get<SearchResponse>(`/search?${params.toString()}`);
      set({
        results: data.results,
        total: data.total,
        offset: LIMIT,
        loading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      set({ error: message, loading: false, results: [], total: 0 });
    }
  },

  loadMore: async () => {
    const { query, communityFilter, channelFilter, offset, total, loading, results } = get();
    if (loading || offset >= total) return;

    set({ loading: true });

    const params = new URLSearchParams({
      q: query,
      limit: String(LIMIT),
      offset: String(offset),
    });
    if (communityFilter) params.set('community_id', communityFilter);
    if (channelFilter) params.set('channel_id', channelFilter);

    try {
      const data = await api.get<SearchResponse>(`/search?${params.toString()}`);
      set({
        results: [...results, ...data.results],
        offset: offset + LIMIT,
        loading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      set({ error: message, loading: false });
    }
  },

  clear: () =>
    set({
      query: '',
      results: [],
      total: 0,
      loading: false,
      error: null,
      offset: 0,
      communityFilter: null,
      channelFilter: null,
    }),
}));
