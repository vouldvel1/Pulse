# Pulse Backend

A self-hosted Discord alternative built with Go. The backend provides a REST API, WebSocket real-time communication, and voice/video capabilities.

## Architecture

### Tech Stack

- **Go 1.24** - Core language
- **PostgreSQL** - Primary database (via pgx/v5)
- **Redis** - Caching, rate limiting, session storage
- **MinIO** - File storage (S3-compatible)
- **LiveKit** - WebRTC media server for voice/video
- **gorilla/websocket** - WebSocket handling

### Project Structure

```
backend/
├── cmd/server/          # Entry point
├── internal/
│   ├── api/             # HTTP handlers
│   ├── db/              # Database queries
│   ├── ws/              # WebSocket hub
│   ├── signaling/       # WebRTC voice signaling
│   ├── middleware/      # Auth, CORS, rate limiting
│   ├── config/          # Configuration loading
│   ├── models/          # Data models
│   ├── cache/           # Redis client
│   └── storage/          # MinIO client
└── migrations/          # SQL migrations
```

### Component Overview

| Component | Responsibility |
|-----------|----------------|
| `api/` | HTTP handlers for all REST endpoints |
| `db/` | Database query objects using pgx |
| `ws/` | WebSocket hub for real-time events |
| `signaling/` | WebRTC voice/video room management |
| `middleware/` | JWT auth, CORS, rate limiting |
| `cache/` | Redis operations |
| `storage/` | File uploads to MinIO |

### API Patterns

- **RESTful endpoints** with JSON responses
- **JWT authentication** with access/refresh token rotation
- **WebSocket** for real-time events (messages, presence, voice)
- **Error responses**: `{"error": "message", "code": "optional_code"}`
- **Paginated responses**: `{"data": [], "total": 100, "page": 1, "per_page": 50, "total_pages": 2}`

## Dependencies

### Direct Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `github.com/golang-jwt/jwt/v5` | v5.2.1 | JWT authentication |
| `github.com/google/uuid` | v1.6.0 | UUID generation |
| `github.com/gorilla/websocket` | v1.5.3 | WebSocket handling |
| `github.com/jackc/pgx/v5` | v5.7.1 | PostgreSQL driver |
| `github.com/livekit/protocol` | v1.44.0 | WebRTC protocol |
| `github.com/minio/minio-go/v7` | v7.0.77 | S3-compatible storage |
| `github.com/redis/go-redis/v9` | v9.11.0 | Redis client |
| `golang.org/x/crypto` | v0.48.0 | Bcrypt password hashing |

## API Schema

### Authentication

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/register` | POST | No | Register new user |
| `/api/auth/login` | POST | No | Login, returns tokens |
| `/api/auth/refresh` | POST | No | Refresh access token |
| `/api/auth/logout` | POST | Yes | Revoke refresh token |
| `/api/auth/me` | GET | Yes | Get current user |

### Users

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/users/search` | GET | Yes | Search users by username |
| `/api/users/me` | PATCH | Yes | Update profile |
| `/api/users/me/avatar` | POST | Yes | Upload avatar |
| `/api/users/me/banner` | POST | Yes | Upload banner |
| `/api/users/me/password` | PUT | Yes | Change password |
| `/api/users/me` | DELETE | Yes | Delete account |

### Communities

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/communities` | POST | Yes | Create community |
| `/api/communities` | GET | Yes | List user's communities |
| `/api/communities/search` | GET | Yes | Search public communities |
| `/api/communities/{id}` | GET | Yes | Get community |
| `/api/communities/{id}` | PATCH | Yes | Update community |
| `/api/communities/{id}` | DELETE | Yes | Delete community |
| `/api/communities/{id}/members` | GET | Yes | List members |
| `/api/communities/{id}/join` | POST | Yes | Join public community |
| `/api/communities/{id}/members/me` | DELETE | Yes | Leave community |

### Channels

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/communities/{id}/channels` | POST | Yes | Create channel |
| `/api/communities/{id}/channels` | GET | Yes | List channels |
| `/api/channels/{id}` | GET | Yes | Get channel |
| `/api/channels/{id}` | PATCH | Yes | Update channel |
| `/api/channels/{id}` | DELETE | Yes | Delete channel |
| `/api/channels/{id}/permissions/{roleId}` | PUT | Yes | Set permission overwrite |
| `/api/channels/{id}/permissions/{roleId}` | DELETE | Yes | Delete permission overwrite |

