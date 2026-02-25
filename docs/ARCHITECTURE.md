# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                        Nginx                             │
│              (reverse proxy, TLS, routing)                │
└──────┬──────────────┬──────────────┬────────────────────┘
       │              │              │
  /api/*         /ws          /storage/*
       │              │              │
       ▼              ▼              ▼
┌─────────────────────────┐  ┌─────────────┐
│      Go API Server      │  │    MinIO     │
│  REST + WebSocket Hub   │  │  (S3-compat) │
│  + WebRTC SFU (Pion)    │  └─────────────┘
└──────┬──────────┬───────┘
       │          │
       ▼          ▼
┌──────────┐ ┌─────────┐  ┌──────────┐
│PostgreSQL│ │  Redis   │  │  Coturn  │
│  (data)  │ │ (cache)  │  │ (TURN)   │
└──────────┘ └─────────┘  └──────────┘
```

## Services

### API Server (Go)

The single Go binary serves REST endpoints, WebSocket connections, and the WebRTC SFU.

**Package structure:**

```
backend/
├── cmd/server/main.go        # Entry point, route registration, dependency wiring
├── internal/
│   ├── config/config.go       # Environment-based configuration
│   ├── models/models.go       # Domain models (User, Community, Channel, Message, etc.)
│   ├── db/                    # Database access layer (one file per domain)
│   │   ├── db.go              # Pool + migration runner
│   │   ├── users.go
│   │   ├── communities.go
│   │   ├── channels.go
│   │   ├── messages.go
│   │   ├── invites.go
│   │   ├── roles.go
│   │   ├── audit_log.go
│   │   ├── dm.go
│   │   ├── notifications.go
│   │   ├── search.go
│   │   └── voice_states.go
│   ├── api/                   # HTTP handlers (one file per domain)
│   │   ├── helpers.go         # JSON read/write, error responses
│   │   ├── auth.go
│   │   ├── communities.go
│   │   ├── channels.go
│   │   ├── messages.go
│   │   ├── uploads.go
│   │   ├── invites.go
│   │   ├── roles.go
│   │   ├── audit_log.go
│   │   ├── dm.go
│   │   ├── notifications.go
│   │   ├── search.go
│   │   ├── voice.go
│   │   └── embeds.go          # URL extraction + OG metadata fetching
│   ├── middleware/             # Auth (JWT), rate limiting, CORS, logger
│   ├── ws/                    # WebSocket hub + client management
│   │   ├── hub.go             # Central pub/sub for channels
│   │   └── broadcaster.go     # Adapter for signaling package
│   ├── signaling/             # WebRTC signaling
│   │   ├── room.go            # Voice room manager
│   │   ├── sfu.go             # Pion WebRTC SFU
│   │   └── voice_ws.go        # Voice WS event handler
│   ├── cache/cache.go         # Redis client (caching, rate limits, presence)
│   └── storage/storage.go     # MinIO client (file upload/download)
└── migrations/
    ├── 001_initial_schema.up.sql
    └── 002_voice_states.up.sql
```

### Frontend (React + TypeScript)

```
frontend/src/
├── main.tsx                   # React entry
├── App.tsx                    # Root with auth routing
├── types/index.ts             # All TypeScript interfaces
├── utils/
│   ├── api.ts                 # HTTP client with token refresh
│   └── websocket.ts           # WS client with reconnection + backoff
├── stores/                    # Zustand state management
│   ├── authStore.ts
│   ├── communityStore.ts
│   ├── channelStore.ts
│   ├── messageStore.ts
│   ├── voiceStore.ts
│   ├── roleStore.ts
│   ├── dmStore.ts
│   ├── notificationStore.ts
│   └── searchStore.ts
├── hooks/
│   └── useWebRTC.ts           # WebRTC hook (SFU + P2P screen share)
└── components/
    ├── auth/AuthForm.tsx
    ├── layout/AppLayout.tsx    # Main layout, WS event wiring
    ├── community/              # CommunityList, Settings, RoleSettings, AuditLog
    ├── channel/                # ChannelSidebar, CreateChannelModal
    ├── chat/                   # ChatView, MessageItem, MessageInput
    ├── voice/                  # VoicePanel, ScreenShare
    ├── dm/                     # DMList, DMChatView
    ├── notifications/          # NotificationPanel
    └── search/                 # SearchPanel
```

## Data Flow

### Message Send Flow

1. User types message in `MessageInput`
2. `messageStore.sendMessage()` calls `POST /api/channels/{id}/messages`
3. Backend validates permissions, inserts into PostgreSQL
4. Backend broadcasts `message` event via WebSocket hub to channel subscribers
5. Backend asynchronously extracts URLs, fetches OG metadata
6. If embeds found, broadcasts `message_embeds` event to channel subscribers
7. All connected clients receive the message via `handleNewMessage` WS handler

### WebSocket Architecture

- Single WS connection per client at `/ws`
- Clients subscribe to channels via `channel_join`/`channel_leave` events
- Hub maintains `channelID -> set of clients` mapping
- Events are typed JSON: `{ "type": "message", "payload": {...} }`
- Voice events routed through the same connection

### Authentication Flow

1. `POST /api/auth/register` or `POST /api/auth/login` returns access + refresh tokens
2. Access token (JWT, 15min) sent in `Authorization: Bearer` header
3. Refresh token (7 days) used to get new access token via `POST /api/auth/refresh`
4. API client automatically retries on 401 after refreshing

## Database Schema

20+ tables including:
- `users`, `communities`, `community_members`
- `channels`, `messages`, `attachments`, `reactions`
- `roles`, `member_roles`, `channel_permission_overwrites`
- `invites`, `audit_log`
- `dm_channels`, `dm_channel_members`, `dm_messages`
- `notifications`, `read_states`
- `voice_states`, `bans`, `webhooks`, `custom_emojis`

Full-text search uses a `search_vector tsvector` column on messages with a GIN index.

## Permission System

21 permission flags stored as a 64-bit integer on roles:
- Admin, Manage Community/Channels/Roles/Messages/Members
- Send/Read Messages, Attach Files
- Connect, Speak, Video, Share Screen
- Mute/Deafen/Move Members
- Mention Everyone, Manage Webhooks
- View Audit Log, Create Invite, Use Reactions

Channel-level overwrites (allow/deny per role) are applied on top of role permissions.
