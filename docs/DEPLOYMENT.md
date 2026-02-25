# Production Deployment

## Prerequisites

- A Linux server with Docker and Docker Compose v2+
- A domain name with DNS pointing to the server
- (Optional) SSL certificate (or use Let's Encrypt via Nginx)

## Deployment Steps

### 1. Clone and Configure

```bash
git clone https://github.com/pulse-chat/pulse.git
cd pulse
cp .env.example .env
```

Edit `.env` with production values:

```env
APP_ENV=production
DOMAIN=chat.example.com

# Strong random secrets (generate with: openssl rand -hex 32)
POSTGRES_PASSWORD=<random>
JWT_SECRET=<random>
TURN_SECRET=<random>
MINIO_ROOT_PASSWORD=<random>

# bcrypt cost (12+ for production)
BCRYPT_COST=12

# Rate limiting
RATE_LIMIT_RPS=10
RATE_LIMIT_BURST=20
```

### 2. Configure Nginx for TLS

Edit `nginx/nginx.conf` to add your SSL certificate:

```nginx
server {
    listen 443 ssl http2;
    server_name chat.example.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # ... existing location blocks ...
}

server {
    listen 80;
    server_name chat.example.com;
    return 301 https://$host$request_uri;
}
```

Mount your certificates in `docker-compose.yml`:

```yaml
nginx:
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - /etc/letsencrypt/live/chat.example.com:/etc/nginx/ssl:ro
```

### 3. Start Services

```bash
docker compose up -d
```

### 4. Verify

```bash
# Check all services are healthy
docker compose ps

# Check API
curl https://chat.example.com/health

# Check logs
docker compose logs -f api
```

## Docker Compose Services

| Service | Port | Description |
|---------|------|-------------|
| nginx | 80, 443 | Reverse proxy |
| api | 8080 (internal) | Go backend |
| frontend | 3000 (internal) | React app (Nginx-served) |
| postgres | 5432 (internal) | PostgreSQL 16 |
| redis | 6379 (internal) | Redis 7 |
| minio | 9000 (internal) | Object storage |
| coturn | 3478 (UDP/TCP) | TURN/STUN server |

Only Nginx and Coturn ports are exposed to the host.

## Data Persistence

Named volumes for stateful data:

| Volume | Service | Data |
|--------|---------|------|
| `pulse_postgres_data` | postgres | Database files |
| `pulse_redis_data` | redis | Cache/persistence |
| `pulse_minio_data` | minio | Uploaded files |

## Backups

### PostgreSQL

```bash
# Dump
docker compose exec postgres pg_dump -U pulse pulse > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U pulse pulse
```

### MinIO

```bash
# Copy data directory
docker compose cp minio:/data ./minio-backup
```

## Scaling Considerations

### Single Server (Default)

The default Docker Compose setup runs all services on one machine. This is suitable for small to medium communities (up to ~500 concurrent users).

### Horizontal Scaling

For larger deployments:

1. **Database**: Use a managed PostgreSQL service (RDS, Cloud SQL)
2. **Redis**: Use a managed Redis service (ElastiCache, Memorystore)
3. **MinIO**: Replace with S3 or any S3-compatible service
4. **API**: Run multiple instances behind a load balancer
   - WebSocket connections are sticky to one instance
   - Use Redis pub/sub for cross-instance message routing (already wired)
5. **Coturn**: Run dedicated TURN servers closer to users

### Performance Tuning

**PostgreSQL:**
```sql
-- Increase shared buffers
ALTER SYSTEM SET shared_buffers = '256MB';
-- Increase work memory for FTS
ALTER SYSTEM SET work_mem = '16MB';
```

**Redis:**
```
maxmemory 256mb
maxmemory-policy allkeys-lru
```

**Nginx:**
```nginx
worker_processes auto;
worker_connections 4096;
```

## Monitoring

Recommended monitoring setup:

- **Health endpoint**: `GET /health` returns JSON with status and timestamp
- **Docker health checks**: All services have health checks in docker-compose.yml
- **Logs**: `docker compose logs -f` or ship to a log aggregator
- **Metrics**: Add Prometheus scraping endpoint (future enhancement)

## Security Checklist

- [ ] Change all default passwords in `.env`
- [ ] Use strong JWT secret (32+ random bytes)
- [ ] Enable TLS (HTTPS) via Nginx
- [ ] Set `APP_ENV=production`
- [ ] Restrict Nginx CORS to your domain
- [ ] Keep Docker images updated
- [ ] Enable PostgreSQL SSL for remote connections
- [ ] Set firewall rules (only expose ports 80, 443, 3478)
- [ ] Regular database backups
- [ ] Monitor disk space for MinIO uploads

## Troubleshooting

**WebSocket connection fails:**
- Check Nginx WebSocket upgrade configuration
- Verify `proxy_set_header Upgrade $http_upgrade`

**Voice not working:**
- Verify Coturn is running: `docker compose logs coturn`
- Check TURN credentials in `.env`
- Ensure port 3478 (UDP+TCP) is open in firewall

**File uploads fail:**
- Check MinIO is healthy: `docker compose logs minio`
- Verify bucket exists: `docker compose exec minio mc ls local/pulse`
- Check file size limits (default 25MB)

**Slow search:**
- Verify FTS index exists: `\d+ messages` in psql should show `idx_messages_fts`
- Run `VACUUM ANALYZE messages` for updated statistics