### Messages

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/channels/{id}/messages` | POST | Yes | Send message |
| `/api/channels/{id}/messages` | GET | Yes | List messages |
| `/api/channels/{channelId}/messages/{messageId}` | PATCH | Yes | Edit message |
| `/api/channels/{channelId}/messages/{messageId}` | DELETE | Yes | Delete message |
| `/api/channels/{id}/pins` | GET | Yes | Get pinned messages |
| `/api/channels/{channelId}/messages/{messageId}/pin` | PUT | Yes | Pin message |
| `/api/channels/{channelId}/messages/{messageId}/pin` | DELETE | Yes | Unpin message |
| `/api/channels/{channelId}/messages/{messageId}/reactions/{emoji}` | PUT | Yes | Add reaction |
| `/api/channels/{channelId}/messages/{messageId}/reactions/{emoji}` | DELETE | Yes | Remove reaction |

### Invites

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/invites/{code}` | GET | No | Get invite info |
| `/api/invites/{code}/join` | POST | Yes | Join via invite |
| `/api/communities/{id}/invites` | POST | Yes | Create invite |
| `/api/communities/{id}/invites` | GET | Yes | List invites |
| `/api/invites/{id}` | DELETE | Yes | Delete invite |

### Roles

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/communities/{id}/roles` | POST | Yes | Create role |
| `/api/communities/{id}/roles` | GET | Yes | List roles |
| `/api/roles/{id}` | PATCH | Yes | Update role |
| `/api/roles/{id}` | DELETE | Yes | Delete role |
| `/api/communities/{id}/roles/reorder` | PATCH | Yes | Reorder roles |
| `/api/communities/{id}/members/{userId}/roles/{roleId}` | PUT | Yes | Assign role |
| `/api/communities/{id}/members/{userId}/roles/{roleId}` | DELETE | Yes | Remove role |
| `/api/communities/{id}/members/{userId}/roles` | GET | Yes | Get member's roles |

### Audit Log

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/communities/{id}/audit-log` | GET | Yes | List audit log entries |

### Direct Messages

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/dm/channels` | POST | Yes | Create DM channel |
| `/api/dm/channels/group` | POST | Yes | Create group DM |
| `/api/dm/channels` | GET | Yes | List DM channels |
| `/api/dm/channels/{id}` | GET | Yes | Get DM channel |
| `/api/dm/channels/{id}/messages` | POST | Yes | Send DM message |
| `/api/dm/channels/{id}/messages` | GET | Yes | List DM messages |
| `/api/dm/channels/{channelId}/messages/{messageId}` | PATCH | Yes | Edit DM message |
| `/api/dm/channels/{channelId}/messages/{messageId}` | DELETE | Yes | Delete DM message |

### Notifications

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/notifications` | GET | Yes | List notifications |
| `/api/notifications/unread-count` | GET | Yes | Get unread count |
| `/api/notifications/{id}/read` | PATCH | Yes | Mark as read |
| `/api/notifications/read-all` | POST | Yes | Mark all as read |
| `/api/notifications/{id}` | DELETE | Yes | Delete notification |

### Voice

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/voice/channels/{id}/join` | POST | Yes | Join voice channel |
| `/api/voice/leave` | POST | Yes | Leave voice channel |
| `/api/voice/state` | PATCH | Yes | Update voice state (mute/deafen) |
| `/api/voice/channels/{id}/participants` | GET | Yes | Get voice participants |

### Other

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/search` | GET | Yes | Full-text search |
| `/api/channels/{id}/upload` | POST | Yes | Upload file |
| `/ws` | GET | Yes | WebSocket endpoint |

