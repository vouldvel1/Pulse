# WebRTC Architecture

## Overview

Pulse uses WebRTC for two features:
1. **Voice channels** — SFU (Selective Forwarding Unit) architecture using Pion WebRTC v4
2. **Screen sharing** — Peer-to-peer with signaling through the WebSocket

## Voice Channels (SFU)

### Architecture

```
User A ──audio──▶ ┌─────┐ ──audio──▶ User B
User B ──audio──▶ │ SFU │ ──audio──▶ User A
User C ──audio──▶ └─────┘ ──audio──▶ User A, User B
                              ──audio──▶ User C
```

Each participant establishes one PeerConnection to the SFU:
- **Upstream**: Sends their audio track
- **Downstream**: Receives all other participants' audio tracks

This scales better than full mesh (P2P with every participant) since each client only maintains one connection.

### Connection Flow

1. Client calls `POST /api/voice/channels/{id}/join`
2. Server creates a voice state in PostgreSQL and adds user to in-memory room
3. Server returns a LiveKit access token and participant list
4. Client connects to LiveKit using the token and WebRTC SDK
5. Audio flows through LiveKit's SFU

### SFU Implementation

Uses LiveKit for the Selective Forwarding Unit:
- Server generates LiveKit access tokens via the `POST /api/voice/channels/{id}/join` endpoint
- Client connects directly to LiveKit server (not through Pulse backend)
- Voice state is tracked in PostgreSQL and synchronized via WebSocket events

### ICE Servers

Configured in `main.go`:
- **STUN**: `stun:<domain>:3478` + `stun:stun.l.google.com:19302`
- **TURN**: `turn:<domain>:3478` (UDP + TCP) when `TURN_SECRET` is configured

### Voice Room Manager

Located in `backend/internal/signaling/room.go`:

- In-memory map of `channelID → Room`
- `Room` tracks participant user IDs and their PeerConnections
- Rooms are created on first join, cleaned up when empty
- Thread-safe with sync.RWMutex

### Voice State

Stored in PostgreSQL (`voice_states` table):
- `user_id`, `channel_id`, `community_id`
- `self_mute`, `self_deaf`, `server_mute`, `server_deaf`
- `streaming` (screen share active)
- `joined_at`

Cleaned up on disconnect (leave or WebSocket close).

## Screen Sharing (P2P)

### Architecture

```
Sharer ──video+audio──▶ Viewer
        ◀──signaling──
```

Screen sharing uses direct peer-to-peer connections (not the SFU), signaled through the WebSocket.

### Connection Flow

1. Sharer calls `navigator.mediaDevices.getDisplayMedia()` with quality presets
2. Sharer sends `screen_share_offer` via WebSocket to viewers in the voice channel
3. Each viewer creates a PeerConnection, sends `screen_share_answer` back
4. ICE candidates exchanged via `ice_candidate` events (with `target: 'peer'`)
5. Video stream flows directly between peers

### Quality Presets

| Preset | Resolution | FPS |
|--------|-----------|-----|
| 480p30 | 854x480 | 30 |
| 720p60 | 1280x720 | 60 |
| 1080p60 | 1920x1080 | 60 |
| 1440p60 | 2560x1440 | 60 |

Users select quality before starting a screen share. The constraints are applied to `getDisplayMedia()`.

### Frontend Implementation

`useWebRTC.ts` hook manages:
- SFU PeerConnection for voice (audio only)
- Separate PeerConnections per viewer for screen sharing
- ICE candidate queuing (candidates received before remote description is set)
- Cleanup on unmount/disconnect

`ScreenShare.tsx` components:
- `ScreenShareControls` — Start/stop, quality picker
- `ScreenShareViewer` — Tabbed view for multiple simultaneous screen shares

## Coturn Configuration

Located in `coturn/turnserver.conf`:

```
listening-port=3478
realm=pulse
use-auth-secret
static-auth-secret=<TURN_SECRET>
```

TURN is used as a fallback when direct peer-to-peer connections fail (NAT traversal).
The server generates time-limited credentials using the shared secret.

## WebSocket Event Types

Voice-related events in the WebSocket protocol:

| Event | Direction | Description |
|-------|-----------|-------------|
| `voice_join` | S→C | User joined voice channel |
| `voice_leave` | S→C | User left voice channel |
| `voice_state` | S→C | User updated mute/deaf state |
| `screen_share_offer` | S→C | SDP offer for screen share |
| `screen_share_answer` | S→C | SDP answer for screen share |
| `ice_candidate` | S→C | ICE candidate (target: 'peer' or 'sfu') |
| `sfu_negotiate` | S→C | SFU renegotiation offer |

All voice WS events are handled by `VoiceWSHandler` in `backend/internal/signaling/voice_ws.go`, which implements the `VoiceEventHandler` interface defined in the `ws` package.
