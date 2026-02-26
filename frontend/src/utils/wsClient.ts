import { getAccessToken } from './api';

const WS_BASE = import.meta.env.VITE_WS_URL ?? '/ws';

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
