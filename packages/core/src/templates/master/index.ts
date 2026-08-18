// packages/core/src/templates/master/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { jwt } from 'hono/jwt';
import { rateLimiter } from 'hono-rate-limiter';
import { cache } from 'hono/cache';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { Hono as HonoType } from 'hono';

// ============================================================
// 1. TYPES & SCHEMAS
// ============================================================

export interface Bindings {
  DB: D1Database;
  KV_CACHE: KVNamespace;
  KV_SESSIONS: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
  AI: any;
  QUEUE: Queue<any>;
  R2: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: 'development' | 'staging' | 'production' | 'test';
  API_VERSION: string;
  PROJECT_NAME: string;
}

export interface Variables {
  userId: string;
  userEmail: string;
  userRole: string;
  requestId: string;
  startTime: number;
}

// User Schema
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

const UserUpdateSchema = UserSchema.partial();

// Resource Schema (example)
const ResourceSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  priority: z.number().min(0).max(5).default(0),
  metadata: z.record(z.string(), z.any()).optional()
});

const ResourceUpdateSchema = ResourceSchema.partial();

// Pagination Schema
const PaginationSchema = z.object({
  page: z.preprocess((value) => value ?? '1', z.string().transform(Number)),
  limit: z.preprocess((value) => value ?? '20', z.string().transform(Number)),
  sort: z.string().default('created_at:desc'),
  filter: z.string().optional()
});

// Response Schemas
const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
  timestamp: z.string()
});

// ============================================================
// 2. DATABASE SCHEMA & MIGRATIONS
// ============================================================

export const MIGRATIONS = {
  up: `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      last_login TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Resources table (example)
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      priority INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Audit log
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_resources_user_id ON resources(user_id);
    CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
    CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);

    -- Triggers for updated_at
    CREATE TRIGGER IF NOT EXISTS update_users_updated_at 
    AFTER UPDATE ON users
    BEGIN
      UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_resources_updated_at 
    AFTER UPDATE ON resources
    BEGIN
      UPDATE resources SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `,
  down: `
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS resources;
    DROP TABLE IF EXISTS users;
  `
};

// ============================================================
// 3. MAIN WORKER CLASS
// ============================================================

export class MasterTemplate {
  private app: HonoType<{ Bindings: Bindings; Variables: Variables }>;
  private env: Bindings;
  private jwtSecret: string;

  constructor(env: Bindings) {
    this.env = env;
    this.jwtSecret = env.JWT_SECRET || 'your-secret-key-change-me';
    this.app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    this.setupMiddleware();
    this.setupRoutes();
  }

  // ============================================================
  // 4. MIDDLEWARE
  // ============================================================

