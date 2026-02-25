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

# Runtime stage
FROM alpine:3.19 AS runtime

RUN apk add --no-cache ca-certificates wget tzdata

WORKDIR /app

COPY --from=builder /pulse-server .
COPY migrations/ ./migrations/

EXPOSE 8080

CMD ["./pulse-server"]
