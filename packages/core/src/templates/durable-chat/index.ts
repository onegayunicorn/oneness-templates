// packages/core/src/templates/durable-chat/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { jwt } from 'hono/jwt';
import { rateLimiter } from 'hono-rate-limiter';

interface Message {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: string;
  type: 'text' | 'system' | 'file';
  metadata?: Record<string, any>;
}

interface Room {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  participants: string[];
  messages: Message[];
}

// Durable Object for chat room
export class ChatRoom {
  private state: DurableObjectState;
  private env: any;
  private room: Room;
  private websockets: Map<string, WebSocket>;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.websockets = new Map();
    this.room = {
      id: state.id.toString(),
      name: 'Default Room',
      description: 'Chat room',
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      participants: [],
      messages: []
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleWebSocket(server);
      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    // REST API
    const router = new Hono();
    router.use('*', cors());
    router.use('*', logger());

    // Get room info
    router.get('/', async (c) => {
      return c.json({
        success: true,
        room: {
          id: this.room.id,
          name: this.room.name,
          description: this.room.description,
          participants: this.room.participants,
          messageCount: this.room.messages.length,
          createdAt: this.room.createdAt
        }
      });
    });

    // Get messages
    router.get('/messages', async (c) => {
      const { limit = '50', before } = c.req.query();
      const limitNum = parseInt(limit);
      
      let messages = [...this.room.messages];
      
      if (before) {
        const beforeIndex = messages.findIndex(m => m.id === before);
        if (beforeIndex !== -1) {
          messages = messages.slice(0, beforeIndex);
        }
      }
      
      messages = messages.slice(-limitNum);

      return c.json({
        success: true,
        data: messages,
        count: messages.length
      });
    });

    // Send message
    router.post('/messages', async (c) => {
      const data = await c.req.json();
      
      const message: Message = {
        id: crypto.randomUUID(),
        userId: data.userId || 'anonymous',
        username: data.username || 'Anonymous',
        content: data.content,
        timestamp: new Date().toISOString(),
        type: data.type || 'text',
        metadata: data.metadata
      };
      
      this.room.messages.push(message);
      
      // Broadcast to all connected clients
      await this.broadcastMessage(message);
      
      // Store for persistence
      await this.state.storage.put('messages', this.room.messages);
      
      return c.json({
        success: true,
        data: message
      }, 201);
    });

    // Get participants
    router.get('/participants', async (c) => {
      return c.json({
        success: true,
        data: this.room.participants,
        count: this.room.participants.length
      });
    });

    // Join room
    router.post('/join', async (c) => {
      const { userId, username } = await c.req.json();
      
      if (userId && !this.room.participants.includes(userId)) {
        this.room.participants.push(userId);
      }
      
      const systemMessage: Message = {
        id: crypto.randomUUID(),
        userId: 'system',
        username: 'System',
        content: `${username || userId} joined the chat`,
        timestamp: new Date().toISOString(),
        type: 'system'
      };
      
      this.room.messages.push(systemMessage);
      await this.broadcastMessage(systemMessage);
      await this.state.storage.put('participants', this.room.participants);
      
      return c.json({
        success: true,
        message: 'Joined successfully'
      });
    });

    // Leave room
    router.post('/leave', async (c) => {
      const { userId, username } = await c.req.json();
      
      this.room.participants = this.room.participants.filter(id => id !== userId);
      
      const systemMessage: Message = {
        id: crypto.randomUUID(),
        userId: 'system',
        username: 'System',
        content: `${username || userId} left the chat`,
        timestamp: new Date().toISOString(),
        type: 'system'
      };
      
      this.room.messages.push(systemMessage);
      await this.broadcastMessage(systemMessage);
      await this.state.storage.put('participants', this.room.participants);
      
      return c.json({
        success: true,
        message: 'Left successfully'
      });
    });

    // Clear messages
    router.delete('/messages', async (c) => {
      this.room.messages = [];
      await this.state.storage.put('messages', this.room.messages);
      
      const systemMessage: Message = {
        id: crypto.randomUUID(),
        userId: 'system',
        username: 'System',
        content: 'Messages cleared',
        timestamp: new Date().toISOString(),
        type: 'system'
      };
      
      await this.broadcastMessage(systemMessage);
      
      return c.json({
        success: true,
        message: 'Messages cleared'
      });
    });

    return router.fetch(request);
  }

