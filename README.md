# Pulse

A self-hosted, production-ready Discord alternative built with Go, React, PostgreSQL, Redis, MinIO, and WebRTC. Deployable via Docker Compose.

## Features

- **Communities** (servers) with channels, roles, and permissions
- **Real-time messaging** via WebSocket with reactions, pins, file attachments
- **Voice channels** with SFU audio routing (Pion WebRTC)
- **Screen sharing** via WebRTC peer-to-peer with quality presets
- **Direct messages** and group DMs
- **Role-based access control** with 21 granular permissions
- **Full-text search** across messages (PostgreSQL FTS with GIN index)
- **Link embeds** with Open Graph metadata extraction
- **Notifications** (mentions, replies, DMs, system)
- **Audit log** per community
- **File uploads** via MinIO with MIME validation and size limits
- **Rate limiting** (Redis-backed)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/pulse-chat/pulse.git
cd pulse

# Copy environment config
cp .env.example .env
# Edit .env with your settings (database passwords, JWT secret, etc.)

# Start all services
docker compose up -d

# Open in browser
open http://localhost
```

See [docs/SETUP.md](docs/SETUP.md) for detailed setup instructions.

## Architecture

- **Backend**: Go (net/http, pgx, gorilla/websocket, Pion WebRTC v4)
- **Frontend**: React 18 + TypeScript + Vite, Zustand state management, CSS Modules
- **Database**: PostgreSQL 16 with full-text search
- **Cache/Pub-Sub**: Redis 7
- **Object Storage**: MinIO
- **TURN/STUN**: Coturn
- **Reverse Proxy**: Nginx

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a detailed system overview.

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, component diagram |
| [SETUP.md](docs/SETUP.md) | Development and production setup |
| [API.md](docs/API.md) | REST API reference |
| [WEBRTC.md](docs/WEBRTC.md) | Voice and screen sharing implementation |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment guide |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.24, net/http, pgx v5, gorilla/websocket |
| Frontend | React 18, TypeScript 5, Vite 6, Zustand |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Storage | MinIO |
| WebRTC | Pion WebRTC v4, Coturn |
| Proxy | Nginx |
| Containers | Docker Compose |

## License

This project is for educational and self-hosting purposes.
