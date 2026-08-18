// packages/core/src/templates/saas-admin/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { rateLimiter } from 'hono-rate-limiter';
import { logger } from 'hono/logger';

interface Organization {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'pending';
  users: number;
  storage: number;
  createdAt: string;
  updatedAt: string;
  settings: Record<string, any>;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  organizationId: string;
  lastLogin: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

interface Subscription {
  id: string;
  organizationId: string;
  plan: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  startDate: string;
  endDate: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  updatedAt: string;
}

export class SaaSAdminTemplate {
  private app: Hono<any>;
  private env: any;
  private jwtSecret: string;

  constructor(env: any) {
    this.env = env;
    this.jwtSecret = env.JWT_SECRET || 'your-secret-key-here';
    this.app = new Hono();
    this.setupMiddleware();
    this.setupAuth();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use('*', logger());
    this.app.use('*', cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400
    }));

    const limiter = rateLimiter({
      windowMs: 60 * 1000,
      limit: 100,
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
    });
    this.app.use('/api/*', limiter);
  }

  private setupAuth() {
    // Login endpoint
    this.app.post('/api/auth/login', async (c) => {
      const { email, password } = await c.req.json();
      const db = (c.env as any).DB;
      
      const user = await db.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(email).first();
      
      if (!user) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }
      
      // In production, use bcrypt to verify password
      const isValid = password === user.password; // Placeholder
      
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
          name: user.name,
          role: user.role,
          organizationId: user.organization_id
        }
      });
    });

    // Register endpoint
    this.app.post('/api/auth/register', async (c) => {
      const { email, password, name, organizationName } = await c.req.json();
      const db = (c.env as any).DB;
      
      // Check if user exists
      const existing = await db.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(email).first();
      
      if (existing) {
        return c.json({ error: 'User already exists' }, 400);
      }
      
      const userId = crypto.randomUUID();
      const orgId = crypto.randomUUID();
      const now = new Date().toISOString();
      
      // Create organization
      await db.prepare(
        'INSERT INTO organizations (id, name, plan, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(orgId, organizationName || 'My Organization', 'free', 'active', now, now).run();
      
      // Create user
      await db.prepare(
        'INSERT INTO users (id, email, name, password, role, organization_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(userId, email, name, password, 'admin', orgId, 'active', now, now).run();
      
      // Create default subscription
      await db.prepare(
        'INSERT INTO subscriptions (id, organization_id, plan, status, start_date, amount, currency, payment_method, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), orgId, 'free', 'active', now, 0, 'USD', 'none', now).run();
      
      const token = await this.generateToken({ id: userId, email, name, role: 'admin', organization_id: orgId });
      
      return c.json({
        success: true,
        token,
        user: {
          id: userId,
          email,
          name,
          role: 'admin',
          organizationId: orgId
        }
      });
    });

    // Protected routes
    this.app.use('/api/*', jwt({
      secret: this.jwtSecret,
      alg: 'HS256'
    }));
  }

  private async generateToken(user: any): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organization_id,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
    };
    
    // Use JWT library or implement your own
    return 'generated-jwt-token';
  }

  private setupRoutes() {
    // Admin dashboard data
    this.app.get('/api/admin/stats', async (c) => {
      const db = (c.env as any).DB;
      
      const [totalUsers, totalOrgs, activeSubscriptions, revenue] = await Promise.all([
        db.prepare('SELECT COUNT(*) as count FROM users').first(),
        db.prepare('SELECT COUNT(*) as count FROM organizations').first(),
        db.prepare('SELECT COUNT(*) as count FROM subscriptions WHERE status = "active"').first(),
        db.prepare('SELECT SUM(amount) as total FROM subscriptions WHERE status = "active"').first()
      ]);
      
      return c.json({
        success: true,
        stats: {
          totalUsers: (totalUsers as any).count || 0,
          totalOrganizations: (totalOrgs as any).count || 0,
          activeSubscriptions: (activeSubscriptions as any).count || 0,
          monthlyRevenue: (revenue as any).total || 0,
          timestamp: new Date().toISOString()
        }
      });
    });

    // Organization management
    this.app.get('/api/admin/organizations', async (c) => {
      const db = (c.env as any).DB;
      const { page = '1', limit = '20', search } = c.req.query();
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      
      let query = 'SELECT * FROM organizations';
      const params = [];
      
      if (search) {
        query += ' WHERE name LIKE ?';
        params.push(`%${search}%`);
      }
      
      query += ' LIMIT ? OFFSET ?';
      params.push(limitNum, offset);
      
      const organizations = await db.prepare(query).bind(...params).all();
      const total = await db.prepare('SELECT COUNT(*) as count FROM organizations').first();
      
      return c.json({
        success: true,
        data: organizations.results,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: (total as any).count,
          pages: Math.ceil((total as any).count / limitNum)
        }
      });
    });

    this.app.get('/api/admin/organizations/:id', async (c) => {
      const id = c.req.param('id');
      const db = (c.env as any).DB;
      
      const org = await db.prepare('SELECT * FROM organizations WHERE id = ?').bind(id).first();
      
      if (!org) {
        return c.json({ error: 'Organization not found' }, 404);
      }
      
      const users = await db.prepare('SELECT * FROM users WHERE organization_id = ?').bind(id).all();
      const subscriptions = await db.prepare('SELECT * FROM subscriptions WHERE organization_id = ?').bind(id).all();
      
      return c.json({
        success: true,
        organization: org,
        users: users.results,
        subscriptions: subscriptions.results
      });
    });

    this.app.put('/api/admin/organizations/:id', async (c) => {
      const id = c.req.param('id');
      const data = await c.req.json();
      const db = (c.env as any).DB;
      
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
        `UPDATE organizations SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`
      ).bind(...values).run();
      
      const org = await db.prepare('SELECT * FROM organizations WHERE id = ?').bind(id).first();
      
      return c.json({
        success: true,
        organization: org
      });
    });

    // User management
    this.app.get('/api/admin/users', async (c) => {
      const db = (c.env as any).DB;
      const { page = '1', limit = '20', role, status } = c.req.query();
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      
      let query = 'SELECT * FROM users';
      const params = [];
      const conditions = [];
      
      if (role) {
        conditions.push('role = ?');
        params.push(role);
      }
      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
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
          total: (total as any).count,
          pages: Math.ceil((total as any).count / limitNum)
        }
      });
    });

    this.app.put('/api/admin/users/:id', async (c) => {
      const id = c.req.param('id');
      const data = await c.req.json();
      const db = (c.env as any).DB;
      
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
        `UPDATE users SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`
      ).bind(...values).run();
      
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      
      return c.json({
        success: true,
        user
      });
    });

    // Subscription management
    this.app.get('/api/admin/subscriptions', async (c) => {
      const db = (c.env as any).DB;
      const { page = '1', limit = '20', status } = c.req.query();
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      
      let query = 'SELECT * FROM subscriptions';
      const params = [];
      
      if (status) {
        query += ' WHERE status = ?';
        params.push(status);
      }
      
      query += ' LIMIT ? OFFSET ?';
      params.push(limitNum, offset);
      
      const subscriptions = await db.prepare(query).bind(...params).all();
      const total = await db.prepare('SELECT COUNT(*) as count FROM subscriptions').first();
      
      return c.json({
        success: true,
        data: subscriptions.results,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: (total as any).count,
          pages: Math.ceil((total as any).count / limitNum)
        }
      });
    });

    // Analytics endpoints
    this.app.get('/api/admin/analytics/revenue', async (c) => {
      const db = (c.env as any).DB;
      const { period = 'monthly' } = c.req.query();
      
      let query = '';
      
      if (period === 'monthly') {
        query = `
          SELECT strftime('%Y-%m', created_at) as period, 
                 SUM(amount) as revenue,
                 COUNT(*) as count
          FROM subscriptions 
          WHERE status = 'active'
          GROUP BY strftime('%Y-%m', created_at)
          ORDER BY period DESC
          LIMIT 12
        `;
      } else if (period === 'daily') {
        query = `
          SELECT strftime('%Y-%m-%d', created_at) as period, 
                 SUM(amount) as revenue,
                 COUNT(*) as count
          FROM subscriptions 
          WHERE status = 'active'
          GROUP BY strftime('%Y-%m-%d', created_at)
          ORDER BY period DESC
          LIMIT 30
        `;
      }
      
      const results = await db.prepare(query).all();
      
      return c.json({
        success: true,
        data: results.results,
        period,
        timestamp: new Date().toISOString()
      });
    });

    // Health endpoint
    this.app.get('/api/health', async (c) => {
      const db = (c.env as any).DB;
      try {
        await db.prepare('SELECT 1').run();
        return c.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        });
      } catch (error) {
        return c.json({
          status: 'unhealthy',
          error: (error as Error).message,
          timestamp: new Date().toISOString()
        }, 503);
      }
    });
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createSaaSAdminTemplate(env: any) {
  return new SaaSAdminTemplate(env);
}
