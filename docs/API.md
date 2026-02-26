# API Reference

Base URL: `/api`

All authenticated endpoints require `Authorization: Bearer <access_token>` header.

---

## Authentication

### POST /api/auth/register

Create a new user account.

**Body:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePass123!",
  "display_name": "John Doe"
}
```

**Response:** `201 Created`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "...",
  "expires_in": 900,
  "user": { "id": "uuid", "email": "...", "username": "...", ... }
}
```

### POST /api/auth/login

**Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:** `200 OK` — Same as register response.

### POST /api/auth/refresh

**Body:**
```json
{ "refresh_token": "..." }
```

**Response:** `200 OK` — New access + refresh tokens.

### POST /api/auth/logout (auth required)

Revokes the current refresh token.

### GET /api/auth/me (auth required)

Returns the authenticated user's profile.

---

## Users

### GET /api/users/search?q=username (auth required)

Search for users by username.

**Query params:**
- `q` (required) — Search query (minimum 1 character)
- `limit` (1-50, default 20)

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "username": "johndoe",
    "display_name": "John Doe",
    "avatar_url": "https://...",
    "bio": "Hello world"
  }
]
```

### PATCH /api/users/me (auth required)

Update your profile.

**Body:**
```json
{
  "display_name": "John Doe",
  "bio": "Hello world",
  "custom_status": "Working on something",
  "username": "johndoe",
  "email": "john@example.com"
}
```

**Response:** `200 OK` — Returns updated user object.

### POST /api/users/me/avatar (auth required)

Upload a new avatar image.

**Form fields:**
- `file` — Image file (max 8MB, JPEG/PNG/GIF/WebP)

**Response:** `200 OK` — Returns updated user object.

### POST /api/users/me/banner (auth required)

Upload a new banner image.

**Form fields:**
- `file` — Image file (max 8MB, JPEG/PNG/GIF/WebP)

**Response:** `200 OK` — Returns updated user object.

### PUT /api/users/me/password (auth required)

Change your password.

**Body:**
```json
{
  "current_password": "OldPass123!",
  "new_password": "NewPass123!"
}
```

**Response:** `200 OK`
```json
{ "message": "password changed" }
```

### DELETE /api/users/me (auth required)

Delete your account.

**Body:**
```json
{ "password": "MyPassword123!" }
```

**Response:** `200 OK`
```json
{ "message": "account deleted" }
```

---

## Communities

### POST /api/communities

Create a new community. Creator becomes owner.

**Body:**
```json
{
  "name": "My Server",
  "description": "A cool server"
}
```

### GET /api/communities

List communities the authenticated user belongs to.

### GET /api/communities/search?q=name (auth required)

Search for public communities.

**Query params:**
- `q` (required) — Search query
- `limit` (1-50, default 20)

### GET /api/communities/{id}

Get a community by ID.

### PATCH /api/communities/{id}

Update a community (owner/admin only).

**Body:**
```json
{
  "name": "New Name",
  "description": "Updated description"
}
```

### DELETE /api/communities/{id}

Soft-delete a community (owner only).

### GET /api/communities/{id}/members

List community members with user info and roles.

### DELETE /api/communities/{id}/members/me

Leave a community (cannot leave if owner).

### POST /api/communities/{id}/join (auth required)

Join a public community.

**Response:** `200 OK`

---

## Channels

### POST /api/communities/{id}/channels

Create a channel in a community.

**Body:**
```json
{
  "name": "general",
  "type": "text",
  "topic": "General discussion"
}
```

Channel types: `text`, `announcement`, `voice`, `category`

### GET /api/communities/{id}/channels

List all channels in a community.

### GET /api/channels/{id}

Get a channel by ID.

### PATCH /api/channels/{id}

Update a channel.

### DELETE /api/channels/{id}

Delete a channel.

### PUT /api/channels/{id}/permissions/{roleId}

Set permission overwrite for a role on a channel.

**Body:**
```json
{ "allow": 192, "deny": 0 }
```

### DELETE /api/channels/{id}/permissions/{roleId}

Remove a permission overwrite.

---

## Messages

### POST /api/channels/{id}/messages

Send a message.

**Body:**
```json
{
  "content": "Hello, world!",
  "reply_to_id": null
}
```

### GET /api/channels/{id}/messages?limit=50&before=uuid

List messages with cursor-based pagination.

**Query params:**
- `limit` (1-100, default 50)
- `before` (message UUID for pagination cursor)

### PATCH /api/channels/{channelId}/messages/{messageId}

Edit a message (author only).

**Body:**
```json
{ "content": "Updated content" }
```

### DELETE /api/channels/{channelId}/messages/{messageId}

Delete a message (author or moderator with manage_messages permission).

### GET /api/channels/{id}/pins

Get pinned messages in a channel.

### PUT /api/channels/{channelId}/messages/{messageId}/pin

Pin a message.

### DELETE /api/channels/{channelId}/messages/{messageId}/pin

Unpin a message.

### PUT /api/channels/{channelId}/messages/{messageId}/reactions/{emoji}

Add a reaction to a message.

### DELETE /api/channels/{channelId}/messages/{messageId}/reactions/{emoji}

Remove your reaction from a message.

---

## File Uploads

### POST /api/channels/{id}/upload

Upload a file attachment. Uses multipart form data.

**Form fields:**
- `file` — The file to upload (max 25MB)
- `content` (optional) — Message text

Validated MIME types: images, videos, audio, documents, archives.

---

## Invites

### POST /api/communities/{id}/invites

Create an invite link.

**Body:**
```json
{
  "max_uses": 10,
  "expires_in_hours": 24
}
```

### GET /api/invites/{code}

Get invite info (public endpoint).

### POST /api/invites/{code}/join

Join a community via invite code.

### GET /api/communities/{id}/invites

List all invites for a community.

### DELETE /api/invites/{id}

Delete an invite.

---

## Roles

### POST /api/communities/{id}/roles

Create a role.

**Body:**
```json
{
  "name": "Moderator",
  "color": "#3b82f6",
  "permissions": 240
}
```

### GET /api/communities/{id}/roles

List all roles in a community.

### PATCH /api/roles/{id}

Update a role (name, color, permissions).

### DELETE /api/roles/{id}

Delete a role (cannot delete @everyone).

### PATCH /api/communities/{id}/roles/reorder

Reorder roles.

**Body:**
```json
{
  "role_ids": ["uuid1", "uuid2", "uuid3"]
}
```

### PUT /api/communities/{id}/members/{userId}/roles/{roleId}

Assign a role to a member.

### DELETE /api/communities/{id}/members/{userId}/roles/{roleId}

Remove a role from a member.

### GET /api/communities/{id}/members/{userId}/roles

Get a member's roles.

---

## Audit Log

### GET /api/communities/{id}/audit-log

List audit log entries. Requires `VIEW_AUDIT_LOG` permission.

**Query params:**
- `limit` (default 50)
- `before` (cursor UUID)
- `action` (filter by action type)
- `actor_id` (filter by actor)

---

## Direct Messages

### POST /api/dm/channels

Create a 1-on-1 DM channel.

**Body:**
```json
{ "recipient_id": "user-uuid" }
```

### POST /api/dm/channels/group

Create a group DM.

**Body:**
```json
{
  "name": "Project Team",
  "member_ids": ["uuid1", "uuid2"]
}
```

### GET /api/dm/channels

List your DM channels.

### GET /api/dm/channels/{id}

Get a DM channel with members.

### POST /api/dm/channels/{id}/messages

Send a DM message.

**Body:**
```json
{ "content": "Hey!" }
```

### GET /api/dm/channels/{id}/messages?limit=50&before=uuid

List DM messages with pagination.

### PATCH /api/dm/channels/{channelId}/messages/{messageId}

Edit a DM message.

### DELETE /api/dm/channels/{channelId}/messages/{messageId}

Delete a DM message.

---

## Notifications

### GET /api/notifications?limit=25&before=uuid&unread_only=true

List notifications.

### GET /api/notifications/unread-count

Get unread notification count.

### PATCH /api/notifications/{id}/read

Mark a notification as read.

### POST /api/notifications/read-all

Mark all notifications as read.

### DELETE /api/notifications/{id}

Delete a notification.

---

## Search

### GET /api/search?q=query&community_id=uuid&channel_id=uuid&limit=25&offset=0

Full-text search across messages in communities you belong to.

**Query params:**
- `q` (required, 2-200 chars) — Search query
- `community_id` (optional) — Filter to a specific community
- `channel_id` (optional) — Filter to a specific channel
- `limit` (1-50, default 25)
- `offset` (default 0)

**Response:**
```json
{
  "results": [
    {
      "message_id": "uuid",
      "channel_id": "uuid",
      "author_id": "uuid",
      "content": "message text",
      "created_at": "2026-01-01T00:00:00Z",
      "author_username": "john",
      "author_display_name": "John Doe",
      "author_avatar_url": null,
      "channel_name": "general",
      "community_id": "uuid",
      "community_name": "My Server",
      "relevance": 0.85
    }
  ],
  "total": 42,
  "limit": 25,
  "offset": 0
}
```

---

## Voice

### POST /api/voice/channels/{id}/join

Join a voice channel. Returns participant list and LiveKit token.

**Response:**
```json
{
  "channel_id": "uuid",
  "participants": [...],
  "token": "livekit-token",
  "livekit_url": "wss://..."
}
```

### POST /api/voice/leave

Leave the current voice channel.

### PATCH /api/voice/state

Update voice state (mute/deaf).

**Body:**
```json
{ "self_mute": true, "self_deaf": false }
```

### GET /api/voice/channels/{id}/participants

List participants in a voice channel.

---

## WebSocket Events

Connect to `/ws` with `token` query parameter.

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `channel_join` | `{ channel_id }` | Subscribe to channel events |
| `channel_leave` | `{ channel_id }` | Unsubscribe from channel events |
| `typing` | `{ channel_id }` | Typing indicator |
| `ping` | `{}` | Keep-alive |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `ready` | `{ user_id }` | Connection established |
| `message` | Message object | New message |
| `message_edit` | Message object | Message edited |
| `message_delete` | `{ id, channel_id }` | Message deleted |
| `message_embeds` | `{ message_id, channel_id, embeds }` | Link embeds for a message |
| `reaction` | Reaction object | Reaction added |
| `reaction_remove` | Reaction object | Reaction removed |
| `voice_join` | `{ user_id, channel_id, username }` | User joined voice |
| `voice_leave` | `{ user_id, channel_id, username }` | User left voice |
| `voice_state` | `{ user_id, channel_id, self_mute, self_deaf }` | Voice state changed |
| `screen_share_offer` | SDP offer | Screen share offer |
| `screen_share_answer` | SDP answer | Screen share answer |
| `ice_candidate` | ICE candidate | ICE candidate exchange |
| `sfu_negotiate` | SDP offer | SFU renegotiation |
| `role_create` | Role object | New role created |
| `role_update` | Role object | Role updated |
| `role_delete` | `{ id, community_id }` | Role deleted |
| `dm_message` | DMMessage object | New DM message |
| `dm_message_edit` | DMMessage object | DM message edited |
| `dm_message_delete` | `{ id, channel_id }` | DM message deleted |
| `dm_channel_create` | DMChannel object | New DM channel created |
| `notification` | Notification object | New notification |
| `pong` | `{}` | Keep-alive response |

---

## Permission Flags

Permissions are stored as a 64-bit integer. Each bit represents a permission:

| Bit | Value | Permission |
|-----|-------|-----------|
| 0 | 1 | Admin |
| 1 | 2 | Manage Community |
| 2 | 4 | Manage Channels |
| 3 | 8 | Manage Roles |
| 4 | 16 | Manage Messages |
| 5 | 32 | Manage Members |
| 6 | 64 | Send Messages |
| 7 | 128 | Read Messages |
| 8 | 256 | Attach Files |
| 9 | 512 | Connect (Voice) |
| 10 | 1024 | Speak |
| 11 | 2048 | Video |
| 12 | 4096 | Mute Members |
| 13 | 8192 | Deafen Members |
| 14 | 16384 | Move Members |
| 15 | 32768 | Mention Everyone |
| 16 | 65536 | Manage Webhooks |
| 17 | 131072 | View Audit Log |
| 18 | 262144 | Create Invite |
| 19 | 524288 | Use Reactions |
| 20 | 1048576 | Share Screen |

Admin (bit 0) bypasses all permission checks.
