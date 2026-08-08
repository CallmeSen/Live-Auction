import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

const ITEM_ID = 'item-1';
const SESSION_ID = 'session-1';
const MIN_INCREMENT = '5';

type Client = {
  socket: WebSocket;
  alias: string;
};

type SocketCommand = {
  action?: string;
  amount?: string;
  item_id?: string;
  request_id?: string;
};

function envelope(data: unknown, status = 200, code = 'OK', message = 'OK') {
  return { status, code, message, data };
}

function parseCommand(raw: string): SocketCommand | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as SocketCommand
      : null;
  } catch {
    return null;
  }
}

function responseJson(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, {
    'access-control-allow-headers': 'authorization, content-type, x-api-key',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-origin': 'http://127.0.0.1:4173',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function bidderAlias(token: string | null): string {
  if (token?.includes('bidder-a')) return 'Bidder A';
  if (token?.includes('bidder-b')) return 'Bidder B';
  return 'Bidder Test';
}

export class MockAuctionServer {
  private readonly httpServer: Server;
  private readonly websocketServer = new WebSocketServer({ noServer: true });
  private readonly clients = new Set<Client>();
  private currentPrice = '100';
  private endTime = Math.floor(Date.now() / 1_000) + 900;
  private started = false;
  private _itemRequestCount = 0;

  constructor(private readonly port: number) {
    this.httpServer = createServer((request, response) => {
      this.handleRequest(request, response);
    });
    this.httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      this.websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        this.connectClient(websocket, bidderAlias(url.searchParams.get('token')));
      });
    });
  }

  get itemRequestCount(): number {
    return this._itemRequestCount;
  }

  async start(): Promise<void> {
    if (this.started) return;
    await new Promise<void>((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(this.port, '127.0.0.1', () => {
        this.httpServer.off('error', reject);
        resolve();
      });
    });
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    for (const client of this.clients) client.socket.close();
    this.clients.clear();
    await new Promise<void>((resolve) => this.websocketServer.close(() => resolve()));
    await new Promise<void>((resolve, reject) => {
      this.httpServer.close((error) => (error ? reject(error) : resolve()));
    });
    this.started = false;
  }

  forceDisconnect(): void {
    for (const client of [...this.clients]) {
      client.socket.close(1012, 'mock-reconnect');
    }
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'OPTIONS') {
      responseJson(response, null, 204);
      return;
    }
    if (request.method === 'GET' && url.pathname === `/api/v1/auction-items/${ITEM_ID}`) {
      this._itemRequestCount += 1;
      responseJson(response, envelope(this.itemSnapshot()));
      return;
    }
    if (request.method === 'GET' && url.pathname === `/api/v1/auction-sessions/${SESSION_ID}`) {
      responseJson(response, envelope(this.sessionDetail()));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/_test/force-disconnect') {
      this.forceDisconnect();
      responseJson(response, envelope({ disconnected: true }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/_test/state') {
      responseJson(response, { itemRequests: this.itemRequestCount });
      return;
    }
    responseJson(response, envelope(null, 404, 'NOT_FOUND', 'Not found'), 404);
  }

  private itemSnapshot() {
    const now = Math.floor(Date.now() / 1_000);
    return {
      item_id: ITEM_ID,
      session_id: SESSION_ID,
      sequence_number: 1,
      name: 'Mock live item',
      description: 'A deterministic auction item for browser tests.',
      category_id: null,
      start_price: '100',
      duration_s: 900,
      status: 'LIVE',
      image_keys: [],
      created_at: now - 60,
      updated_at: now,
      live: {
        status: 'LIVE',
        current_price: this.currentPrice,
        end_time: this.endTime,
        extension_count: 0,
      },
    };
  }

  private sessionDetail() {
    const now = Math.floor(Date.now() / 1_000);
    return {
      session: {
        session_id: SESSION_ID,
        title: 'Mock auction session',
        description: 'Browser test fixture',
        status: 'LIVE',
        item_count: 1,
        active_item_id: ITEM_ID,
        current_sequence: 1,
        created_at: now - 60,
        updated_at: now,
      },
      rules: {
        min_increment: MIN_INCREMENT,
        max_increment: '10000',
        anti_snipe_window_s: 30,
        anti_snipe_extend_s: 30,
        max_extensions: 3,
        public_history_limit: 10,
      },
      items: [this.itemSnapshot()],
    };
  }

  private connectClient(socket: WebSocket, alias: string): void {
    const client = { socket, alias };
    this.clients.add(client);
    socket.on('message', (raw) => this.handleSocketMessage(client, raw.toString()));
    socket.on('close', () => this.clients.delete(client));
  }

  private handleSocketMessage(client: Client, raw: string): void {
    const command = parseCommand(raw);
    if (!command || command.item_id !== ITEM_ID) return;
    if (command.action === 'joinRoom') {
      this.send(client.socket, { type: 'room_joined', item_id: ITEM_ID, bidder_alias: client.alias });
      return;
    }
    if (
      command.action !== 'placeBid'
      || typeof command.amount !== 'string'
      || typeof command.request_id !== 'string'
    ) return;

    if (command.amount === '999') {
      this.send(client.socket, {
        type: 'bid_result',
        item_id: ITEM_ID,
        status: 'REJECTED',
        reason: 'REJECTED_LOW_INCREMENT',
        request_id: command.request_id,
      });
      return;
    }

    this.send(client.socket, {
      type: 'bid_queued',
      item_id: ITEM_ID,
      request_id: command.request_id,
    });
    this.currentPrice = command.amount;
    this.endTime = Math.floor(Date.now() / 1_000) + 930;
    const update = {
      type: 'price_update',
      item_id: ITEM_ID,
      status: 'ACCEPTED',
      request_id: command.request_id,
      current_price: this.currentPrice,
      highest_bidder_alias: client.alias,
      end_time: this.endTime,
    };
    setTimeout(() => {
      for (const connected of this.clients) this.send(connected.socket, update);
    }, 10);
  }

  private send(socket: WebSocket, message: unknown): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }
}
