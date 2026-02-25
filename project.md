You are a senior full-stack engineer. Your task is to build a complete, production-ready, 
self-hosted Discord alternative that can be deployed via Docker Compose.

## Project Name
FluxClone (or choose a fitting name)

## Core Tech Stack (orient on https://github.com/fluxerapp/fluxer)
- **Frontend**: TypeScript + React (or SolidJS) + CSS Modules
- **Backend API**: Go (REST + WebSocket)
- **Realtime/Presence**: Erlang/OTP (or Go with goroutines if Erlang is too complex)
- **Media/Voice signaling**: Go + WebRTC (Pion library)
- **TURN/STUN**: Coturn (self-hosted, containerized)
- **Database**: PostgreSQL + Redis (caching, sessions, pub/sub)
- **File storage**: MinIO (S3-compatible, self-hosted)
- **Auth**: JWT + refresh tokens
- **Container orchestration**: Docker Compose (production-ready)

---

## Features to Implement

### 1. Communities (Servers/Guilds)
- Create, edit, delete communities
- Invite system (invite links with expiry and usage limits)
- Roles and permissions system (Admin, Moderator, Member, custom roles)
- Member management (kick, ban, timeout)
- Community icon and banner upload

### 2. Channels
- Text channels (with categories/groups)
- Announcement channels
- Channel permissions per role
- Message history with pagination
- Channel topics and descriptions

### 3. Text Chats
- Real-time messaging via WebSocket
- Message editing and deletion
- File and image attachments (via MinIO)
- Embeds and link previews
- Reactions (emoji)
- Reply to message (threaded replies)
- Mention users (@user) and roles (@role)
- Message search
- Read/unread state tracking
- Direct Messages (DMs) between users
- Group DMs

### 4. Voice Channels
- Join/leave voice channels
- Multiple users in one channel
- Push-to-talk and Voice Activity Detection (VAD)
- Mute/deafen self
- Server mute/deafen by moderators
- User volume control per participant
- WebRTC-based using Pion (Go) for SFU (Selective Forwarding Unit)
- The SFU should only forward audio streams — no server-side decoding/encoding

### 5. Screen Sharing with P2P Priority
- Screen sharing inside voice channels
- **Architecture**: Use WebRTC P2P (peer-to-peer) by default:
  - Server acts only as a signaling relay (SDP offer/answer, ICE candidates)
  - Direct P2P connection between peers whenever possible via STUN
  - Fall back to TURN relay only when P2P is not possible (strict NAT)
  - Server NEVER receives or processes the media stream
- Quality selection by the broadcaster:
  - 480p30, 720p60, 1080p60, 1440p60 (2K), 1440p60 (2K max)
- Audio from the shared screen/application (system audio capture)
- Multiple simultaneous screen shares in one voice channel
- Viewer can watch without being in the voice channel (optional toggle)

### 6. User System
- Registration and login (email + password)
- Profile: avatar, banner, bio, status
- Custom status (text + emoji)
- Online/Idle/Do Not Disturb/Invisible presence
- Two-factor authentication (TOTP)
- Account settings

### 7. Notifications
- In-app notification system (mentions, replies, DMs)
- Notification preferences per channel/community
- Desktop push notifications (Web Push API)

### 8. Additional Important Features
- Full-text message search (using PostgreSQL FTS or Meilisearch)
- Audit log per community (who did what)
- Webhooks (incoming, for integrations)
- Emoji support (custom community emojis + Unicode)
- Keyboard shortcuts
- Dark/Light theme
- Mobile-responsive UI

---

## Docker Compose Architecture

Create a `docker-compose.yml` that includes these services:
1. `frontend` — React/SolidJS app served via Nginx
2. `api` — Go backend (REST + WebSocket)
3. `signaling` — WebRTC signaling server (Go, can be part of `api`)
4. `coturn` — TURN/STUN server for WebRTC fallback
5. `postgres` — PostgreSQL 16
6. `redis` — Redis 7
7. `minio` — Object storage for files/avatars
8. `nginx` — Reverse proxy (routes `/api`, `/ws`, `/storage`)

All services must:
- Use named volumes for data persistence
- Have health checks
- Support environment variable configuration via `.env` file
- Be network-isolated (frontend → nginx → backend only)

