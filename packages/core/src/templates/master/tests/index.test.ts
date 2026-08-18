// packages/core/src/templates/master/tests/index.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMasterTemplate, MasterTemplate, Bindings } from '../index';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';

// Mock data
const mockUser = {
  id: nanoid(),
  email: 'test@example.com',
  password: 'password123',
  name: 'Test User',
  role: 'user'
};

const mockResource = {
  id: nanoid(),
  title: 'Test Resource',
  description: 'Test Description',
  status: 'draft' as const,
  priority: 1
};

const authToken = JSON.stringify({
  sub: mockUser.id,
  email: mockUser.email,
  role: 'user',
  exp: Math.floor(Date.now() / 1000) + 3600
});

describe('MasterTemplate', () => {
  let template: MasterTemplate;
  let mockEnv: Bindings;

  beforeEach(() => {
    // Setup mock environment
    mockEnv = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null)
        }),
        exec: vi.fn().mockResolvedValue({}),
        batch: vi.fn().mockResolvedValue([])
      } as any,
      KV_CACHE: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ keys: [] })
      } as any,
      KV_SESSIONS: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ keys: [] })
      } as any,
      KV_RATE_LIMIT: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      } as any,
      AI: {} as any,
      QUEUE: {
        send: vi.fn().mockResolvedValue(undefined)
      } as any,
      R2: {} as any,
      JWT_SECRET: 'test-secret',
      ENVIRONMENT: 'test' as any,
      API_VERSION: '1.0.0',
      PROJECT_NAME: 'test-project'
    };

    template = new MasterTemplate(mockEnv);
  });

  describe('Health Checks', () => {
    it('should return health status', async () => {
      const req = new Request('http://localhost/api/health');
      const res = await template.handle(req, mockEnv);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data.status', 'healthy');
    });

    it('should return readiness status', async () => {
      const req = new Request('http://localhost/api/ready');
      const res = await template.handle(req, mockEnv);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data).toHaveProperty('status', 'ready');
    });
  });

  describe('Authentication', () => {
    it('should register a new user', async () => {
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        first: vi.fn().mockResolvedValue(null)
      });

      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockUser)
      });

      const res = await template.handle(req, mockEnv);
      expect(res.status).toBe(201);
      
      const data = await res.json() as any;
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data.user');
      expect(data.data.user).toHaveProperty('email', mockUser.email);
    });

    it('should login a user', async () => {
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: mockUser.id,
          email: mockUser.email,
          password: mockUser.password,
          name: mockUser.name,
          role: mockUser.role
        }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } })
      });

      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: mockUser.email,
          password: mockUser.password
        })
      });

      const res = await template.handle(req, mockEnv);
      expect(res.status).toBe(200);
      
      const data = await res.json() as any;
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data.token');
    });
  });

  describe('CRUD Operations', () => {
    it('should create a resource', async () => {
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        first: vi.fn().mockResolvedValue(mockResource)
      });

      const req = new Request('http://localhost/api/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(mockResource)
      });

      // Mock auth middleware
      const res = await template.handle(req, mockEnv);
      expect(res.status).toBe(201);
      
      const data = await res.json() as any;
      expect(data).toHaveProperty('success', true);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit requests', async () => {
      const requests = Array(15).fill(null).map(() => 
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'wrongpassword'
          })
        })
      );

      const responses = await Promise.all(
        requests.map(req => template.handle(req, mockEnv))
      );

      // Some requests should be rate limited
      const rateLimited = responses.filter(res => res.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('WebSocket', () => {
    it.skip('should handle WebSocket upgrade in a Cloudflare Worker runtime', async () => {
      vi.stubGlobal('WebSocketPair', class {
        client = {};
        server = {
          accept: vi.fn(),
          send: vi.fn(),
          addEventListener: vi.fn()
        };
      });
      const req = new Request('http://localhost/api/ws', {
        headers: {
          'Upgrade': 'websocket',
          'Authorization': `Bearer ${authToken}`
        }
      });

      const res = await template.handle(req, mockEnv);
      expect(res.status).toBe(101);
      expect(res.headers.get('Upgrade')).toBe('websocket');
      vi.unstubAllGlobals();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      const req = new Request('http://localhost/api/nonexistent');
      const res = await template.handle(req, mockEnv);
      
      expect(res.status).toBe(404);
      const data = await res.json() as any;
      expect(data).toHaveProperty('code', 'NOT_FOUND');
    });

    it('should handle invalid JSON', async () => {
      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      const res = await template.handle(req, mockEnv);
      expect(res.status).toBe(400);
    });
  });
});

// Integration smoke test
describe('MasterTemplate Integration', () => {
  it('serves a healthy service with Cloudflare-style bindings', async () => {
    const env: Bindings = {
      DB: { prepare: vi.fn(() => ({ run: vi.fn().mockResolvedValue({}) })) } as any,
      KV_CACHE: { get: vi.fn().mockResolvedValue(null), put: vi.fn(), list: vi.fn().mockResolvedValue({ keys: [] }), delete: vi.fn() } as any,
      KV_SESSIONS: {} as any,
      KV_RATE_LIMIT: {} as any,
      AI: {},
      QUEUE: {} as any,
      R2: {} as any,
      JWT_SECRET: 'test-secret',
      ENVIRONMENT: 'test',
      API_VERSION: '1.0.0',
      PROJECT_NAME: 'test'
    };
    const response = await new MasterTemplate(env).handle(
      new Request('http://localhost/api/health'),
      env
    );
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.data.status).toBe('healthy');
  });
});