  private async handleWebSocket(ws: WebSocket) {
    ws.accept();
    const id = crypto.randomUUID();
    this.websockets.set(id, ws);
    
    // Send initial messages
    ws.send(JSON.stringify({
      type: 'init',
      data: {
        room: this.room,
        messages: this.room.messages.slice(-50)
      }
    }));

    ws.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        
        if (data.type === 'message') {
          const message: Message = {
            id: crypto.randomUUID(),
            userId: data.userId || 'anonymous',
            username: data.username || 'Anonymous',
            content: data.content,
            timestamp: new Date().toISOString(),
            type: 'text'
          };
          
          this.room.messages.push(message);
          await this.broadcastMessage(message);
          await this.state.storage.put('messages', this.room.messages);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.addEventListener('close', () => {
      this.websockets.delete(id);
    });
  }

  private async broadcastMessage(message: Message) {
    const serialized = JSON.stringify({
      type: 'message',
      data: message
    });
    
    const promises = [];
    for (const [id, ws] of this.websockets) {
      try {
        ws.send(serialized);
      } catch (error) {
        this.websockets.delete(id);
      }
    }
    
    await Promise.allSettled(promises);
  }
}

// Main Worker
export class DurableChatTemplate {
  private app: Hono<any>;
  private env: any;

  constructor(env: any) {
    this.env = env;
    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.use('*', cors());
    this.app.use('*', logger());

    // Create room
    this.app.post('/api/rooms', async (c) => {
      const { name, description } = await c.req.json();
      const id = crypto.randomUUID();
      
      const room = this.env.CHAT_ROOM.idFromName(id);
      const stub = this.env.CHAT_ROOM.get(room);
      
      // Initialize room with name and description
      const response = await stub.fetch(new Request(`${this.env.WORKER_URL}/rooms/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      }));
      
      const data = await response.json();
      
      return c.json({
        success: true,
        data: {
          id,
          ...data
        }
      });
    });

    // Proxy to room
    this.app.all('/api/rooms/:id/*', async (c) => {
      const id = c.req.param('id');
      const path = c.req.path.replace(`/api/rooms/${id}`, '');
      
      const room = this.env.CHAT_ROOM.idFromName(id);
      const stub = this.env.CHAT_ROOM.get(room);
      
      const url = new URL(c.req.url);
      const request = new Request(url, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.raw.body
      });
      
      return stub.fetch(request);
    });

    // WebSocket endpoint
    this.app.get('/api/rooms/:id/ws', async (c) => {
      const id = c.req.param('id');
      const room = this.env.CHAT_ROOM.idFromName(id);
      const stub = this.env.CHAT_ROOM.get(room);
      
      const url = new URL(c.req.url);
      const request = new Request(url, {
        method: 'GET',
        headers: c.req.raw.headers,
        body: null
      });
      
      return stub.fetch(request);
    });

    // List rooms
    this.app.get('/api/rooms', async (c) => {
      // In production, maintain a list of rooms in KV
      const rooms = await this.env.KV_ROOMS.list();
      const roomList = [];
      
      for (const key of rooms.keys) {
        const roomData = await this.env.KV_ROOMS.get(key.name);
        if (roomData) {
          roomList.push(JSON.parse(roomData));
        }
      }
      
      return c.json({
        success: true,
        data: roomList,
        count: roomList.length
      });
    });
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createDurableChatTemplate(env: any) {
  return new DurableChatTemplate(env);
}