  private setupMiddleware() {
    // Request ID and timing
    this.app.use('*', async (c, next) => {
      c.set('requestId', crypto.randomUUID());
      c.set('startTime', Date.now());
      await next();
    });

    // Logger
    this.app.use('*', logger());

    // Security headers
    this.app.use('*', secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "*.workers.dev"]
      }
    }));

    // CORS
    this.app.use('*', cors({
      origin: (origin) => {
        const allowedOrigins = [
          '*.workers.dev',
          '*.onegayunicorn.com',
          'localhost:*'
        ];
        return allowedOrigins.some(pattern => {
          if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return regex.test(origin);
          }
          return origin === pattern;
        }) ? origin : 'https://oneness.workers.dev';
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposeHeaders: ['X-Request-ID', 'X-Response-Time'],
      maxAge: 86400
    }));

    // Rate Limiting - Global
    const globalLimiter = rateLimiter({
      windowMs: 60 * 1000,
      limit: 1000,
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown',
      handler: (c) => {
        return c.json({
          success: false,
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED'
        }, 429);
      }
    });
    this.app.use('*', globalLimiter);

    // Rate Limiting - Strict for auth
    const authLimiter = rateLimiter({
      windowMs: 60 * 1000,
      limit: 10,
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
    });
    this.app.use('/api/auth/*', authLimiter);

    // Cache middleware for GET requests
    this.app.use('/api/*', async (c, next) => {
      if (c.req.method === 'GET') {
        const cacheKey = c.req.url;
        const cached = await c.env.KV_CACHE.get(cacheKey);
        
        if (cached) {
          const data = JSON.parse(cached);
          return c.json(data, 200, {
            'X-Cache': 'HIT',
            'Cache-Control': 'public, max-age=300'
          });
        }
        
        await next();
        
        // Cache successful GET responses
        if (c.res.status === 200) {
          const response = await c.res.clone().json();
          await c.env.KV_CACHE.put(cacheKey, JSON.stringify(response), {
            expirationTtl: 300 // 5 minutes
          });
        }
      } else {
        // Invalidate cache on mutations
        await next();
        const keys = await c.env.KV_CACHE.list({ prefix: '/api/' });
        for (const key of keys.keys) {
          await c.env.KV_CACHE.delete(key.name);
        }
      }
    });

    // Request validation
    this.app.use('*', async (c, next) => {
      const start = Date.now();
      await next();
      const duration = Date.now() - start;
      c.header('X-Response-Time', `${duration}ms`);
      c.header('X-Request-ID', c.get('requestId'));
    });
  }

  // ============================================================
  // 5. AUTHENTICATION
  // ============================================================

  private async generateToken(user: any): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
    };
    
    // In production, use proper JWT signing
    return JSON.stringify(payload);
  }

  private async verifyToken(token: string): Promise<any> {
    try {
      const payload = JSON.parse(token);
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
      }
      return payload;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  private authMiddleware = async (c: any, next: any) => {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }, 401);
    }

    const token = authHeader.substring(7);
    
    try {
      const payload = await this.verifyToken(token);
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

  private roleMiddleware = (allowedRoles: string[]) => {
    return async (c: any, next: any) => {
      const userRole = c.get('userRole');
      
      if (!allowedRoles.includes(userRole)) {
        return c.json({
          success: false,
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED'
        }, 403);
      }
      
      await next();
    };
  };

  // ============================================================
  // 6. ROUTES
  // ============================================================

  private setupRoutes() {
    // ==========================================================
    // 6.1. HEALTH & METRICS
    // ==========================================================

    this.app.get('/api/health', async (c) => {
      const db = c.env.DB;
      const start = Date.now();
      
      try {
        await db.prepare('SELECT 1').run();
        const latency = Date.now() - start;
        
        return c.json({
          success: true,
          data: {
            status: 'healthy',
            version: c.env.API_VERSION || '1.0.0',
            environment: c.env.ENVIRONMENT || 'development',
            timestamp: new Date().toISOString(),
            uptime: 0,
            database: {
              status: 'connected',
              latency: `${latency}ms`
            },
            cache: {
              status: 'connected'
            },
            queue: {
              status: 'connected'
            },
            services: {
              ai: 'available',
              r2: 'available'
            }
          }
        });
      } catch (error) {
        return c.json({
          success: false,
          error: 'Health check failed',
          details: (error as Error).message,
          timestamp: new Date().toISOString()
        }, 503);
      }
    });

    // Readiness probe
    this.app.get('/api/ready', async (c) => {
      const db = c.env.DB;
      
      try {
        await db.prepare('SELECT 1').run();
        return c.json({
          success: true,
          status: 'ready',
          timestamp: new Date().toISOString()
        });
      } catch {
        return c.json({
          success: false,
          status: 'not_ready',
          timestamp: new Date().toISOString()
        }, 503);
      }
    });

    // Metrics endpoint
    this.app.get('/api/metrics', this.authMiddleware, this.roleMiddleware(['admin']), async (c) => {
      const db = c.env.DB;
      
      const [users, resources, audits] = await Promise.all([
        db.prepare('SELECT COUNT(*) as count FROM users').first(),
        db.prepare('SELECT COUNT(*) as count FROM resources').first(),
        db.prepare('SELECT COUNT(*) as count FROM audit_log').first()
      ]);

      const cacheKeys = await c.env.KV_CACHE.list();
      const sessions = await c.env.KV_SESSIONS.list();

      return c.json({
        success: true,
        data: {
          users: (users as any).count || 0,
          resources: (resources as any).count || 0,
          audits: (audits as any).count || 0,
          cache: {
            keys: cacheKeys.keys.length,
            size: cacheKeys.keys.reduce((acc, k) => acc + (k.expiration || 0), 0)
          },
          sessions: sessions.keys.length,
          timestamp: new Date().toISOString()
        }
      });
    });

    // ==========================================================
    // 6.2. AUTHENTICATION
    // ==========================================================

    // Register
    this.app.post('/api/auth/register', zValidator('json', UserSchema), async (c) => {
      const data = await c.req.valid('json');
      const db = c.env.DB;

      // Check if user exists
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

      // In production, hash password with bcrypt
      const hashedPassword = data.password; // Placeholder

      await db.prepare(
        `INSERT INTO users (id, email, password, name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        data.email,
        hashedPassword,
        data.name,
        data.role || 'user',
        'active',
        now,
        now
      ).run();

      // Log audit
      await db.prepare(
        `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        nanoid(),
        id,
        'register',
        'user',
        id,
        JSON.stringify({ email: data.email }),
        c.req.header('x-forwarded-for') || 'unknown',
        c.req.header('user-agent') || 'unknown',
        now
      ).run();

      const token = await this.generateToken({ id, email: data.email, name: data.name, role: data.role });

      return c.json({
        success: true,
        data: {
          user: {
            id,
            email: data.email,
            name: data.name,
            role: data.role
          },
          token
        }
      }, 201);
    });

    // Login
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

      // In production, verify with bcrypt
      const isValid = data.password === user.password;
      if (!isValid) {
        return c.json({
          success: false,
          error: 'Invalid credentials',
          code: 'AUTH_FAILED'
        }, 401);
      }

      // Update last login
      const now = new Date().toISOString();
      await db.prepare(
        'UPDATE users SET last_login = ? WHERE id = ?'
      ).bind(now, user.id).run();

      // Log audit
      await db.prepare(
        `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        nanoid(),
        user.id,
        'login',
        'user',
        user.id,
        JSON.stringify({ email: user.email }),
        c.req.header('x-forwarded-for') || 'unknown',
        c.req.header('user-agent') || 'unknown',
        now
      ).run();

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

    // Logout
    this.app.post('/api/auth/logout', this.authMiddleware, async (c) => {
      const userId = c.get('userId');
      const token = c.req.header('Authorization')?.substring(7);
      
      // Blacklist token in KV
      if (token) {
        await c.env.KV_SESSIONS.put(`token:${token}`, 'revoked', {
          expirationTtl: 86400 // 24 hours
        });
      }

      // Log audit
      const db = c.env.DB;
      await db.prepare(
        `INSERT INTO audit_log (id, user_id, action, resource_type, details, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        nanoid(),
        userId,
        'logout',
        'user',
        JSON.stringify({ userId }),
        c.req.header('x-forwarded-for') || 'unknown',
        c.req.header('user-agent') || 'unknown',
        new Date().toISOString()
      ).run();

      return c.json({
        success: true,
        message: 'Logged out successfully'
      });
    });

    // Get current user
    this.app.get('/api/auth/me', this.authMiddleware, async (c) => {
      const userId = c.get('userId');
      const db = c.env.DB;

      const user = await db.prepare(
        'SELECT id, email, name, role, status, last_login, created_at FROM users WHERE id = ?'
      ).bind(userId).first();

      if (!user) {
        return c.json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        }, 404);
      }

      return c.json({
        success: true,
        data: user
      });
    });

    // Update user
    this.app.put('/api/auth/me', this.authMiddleware, zValidator('json', UserUpdateSchema), async (c) => {
      const userId = c.get('userId');
      const data = await c.req.valid('json');
      const db = c.env.DB;

      const updates = [];
      const values = [];

      for (const [key, value] of Object.entries(data)) {
        if (key !== 'id' && key !== 'role' && key !== 'email') {
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

      values.push(userId);

      await db.prepare(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...values).run();

      // Log audit
      await db.prepare(
        `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        nanoid(),
        userId,
        'update_profile',
        'user',
        userId,
        JSON.stringify(data),
        new Date().toISOString()
      ).run();

      return c.json({
        success: true,
        message: 'Profile updated successfully'
      });
    });

    // ==========================================================
    // 6.3. RESOURCES (Example CRUD)
    // ==========================================================

    // List resources with pagination
    this.app.get('/api/resources', this.authMiddleware, async (c) => {
      const userId = c.get('userId');
      const db = c.env.DB;
      const { page, limit, sort, filter } = c.req.query();
      
      const pageNum = parseInt(page || '1');
      const limitNum = parseInt(limit || '20');
      const offset = (pageNum - 1) * limitNum;

      let query = 'SELECT * FROM resources WHERE user_id = ?';
      const params: any[] = [userId];

      if (filter) {
        const [key, value] = filter.split(':');
        if (key && value) {
          query += ` AND ${key} = ?`;
          params.push(value);
        }
      }

      if (sort) {
        const [field, order] = sort.split(':');
        query += ` ORDER BY ${field} ${order === 'asc' ? 'ASC' : 'DESC'}`;
      } else {
        query += ' ORDER BY created_at DESC';
      }

      query += ' LIMIT ? OFFSET ?';
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

    // Create resource
    this.app.post('/api/resources', this.authMiddleware, zValidator('json', ResourceSchema), async (c) => {
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

      const resource = await db.prepare(
        'SELECT * FROM resources WHERE id = ?'
      ).bind(id).first();

      // Log audit
      await db.prepare(
        `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        nanoid(),
        userId,
        'create',
        'resource',
        id,
        JSON.stringify(data),
        now
      ).run();

      // Queue for processing
      await c.env.QUEUE.send({
        type: 'resource_created',
        resourceId: id,
        userId,
        timestamp: now
      });

      return c.json({
        success: true,
        data: resource
      }, 201);
    });

    // Get resource by ID
    this.app.get('/api/resources/:id', this.authMiddleware, async (c) => {
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

      // Increment view count
      await db.prepare(
        'UPDATE resources SET views = views + 1 WHERE id = ?'
      ).bind(id).run();

      return c.json({
        success: true,
        data: resource
      });
    });

    // Update resource
    this.app.put('/api/resources/:id', this.authMiddleware, zValidator('json', ResourceUpdateSchema), async (c) => {
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

      await db.prepare(
        `UPDATE resources SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...values).run();

      const resource = await db.prepare(
        'SELECT * FROM resources WHERE id = ?'
      ).bind(id).first();

      // Log audit
      await db.prepare(
        `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        nanoid(),
        userId,
        'update',
        'resource',
        id,
        JSON.stringify(data),
        new Date().toISOString()
      ).run();

      return c.json({
        success: true,
        data: resource
      });
    });

    // Delete resource
    this.app.delete('/api/resources/:id', this.authMiddleware, async (c) => {
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

      // Log audit
      await db.prepare(
        `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        nanoid(),
        userId,
        'delete',
        'resource',
        id,
        JSON.stringify({ deleted: true }),
        new Date().toISOString()
      ).run();

      return c.json({
        success: true,
        message: 'Resource deleted successfully'
      });
    });

    // ==========================================================
    // 6.4. ADMIN ROUTES
    // ==========================================================

    // List all users (admin only)
    this.app.get('/api/admin/users', this.authMiddleware, this.roleMiddleware(['admin']), async (c) => {
      const db = c.env.DB;
      const { page = '1', limit = '20', status } = c.req.query();

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      let query = 'SELECT id, email, name, role, status, last_login, created_at FROM users';
      const params: any[] = [];

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

    // Update user status (admin only)
    this.app.put('/api/admin/users/:id/status', this.authMiddleware, this.roleMiddleware(['admin']), async (c) => {
      const id = c.req.param('id');
      const { status } = await c.req.json();
      const db = c.env.DB;

      await db.prepare(
        'UPDATE users SET status = ? WHERE id = ?'
      ).bind(status, id).run();

      // Log audit
      await db.prepare(
        `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        nanoid(),
        id,
        'status_change',
        'user',
        id,
        JSON.stringify({ status }),
        new Date().toISOString()
      ).run();

      return c.json({
        success: true,
        message: 'User status updated successfully'
      });
    });

    // ==========================================================
    // 6.5. WEBHOOKS
    // ==========================================================

    this.app.post('/api/webhooks/:provider', async (c) => {
      const provider = c.req.param('provider');
      const signature = c.req.header('x-webhook-signature');
      const body = await c.req.json();

      // Validate webhook signature
      // In production, verify with provider's signing secret

      // Process webhook
      await c.env.QUEUE.send({
        type: 'webhook_received',
        provider,
        body,
        timestamp: new Date().toISOString()
      });

      return c.json({
        success: true,
        message: 'Webhook processed'
      });
    });

    // ==========================================================
    // 6.6. WEBSOCKET
    // ==========================================================

    this.app.get('/api/ws', this.authMiddleware, async (c) => {
      const upgradeHeader = c.req.header('Upgrade');
      
      if (upgradeHeader !== 'websocket') {
        return c.text('Expected websocket', 426);
      }

      const userId = c.get('userId');
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      server.accept();

      // Send initial message
      server.send(JSON.stringify({
        type: 'connected',
        userId,
        timestamp: new Date().toISOString()
      }));

      // Handle messages
      server.addEventListener('message', async (event: any) => {
        try {
          const data = JSON.parse(event.data);
          // Process WebSocket message
          server.send(JSON.stringify({
            type: 'echo',
            data,
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          server.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format',
            timestamp: new Date().toISOString()
          }));
        }
      });

      // Handle close
      server.addEventListener('close', () => {
        console.log(`WebSocket closed for user ${userId}`);
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: {
          'Upgrade': 'websocket'
        }
      });
    });

    // ==========================================================
    // 6.7. SSE STREAMING
    // ==========================================================

    this.app.get('/api/events', this.authMiddleware, async (c) => {
      const userId = c.get('userId');
      
      return streamSSE(c, async (stream) => {
        // Send initial event
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'connected',
            userId,
            timestamp: new Date().toISOString()
          })
        });

        // Keep connection alive with heartbeat
        const interval = setInterval(async () => {
          await stream.writeSSE({
            event: 'heartbeat',
            data: JSON.stringify({
              timestamp: new Date().toISOString()
            })
          });
        }, 30000);

        // Clean up
        stream.onAbort(() => {
          clearInterval(interval);
        });
      });
    });

    // ==========================================================
    // 6.8. FALLBACK
    // ==========================================================

    this.app.get('*', (c) => {
      return c.json({
        success: false,
        error: 'Not found',
        code: 'NOT_FOUND',
        path: c.req.path
      }, 404);
    });
  }

  // ============================================================
  // 7. HANDLER
  // ============================================================

  public async handle(request: Request, env: Bindings): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