## WebSocket Events

### Client -> Server

| Event | Payload | Description |
|-------|---------|-------------|
| `ping` | - | Keep-alive |
| `channel_join` | `{"channel_id": "uuid"}` | Subscribe to channel |
| `channel_leave` | `{"channel_id": "uuid"}` | Unsubscribe from channel |
| `typing` | `{"channel_id": "uuid"}` | Typing indicator |
| `presence` | `{"status': "online / offline / dnd"} ` | Update presence |
| `voice_join` | `{"channel_id": "uuid"}` | Join voice |
| `voice_leave` | - | Leave voice |
| `voice_state` | `{"self_mute": bool, "self_deaf": bool}` | Update voice state |
| `voice:speaking` | `{"is_speaking": bool}` | Speaking indicator |
| `screen_share_offer` | `{"target_user_id": "uuid", "channel_id": "uuid", "sdp": "..."}` |
| `screen_share_answer` | `{"target_user_id": "uuid", "channel_id": "uuid", "sdp": "..."}` |
| `ice_candidate` | `{"target_user_id": "uuid", "channel_id": "uuid", "candidate": "...", "target": "peer|sfu"}` |

### Server -> Client

| Event | Description |
|-------|-------------|
| `ready` | Initial connection ack |
| `pong` | Ping response |
| `message` | New message |
| `message_edit` | Message edited |
| `message_delete` | Message deleted |
| `typing` | User typing |
| `presence` | User presence change |
| `channel_join` | Member joined channel |
| `channel_leave` | Member left channel |
| `reaction` | Reaction added |
| `reaction_remove` | Reaction removed |
| `notification` | Notification received |
| `voice_join` | User joined voice |
| `voice_leave` | User left voice |
| `voice_state` | Voice state changed |
| `member_join` | Member joined community |
| `member_leave` | Member left community |
| `member_update` | Member updated |
| `community_update` | Community updated |
| `channel_update` | Channel updated |
| `error` | Error occurred |

## Database Schema

### Tables

#### users

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | VARCHAR(255) | Unique email |
| username | VARCHAR(32) | Unique username |
| display_name | VARCHAR(64) | Display name |
| password_hash | VARCHAR(255) | Bcrypt hash |
| avatar_url | TEXT | Avatar image URL |
| banner_url | TEXT | Banner image URL |
| bio | TEXT | User bio |
| status | VARCHAR(32) | User status text |
| custom_status | VARCHAR(128) | Custom status |
| presence | VARCHAR(16) | online/offline/dnd |
| totp_secret | VARCHAR(64) | TOTP secret |
| totp_enabled | BOOLEAN | 2FA enabled |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |
| deleted_at | TIMESTAMPTZ | Soft delete |

#### communities

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(100) | Community name |
| description | TEXT | Community description |
| icon_url | TEXT | Icon image URL |
| banner_url | TEXT | Banner image URL |
| owner_id | UUID | Owner user FK |
| visibility | VARCHAR(16) | public/private |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |
| deleted_at | TIMESTAMPTZ | Soft delete |

#### channels

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| community_id | UUID | Community FK |
| parent_id | UUID | Parent channel (category) |
| name | VARCHAR(100) | Channel name |
| topic | TEXT | Channel topic |
| type | VARCHAR(20) | text/announcement/voice/category |
| position | INT | Sort position |
| is_private | BOOLEAN | Private channel |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

#### messages

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| channel_id | UUID | Channel FK |
| author_id | UUID | Author user FK |
| content | TEXT | Message content |
| reply_to_id | UUID | Reply target FK |
| pinned | BOOLEAN | Pinned flag |
| edited_at | TIMESTAMPTZ | Edit timestamp |
| created_at | TIMESTAMPTZ | Creation time |
| deleted_at | TIMESTAMPTZ | Soft delete |

