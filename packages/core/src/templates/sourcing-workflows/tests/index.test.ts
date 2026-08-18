import { describe, expect, it } from 'vitest';
import { SourcingWorkflowsTemplate } from '../src/index';

describe('SourcingWorkflowsTemplate', () => {
  it('reports a healthy workflow service', async () => {
    const env = {} as any;
    const response = await new SourcingWorkflowsTemplate(env).handle(
      new Request('https://example.test/api/health'),
      env
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.version).toBe('1.0.0');
  });
});
