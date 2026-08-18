import { describe, expect, it } from 'vitest';
import { UniversalDriverTemplate } from '../src/index';

describe('UniversalDriverTemplate', () => {
  it('reports device and connection health', async () => {
    const env = {} as any;
    const response = await new UniversalDriverTemplate(env).handle(
      new Request('https://example.test/api/health'),
      env
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.deviceCount).toBe(0);
    expect(body.connectionCount).toBe(0);
  });
});
