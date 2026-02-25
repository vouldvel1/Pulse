# Build stage
FROM node:20-alpine AS dev

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

# Production build stage
FROM dev AS builder
ARG VITE_API_URL=/api
ARG VITE_WS_URL=/ws
ARG VITE_APP_NAME=Pulse

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_APP_NAME=$VITE_APP_NAME

RUN npm run build

# Production runtime
FROM nginx:1.25-alpine AS runtime

RUN apk add --no-cache curl

COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config for SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
