// Core types for Pulse frontend

export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  status: string;
  custom_status: string | null;
  presence: Presence;
  totp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type Presence = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

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

export interface CommunitySearchResult {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  banner_url: string | null;
  owner_id: string;
  visibility: 'public' | 'private';
  member_count: number;
  created_at: string;
}

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
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  reply_to_id: string | null;
  pinned: boolean;
  edited_at: string | null;
  created_at: string;
  author?: User;
  attachments?: Attachment[];
  reactions?: ReactionAgg[];
  embeds?: Embed[];
}

export interface Attachment {
  id: string;
  message_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  url: string;
  width?: number;
  height?: number;
}

export interface ReactionAgg {
  emoji: string;
  count: number;
  me: boolean;
}

export interface Role {
  id: string;
  community_id: string;
  name: string;
  color: string | null;
  position: number;
  permissions: number;
  is_default: boolean;
}

export interface CommunityMember {
  user_id: string;
  community_id: string;
  nickname: string | null;
  joined_at: string;
  user?: User;
  roles?: Role[];
}

export interface Invite {
  id: string;
  code: string;
  community_id: string;
  creator_id: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: string;
}

export interface WSEvent<T = unknown> {
  type: string;
  payload: T;
}

export interface ReadState {
  user_id: string;
  channel_id: string;
  last_message_id: string;
  mention_count: number;
}

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

export interface AuditLogEntry {
  id: string;
  community_id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  changes: string | null;
  created_at: string;
}

// Permission flags (match backend)
export const Permissions = {
  ADMIN: 1 << 0,
  MANAGE_COMMUNITY: 1 << 1,
  MANAGE_CHANNELS: 1 << 2,
  MANAGE_ROLES: 1 << 3,
  MANAGE_MESSAGES: 1 << 4,
  MANAGE_MEMBERS: 1 << 5,
  SEND_MESSAGES: 1 << 6,
  READ_MESSAGES: 1 << 7,
  ATTACH_FILES: 1 << 8,
  CONNECT: 1 << 9,
  SPEAK: 1 << 10,
  VIDEO: 1 << 11,
  MUTE_MEMBERS: 1 << 12,
  DEAFEN_MEMBERS: 1 << 13,
  MOVE_MEMBERS: 1 << 14,
  MENTION_EVERYONE: 1 << 15,
  MANAGE_WEBHOOKS: 1 << 16,
  VIEW_AUDIT_LOG: 1 << 17,
  CREATE_INVITE: 1 << 18,
  USE_REACTIONS: 1 << 19,
  SHARE_SCREEN: 1 << 20,
} as const;

export function hasPermission(userPerms: number, perm: number): boolean {
  if (userPerms & Permissions.ADMIN) return true;
  return (userPerms & perm) === perm;
}

// Voice / Screen Share types

export interface VoiceState {
  user_id: string;
  channel_id: string;
  community_id: string;
  self_mute: boolean;
  self_deaf: boolean;
  server_mute: boolean;
  server_deaf: boolean;
  streaming: boolean;
  joined_at: string;
  user?: User;
}

export interface VoiceParticipant {
  user_id: string;
  username: string;
  self_mute: boolean;
  self_deaf: boolean;
  server_mute: boolean;
  server_deaf: boolean;
  joined_at: string;
}

export interface ScreenShareSession {
  user_id: string;
  channel_id: string;
  stream_id: string;
  quality: ScreenShareQuality;
  has_audio: boolean;
}

export type ScreenShareQuality = '480p30' | '720p60' | '1080p60' | '1440p60';

export interface JoinVoiceResponse {
  channel_id: string;
  participants: VoiceParticipant[];
  token: string;
  livekit_url: string;
}

// WebSocket voice event payloads
export interface VoiceJoinPayload {
  user_id: string;
  channel_id: string;
  username: string;
  self_mute: boolean;
  self_deaf: boolean;
}

export interface VoiceLeavePayload {
  user_id: string;
  channel_id: string;
  username: string;
}

export interface VoiceStatePayload {
  user_id: string;
  channel_id: string;
  self_mute: boolean;
  self_deaf: boolean;
}

export interface ScreenShareOfferPayload {
  from_user_id: string;
  channel_id: string;
  sdp: RTCSessionDescriptionInit;
}

export interface ScreenShareAnswerPayload {
  from_user_id: string;
  channel_id: string;
  sdp: RTCSessionDescriptionInit;
}

export interface ICECandidatePayload {
  from_user_id: string;
  channel_id: string;
  candidate: RTCIceCandidateInit;
  target: 'peer';
}

// DM types

export interface DMChannel {
  id: string;
  name: string | null;
  is_group: boolean;
  owner_id: string | null;
  created_at: string;
  members: DMUser[];
}

export interface DMUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
}

export interface DMMessage {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  reply_to_id: string | null;
  edited_at: string | null;
  created_at: string;
  author?: DMUser;
}

// Search types

export interface SearchResult {
  message_id: string;
  channel_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string | null;
  channel_name: string;
  community_id: string;
  community_name: string;
  relevance: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  limit: number;
  offset: number;
}

// Embed types (link previews)

export interface Embed {
  url: string;
  type: 'link' | 'image' | 'video';
  title?: string;
  description?: string;
  site_name?: string;
  image_url?: string;
  color?: string;
}

export interface MessageEmbedsPayload {
  message_id: string;
  channel_id: string;
  embeds: Embed[];
}
