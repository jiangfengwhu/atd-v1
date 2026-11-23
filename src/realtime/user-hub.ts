import type { DurableObjectState, WebSocket as CfWebSocket } from '@cloudflare/workers-types';
import type { Bindings } from '../types';

declare const WebSocketPair: {
  new (): { 0: CfWebSocket; 1: CfWebSocket };
};

declare const WebSocketRequestResponsePair: {
  new (request: string, response: string): unknown;
};

/**
 * Per-user Durable Object using the WebSocket Hibernation API to fan out
 * real-time notification and direct-message events across active tabs.
 */
export class UserRealtimeHub {
  private ctx: DurableObjectState;
  private env: Bindings;

  constructor(ctx: DurableObjectState, env: Bindings) {
    this.ctx = ctx;
    this.env = env;
    if (typeof WebSocketRequestResponsePair !== 'undefined') {
      this.ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair('ping', 'pong') as never
      );
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/push' && request.method === 'POST') {
      const payload = await request.text();
      const sockets = this.ctx.getWebSockets();
      let delivered = 0;
      for (const ws of sockets) {
        try {
          ws.send(payload);
          delivered += 1;
        } catch {
          try {
            ws.close(1011, 'Send failed');
          } catch {
            // ignore already-closed socket
          }
        }
      }
      return Response.json({ ok: true, delivered });
    }

    const upgrade = request.headers.get('upgrade');
    if (upgrade && upgrade.toLowerCase() === 'websocket') {
      const userId = url.searchParams.get('userId') || '';
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      this.ctx.acceptWebSocket(server, userId ? [userId] : undefined);
      try {
        server.send(
          JSON.stringify({
            type: 'connected',
            userId,
            timestamp: new Date().toISOString(),
          })
        );
      } catch {
        // ignore initial send failure
      }

      return new Response(null, {
        status: 101,
        webSocket: client,
      } as unknown as ResponseInit);
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: CfWebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    if (message === 'ping') {
      ws.send('pong');
      return;
    }
    try {
      const parsed = JSON.parse(message) as { type?: string };
      if (parsed?.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    } catch {
      // Ignore unrecognized client messages
    }
  }

  async webSocketClose(
    ws: CfWebSocket,
    code: number,
    reason: string,
    _wasClean: boolean
  ): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: CfWebSocket): Promise<void> {
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // already closed
    }
  }
}
