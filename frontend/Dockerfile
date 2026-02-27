# ─── Stage 0: Dev (hot-reload via volume mount) ───────────────────────────────
FROM node:22-alpine AS dev

WORKDIR /app

# Install dependencies only; source is mounted at runtime via docker-compose volume
COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci

# Build args must come after dependency install to avoid cache-busting npm ci
ARG VITE_API_URL=/api
ARG VITE_WS_URL=/ws
ARG VITE_APP_NAME=Pulse

ENV VITE_API_URL=${VITE_API_URL} \
    VITE_WS_URL=${VITE_WS_URL} \
    VITE_APP_NAME=${VITE_APP_NAME}

COPY . .
RUN npm run build

# ─── Stage 2: Serve ──────────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runtime

# Install curl for healthcheck (wget in busybox alpine is unreliable for this)
RUN apk add --no-cache curl

# Remove default config and install SPA config
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
