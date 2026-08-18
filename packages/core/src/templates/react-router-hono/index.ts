// packages/core/src/templates/react-router-hono/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/cloudflare-workers';
import { jwt } from 'hono/jwt';
import { rateLimiter } from 'hono-rate-limiter';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

// Schema definitions
const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const TaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  status: z.enum(['todo', 'in-progress', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.string().datetime().optional(),
});

export class ReactRouterHonoTemplate {
  private app: Hono<any>;
  private env: any;
  private jwtSecret: string;

  constructor(env: any) {
    this.env = env;
    this.jwtSecret = env.JWT_SECRET || 'your-secret-key-here';
    this.app = new Hono();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use('*', logger());
    this.app.use('*', cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }));

    const limiter = rateLimiter({
      windowMs: 60 * 1000,
      limit: 100,
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
    });
    this.app.use('/api/*', limiter);
  }

  private setupRoutes() {
    // Health check
    this.app.get('/api/health', (c) => {
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Auth routes
    this.app.post('/api/auth/register', zValidator('json', UserSchema), async (c) => {
      const data = await c.req.valid('json');
      const db = (c.env as any).DB;

      // Check if user exists
      const existing = await db.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(data.email).first();

      if (existing) {
        return c.json({ error: 'User already exists' }, 400);
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await db.prepare(
        'INSERT INTO users (id, email, password, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, data.email, data.password, data.name, now, now).run();

      // Generate JWT
      const token = await this.generateToken({ id, email: data.email, name: data.name });

      return c.json({
        success: true,
        token,
        user: {
          id,
          email: data.email,
          name: data.name
        }
      }, 201);
    });

    this.app.post('/api/auth/login', zValidator('json', LoginSchema), async (c) => {
      const data = await c.req.valid('json');
      const db = (c.env as any).DB;

      const user = await db.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(data.email).first();

      if (!user) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      // In production, use bcrypt
      const isValid = data.password === user.password;
      if (!isValid) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      const token = await this.generateToken(user);

      return c.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      });
    });

    this.app.get('/api/auth/me', jwt({ secret: this.jwtSecret, alg: 'HS256' }), async (c) => {
      const payload = c.get('jwtPayload') as any;
      const db = (c.env as any).DB;

      const user = await db.prepare(
        'SELECT id, email, name, created_at FROM users WHERE id = ?'
      ).bind(payload.sub).first();

      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }

      return c.json({ user });
    });

    // Task routes (protected)
    this.app.use('/api/tasks/*', jwt({ secret: this.jwtSecret, alg: 'HS256' }));

    this.app.get('/api/tasks', async (c) => {
      const payload = c.get('jwtPayload') as any;
      const db = (c.env as any).DB;
      const { status, page = '1', limit = '20' } = c.req.query();

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      let query = 'SELECT * FROM tasks WHERE user_id = ?';
      const params = [payload.sub];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' LIMIT ? OFFSET ?';
      params.push(limitNum, offset);

      const tasks = await db.prepare(query).bind(...params).all();
      const total = await db.prepare(
        'SELECT COUNT(*) as count FROM tasks WHERE user_id = ?'
      ).bind(payload.sub).first();

      return c.json({
        success: true,
        data: tasks.results,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: (total as any).count,
          pages: Math.ceil((total as any).count / limitNum)
        }
      });
    });

    this.app.post('/api/tasks', zValidator('json', TaskSchema), async (c) => {
      const payload = c.get('jwtPayload') as any;
      const data = await c.req.valid('json');
      const db = (c.env as any).DB;

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await db.prepare(
        `INSERT INTO tasks (id, user_id, title, description, status, priority, due_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        payload.sub,
        data.title,
        data.description || '',
        data.status,
        data.priority,
        data.dueDate || null,
        now,
        now
      ).run();

      const task = await db.prepare(
        'SELECT * FROM tasks WHERE id = ?'
      ).bind(id).first();

      return c.json({
        success: true,
        data: task
      }, 201);
    });

    this.app.get('/api/tasks/:id', async (c) => {
      const payload = c.get('jwtPayload') as any;
      const id = c.req.param('id');
      const db = (c.env as any).DB;

      const task = await db.prepare(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ?'
      ).bind(id, payload.sub).first();

      if (!task) {
        return c.json({ error: 'Task not found' }, 404);
      }

      return c.json({
        success: true,
        data: task
      });
    });

    this.app.put('/api/tasks/:id', zValidator('json', TaskSchema.partial()), async (c) => {
      const payload = c.get('jwtPayload') as any;
      const id = c.req.param('id');
      const data = await c.req.valid('json');
      const db = (c.env as any).DB;

      const existing = await db.prepare(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ?'
      ).bind(id, payload.sub).first();

      if (!existing) {
        return c.json({ error: 'Task not found' }, 404);
      }

      const updates = [];
      const values = [];

      for (const [key, value] of Object.entries(data)) {
        updates.push(`${key} = ?`);
        values.push(value);
      }

      if (updates.length === 0) {
        return c.json({ error: 'No fields to update' }, 400);
      }

      const now = new Date().toISOString();
      values.push(now);
      values.push(id);

      await db.prepare(
        `UPDATE tasks SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`
      ).bind(...values).run();

      const task = await db.prepare(
        'SELECT * FROM tasks WHERE id = ?'
      ).bind(id).first();

      return c.json({
        success: true,
        data: task
      });
    });

    this.app.delete('/api/tasks/:id', async (c) => {
      const payload = c.get('jwtPayload') as any;
      const id = c.req.param('id');
      const db = (c.env as any).DB;

      const result = await db.prepare(
        'DELETE FROM tasks WHERE id = ? AND user_id = ?'
      ).bind(id, payload.sub).run();

      if (result.meta.changes === 0) {
        return c.json({ error: 'Task not found' }, 404);
      }

      return c.json({
        success: true,
        message: 'Task deleted successfully'
      });
    });

    // Stats endpoint
    this.app.get('/api/stats', jwt({ secret: this.jwtSecret, alg: 'HS256' }), async (c) => {
      const payload = c.get('jwtPayload') as any;
      const db = (c.env as any).DB;

      const [total, completed, inProgress, todo] = await Promise.all([
        db.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_id = ?').bind(payload.sub).first(),
        db.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = "done"').bind(payload.sub).first(),
        db.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = "in-progress"').bind(payload.sub).first(),
        db.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = "todo"').bind(payload.sub).first()
      ]);

      return c.json({
        success: true,
        stats: {
          total: (total as any).count || 0,
          completed: (completed as any).count || 0,
          inProgress: (inProgress as any).count || 0,
          todo: (todo as any).count || 0
        }
      });
    });

    // Serve React app for non-API routes
    this.app.get('*', serveStatic({ root: './dist' }));
  }

  private async generateToken(user: any): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
    };
    // In production, use proper JWT signing
    return JSON.stringify(payload);
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createReactRouterHonoTemplate(env: any) {
  return new ReactRouterHonoTemplate(env);
}
