import type {
  DirectMessageItem,
  NotificationItem,
  NotificationType,
  UnreadByType,
} from '@/lib/api';

export type RealtimeEvent =
  | { type: 'connected'; userId: string; timestamp: string }
  | {
      type: 'notification:new';
      notification: NotificationItem;
      unreadCount: number;
      unreadByType?: UnreadByType;
    }
  | {
      type: 'notification:read';
      unreadCount: number;
      unreadByType?: UnreadByType;
      ids?: string[];
      all?: boolean;
      category?: NotificationType;
    }
  | {
      type: 'dm:new';
      message: DirectMessageItem & { conversationKey?: string };
      sender: {
        id: string;
        nickname: string;
        avatarSeed: string;
        avatarUrl: string;
        bio: string;
      };
      receiverId: string;
      totalUnread: number;
    }
  | { type: 'dm:read'; peerId: string; totalUnread: number }
  | { type: 'pong'; timestamp?: string };

type RealtimeListener = (event: RealtimeEvent) => void;

const HEARTBEAT_INTERVAL_MS = 45_000;
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private shouldStayConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private listeners = new Set<RealtimeListener>();
  private visibilityBound = false;

  private handleVisibilityChange = () => {
    if (
      document.visibilityState === 'visible' &&
      this.shouldStayConnected &&
      (!this.ws || this.ws.readyState === WebSocket.CLOSED)
    ) {
      this.clearReconnectTimer();
      this.openSocket();
    }
  };

  connect() {
    this.shouldStayConnected = true;
    if (!this.visibilityBound && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityBound = true;
    }
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.openSocket();
  }

  disconnect() {
    this.shouldStayConnected = false;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    if (this.visibilityBound && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityBound = false;
    }
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      try {
        socket.close(1000, 'Client disconnect');
      } catch {
        // ignore close errors
      }
    }
  }

  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private openSocket() {
    if (!this.shouldStayConnected || typeof window === 'undefined') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data === 'pong') {
        return;
      }
      try {
        const parsed = JSON.parse(event.data) as RealtimeEvent;
        if (!parsed || typeof parsed.type !== 'string') return;
        for (const listener of this.listeners) {
          try {
            listener(parsed);
          } catch (err) {
            console.error('Realtime listener error:', err);
          }
        }
      } catch {
        // Ignore non-JSON frames
      }
    };

    socket.onclose = () => {
      if (this.ws === socket) {
        this.ws = null;
      }
      this.clearHeartbeat();
      if (this.shouldStayConnected) {
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      // onclose handles cleanup and backoff reconnect
    };
  }

  private startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        this.ws &&
        this.ws.readyState === WebSocket.OPEN
      ) {
        try {
          this.ws.send('ping');
        } catch {
          // ignore
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private scheduleReconnect() {
    if (!this.shouldStayConnected || this.reconnectTimer !== null) return;
    const delay = Math.min(
      MAX_RECONNECT_MS,
      BASE_RECONNECT_MS * Math.pow(2, this.reconnectAttempts)
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export const realtimeClient = new RealtimeClient();
