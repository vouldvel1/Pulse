import type {
  AuthTokens,
  User,
  Community,
  CommunityMember,
  Channel,
  Message,
  DMChannel,
  DMMessage,
  Invite,
  Notification,
  Role,
  VoiceParticipant,
} from '@/types';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ─── Token storage ────────────────────────────────────────────────────────────

let accessToken: string | null = localStorage.getItem('access_token');
let refreshToken: string | null = localStorage.getItem('refresh_token');

export function setTokens(tokens: { access_token: string; refresh_token: string }) {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  localStorage.setItem('access_token', tokens.access_token);
  localStorage.setItem('refresh_token', tokens.refresh_token);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function getAccessToken() {
  return accessToken;
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as AuthTokens;
    setTokens(data);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, options, false);
    }
    clearTokens();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      message = err.error ?? message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  register: (username: string, email: string, password: string) =>
    request<AuthTokens>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<void>('/auth/logout', { method: 'POST' }),

  me: () => request<User>('/auth/me'),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = {
  search: (q: string, limit = 20) =>
    request<User[]>(`/users/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  updateMe: (data: Partial<Pick<User, 'display_name' | 'bio' | 'custom_status' | 'username' | 'email'>>) =>
    request<User>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return request<User>('/users/me/avatar', { method: 'POST', body: fd });
  },

  uploadBanner: (file: File) => {
    const fd = new FormData();
    fd.append('banner', file);
    return request<User>('/users/me/banner', { method: 'POST', body: fd });
  },

  changePassword: (current_password: string, new_password: string) =>
    request<void>('/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password, new_password }),
    }),
};

// ─── Communities ──────────────────────────────────────────────────────────────

export const communities = {
  create: (name: string, description?: string, visibility?: 'public' | 'private') =>
    request<Community>('/communities', {
      method: 'POST',
      body: JSON.stringify({ name, description, visibility: visibility ?? 'private' }),
    }),

  list: () => request<Community[]>('/communities'),

  search: (q: string, limit = 20) =>
    request<Community[]>(`/communities/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  get: (id: string) => request<Community>(`/communities/${id}`),

  update: (id: string, data: Partial<Pick<Community, 'name' | 'description' | 'visibility'>>) =>
    request<Community>(`/communities/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/communities/${id}`, { method: 'DELETE' }),

  members: (id: string) =>
    request<{ data: CommunityMember[] }>(`/communities/${id}/members`)
      .then((r) => r.data ?? []),

  join: (id: string) => request<void>(`/communities/${id}/join`, { method: 'POST' }),

  // Join a public community and return the Community object (backend returns it on success)
  joinAndGet: (id: string) => request<Community>(`/communities/${id}/join`, { method: 'POST' }),

  leave: (id: string) => request<void>(`/communities/${id}/members/me`, { method: 'DELETE' }),
};

// ─── Channels ─────────────────────────────────────────────────────────────────

export const channels = {
  create: (communityId: string, data: { name: string; type: string; topic?: string; parent_id?: string }) =>
    request<Channel>(`/communities/${communityId}/channels`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  list: (communityId: string) =>
    request<Channel[]>(`/communities/${communityId}/channels`),

  get: (id: string) => request<Channel>(`/channels/${id}`),

  update: (id: string, data: Partial<Pick<Channel, 'name' | 'topic'>>) =>
    request<Channel>(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/channels/${id}`, { method: 'DELETE' }),
};

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messages = {
  list: (channelId: string, limit = 50, before?: string) =>
    request<Message[]>(
      `/channels/${channelId}/messages?limit=${limit}${before ? `&before=${before}` : ''}`,
    ),

  send: (channelId: string, content: string, reply_to_id?: string) =>
    request<Message>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, reply_to_id }),
    }),

  edit: (channelId: string, messageId: string, content: string) =>
    request<Message>(`/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  delete: (channelId: string, messageId: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' }),

  addReaction: (channelId: string, messageId: string, emoji: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'PUT',
    }),

  removeReaction: (channelId: string, messageId: string, emoji: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    }),

  uploadFile: (channelId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ url: string; file_name: string; mime_type: string; file_size: number }>(
      `/channels/${channelId}/upload`,
      { method: 'POST', body: fd },
    );
  },

  getPins: (channelId: string) => request<Message[]>(`/channels/${channelId}/pins`),

  pin: (channelId: string, messageId: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}/pin`, { method: 'PUT' }),

  unpin: (channelId: string, messageId: string) =>
    request<void>(`/channels/${channelId}/messages/${messageId}/pin`, { method: 'DELETE' }),
};

// ─── DM ───────────────────────────────────────────────────────────────────────

export const dm = {
  createChannel: (recipient_id: string) =>
    request<DMChannel>('/dm/channels', { method: 'POST', body: JSON.stringify({ recipient_id }) }),

  createGroupChannel: (name: string, member_ids: string[]) =>
    request<DMChannel>('/dm/channels/group', {
      method: 'POST',
      body: JSON.stringify({ name, member_ids }),
    }),

  listChannels: () => request<DMChannel[]>('/dm/channels'),

  getChannel: (id: string) => request<DMChannel>(`/dm/channels/${id}`),

  listMessages: (channelId: string, limit = 50, before?: string) =>
    request<DMMessage[]>(
      `/dm/channels/${channelId}/messages?limit=${limit}${before ? `&before=${before}` : ''}`,
    ),

  sendMessage: (channelId: string, content: string, reply_to_id?: string) =>
    request<DMMessage>(`/dm/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, reply_to_id }),
    }),

  editMessage: (channelId: string, messageId: string, content: string) =>
    request<DMMessage>(`/dm/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  deleteMessage: (channelId: string, messageId: string) =>
    request<void>(`/dm/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' }),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = {
  list: (limit = 20, unread_only?: boolean) =>
    request<Notification[]>(`/notifications?limit=${limit}${unread_only ? '&unread_only=true' : ''}`),

  unreadCount: () => request<{ count: number }>('/notifications/unread-count'),

  markRead: (id: string) => request<void>(`/notifications/${id}/read`, { method: 'PATCH' }),

  markAllRead: () => request<void>('/notifications/read-all', { method: 'POST' }),

  delete: (id: string) => request<void>(`/notifications/${id}`, { method: 'DELETE' }),
};

