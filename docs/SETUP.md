# Setup Guide

## Prerequisites

- Docker and Docker Compose (v2+)
- Git

For local development without Docker:
- Go 1.24+
- Node.js 20+ with npm
- PostgreSQL 16
- Redis 7
- MinIO (or any S3-compatible storage)

## Quick Start (Docker)

```bash
# Clone
git clone https://github.com/pulse-chat/pulse.git
cd pulse

# Configure
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Required - change these
POSTGRES_PASSWORD=your_secure_password
JWT_SECRET=your_random_32_char_secret
TURN_SECRET=your_turn_secret
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your_minio_password

# Optional
DOMAIN=localhost
API_PORT=8080
```

```bash
# Start all services
docker compose up -d

# Check health
curl http://localhost/health

# View logs
docker compose logs -f api
```

Open `http://localhost` in your browser.

## Development Setup (Without Docker)

### 1. Database

```bash
# Start PostgreSQL
createdb pulse_dev

# Set DSN in environment
export POSTGRES_DSN="postgresql://postgres:password@localhost:5432/pulse_dev?sslmode=disable"
```

### 2. Redis

```bash
# Start Redis on default port
redis-server
```

### 3. MinIO

```bash
# Start MinIO
minio server /tmp/minio-data --console-address ":9001"

export MINIO_ENDPOINT=localhost:9000
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
export MINIO_BUCKET=pulse
```

### 4. Backend

```bash
cd backend

# Install dependencies
go mod download

# Set environment variables
export JWT_SECRET=dev-secret-change-me
export BCRYPT_COST=12
export API_PORT=8080

# Run with live reload (optional: install air)
go run cmd/server/main.go
```

The server starts on `http://localhost:8080`.

### 5. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (proxies /api to backend)
npm run dev
```

The dev server starts on `http://localhost:5173` with hot reload.

### 6. Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | Environment mode |
| `API_PORT` | `8080` | API server port |
| `DOMAIN` | `localhost` | Domain for TURN/CORS |
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_USER` | `pulse` | PostgreSQL user |
| `POSTGRES_PASSWORD` | `pulse` | PostgreSQL password |
| `POSTGRES_DB` | `pulse` | PostgreSQL database |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | `` | Redis password |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO endpoint |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET` | `pulse` | MinIO bucket name |
| `MINIO_USE_SSL` | `false` | Use SSL for MinIO |
| `JWT_SECRET` | (required) | JWT signing secret |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token expiry |
| `JWT_REFRESH_EXPIRY` | `168h` | Refresh token expiry (7 days) |
| `BCRYPT_COST` | `12` | bcrypt hashing cost |
| `RATE_LIMIT_RPS` | `10` | Rate limit requests/second |
| `RATE_LIMIT_BURST` | `20` | Rate limit burst size |
| `TURN_SECRET` | `` | TURN server shared secret |
| `TURN_REALM` | `pulse` | TURN server realm |

## Verifying the Setup

```bash
# Health check
curl http://localhost:8080/health
# → {"status":"ok","time":"..."}

# Register a user
curl -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","username":"testuser","password":"TestPass123!","display_name":"Test User"}'

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"TestPass123!"}'
```

## Running Migrations

Migrations run automatically on server startup. They are located in `backend/migrations/`:

- `001_initial_schema.up.sql` — All tables, indexes, triggers, FTS
- `002_voice_states.up.sql` — Voice state table

To reset the database:

```bash
# Docker
docker compose down -v  # removes volumes
docker compose up -d

# Local
dropdb pulse_dev && createdb pulse_dev
```
