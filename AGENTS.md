# Agent Guidelines for Pulse

This document provides guidance for agents working on the Pulse codebase.

## Project Structure

```
/home/vouldvell/Projects/Pulse
├── backend/           # Go 1.24 API server (net/http)
│   ├── cmd/server/    # Entry point
│   └── internal/      # Packages: api, db, ws, middleware, config, etc.
├── frontend/          # React 18 + TypeScript + Vite
│   └── src/
│       ├── components/  # React components (by feature)
│       ├── stores/      # Zustand state stores
│       ├── hooks/       # Custom React hooks
│       ├── types/       # TypeScript type definitions
│       └── utils/       # API client, WebSocket client
├── docs/              # Documentation
├── docker-compose.yml # Full stack
└── .env.example       # Environment template
```

## Build Commands

### Frontend (React + TypeScript)
```bash
cd frontend
npm run dev      # Start Vite dev server
npm run build    # Type-check + production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Backend (Go)
```bash
cd backend
go run ./cmd/server          # Run server
go build ./cmd/server        # Build binary
go vet ./...                 # Run go vet
go test ./...                # Run tests (none currently exist)
```

### Running a Single Test
```bash
# Backend - run specific test file
go test -v ./internal/api/... -run TestFunctionName

# Frontend - add test files first (no tests currently exist)
```

## Code Style

### Go Backend

**Imports**: Grouped and ordered:
1. Standard library (`fmt`, `net/http`, etc.)
2. Third-party packages (`github.com/...`)
3. Internal packages (`github.com/pulse-chat/pulse/internal/...`)

```go
import (
    "context"
    "encoding/json"
    "log"
    "net/http"
    "time"

    "github.com/gorilla/websocket"
    "github.com/google/uuid"
    "github.com/pulse-chat/pulse/internal/config"
    "github.com/pulse-chat/pulse/internal/db"
)
```

**Naming**:
- Types: `PascalCase` (e.g., `UserHandler`, `CommunityQueries`)
- Functions/Methods: `PascalCase` (e.g., `NewUserHandler`, `SearchUsers`)
- Variables/Constants: `camelCase` or `PascalCase` for exported, `camelCase` for unexported
- Interfaces: `Nouner` pattern (e.g., `Reader`, `Writer`) or descriptive (e.g., `UserHandler`)

**Types & Structs**:
- Use struct tags for JSON serialization: `` `json:"field_name"` ``
- Use pointer types (`*string`) for nullable fields
- Define response DTOs separately from database models

**Error Handling**:
- Return errors from functions; handle at handler level
- Use `writeError(w, status, "message")` for API errors
- Log errors with context: `log.Printf("failed to do thing: %v", err)`

**HTTP Handlers**:
- Follow pattern: `func (h *HandlerType) HandlerName(w http.ResponseWriter, r *http.Request)`
- Extract path params from `r.PathValue()`
- Query params from `r.URL.Query().Get()`
- Return early on validation failure

### Frontend (React + TypeScript)

**Imports**: Organized groups:
1. React/core imports (`react`, `react-router-dom`)
2. External libraries (`zustand`, `livekit-client`)
3. Internal modules (`@/components/...`, `@/stores/...`, `@/types`)

```tsx
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { User, Message } from '@/types';
import { api } from '@/utils/api';
```

**Types**:
- Use explicit types for interfaces and state
- Use `type` for unions/tuples, `interface` for objects
- Import types explicitly: `import type { User }`

**Components**:
- Use functional components with hooks
- Name components: `PascalCase` (e.g., `ChatView`, `MessageItem`)
- Co-locate styles as CSS modules or inline styles for simple cases

**State Management (Zustand)**:
```typescript
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: async (email, password) => { /* ... */ },
}));
```

**Naming**:
- Files: `camelCase.ts` for utilities, `PascalCase.tsx` for components
- Hooks: `useCamelCase` (e.g., `useWebRTC`, `useVoicePing`)
- Stores: `*Store.ts` (e.g., `authStore.ts`, `messageStore.ts`)
- Types: `PascalCase` in `types/index.ts`

**Error Handling**:
- Use try/catch in async functions
- Set error state in stores: `set({ error: message })`
- Display errors in UI components

## API Conventions

### REST Endpoints
- `GET /api/resource` - List
- `GET /api/resource/{id}` - Get one
- `POST /api/resource` - Create
- `PATCH /api/resource/{id}` - Update
- `DELETE /api/resource/{id}` - Delete

### JSON Naming
- Use snake_case for API fields: `user_id`, `created_at`, `is_private`
- Frontend converts to camelCase for internal use

## Database Patterns

- Use `pgx` for database operations
- Define queries in `/internal/db/` with separate query objects per entity
- Use UUIDs for all ID fields
- Include `CreatedAt`/`UpdatedAt` timestamps

## WebSocket Conventions

- Client connects to `/ws` endpoint
- Messages follow Discord-like payload structure
- Use hub/broadcaster pattern for room-based messaging

## Testing

No tests currently exist. When adding tests:
- Backend: `*_test.go` files in same package
- Frontend: `*.test.ts` or `*.spec.ts` files (consider Vitest)
- Run linting before committing

## Key Dependencies

**Backend**: Go 1.24, pgx v5, gorilla/websocket, jwt/v5, redis/go-redis, pion/webrtc
**Frontend**: React 18, TypeScript 5.6, Vite 6, Zustand 5, react-router-dom 6, livekit-client
