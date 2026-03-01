# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

# Copy go module files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /pulse-server ./cmd/server

# ---------------------------------------------------------------------------
# Development stage (hot reload)
# ---------------------------------------------------------------------------
FROM golang:1.24-alpine AS dev

WORKDIR /app

# Install development dependencies
RUN apk add --no-cache gcc musl-dev

# Copy go module files
COPY go.mod go.sum ./
RUN go mod download

# Install air for hot reload
RUN go install github.com/air-verse/air@v1.61.7

ENV PATH="/root/go/bin:${PATH}"

# Copy source code
COPY . .

EXPOSE 8080

# Run with air for hot reload
CMD ["air", "-c", ".air.toml"]

# Runtime stage
FROM alpine:3.19 AS runtime

RUN apk add --no-cache ca-certificates wget tzdata

WORKDIR /app

COPY --from=builder /pulse-server .
COPY migrations/ ./migrations/

EXPOSE 8080

CMD ["./pulse-server"]
