import { describe, expect, it, vi } from 'vitest';
import { CloudflareAPIStarter } from '../src/index';

describe('CloudflareAPIStarter', () => {
  it('reports a healthy D1-backed service', async () => {
    const env = {
      DB: { prepare: vi.fn(() => ({ run: vi.fn().mockResolvedValue({}) })) },
      KV_CACHE: { get: vi.fn().mockResolvedValue(null), put: vi.fn(), list: vi.fn().mockResolvedValue({ keys: [] }), delete: vi.fn() },
      KV_SESSIONS: {},
      KV_RATE_LIMIT: {},
      AI: {},
      QUEUE: {},
      R2: {},
      JWT_SECRET: 'test-secret',
      ENVIRONMENT: 'test',
      API_VERSION: '1.0.0'
    } as any;

    const response = await new CloudflareAPIStarter(env).handle(
      new Request('https://example.test/api/health'),
      env
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
  });
});
