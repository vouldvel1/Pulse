# Backend Development Guide

## Prerequisites

- **Go 1.24+**
- **PostgreSQL 16+** (or Docker)
- **Redis 7+** (or Docker)
- **MinIO** (or Docker)
- **LiveKit** (optional, for voice/video)

## Quick Start (Docker)

```bash
cd backend

# Copy environment template
cp .env.example .env

# Start all services (Postgres, Redis, MinIO, API)
docker compose up -d

# Start with LiveKit (voice/video)
docker compose up -d livekit

# View logs
docker compose logs -f api

# Stop services
docker compose down
```

The API runs on `http://localhost:8080` with hot reload.

## Local Development (Without Docker)

### 1. Start Dependencies

```bash
# Using Docker for dependencies only
docker run -d \
  --name pulse_postgres \
  -e POSTGRES_USER=pulse \
  -e POSTGRES_PASSWORD=pulse_dev \
  -e POSTGRES_DB=pulse \
  -p 5432:5432 \
  postgres:16-alpine

docker run -d \
  --name pulse_redis \
  -e REDIS_PASSWORD=redis_dev \
  -p 6379:6379 \
  redis:7-alpine

docker run -d \
  --name pulse_minio \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -p 9000:9000 \
  -p 9001:9001 \
  minio/minio server /data --console-address ":9001"

# Optional: LiveKit for voice/video
docker run -d \
  --name pulse_livekit \
  -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server --dev
```

### 2. Run the Server

```bash
cd backend

# Copy environment template
cp .env.example .env
# Edit .env - change POSTGRES_HOST, REDIS_HOST, MINIO_ENDPOINT to localhost

# Install dependencies
go mod download

# Run with hot reload (recommended)
go install github.com/air-verse/air@latest
air -c .air.toml

# Or run directly
go run ./cmd/server
```

Server starts at `http://localhost:8080`

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

For Docker development, use these values:

```bash
# App
APP_ENV=development
API_PORT=8080
API_LOG_LEVEL=debug
DOMAIN=localhost

# Database (use service name when running in Docker)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=pulse
POSTGRES_PASSWORD=pulse_dev
POSTGRES_DB=pulse

# Redis (use service name when running in Docker)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=redis_dev

# MinIO (use service name when running in Docker)
MINIO_ENDPOINT=minio:9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_BUCKET=pulse-uploads
MINIO_USE_SSL=false

# JWT
JWT_SECRET=dev-secret-change-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=168h

# Security (use lower cost for dev)
BCRYPT_COST=4
MAX_UPLOAD_SIZE=52428800
RATE_LIMIT_RPS=60
RATE_LIMIT_BURST=120

# LiveKit (optional)
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_WS_URL=ws://localhost:7880
```

## Testing the API

### 1. Register a User

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "display_name": "Test User",
    "password": "password123"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Save the `access_token` from the response.

### 3. Create a Community

```bash
curl -X POST http://localhost:8080/api/communities \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Community",
    "description": "A test community"
  }'
```

### 4. Create a Voice Channel

```bash
curl -X POST "http://localhost:8080/api/communities/<community-id>/channels" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "General Voice",
    "type": "voice"
  }'
```

## Testing Voice/Video

### Option 1: LiveKit CLI

```bash
# Install CLI
brew install livekit

# Create a room via API, then join
livekit-cli join --room <room-name> --identity test-user --url ws://localhost:7880
```

### Option 2: WebSocket

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c "ws://localhost:8080/ws?token=<access-token>"
```

Send events:
```json
{"type": "voice_join", "payload": {"channel_id": "<voice-channel-uuid>"}}
{"type": "voice_state", "payload": {"self_mute": true, "self_deaf": false}}
{"type": "voice_leave", "payload": {}}
```

### Option 3: REST API

```bash
# Join voice channel
curl -X POST "http://localhost:8080/api/voice/channels/<channel-id>/join" \
  -H "Authorization: Bearer <token>"

# Get participants
curl "http://localhost:8080/api/voice/channels/<channel-id>/participants" \
  -H "Authorization: Bearer <token>"

# Update voice state
curl -X PATCH "http://localhost:8080/api/voice/state" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"self_mute": true}'

# Leave voice
curl -X POST "http://localhost:8080/api/voice/leave" \
  -H "Authorization: Bearer <token>"
```

## Testing WebSocket

```bash
# Connect with token
wscat -c "ws://localhost:8080/ws?token=<access-token>"

# Subscribe to channel
{"type": "channel_join", "payload": {"channel_id": "<channel-id>"}}

# Send typing indicator
{"type": "typing", "payload": {"channel_id": "<channel-id>"}}

# Update presence
{"type": "presence", "payload": {"status": "online"}}

# Ping
{"type": "ping", "payload": {}}
```

## Useful Commands

```bash
# Run tests
go test ./...

# Run linter
go vet ./...

# Build binary
go build -o pulse-server ./cmd/server

# Format code
go fmt ./...

# Create migration
# Add SQL file to migrations/ directory
```

## Troubleshooting

### "Connection refused" to database
- Ensure PostgreSQL is running: `docker ps | grep postgres`
- Check POSTGRES_HOST environment variable

### "Connection refused" to Redis
- Ensure Redis is running: `docker ps | grep redis`
- Check REDIS_HOST and REDIS_PASSWORD

### MinIO bucket not found
- Access MinIO console at http://localhost:9001
- Create bucket `pulse-uploads` (or set MINIO_BUCKET)

### Voice not working
- Ensure LiveKit is running: `docker ps | grep livekit`
- Check LIVEKIT_WS_URL matches your LiveKit URL

### Hot reload not working
- Ensure air is installed: `which air`
- Check .air.toml exists in backend directory
