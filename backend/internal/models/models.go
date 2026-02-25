package models

import (
	"time"

	"github.com/google/uuid"
)

// User represents a registered user
type User struct {
	ID           uuid.UUID  `json:"id"`
	Email        string     `json:"email"`
	Username     string     `json:"username"`
	DisplayName  string     `json:"display_name"`
	PasswordHash string     `json:"-"`
	AvatarURL    *string    `json:"avatar_url"`
	BannerURL    *string    `json:"banner_url"`
	Bio          *string    `json:"bio"`
	Status       string     `json:"status"`
	CustomStatus *string    `json:"custom_status"`
	Presence     string     `json:"presence"`
	TotpSecret   *string    `json:"-"`
	TotpEnabled  bool       `json:"totp_enabled"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	DeletedAt    *time.Time `json:"-"`
}

// Community represents a server/guild
type Community struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	IconURL     *string    `json:"icon_url"`
	BannerURL   *string    `json:"banner_url"`
	OwnerID     uuid.UUID  `json:"owner_id"`
	Visibility  string     `json:"visibility"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `json:"-"`
}

// CommunitySearchResult includes member_count for discovery
type CommunitySearchResult struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	IconURL     *string   `json:"icon_url"`
	BannerURL   *string   `json:"banner_url"`
	OwnerID     uuid.UUID `json:"owner_id"`
	Visibility  string    `json:"visibility"`
	MemberCount int       `json:"member_count"`
	CreatedAt   time.Time `json:"created_at"`
}

// Channel types
const (
	ChannelTypeText         = "text"
	ChannelTypeAnnouncement = "announcement"
	ChannelTypeVoice        = "voice"
	ChannelTypeCategory     = "category"
)

