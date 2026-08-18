import { describe, expect, it } from 'vitest';
import {
  CapabilityPluginRegistry,
  composeApplication,
  getPathway,
  loadPlatformCatalog,
  validateCapabilityPlugin
} from '../src/index.js';

describe('@oneness/platform', () => {
  const catalog = loadPlatformCatalog();

  it('loads the machine-readable platform catalogs', () => {
    expect(catalog.pathways.pathways).toHaveLength(16);
    expect(catalog.modules.modules.length).toBeGreaterThan(10);
  });

  it('resolves a known pathway and its foundation templates', () => {
    const pathway = getPathway(catalog, 'procurement');
    expect(pathway.foundations).toContain('sourcing-workflows');
    expect(pathway.status).toBe('foundation');
  });

  it('resolves capability dependencies without duplicates', () => {
    const plan = composeApplication(catalog, 'enterprise', ['authorization']);
    expect(plan.unresolvedCapabilities).toEqual([]);
    expect(plan.resolvedCapabilities.map((module) => module.id)).toEqual([
      'identity',
      'organisations',
      'authorization'
    ]);
  });

  it('reports unknown capabilities instead of silently dropping them', () => {
    const plan = composeApplication(catalog, 'ai', ['ai', 'not-a-module']);
    expect(plan.unresolvedCapabilities).toEqual(['not-a-module']);
    expect(plan.resolvedCapabilities.map((module) => module.id)).toContain('ai');
  });

  it('tracks future capabilities as future work', () => {
    const plan = composeApplication(catalog, 'payments', ['payments']);
    expect(plan.futureCapabilities).toContain('payments');
    expect(plan.pathway.status).toBe('future');
  });

  it('rejects unknown pathways', () => {
    expect(() => getPathway(catalog, 'missing')).toThrow('Unknown pathway: missing');
  });

  it('registers an external capability and resolves its catalog dependencies', () => {
    const registry = new CapabilityPluginRegistry().register({
      id: 'acme-risk',
      version: '1.0.0',
      apiVersion: '1',
      capabilities: [{
        id: 'risk-scoring',
        status: 'partial',
        dependencies: ['identity'],
        concerns: ['risk-models']
      }]
    });
    const plan = composeApplication(catalog, 'enterprise', ['risk-scoring'], registry);
    expect(plan.resolvedCapabilities.map((module) => module.id)).toEqual(['identity', 'risk-scoring']);
    expect(plan.resolvedCapabilities.at(-1)?.source).toBe('plugin:acme-risk@1.0.0');
  });

  it('rejects plugin capability collisions with built-in modules', () => {
    const registry = new CapabilityPluginRegistry().register({
      id: 'bad-plugin',
      version: '1.0.0',
      apiVersion: '1',
      capabilities: [{ id: 'identity', status: 'partial', dependencies: [], concerns: [] }]
    });
    expect(() => composeApplication(catalog, 'enterprise', ['identity'], registry))
      .toThrow('Plugin capability conflicts with catalog module: identity');
  });

  it('validates plugin metadata before registration', () => {
    expect(() => validateCapabilityPlugin({
      id: 'Bad Plugin',
      version: '1.0.0',
      apiVersion: '1',
      capabilities: [{ id: 'custom', status: 'partial', dependencies: [], concerns: [] }]
    })).toThrow('Invalid plugin id');
  });
});
