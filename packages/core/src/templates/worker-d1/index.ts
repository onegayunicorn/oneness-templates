// packages/core/src/templates/worker-d1/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { rateLimiter } from 'hono-rate-limiter';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

interface ModelConfig {
  tableName: string;
  schema: Record<string, any>;
  validators: Record<string, (value: any) => boolean>;
  hooks: {
    beforeCreate?: (data: any) => any;
    afterCreate?: (data: any) => void;
    beforeUpdate?: (data: any) => any;
    afterUpdate?: (data: any) => void;
    beforeDelete?: (id: string) => void;
    afterDelete?: (id: string) => void;
  };
}

export class WorkerD1Template {
  private app: Hono;
  private env: any;
  private models: Map<string, ModelConfig>;

  constructor(env: any) {
    this.env = env;
    this.app = new Hono();
    this.models = new Map();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupModelRoutes();
  }

  private setupMiddleware() {
    // Logger
    this.app.use('*', logger());
    
    // CORS
    this.app.use('*', cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400
    }));
    
    // Security headers
    this.app.use('*', secureHeaders());
    
    // Rate limiting
    const limiter = rateLimiter({
      windowMs: 60 * 1000,
      limit: 100,
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
    });
    this.app.use('*', limiter);
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', async (c) => {
      const db = c.env.DB;
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

    // Database info
    this.app.get('/db-info', async (c) => {
      const db = c.env.DB;
      const tables = await db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all();
      
      return c.json({
        tables: tables.results,
        modelCount: this.models.size,
        timestamp: new Date().toISOString()
      });
    });

    // Create table endpoint
    this.app.post('/create-table', async (c) => {
      const { tableName, schema } = await c.req.json();
      
      // Validate schema
      if (!this.validateSchema(schema)) {
        return c.json({ error: 'Invalid schema' }, 400);
      }
      
      const db = c.env.DB;
      const columns = Object.entries(schema).map(([name, type]) => 
        `${name} ${type}`
      ).join(', ');
      
      const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (id TEXT PRIMARY KEY, ${columns}, created_at TEXT, updated_at TEXT)`;
      
      try {
        await db.prepare(sql).run();
        return c.json({
          success: true,
          message: `Table ${tableName} created successfully`,
          table: tableName,
          schema: schema
        });
      } catch (error) {
        return c.json({
          error: (error as Error).message
        }, 500);
      }
    });

    // Bulk insert
    this.app.post('/bulk/:table', async (c) => {
      const table = c.req.param('table');
      const data = await c.req.json();
      
      if (!Array.isArray(data)) {
        return c.json({ error: 'Data must be an array' }, 400);
      }
      
      const db = c.env.DB;
      const results = [];
      const errors = [];
      
      for (const item of data) {
        try {
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          const columns = Object.keys(item);
          const values = Object.values(item);
          const placeholders = columns.map(() => '?').join(', ');
          
          await db.prepare(
            `INSERT INTO ${table} (id, ${columns.join(', ')}, created_at, updated_at) VALUES (?, ${placeholders}, ?, ?)`
          ).bind(id, ...values, now, now).run();
          
          results.push({ id, ...item });
        } catch (error) {
          errors.push({ item, error: (error as Error).message });
        }
      }
      
      return c.json({
        success: true,
        inserted: results.length,
        errors: errors.length,
        results,
        errorDetails: errors
      });
    });

    // Query builder endpoint
    this.app.post('/query', async (c) => {
      const { query, params } = await c.req.json();
      
      if (!query) {
        return c.json({ error: 'Query is required' }, 400);
      }
      
      const db = c.env.DB;
      
      try {
        const result = await db.prepare(query).bind(...(params || [])).all();
        return c.json({
          success: true,
          data: result.results,
          count: result.results.length,
          query
        });
      } catch (error) {
        return c.json({
          error: (error as Error).message,
          query
        }, 500);
      }
    });

    // Transaction endpoint
    this.app.post('/transaction', async (c) => {
      const { operations } = await c.req.json();
      
      if (!Array.isArray(operations) || operations.length === 0) {
        return c.json({ error: 'Operations must be a non-empty array' }, 400);
      }
      
      const db = c.env.DB;
      
      try {
        const results = [];
        for (const op of operations) {
          const result = await db.prepare(op.query).bind(...(op.params || [])).run();
          results.push(result);
        }
        
        return c.json({
          success: true,
          results,
          count: results.length
        });
      } catch (error) {
        return c.json({
          error: (error as Error).message,
          operation: operations
        }, 500);
      }
    });
  }

  private setupModelRoutes() {
    // Register model
    this.app.post('/models/register', async (c) => {
      const { name, schema, validators, hooks } = await c.req.json();
      
      if (this.models.has(name)) {
        return c.json({ error: `Model ${name} already exists` }, 400);
      }
      
      this.models.set(name, {
        tableName: name,
        schema,
        validators: validators || {},
        hooks: hooks || {}
      });
      
      return c.json({
        success: true,
        message: `Model ${name} registered successfully`
      });
    });

    // CRUD endpoints for models
    this.app.post('/models/:name', async (c) => {
      const name = c.req.param('name');
      const model = this.models.get(name);
      
      if (!model) {
        return c.json({ error: `Model ${name} not found` }, 404);
      }
      
      let data = await c.req.json();
      
      // Validate
      const validationErrors = this.validateData(data, model);
      if (validationErrors.length > 0) {
        return c.json({ errors: validationErrors }, 400);
      }
      
      // Before create hook
      if (model.hooks.beforeCreate) {
        data = model.hooks.beforeCreate(data);
      }
      
      const db = c.env.DB;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map(() => '?').join(', ');
      
      await db.prepare(
        `INSERT INTO ${model.tableName} (id, ${columns.join(', ')}, created_at, updated_at) VALUES (?, ${placeholders}, ?, ?)`
      ).bind(id, ...values, now, now).run();
      
      const result = await db.prepare(
        `SELECT * FROM ${model.tableName} WHERE id = ?`
      ).bind(id).first();
      
      // After create hook
      if (model.hooks.afterCreate) {
        model.hooks.afterCreate(result);
      }
      
      return c.json({
        success: true,
        data: result
      }, 201);
    });

    this.app.get('/models/:name', async (c) => {
      const name = c.req.param('name');
      const model = this.models.get(name);
      
      if (!model) {
        return c.json({ error: `Model ${name} not found` }, 404);
      }
      
      const { page, limit, ...filters } = c.req.query();
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 20;
      const offset = (pageNum - 1) * limitNum;
      
      const db = c.env.DB;
      let query = `SELECT * FROM ${model.tableName}`;
      const params = [];
      
      // Build WHERE clause from filters
      const whereClauses = [];
      for (const [key, value] of Object.entries(filters)) {
        whereClauses.push(`${key} = ?`);
        params.push(value);
      }
      
      if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limitNum, offset);
      
      const result = await db.prepare(query).bind(...params).all();
      const total = await db.prepare(
        `SELECT COUNT(*) as count FROM ${model.tableName}`
      ).first();
      
      return c.json({
        success: true,
        data: result.results,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: (total as any).count,
          pages: Math.ceil((total as any).count / limitNum)
        }
      });
    });

    this.app.get('/models/:name/:id', async (c) => {
      const name = c.req.param('name');
      const id = c.req.param('id');
      const model = this.models.get(name);
      
      if (!model) {
        return c.json({ error: `Model ${name} not found` }, 404);
      }
      
      const db = c.env.DB;
      const result = await db.prepare(
        `SELECT * FROM ${model.tableName} WHERE id = ?`
      ).bind(id).first();
      
      if (!result) {
        return c.json({ error: 'Record not found' }, 404);
      }
      
      return c.json({
        success: true,
        data: result
      });
    });

    this.app.put('/models/:name/:id', async (c) => {
      const name = c.req.param('name');
      const id = c.req.param('id');
      const model = this.models.get(name);
      
      if (!model) {
        return c.json({ error: `Model ${name} not found` }, 404);
      }
      
      let data = await c.req.json();
      
      // Validate
      const validationErrors = this.validateData(data, model, false);
      if (validationErrors.length > 0) {
        return c.json({ errors: validationErrors }, 400);
      }
      
      // Before update hook
      if (model.hooks.beforeUpdate) {
        data = model.hooks.beforeUpdate(data);
      }
      
      const db = c.env.DB;
      const now = new Date().toISOString();
      const updates = Object.entries(data).map(([key, value]) => `${key} = ?`);
      const values = Object.values(data);
      
      await db.prepare(
        `UPDATE ${model.tableName} SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`
      ).bind(...values, now, id).run();
      
      const result = await db.prepare(
        `SELECT * FROM ${model.tableName} WHERE id = ?`
      ).bind(id).first();
      
      // After update hook
      if (model.hooks.afterUpdate) {
        model.hooks.afterUpdate(result);
      }
      
      return c.json({
        success: true,
        data: result
      });
    });

    this.app.delete('/models/:name/:id', async (c) => {
      const name = c.req.param('name');
      const id = c.req.param('id');
      const model = this.models.get(name);
      
      if (!model) {
        return c.json({ error: `Model ${name} not found` }, 404);
      }
      
      // Before delete hook
      if (model.hooks.beforeDelete) {
        model.hooks.beforeDelete(id);
      }
      
      const db = c.env.DB;
      const result = await db.prepare(
        `DELETE FROM ${model.tableName} WHERE id = ?`
      ).bind(id).run();
      
      if (result.meta.changes === 0) {
        return c.json({ error: 'Record not found' }, 404);
      }
      
      // After delete hook
      if (model.hooks.afterDelete) {
        model.hooks.afterDelete(id);
      }
      
      return c.json({
        success: true,
        message: 'Record deleted successfully',
        id
      });
    });
  }

  private validateSchema(schema: Record<string, any>): boolean {
    const validTypes = ['TEXT', 'INTEGER', 'REAL', 'BLOB', 'NUMERIC'];
    for (const [name, type] of Object.entries(schema)) {
      if (!name || !type || !validTypes.includes(type.toUpperCase())) {
        return false;
      }
    }
    return true;
  }

  private validateData(data: any, model: ModelConfig, requireAll: boolean = true): string[] {
    const errors: string[] = [];
    const schema = model.schema;
    const validators = model.validators;
    
    for (const [key, type] of Object.entries(schema)) {
      if (requireAll && !(key in data)) {
        errors.push(`Field ${key} is required`);
        continue;
      }
      
      if (key in data) {
        const value = data[key];
        
        // Type validation
        const validType = this.validateType(value, type);
        if (!validType) {
          errors.push(`Field ${key} must be of type ${type}`);
        }
        
        // Custom validator
        if (validators[key] && !validators[key](value)) {
          errors.push(`Field ${key} failed validation`);
        }
      }
    }
    
    return errors;
  }

  private validateType(value: any, type: string): boolean {
    const typeUpper = type.toUpperCase();
    switch (typeUpper) {
      case 'TEXT':
        return typeof value === 'string';
      case 'INTEGER':
        return typeof value === 'number' && Number.isInteger(value);
      case 'REAL':
        return typeof value === 'number' && !isNaN(value);
      case 'BLOB':
        return value instanceof ArrayBuffer || value instanceof Uint8Array || typeof value === 'string';
      case 'NUMERIC':
        return typeof value === 'number' && !isNaN(value) || typeof value === 'string';
      default:
        return false;
    }
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createWorkerD1Template(env: any) {
  return new WorkerD1Template(env);
}
