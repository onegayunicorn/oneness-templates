// packages/core/src/templates/backend-openapi/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

// Schema definitions
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100)
});

const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional()
});

// Response schemas
const SuccessResponse = z.object({
  success: z.boolean(),
  message: z.string().optional()
});

const UserResponse = z.object({
  success: z.boolean(),
  data: UserSchema.optional(),
  error: z.string().optional()
});

const UsersResponse = z.object({
  success: z.boolean(),
  data: z.array(UserSchema).optional(),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  error: z.string().optional()
});

export class BackendOpenAPITemplate {
  private app: OpenAPIHono<any, any, any>;
  private env: any;

  constructor(env: any) {
    this.env = env;
    this.app = new OpenAPIHono();
    this.setupRoutes();
    this.setupDocs();
  }

  private setupRoutes() {
    // Health check endpoint
    const healthRoute = createRoute({
      method: 'get',
      path: '/health',
      tags: ['System'],
      summary: 'Health check endpoint',
      description: 'Check if the API is running',
      responses: {
        200: {
          description: 'API is healthy',
          content: {
            'application/json': {
              schema: z.object({
                status: z.string(),
                timestamp: z.string(),
                version: z.string()
              })
            }
          }
        }
      }
    });

    (this.app as any).openapi(healthRoute, async (c) => {
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Create user endpoint
    const createUserRoute = createRoute({
      method: 'post',
      path: '/users',
      tags: ['Users'],
      summary: 'Create a new user',
      description: 'Create a new user with email and name',
      request: {
        body: {
          content: {
            'application/json': {
              schema: CreateUserSchema
            }
          }
        }
      },
      responses: {
        201: {
          description: 'User created successfully',
          content: {
            'application/json': {
              schema: UserResponse
            }
          }
        },
        400: {
          description: 'Invalid input',
          content: {
            'application/json': {
              schema: z.object({
                success: z.boolean(),
                error: z.string()
              })
            }
          }
        }
      }
    });

    (this.app as any).openapi(createUserRoute, async (c) => {
      const data = c.req.valid('json') as any;
      const db = (c.env as any).DB;
      
      try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        
        await db.prepare(
          'INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, data.email, data.name, now, now).run();
        
        const user = await db.prepare(
          'SELECT id, email, name, created_at, updated_at FROM users WHERE id = ?'
        ).bind(id).first();
        
        return c.json({ success: true, data: user }, 201);
      } catch (error) {
        return c.json({ 
          success: false, 
          error: (error as Error).message 
        }, 400);
      }
    });

    // Get all users endpoint
    const getUsersRoute = createRoute({
      method: 'get',
      path: '/users',
      tags: ['Users'],
      summary: 'Get all users',
      description: 'Retrieve a paginated list of users',
      request: {
        query: z.object({
          page: z.string().optional().default('1'),
          limit: z.string().optional().default('10')
        })
      },
      responses: {
        200: {
          description: 'Users retrieved successfully',
          content: {
            'application/json': {
              schema: UsersResponse
            }
          }
        }
      }
    });

    (this.app as any).openapi(getUsersRoute, async (c) => {
      const { page, limit } = c.req.valid('query');
      const db = (c.env as any).DB;
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const users = await db.prepare(
        'SELECT id, email, name, created_at, updated_at FROM users LIMIT ? OFFSET ?'
      ).bind(parseInt(limit), offset).all();
      
      const total = (await db.prepare('SELECT COUNT(*) as count FROM users').first()) as any;
      
      return c.json({
        success: true,
        data: users.results,
        total: total.count,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    });

    // Get single user endpoint
    const getUserRoute = createRoute({
      method: 'get',
      path: '/users/{id}',
      tags: ['Users'],
      summary: 'Get user by ID',
      description: 'Retrieve a specific user by their ID',
      request: {
        params: z.object({
          id: z.string().uuid()
        })
      },
      responses: {
        200: {
          description: 'User found',
          content: {
            'application/json': {
              schema: UserResponse
            }
          }
        },
        404: {
          description: 'User not found',
          content: {
            'application/json': {
              schema: z.object({
                success: z.boolean(),
                error: z.string()
              })
            }
          }
        }
      }
    });

    (this.app as any).openapi(getUserRoute, async (c) => {
      const { id } = c.req.valid('param');
      const db = (c.env as any).DB;
      
      const user = await db.prepare(
        'SELECT id, email, name, created_at, updated_at FROM users WHERE id = ?'
      ).bind(id).first();
      
      if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }
      
      return c.json({ success: true, data: user });
    });

    // Update user endpoint
    const updateUserRoute = createRoute({
      method: 'put',
      path: '/users/{id}',
      tags: ['Users'],
      summary: 'Update user',
      description: 'Update a user by their ID',
      request: {
        params: z.object({
          id: z.string().uuid()
        }),
        body: {
          content: {
            'application/json': {
              schema: UpdateUserSchema
            }
          }
        }
      },
      responses: {
        200: {
          description: 'User updated successfully',
          content: {
            'application/json': {
              schema: UserResponse
            }
          }
        },
        404: {
          description: 'User not found',
          content: {
            'application/json': {
              schema: z.object({
                success: z.boolean(),
                error: z.string()
              })
            }
          }
        }
      }
    });

    (this.app as any).openapi(updateUserRoute, async (c) => {
      const { id } = c.req.valid('param');
      const data = c.req.valid('json') as any;
      const db = (c.env as any).DB;
      
      const existing = await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
      if (!existing) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }
      
      const updates: string[] = [];
      const values: any[] = [];
      
      if (data.email) {
        updates.push('email = ?');
        values.push(data.email);
      }
      if (data.name) {
        updates.push('name = ?');
        values.push(data.name);
      }
      
      if (updates.length === 0) {
        return c.json({ success: false, error: 'No fields to update' }, 400);
      }
      
      values.push(new Date().toISOString());
      values.push(id);
      
      await db.prepare(
        `UPDATE users SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`
      ).bind(...values).run();
      
      const user = await db.prepare(
        'SELECT id, email, name, created_at, updated_at FROM users WHERE id = ?'
      ).bind(id).first();
      
      return c.json({ success: true, data: user });
    });

    // Delete user endpoint
    const deleteUserRoute = createRoute({
      method: 'delete',
      path: '/users/{id}',
      tags: ['Users'],
      summary: 'Delete user',
      description: 'Delete a user by their ID',
      request: {
        params: z.object({
          id: z.string().uuid()
        })
      },
      responses: {
        200: {
          description: 'User deleted successfully',
          content: {
            'application/json': {
              schema: SuccessResponse
            }
          }
        },
        404: {
          description: 'User not found',
          content: {
            'application/json': {
              schema: z.object({
                success: z.boolean(),
                error: z.string()
              })
            }
          }
        }
      }
    });

    (this.app as any).openapi(deleteUserRoute, async (c) => {
      const { id } = c.req.valid('param');
      const db = (c.env as any).DB;
      
      const result = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      
      if (result.meta.changes === 0) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }
      
      return c.json({ success: true, message: 'User deleted successfully' });
    });

    // CORS
    this.app.use('*', cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }));
  }

  private setupDocs() {
    // Serve OpenAPI documentation
    this.app.doc('/openapi.json', {
      openapi: '3.0.0',
      info: {
        title: 'Backend API',
        version: '1.0.0',
        description: 'Complete backend API with OpenAPI specification'
      },
      servers: [
        {
          url: 'https://api.onegayunicorn.com',
          description: 'Production server'
        }
      ]
    });

    // Serve Swagger UI
    this.app.get('/docs', swaggerUI({
      url: '/openapi.json'
    }));
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createBackendOpenAPITemplate(env: any) {
  return new BackendOpenAPITemplate(env);
}
