import type { WSEvent } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL || '/ws';

type EventHandler = (payload: unknown) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private getToken: (() => string | null) | null = null;
  private refreshToken: (() => Promise<string | null>) | null = null;
  private intentionallyClosed = false;
  private pendingQueue: Array<{ type: string; payload: unknown }> = [];
  private _connected = false;

  /** Whether the WebSocket is currently open */
  get connected(): boolean {
    return this._connected;
  }

  /**
   * Connect to the WebSocket server.
   * @param getToken synchronous getter for the current access token
   * @param refreshTokenFn optional async function that refreshes the access
   *        token and returns the new one (or null on failure)
   */
  connect(getToken: () => string | null, refreshTokenFn?: () => Promise<string | null>): void {
    this.getToken = getToken;
    if (refreshTokenFn) {
      this.refreshToken = refreshTokenFn;
    }
    this.intentionallyClosed = false;

    // If already connected or connecting, don't create a duplicate
    if (this.ws) {
      const state = this.ws.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        return;
      }
      // CLOSING or CLOSED — clean up the stale reference
      this.ws = null;
    }

    this.doConnect();
  }

  private async doConnect(): Promise<void> {
    if (!this.getToken) return;

    let token = this.getToken();

    // If the token is missing and we have a refresh function, try refreshing
    if (!token && this.refreshToken) {
      token = await this.refreshToken();
    }

    if (!token) {
      // Still no token — schedule a reconnect so we try again later
      this.scheduleReconnect();
      return;
    }

    // Close any existing connection before creating a new one
    if (this.ws) {
      try {
        this.ws.onclose = null; // prevent reconnect loop
        this.ws.close(1000, 'Replacing connection');
      } catch {
        // ignore
      }
      this.ws = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}${WS_URL}?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this._connected = true;

      // Flush any messages queued while the connection was being established
      const queued = this.pendingQueue.splice(0);
      for (const msg of queued) {
        this.send(msg.type, msg.payload);
      }

      // Emit a synthetic 'connected' event so stores can re-subscribe
      this.emit('connected', undefined);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      // The backend writePump may batch multiple JSON messages into a single
      // WebSocket frame separated by newlines. Split and parse each individually.
      const raw = event.data as string;
      const lines = raw.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed) as WSEvent;
          this.emit(data.type, data.payload);
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log(`[WS] Disconnected: ${event.code} ${event.reason}`);
      const wasConnected = this._connected;
      this.ws = null;
      this._connected = false;

      if (wasConnected) {
        // Emit 'disconnected' event so UI can react
        this.emit('disconnected', undefined);
      }

      if (!this.intentionallyClosed) {
        // If the server rejected with 401 (expired token), try refreshing
        // before the next reconnect attempt.
        if (event.code === 4401 || event.code === 1008) {
          this.refreshAndReconnect();
        } else {
          this.scheduleReconnect();
        }
      }
    };

    this.ws.onerror = () => {
      console.error('[WS] Error occurred');
    };
  }

  /**
   * Try refreshing the access token before scheduling a reconnect. If the WS
   * server closes the connection because the JWT is invalid/expired, the HTTP
   * close code may vary, so this is also called as a fallback during normal
   * reconnect if the token getter returns null.
   */
  private async refreshAndReconnect(): Promise<void> {
    if (this.refreshToken) {
      const newToken = await this.refreshToken();
      if (newToken) {
        // Token refreshed — connect immediately without delay
        this.doConnect();
        return;
      }
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnection attempts reached');
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      // Before reconnecting, check if token is still valid; if not, try refreshing
      const token = this.getToken?.();
      if (!token && this.refreshToken) {
        this.refreshAndReconnect();
      } else {
        this.doConnect();
      }
    }, delay);
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.pendingQueue = [];
    this._connected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }
    this.handlers.clear();
  }

  send(type: string, payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue the message to be sent when the connection opens
      this.pendingQueue.push({ type, payload });
      return;
    }

    const event: WSEvent = { type, payload };
    this.ws.send(JSON.stringify(event));
  }

  on(type: string, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  off(type: string, handler: EventHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  private emit(type: string, payload: unknown): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[WS] Error in handler for ${type}:`, err);
        }
      });
    }
  }

  get isConnected(): boolean {
    return this._connected;
  }
}

export const wsClient = new WebSocketClient();