#### attachments

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| message_id | UUID | Message FK |
| file_name | VARCHAR(255) | Original filename |
| file_size | BIGINT | File size in bytes |
| mime_type | VARCHAR(128) | MIME type |
| url | TEXT | File URL |
| width | INT | Image width |
| height | INT | Image height |
| created_at | TIMESTAMPTZ | Creation time |

#### reactions

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| message_id | UUID | Message FK |
| user_id | UUID | User FK |
| emoji | VARCHAR(64) | Emoji string |
| created_at | TIMESTAMPTZ | Creation time |

#### roles

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| community_id | UUID | Community FK |
| name | VARCHAR(64) | Role name |
| color | VARCHAR(7) | Hex color |
| position | INT | Sort position |
| permissions | BIGINT | Permission flags |
| is_default | BOOLEAN | Default role for new members |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

#### community_members

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | User FK |
| community_id | UUID | Community FK |
| nickname | VARCHAR(64) | Server nickname |
| joined_at | TIMESTAMPTZ | Join time |
| timeout_until | TIMESTAMPTZ | Timeout expiry |

#### member_roles

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | User FK |
| community_id | UUID | Community FK |
| role_id | UUID | Role FK |

#### invites

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| code | VARCHAR(16) | Unique invite code |
| community_id | UUID | Community FK |
| creator_id | UUID | Creator user FK |
| max_uses | INT | Max uses (null = unlimited) |
| uses | INT | Current use count |
| expires_at | TIMESTAMPTZ | Expiration time |
| created_at | TIMESTAMPTZ | Creation time |

#### dm_channels

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(100) | Group DM name |
| is_group | BOOLEAN | Group DM flag |
| owner_id | UUID | Owner user FK |
| created_at | TIMESTAMPTZ | Creation time |

#### dm_channel_members

| Column | Type | Description |
|--------|------|-------------|
| channel_id | UUID | DM channel FK |
| user_id | UUID | User FK |
| joined_at | TIMESTAMPTZ | Join time |

#### dm_messages

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| channel_id | UUID | DM channel FK |
| author_id | UUID | Author user FK |
| content | TEXT | Message content |
| reply_to_id | UUID | Reply target FK |
| edited_at | TIMESTAMPTZ | Edit timestamp |
| created_at | TIMESTAMPTZ | Creation time |
| deleted_at | TIMESTAMPTZ | Soft delete |

#### read_states

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | User FK |
| channel_id | UUID | Channel FK |
| last_message_id | UUID | Last read message |
| mention_count | INT | Unread mentions |

#### bans

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | Banned user FK |
| community_id | UUID | Community FK |
| reason | TEXT | Ban reason |
| banned_by | UUID | Moderator FK |
| created_at | TIMESTAMPTZ | Ban time |

#### audit_log

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| community_id | UUID | Community FK |
| actor_id | UUID | Actor user FK |
| action | VARCHAR(64) | Action type |
| target_type | VARCHAR(32) | Target type |
| target_id | UUID | Target ID |
| changes | JSONB | Change data |
| created_at | TIMESTAMPTZ | Action time |

#### channel_permission_overwrites

| Column | Type | Description |
|--------|------|-------------|
| channel_id | UUID | Channel FK |
| role_id | UUID | Role FK |
| allow | BIGINT | Allowed permissions |
| deny | BIGINT | Denied permissions |

#### refresh_tokens

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User FK |
| token_hash | VARCHAR(255) | Token hash |
| expires_at | TIMESTAMPTZ | Expiration |
| created_at | TIMESTAMPTZ | Creation time |
| revoked | BOOLEAN | Revoked flag |

#### notifications

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Target user FK |
| type | VARCHAR(32) | mention/reply/dm/system |
| title | VARCHAR(255) | Notification title |
| body | TEXT | Notification body |
| resource_id | UUID | Related resource |
| read | BOOLEAN | Read flag |
| created_at | TIMESTAMPTZ | Creation time |

