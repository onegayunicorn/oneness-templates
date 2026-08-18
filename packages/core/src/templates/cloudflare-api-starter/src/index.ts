// packages/core/src/templates/cloudflare-api-starter/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { cache } from 'hono/cache';
import { rateLimiter } from 'hono-rate-limiter';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { nanoid } from 'nanoid';

// Types
export interface Bindings {
  DB: D1Database;
  KV_CACHE: KVNamespace;
  KV_SESSIONS: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
  AI: any;
  QUEUE: Queue;
  R2: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  API_VERSION: string;
}

export interface Variables {
  userId: string;
  userEmail: string;
  userRole: string;
  requestId: string;
}

// Schemas
const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  role: z.enum(['admin', 'user', 'viewer']).default('user')
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const ResourceSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  priority: z.number().min(0).max(5).default(0),
  metadata: z.record(z.any()).optional()
});

// Main Application
export class CloudflareAPIStarter {
  private app: Hono<{ Bindings: Bindings; Variables: Variables }>;
  private env: Bindings;
  private jwtSecret: string;

  constructor(env: Bindings) {
    this.env = env;
    this.jwtSecret = env.JWT_SECRET || 'your-secret-key-change-me';
    this.app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // Request ID
    this.app.use('*', async (c, next) => {
      c.set('requestId', crypto.randomUUID());
      await next();
    });

    // Logger
    this.app.use('*', logger());

    // Security Headers
    this.app.use('*', secureHeaders());

    // CORS
    this.app.use('*', cors({
      origin: (origin) => {
        const allowed = ['*.workers.dev', '*.onegayunicorn.com', 'localhost:*'];
        return allowed.some(p => {
          const regex = new RegExp(p.replace('*', '.*'));
          return regex.test(origin);
        }) ? origin : 'https://oneness.workers.dev';
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400
    }));

    // Rate Limiting - Global
    const globalLimiter = rateLimiter({
      windowMs: 60 * 1000,
      limit: 1000,
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
    });
    this.app.use('*', globalLimiter);

    // Rate Limiting - Auth (strict)
    const authLimiter = rateLimiter({
      windowMs: 60 * 1000,
      limit: 10,
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
    });
    this.app.use('/api/auth/*', authLimiter);

    // Cache
    this.app.use('/api/*', async (c, next) => {
      if (c.req.method === 'GET') {
        const cached = await c.env.KV_CACHE.get(c.req.url);
        if (cached) {
          return c.json(JSON.parse(cached), 200, {
            'X-Cache': 'HIT',
            'Cache-Control': 'public, max-age=300'
          });
        }
        await next();
        if (c.res.status === 200) {
          const response = await c.res.clone().json();
          await c.env.KV_CACHE.put(c.req.url, JSON.stringify(response), {
            expirationTtl: 300
          });
        }
      } else {
        await next();
        const keys = await c.env.KV_CACHE.list({ prefix: '/api/' });
        for (const key of keys.keys) {
          await c.env.KV_CACHE.delete(key.name);
        }
      }
    });

    // Response timing
    this.app.use('*', async (c, next) => {
      const start = Date.now();
      await next();
      c.header('X-Response-Time', `${Date.now() - start}ms`);
      c.header('X-Request-ID', c.get('requestId'));
    });
  }

  private setupRoutes() {
    // Health
    this.app.get('/api/health', async (c) => {
      try {
        await c.env.DB.prepare('SELECT 1').run();
        return c.json({
          success: true,
          data: {
            status: 'healthy',
            version: c.env.API_VERSION || '1.0.0',
            environment: c.env.ENVIRONMENT || 'development',
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        return c.json({
          success: false,
          error: 'Health check failed',
          details: (error as Error).message
        }, 503);
      }
    });

    // Auth Routes
    this.app.post('/api/auth/register', zValidator('json', UserSchema), async (c) => {
      const data = await c.req.valid('json');
      const db = c.env.DB;

      const existing = await db.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(data.email).first();

      if (existing) {
        return c.json({
          success: false,
          error: 'User already exists',
          code: 'USER_EXISTS'
        }, 409);
      }

      const id = nanoid();
      const now = new Date().toISOString();

      await db.prepare(
        `INSERT INTO users (id, email, password, name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        data.email,
        data.password, // In production: hash with bcrypt
        data.name,
        data.role || 'user',
        'active',
        now,
        now
      ).run();

      const token = await this.generateToken({ id, email: data.email, name: data.name, role: data.role });

      return c.json({
        success: true,
        data: {
          user: { id, email: data.email, name: data.name, role: data.role },
          token
        }
      }, 201);
    });

    this.app.post('/api/auth/login', zValidator('json', LoginSchema), async (c) => {
      const data = await c.req.valid('json');
      const db = c.env.DB;

      const user = await db.prepare(
        'SELECT * FROM users WHERE email = ? AND status = "active"'
      ).bind(data.email).first();

      if (!user) {
        return c.json({
          success: false,
          error: 'Invalid credentials',
          code: 'AUTH_FAILED'
        }, 401);
      }

      // In production: verify with bcrypt
      if (data.password !== user.password) {
        return c.json({
          success: false,
          error: 'Invalid credentials',
          code: 'AUTH_FAILED'
        }, 401);
      }

      const now = new Date().toISOString();
      await db.prepare(
        'UPDATE users SET last_login = ? WHERE id = ?'
      ).bind(now, user.id).run();

      const token = await this.generateToken(user);

      return c.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          },
          token
        }
      });
    });

    // Protected Routes Middleware
    const auth = async (c: any, next: any) => {
      const authHeader = c.req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }, 401);
      }

      try {
        const token = authHeader.substring(7);
        const payload = JSON.parse(token);
        if (payload.exp < Math.floor(Date.now() / 1000)) {
          throw new Error('Token expired');
        }
        c.set('userId', payload.sub);
        c.set('userEmail', payload.email);
        c.set('userRole', payload.role);
        await next();
      } catch (error) {
        return c.json({
          success: false,
          error: 'Invalid or expired token',
          code: 'AUTH_INVALID'
        }, 401);
      }
    };

    const role = (allowed: string[]) => async (c: any, next: any) => {
      if (!allowed.includes(c.get('userRole'))) {
        return c.json({
          success: false,
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED'
        }, 403);
      }
      await next();
    };

    // Resource Routes
    this.app.get('/api/resources', auth, async (c) => {
      const userId = c.get('userId');
      const db = c.env.DB;
      const { page = '1', limit = '20', status } = c.req.query();

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      let query = 'SELECT * FROM resources WHERE user_id = ?';
      const params: any[] = [userId];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limitNum, offset);

      const resources = await db.prepare(query).bind(...params).all();
      const total = await db.prepare(
        'SELECT COUNT(*) as count FROM resources WHERE user_id = ?'
      ).bind(userId).first();

      return c.json({
        success: true,
        data: resources.results,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: (total as any).count || 0,
          pages: Math.ceil(((total as any).count || 0) / limitNum)
        }
      });
    });

    this.app.post('/api/resources', auth, zValidator('json', ResourceSchema), async (c) => {
      const userId = c.get('userId');
      const data = await c.req.valid('json');
      const db = c.env.DB;

      const id = nanoid();
      const now = new Date().toISOString();

      await db.prepare(
        `INSERT INTO resources (id, user_id, title, description, status, priority, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        userId,
        data.title,
        data.description || '',
        data.status,
        data.priority || 0,
        JSON.stringify(data.metadata || {}),
        now,
        now
      ).run();

      const resource = await db.prepare('SELECT * FROM resources WHERE id = ?').bind(id).first();

      return c.json({
        success: true,
        data: resource
      }, 201);
    });

    this.app.get('/api/resources/:id', auth, async (c) => {
      const userId = c.get('userId');
      const id = c.req.param('id');
      const db = c.env.DB;

      const resource = await db.prepare(
        'SELECT * FROM resources WHERE id = ? AND user_id = ?'
      ).bind(id, userId).first();

      if (!resource) {
        return c.json({
          success: false,
          error: 'Resource not found',
          code: 'RESOURCE_NOT_FOUND'
        }, 404);
      }

      await db.prepare('UPDATE resources SET views = views + 1 WHERE id = ?').bind(id).run();

      return c.json({
        success: true,
        data: resource
      });
    });

    this.app.put('/api/resources/:id', auth, zValidator('json', ResourceSchema.partial()), async (c) => {
      const userId = c.get('userId');
      const id = c.req.param('id');
      const data = await c.req.valid('json');
      const db = c.env.DB;

      const existing = await db.prepare(
        'SELECT * FROM resources WHERE id = ? AND user_id = ?'
      ).bind(id, userId).first();

      if (!existing) {
        return c.json({
          success: false,
          error: 'Resource not found',
          code: 'RESOURCE_NOT_FOUND'
        }, 404);
      }

      const updates = [];
      const values = [];

      for (const [key, value] of Object.entries(data)) {
        if (key !== 'id' && key !== 'user_id') {
          updates.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (updates.length === 0) {
        return c.json({
          success: false,
          error: 'No fields to update',
          code: 'NO_FIELDS'
        }, 400);
      }

      values.push(id);
      await db.prepare(`UPDATE resources SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

      const resource = await db.prepare('SELECT * FROM resources WHERE id = ?').bind(id).first();

      return c.json({
        success: true,
        data: resource
      });
    });

    this.app.delete('/api/resources/:id', auth, async (c) => {
      const userId = c.get('userId');
      const id = c.req.param('id');
      const db = c.env.DB;

      const result = await db.prepare(
        'DELETE FROM resources WHERE id = ? AND user_id = ?'
      ).bind(id, userId).run();

      if (result.meta.changes === 0) {
        return c.json({
          success: false,
          error: 'Resource not found',
          code: 'RESOURCE_NOT_FOUND'
        }, 404);
      }

      return c.json({
        success: true,
        message: 'Resource deleted successfully'
      });
    });

    // Admin Routes
    this.app.get('/api/admin/users', auth, role(['admin']), async (c) => {
      const db = c.env.DB;
      const { page = '1', limit = '20', status } = c.req.query();

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      let query = 'SELECT id, email, name, role, status, last_login, created_at FROM users';
      const params = [];

      if (status) {
        query += ' WHERE status = ?';
        params.push(status);
      }

      query += ' LIMIT ? OFFSET ?';
      params.push(limitNum, offset);

      const users = await db.prepare(query).bind(...params).all();
      const total = await db.prepare('SELECT COUNT(*) as count FROM users').first();

      return c.json({
        success: true,
        data: users.results,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: (total as any).count || 0,
          pages: Math.ceil(((total as any).count || 0) / limitNum)
        }
      });
    });

    this.app.put('/api/admin/users/:id/status', auth, role(['admin']), async (c) => {
      const id = c.req.param('id');
      const { status } = await c.req.json();
      const db = c.env.DB;

      await db.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, id).run();

      return c.json({
        success: true,
        message: 'User status updated successfully'
      });
    });

    // WebSocket
    this.app.get('/api/ws', auth, async (c) => {
      const upgradeHeader = c.req.header('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return c.text('Expected websocket', 426);
      }

      const userId = c.get('userId');
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      server.send(JSON.stringify({
        type: 'connected',
        userId,
        timestamp: new Date().toISOString()
      }));

      server.addEventListener('message', async (event: any) => {
        try {
          const data = JSON.parse(event.data);
          server.send(JSON.stringify({
            type: 'echo',
            data,
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          server.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format'
          }));
        }
      });

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    });

    // Fallback
    this.app.get('*', (c) => {
      return c.json({
        success: false,
        error: 'Not found',
        code: 'NOT_FOUND',
        path: c.req.path
      }, 404);
    });
  }

  private async generateToken(user: any): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
    };
    return JSON.stringify(payload);
  }

  public async handle(request: Request, env: Bindings): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const template = new CloudflareAPIStarter(env);
    return template.handle(request, env);
  }
};