---

## WebRTC P2P Screen Share — Technical Specification

Implement the following flow:
1. Broadcaster sends `screen-share-offer` event via WebSocket to signaling server
2. Signaling server forwards SDP offer to all viewers in the channel
3. Each viewer responds with SDP answer directly via signaling
4. ICE candidates are exchanged through the signaling server (trickle ICE)
5. Once ICE negotiation completes, media flows directly P2P
6. If P2P fails (no common ICE candidates), fall back to TURN relay
7. Server logs only: who is sharing, to whom, start/end time — NO media data

STUN servers to configure:
- Self-hosted Coturn (primary)
- Google STUN as fallback: `stun:stun.l.google.com:19302`

---

## Project File Structure

Generate the following structure:
/
├── frontend/ # TypeScript frontend app
│ ├── src/
│ ├── public/
│ └── Dockerfile
├── backend/ # Go backend
│ ├── cmd/server/
│ ├── internal/
│ │ ├── api/ # REST handlers
│ │ ├── ws/ # WebSocket hub
│ │ ├── signaling/ # WebRTC signaling
│ │ ├── db/ # PostgreSQL queries
│ │ ├── cache/ # Redis
│ │ └── storage/ # MinIO client
│ ├── migrations/ # SQL migration files
│ └── Dockerfile
├── nginx/
│ └── nginx.conf
├── coturn/
│ └── turnserver.conf
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
└── docs/ # Full documentation
├── README.md
├── ARCHITECTURE.md
├── SETUP.md
├── API.md
├── WEBRTC.md
└── DEPLOYMENT.md

---

## Documentation Requirements

Generate complete documentation in `/docs/`:

### README.md
- Project overview, features list, screenshots placeholder
- Quick start (5 commands to get running)
- Requirements (Docker, ports needed)

### SETUP.md
- Step-by-step deployment guide
- Environment variables explanation (every variable)
- SSL/TLS setup with Let's Encrypt or self-signed cert
- Firewall rules needed (ports: 80, 443, 3478 UDP/TCP for TURN, 5349)
- First-run setup (creating admin account)
- Backup and restore procedure

### ARCHITECTURE.md
- System architecture diagram (ASCII or Mermaid)
- Database schema (all tables with relations)
- WebSocket event reference
- Service interaction map

### API.md
- Full REST API reference (all endpoints)
- Authentication flow
- Rate limiting rules
- Error codes

### WEBRTC.md
- P2P screen share flow diagram
- Signaling protocol specification
- TURN/STUN configuration
- Troubleshooting P2P connectivity issues

### DEPLOYMENT.md
- Production hardening checklist
- Scaling considerations
- Monitoring setup (optional: Prometheus + Grafana)
- Updating the application

---

## Implementation Order

Implement in this order to ensure a working system at each step:

**Phase 1 — Foundation**
1. Docker Compose skeleton with all services
2. PostgreSQL schema + migrations
3. Go backend: auth (register/login/JWT)
4. Frontend: login/register screens

**Phase 2 — Core Chat**
5. Community CRUD
6. Channel CRUD + permissions
7. Real-time messaging via WebSocket
8. File uploads via MinIO

**Phase 3 — Voice & Screen**
9. Voice channel WebRTC SFU (Pion)
10. WebRTC P2P screen sharing with signaling
11. Coturn configuration and fallback

**Phase 4 — Polish**
12. Roles, permissions, audit log
13. DMs and notifications
14. Search, reactions, embeds
15. Documentation generation

---

## Quality Requirements
- All Go code must handle errors explicitly (no `_` ignoring)
- Frontend must be fully typed (strict TypeScript, no `any`)
- All WebSocket connections must handle reconnection with exponential backoff
- SQL queries must use parameterized statements (no SQL injection)
- Passwords must be hashed with bcrypt (cost >= 12)
- Tokens must be stored in httpOnly cookies or secure storage
- All file uploads must validate MIME type and size limit (configurable)
- Rate limiting on all API endpoints (Redis-backed)

Start with Phase 1. After completing each phase, show a summary of what was built and 
what tests or commands can verify it works before moving to the next phase.