#### voice_states

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | User FK |
| channel_id | UUID | Voice channel FK |
| community_id | UUID | Community FK |
| self_mute | BOOLEAN | Self muted |
| self_deaf | BOOLEAN | Self deafened |
| server_mute | BOOLEAN | Server muted |
| server_deaf | BOOLEAN | Server deafened |
| streaming | BOOLEAN | Streaming |
| joined_at | TIMESTAMPTZ | Join time |

### Permission Flags

| Flag | Value | Description |
|------|-------|-------------|
| PermAdmin | 1 << 0 | Full access |
| PermManageCommunity | 1 << 1 | Manage community settings |
| PermManageChannels | 1 << 2 | Create/delete channels |
| PermManageRoles | 1 << 3 | Manage roles |
| PermManageMessages | 1 << 4 | Delete any message |
| PermManageMembers | 1 << 5 | Kick/ban members |
| PermSendMessages | 1 << 6 | Send messages |
| PermReadMessages | 1 << 7 | Read messages |
| PermAttachFiles | 1 << 8 | Upload files |
| PermConnect | 1 << 9 | Connect to voice |
| PermSpeak | 1 << 10 | Speak in voice |
| PermVideo | 1 << 11 | Video streaming |
| PermMuteMembers | 1 << 12 | Mute others |
| PermDeafenMembers | 1 << 13 | Deafen others |
| PermMoveMembers | 1 << 14 | Move between channels |
| PermMentionEveryone | 1 << 15 | @everyone mention |
| PermManageWebhooks | 1 << 16 | Manage webhooks |
| PermViewAuditLog | 1 << 17 | View audit log |
| PermCreateInvite | 1 << 18 | Create invites |
| PermUseReactions | 1 << 19 | Use reactions |
| PermShareScreen | 1 << 20 | Share screen |

Default permissions for new members:
`PermSendMessages | PermReadMessages | PermAttachFiles | PermConnect | PermSpeak | PermVideo | PermCreateInvite | PermUseReactions | PermShareScreen`

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| APP_ENV | production | Environment |
| DOMAIN | localhost | Domain for CORS |
| API_PORT | 8080 | HTTP server port |
| POSTGRES_HOST | localhost | Database host |
| POSTGRES_PORT | 5432 | Database port |
| POSTGRES_USER | pulse | Database user |
| POSTGRES_PASSWORD | - | Database password |
| POSTGRES_DB | pulse | Database name |
| REDIS_HOST | localhost | Redis host |
| REDIS_PORT | 6379 | Redis port |
| REDIS_PASSWORD | - | Redis password |
| MINIO_ENDPOINT | localhost:9000 | MinIO endpoint |
| MINIO_ROOT_USER | - | MinIO access key |
| MINIO_ROOT_PASSWORD | - | MinIO secret key |
| MINIO_BUCKET | pulse-uploads | Bucket name |
| MINIO_USE_SSL | false | Use SSL |
| JWT_SECRET | - | JWT signing secret |
| JWT_ACCESS_EXPIRY | 15m | Access token expiry |
| JWT_REFRESH_EXPIRY | 168h | Refresh token expiry |
| BCRYPT_COST | 12 | Password hashing cost |
| MAX_UPLOAD_SIZE | 52428800 | Max upload size (50MB) |
| RATE_LIMIT_RPS | 60 | Requests per second |
| RATE_LIMIT_BURST | 120 | Rate limit burst |
| LIVEKIT_API_KEY | devkey | LiveKit API key |
| LIVEKIT_API_SECRET | - | LiveKit API secret |
| LIVEKIT_URL | ws://livekit:7880 | Internal LiveKit URL |
| LIVEKIT_WS_URL | ws://127.0.0.1:7880 | Public LiveKit URL |

## Running

### Docker (Recommended)

```bash
cd backend
cp .env.example .env
docker compose up -d
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed setup.

### Local Development

```bash
# Run server
go run ./cmd/server

# Build binary
go build ./cmd/server

# Run migrations
# (handled automatically on startup)
```

## Testing

```bash
go test ./...
go vet ./...
```
