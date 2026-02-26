// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  status: string | null;
  custom_status: string | null;
  presence: 'online' | 'idle' | 'dnd' | 'offline';
  created_at: string;
  updated_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: User;
}

// ─── Communities ─────────────────────────────────────────────────────────────

export interface Community {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  banner_url: string | null;
  owner_id: string;
  visibility: 'public' | 'private';
  created_at: string;
  updated_at: string;
}

export interface CommunityMember {
  user_id: string;
  community_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  nickname: string | null;
  joined_at: string;
  roles: Role[];
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  community_id: string;
  name: string;
  color: string;
  position: number;
  permissions: number;
  is_default: boolean;
}

// ─── Channels ────────────────────────────────────────────────────────────────

export type ChannelType = 'text' | 'announcement' | 'voice' | 'category';

export interface Channel {
  id: string;
  community_id: string;
  parent_id: string | null;
  name: string;
  topic: string | null;
  type: ChannelType;
  position: number;
  is_private: boolean;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface Attachment {
  id: string;
  message_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface Embed {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  author: User;
  content: string;
  reply_to_id: string | null;
  reply_to: Message | null;
  pinned: boolean;
  edited_at: string | null;
  created_at: string;
  attachments: Attachment[];
  reactions: Reaction[];
  embeds: Embed[];
}

// ─── DM ──────────────────────────────────────────────────────────────────────

export interface DMChannel {
  id: string;
  name: string | null;
  is_group: boolean;
  owner_id: string | null;
  members: User[];
  last_message: DMMessage | null;
  created_at: string;
}

export interface DMMessage {
  id: string;
  channel_id: string;
  author_id: string;
  author: User;
  content: string;
  reply_to_id: string | null;
  edited_at: string | null;
  created_at: string;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  type: 'mention' | 'reply' | 'dm' | 'system';
  title: string;
  body: string;
  resource_id: string | null;
  read: boolean;
  created_at: string;
}

// ─── Voice ───────────────────────────────────────────────────────────────────

export interface VoiceParticipant {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  self_mute: boolean;
  self_deaf: boolean;
  server_mute: boolean;
  server_deaf: boolean;
  is_speaking: boolean;
}

export interface VoiceState {
  channelId: string | null;
  channelName: string | null;
  communityName: string | null;
  participants: VoiceParticipant[];
  selfMute: boolean;
  selfDeaf: boolean;
  livekitToken: string | null;
  livekitUrl: string | null;
}

// ─── Invites ─────────────────────────────────────────────────────────────────

export interface Invite {
  id: string;
  code: string;
  community_id: string;
  community: Community | null;
  creator_id: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  messages: Message[];
  total: number;
}

// ─── WebSocket events ────────────────────────────────────────────────────────

export interface WSPayload {
  type: string;
  payload: Record<string, unknown>;
}

// ─── API pagination ──────────────────────────────────────────────────────────

export interface PaginatedMessages {
  messages: Message[];
  has_more: boolean;
}

export interface PaginatedDMMessages {
  messages: DMMessage[];
  has_more: boolean;
}
