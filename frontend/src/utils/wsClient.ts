import { getAccessToken, registerAuthFailureHandler } from './api';

// Resolve the WebSocket base URL.  VITE_WS_URL must be an absolute ws:// or
// wss:// URL (e.g. wss://pulse.example.com/ws).  If a relative path is
// supplied as a fallback (e.g. during Vite dev without the env var set), we
// derive the absolute URL from window.location so new WebSocket() does not
// throw "The URL's scheme must be either 'ws' or 'wss'".
function resolveWsBase(): string {
  const raw = import.meta.env.VITE_WS_URL as string | undefined;
  if (raw && (raw.startsWith('ws://') || raw.startsWith('wss://'))) {
    return raw;
  }
  // Derive from current page origin: http→ws, https→wss
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const path = raw && raw.startsWith('/') ? raw : '/ws';
  return `${scheme}://${window.location.host}${path}`;
}

const WS_BASE = resolveWsBase();

type EventHandler = (payload: Record<string, unknown>) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxDelay = 30000;
  private shouldConnect = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  connect() {
    this.shouldConnect = true;
    this.openConnection();
  }

  disconnect() {
    this.shouldConnect = false;
    this.clearTimers();
    if (this.socket) {
      this.socket.close(1000, 'User disconnected');
      this.socket = null;
    }
  }

  private openConnection() {
    const token = getAccessToken();
    if (!token) return;

    const url = `${WS_BASE}?token=${encodeURIComponent(token)}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.reconnectDelay = 1000;
      this.startPing();
    };

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          payload: Record<string, unknown>;
        };
        this.dispatch(msg.type, msg.payload ?? {});
      } catch { /* ignore malformed */ }
    };

    this.socket.onclose = (e) => {
      this.clearTimers();
      if (this.shouldConnect && e.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      this.send('ping', {});
    }, 30000);
  }

  private clearTimers() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
      this.openConnection();
    }, this.reconnectDelay);
  }

  send(type: string, payload: Record<string, unknown>) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
    }
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  private dispatch(event: string, payload: Record<string, unknown>) {
    this.handlers.get(event)?.forEach((h) => h(payload));
    // Wildcard listeners
    this.handlers.get('*')?.forEach((h) => h({ type: event, ...payload }));
  }

  joinChannel(channelId: string) {
    this.send('channel_join', { channel_id: channelId });
  }

  leaveChannel(channelId: string) {
    this.send('channel_leave', { channel_id: channelId });
  }

  sendTyping(channelId: string) {
    this.send('typing', { channel_id: channelId });
  }

  updatePresence(status: 'online' | 'idle' | 'dnd' | 'invisible') {
    this.send('presence', { status });
  }
}

export const wsClient = new WebSocketClient();

// Register a cleanup hook so api.ts can disconnect the WebSocket before
// redirecting to /login on auth failure, without creating a circular import.
registerAuthFailureHandler(() => wsClient.disconnect());