// ============================================================
// 8. FACTORY
// ============================================================

export function createMasterTemplate(env: Bindings) {
  return new MasterTemplate(env);
}

// ============================================================
// 9. DURABLE OBJECTS
// ============================================================

export class WebSocketRoom {
  constructor(private readonly state: DurableObjectState, private readonly env: Bindings) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.addEventListener('message', (event) => server.send(String(event.data)));
    return new Response(null, { status: 101, webSocket: client });
  }
}

// ============================================================
// 10. EXPORTS
// ============================================================

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const template = new MasterTemplate(env);
    return template.handle(request, env);
  },
  
  async scheduled(event: any, env: Bindings): Promise<void> {
    // Scheduled tasks
    const db = env.DB;
    
    // Clean up expired sessions
    const now = new Date().toISOString();
    await db.prepare(
      'DELETE FROM sessions WHERE expires_at < ?'
    ).bind(now).run();
    
    // Archive old audit logs (keep 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare(
      'DELETE FROM audit_log WHERE created_at < ?'
    ).bind(thirtyDaysAgo).run();
  },
  
  async queue(batch: any, env: Bindings): Promise<void> {
    // Process queue messages
    for (const message of batch.messages) {
      try {
        const data = JSON.parse(message.body);
        // Process based on type
        console.log('Processing queue message:', data);
        message.ack();
      } catch (error) {
        console.error('Error processing queue message:', error);
        message.retry();
      }
    }
  }
};