// ─── Invites ──────────────────────────────────────────────────────────────────

export const invites = {
  get: (code: string) => request<Invite>(`/invites/${code}`),

  join: (code: string) => request<Community>(`/invites/${code}/join`, { method: 'POST' }),

  create: (communityId: string, max_uses?: number, expires_in_hours?: number) =>
    request<Invite>(`/communities/${communityId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ max_uses, expires_in_hours }),
    }),

  list: (communityId: string) => request<Invite[]>(`/communities/${communityId}/invites`),

  delete: (id: string) => request<void>(`/invites/${id}`, { method: 'DELETE' }),
};

// ─── Roles ────────────────────────────────────────────────────────────────────

export const roles = {
  create: (communityId: string, name: string, color: string, permissions: number) =>
    request<Role>(`/communities/${communityId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ name, color, permissions }),
    }),

  list: (communityId: string) => request<Role[]>(`/communities/${communityId}/roles`),

  update: (id: string, data: Partial<Pick<Role, 'name' | 'color' | 'permissions'>>) =>
    request<Role>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/roles/${id}`, { method: 'DELETE' }),

  assignToMember: (communityId: string, userId: string, roleId: string) =>
    request<void>(`/communities/${communityId}/members/${userId}/roles/${roleId}`, { method: 'PUT' }),

  removeFromMember: (communityId: string, userId: string, roleId: string) =>
    request<void>(`/communities/${communityId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' }),
};

// ─── Voice ────────────────────────────────────────────────────────────────────

export interface ICEServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export const voice = {
  join: (channelId: string) =>
    request<{ token: string; livekit_url: string; participants: VoiceParticipant[] }>(
      `/voice/channels/${channelId}/join`,
      { method: 'POST' },
    ),

  leave: () => request<void>('/voice/leave', { method: 'POST' }),

  updateState: (self_mute: boolean, self_deaf: boolean) =>
    request<void>('/voice/state', { method: 'PATCH', body: JSON.stringify({ self_mute, self_deaf }) }),

  participants: (channelId: string) =>
    request<VoiceParticipant[]>(`/voice/channels/${channelId}/participants`),

  /** Returns ephemeral ICE servers (STUN + TURN) from the backend. */
  iceServers: () =>
    request<{ ice_servers: ICEServer[] }>('/voice/ice-servers').then((r) => r.ice_servers),
};

// ─── Search ───────────────────────────────────────────────────────────────────

export const search = {
  messages: (q: string, communityId?: string, channelId?: string, limit = 20, offset = 0) => {
    const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
    if (communityId) params.set('community_id', communityId);
    if (channelId) params.set('channel_id', channelId);
    return request<{ messages: Message[]; total: number }>(`/search?${params}`);
  },
};