// Channel represents a channel within a community
type Channel struct {
	ID          uuid.UUID  `json:"id"`
	CommunityID uuid.UUID  `json:"community_id"`
	ParentID    *uuid.UUID `json:"parent_id"`
	Name        string     `json:"name"`
	Topic       *string    `json:"topic"`
	Type        string     `json:"type"`
	Position    int        `json:"position"`
	IsPrivate   bool       `json:"is_private"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// Message represents a chat message
type Message struct {
	ID        uuid.UUID  `json:"id"`
	ChannelID uuid.UUID  `json:"channel_id"`
	AuthorID  uuid.UUID  `json:"author_id"`
	Content   string     `json:"content"`
	ReplyToID *uuid.UUID `json:"reply_to_id"`
	Pinned    bool       `json:"pinned"`
	EditedAt  *time.Time `json:"edited_at"`
	CreatedAt time.Time  `json:"created_at"`
	DeletedAt *time.Time `json:"-"`

	// Joined fields (not stored directly)
	Author      *User         `json:"author,omitempty"`
	Attachments []Attachment  `json:"attachments,omitempty"`
	Reactions   []ReactionAgg `json:"reactions,omitempty"`
}

// Attachment represents a file attached to a message
type Attachment struct {
	ID        uuid.UUID `json:"id"`
	MessageID uuid.UUID `json:"message_id"`
	FileName  string    `json:"file_name"`
	FileSize  int64     `json:"file_size"`
	MimeType  string    `json:"mime_type"`
	URL       string    `json:"url"`
	Width     *int      `json:"width,omitempty"`
	Height    *int      `json:"height,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// Reaction represents a single user's reaction
type Reaction struct {
	ID        uuid.UUID `json:"id"`
	MessageID uuid.UUID `json:"message_id"`
	UserID    uuid.UUID `json:"user_id"`
	Emoji     string    `json:"emoji"`
	CreatedAt time.Time `json:"created_at"`
}

// ReactionAgg is an aggregated reaction for display
type ReactionAgg struct {
	Emoji string `json:"emoji"`
	Count int    `json:"count"`
	Me    bool   `json:"me"`
}

// Role represents a role in a community
type Role struct {
	ID          uuid.UUID `json:"id"`
	CommunityID uuid.UUID `json:"community_id"`
	Name        string    `json:"name"`
	Color       *string   `json:"color"`
	Position    int       `json:"position"`
	Permissions int64     `json:"permissions"`
	IsDefault   bool      `json:"is_default"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Permission flags
const (
	PermAdmin           int64 = 1 << 0
	PermManageCommunity int64 = 1 << 1
	PermManageChannels  int64 = 1 << 2
	PermManageRoles     int64 = 1 << 3
	PermManageMessages  int64 = 1 << 4
	PermManageMembers   int64 = 1 << 5
	PermSendMessages    int64 = 1 << 6
	PermReadMessages    int64 = 1 << 7
	PermAttachFiles     int64 = 1 << 8
	PermConnect         int64 = 1 << 9
	PermSpeak           int64 = 1 << 10
	PermVideo           int64 = 1 << 11
	PermMuteMembers     int64 = 1 << 12
	PermDeafenMembers   int64 = 1 << 13
	PermMoveMembers     int64 = 1 << 14
	PermMentionEveryone int64 = 1 << 15
	PermManageWebhooks  int64 = 1 << 16
	PermViewAuditLog    int64 = 1 << 17
	PermCreateInvite    int64 = 1 << 18
	PermUseReactions    int64 = 1 << 19
	PermShareScreen     int64 = 1 << 20
)

// Default member permissions
const DefaultPermissions = PermSendMessages | PermReadMessages | PermAttachFiles |
	PermConnect | PermSpeak | PermVideo | PermCreateInvite | PermUseReactions | PermShareScreen

// CommunityMember is the join between user and community
type CommunityMember struct {
	UserID       uuid.UUID  `json:"user_id"`
	CommunityID  uuid.UUID  `json:"community_id"`
	Nickname     *string    `json:"nickname"`
	JoinedAt     time.Time  `json:"joined_at"`
	TimeoutUntil *time.Time `json:"timeout_until,omitempty"`

	User  *User  `json:"user,omitempty"`
	Roles []Role `json:"roles,omitempty"`
}

// MemberRole maps a member to a role
type MemberRole struct {
	UserID      uuid.UUID `json:"user_id"`
	CommunityID uuid.UUID `json:"community_id"`
	RoleID      uuid.UUID `json:"role_id"`
}

// Invite to a community
type Invite struct {
	ID          uuid.UUID  `json:"id"`
	Code        string     `json:"code"`
	CommunityID uuid.UUID  `json:"community_id"`
	CreatorID   uuid.UUID  `json:"creator_id"`
	MaxUses     *int       `json:"max_uses"`
	Uses        int        `json:"uses"`
	ExpiresAt   *time.Time `json:"expires_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

// DirectMessage channel (DM / Group DM)
type DMChannel struct {
	ID        uuid.UUID  `json:"id"`
	Name      *string    `json:"name"`
	IsGroup   bool       `json:"is_group"`
	OwnerID   *uuid.UUID `json:"owner_id"`
	CreatedAt time.Time  `json:"created_at"`
}

// DMChannelMember associates users with DM channels
type DMChannelMember struct {
	ChannelID uuid.UUID `json:"channel_id"`
	UserID    uuid.UUID `json:"user_id"`
	JoinedAt  time.Time `json:"joined_at"`
}

// DMMessage represents a message in a DM channel
type DMMessage struct {
	ID        uuid.UUID  `json:"id"`
	ChannelID uuid.UUID  `json:"channel_id"`
	AuthorID  uuid.UUID  `json:"author_id"`
	Content   string     `json:"content"`
	ReplyToID *uuid.UUID `json:"reply_to_id"`
	EditedAt  *time.Time `json:"edited_at"`
	CreatedAt time.Time  `json:"created_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`

	Author *User `json:"author,omitempty"`
}

// DMChannelWithMembers is a DMChannel with its member list populated
type DMChannelWithMembers struct {
	DMChannel
	Members []User `json:"members"`
}

// ReadState tracks read/unread state
type ReadState struct {
	UserID        uuid.UUID `json:"user_id"`
	ChannelID     uuid.UUID `json:"channel_id"`
	LastMessageID uuid.UUID `json:"last_message_id"`
	MentionCount  int       `json:"mention_count"`
}

// AuditLog entry
type AuditLogEntry struct {
	ID          uuid.UUID `json:"id"`
	CommunityID uuid.UUID `json:"community_id"`
	ActorID     uuid.UUID `json:"actor_id"`
	Action      string    `json:"action"`
	TargetType  string    `json:"target_type"`
	TargetID    uuid.UUID `json:"target_id"`
	Changes     *string   `json:"changes"` // JSON string or null
	CreatedAt   time.Time `json:"created_at"`
}

// Webhook
type Webhook struct {
	ID          uuid.UUID `json:"id"`
	CommunityID uuid.UUID `json:"community_id"`
	ChannelID   uuid.UUID `json:"channel_id"`
	Name        string    `json:"name"`
	Token       string    `json:"-"`
	AvatarURL   *string   `json:"avatar_url"`
	CreatorID   uuid.UUID `json:"creator_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Ban record
type Ban struct {
	UserID      uuid.UUID `json:"user_id"`
	CommunityID uuid.UUID `json:"community_id"`
	Reason      *string   `json:"reason"`
	BannedBy    uuid.UUID `json:"banned_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// ChannelPermissionOverwrite for per-role channel perms
type ChannelPermissionOverwrite struct {
	ChannelID uuid.UUID `json:"channel_id"`
	RoleID    uuid.UUID `json:"role_id"`
	Allow     int64     `json:"allow"`
	Deny      int64     `json:"deny"`
}

// RefreshToken stored in DB for token rotation
type RefreshToken struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	TokenHash string    `json:"-"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
	Revoked   bool      `json:"revoked"`
}

// CustomEmoji for communities
type CustomEmoji struct {
	ID          uuid.UUID `json:"id"`
	CommunityID uuid.UUID `json:"community_id"`
	Name        string    `json:"name"`
	URL         string    `json:"url"`
	CreatorID   uuid.UUID `json:"creator_id"`
	CreatedAt   time.Time `json:"created_at"`
}

// VoiceState represents a user's connection to a voice channel
type VoiceState struct {
	UserID      uuid.UUID `json:"user_id"`
	ChannelID   uuid.UUID `json:"channel_id"`
	CommunityID uuid.UUID `json:"community_id"`
	SelfMute    bool      `json:"self_mute"`
	SelfDeaf    bool      `json:"self_deaf"`
	ServerMute  bool      `json:"server_mute"`
	ServerDeaf  bool      `json:"server_deaf"`
	Streaming   bool      `json:"streaming"`
	JoinedAt    time.Time `json:"joined_at"`

	// Joined field (not stored directly)
	User *User `json:"user,omitempty"`
}

// ScreenShareSession tracks an active screen share (in-memory only, not persisted)
type ScreenShareSession struct {
	UserID    uuid.UUID `json:"user_id"`
	ChannelID uuid.UUID `json:"channel_id"`
	StreamID  string    `json:"stream_id"`
	Quality   string    `json:"quality"` // "480p30", "720p60", "1080p60", "1440p60"
	HasAudio  bool      `json:"has_audio"`
}

// SearchResult represents a search hit for full-text message search
type SearchResult struct {
	MessageID         uuid.UUID `json:"message_id"`
	ChannelID         uuid.UUID `json:"channel_id"`
	AuthorID          uuid.UUID `json:"author_id"`
	Content           string    `json:"content"`
	CreatedAt         time.Time `json:"created_at"`
	AuthorUserID      uuid.UUID `json:"-"` // same as AuthorID, used for scan
	AuthorUsername    string    `json:"author_username"`
	AuthorDisplayName string    `json:"author_display_name"`
	AuthorAvatarURL   *string   `json:"author_avatar_url"`
	ChannelName       string    `json:"channel_name"`
	CommunityID       uuid.UUID `json:"community_id"`
	CommunityName     string    `json:"community_name"`
	Relevance         float64   `json:"relevance"`
}

// Embed represents a link preview extracted from a message
type Embed struct {
	URL         string `json:"url"`
	Type        string `json:"type"` // "link", "image", "video"
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	SiteName    string `json:"site_name,omitempty"`
	ImageURL    string `json:"image_url,omitempty"`
	Color       string `json:"color,omitempty"`
}

// Notification types
const (
	NotifTypeMention = "mention"
	NotifTypeReply   = "reply"
	NotifTypeDM      = "dm"
	NotifTypeSystem  = "system"
)

// Notification
type Notification struct {
	ID         uuid.UUID  `json:"id"`
	UserID     uuid.UUID  `json:"user_id"`
	Type       string     `json:"type"`
	Title      string     `json:"title"`
	Body       string     `json:"body"`
	ResourceID *uuid.UUID `json:"resource_id"`
	Read       bool       `json:"read"`
	CreatedAt  time.Time  `json:"created_at"`
}
