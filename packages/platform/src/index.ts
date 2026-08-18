import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type PathwayStatus = 'foundation' | 'future';
type ModuleStatus = 'partial' | 'future';

export interface PlatformPathway {
  id: string;
  status: PathwayStatus;
  foundations: string[];
  capabilities: string[];
}

export interface CapabilityModule {
  id: string;
  status: ModuleStatus;
  dependencies: string[];
  concerns: string[];
}

export interface PlatformPathwaysCatalog {
  schema_version: string;
  status: string;
  description: string;
  pathways: PlatformPathway[];
}

export interface CapabilityModulesCatalog {
  schema_version: string;
  status: string;
  modules: CapabilityModule[];
}

export interface PlatformCatalog {
  pathways: PlatformPathwaysCatalog;
  modules: CapabilityModulesCatalog;
}

export interface CompositionPlan {
  pathway: PlatformPathway;
  requestedCapabilities: string[];
  resolvedCapabilities: CapabilityModule[];
  foundations: string[];
  unresolvedCapabilities: string[];
  futureCapabilities: string[];
}

function readJson<T>(relativePath: string): T {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as T;
}

export function loadPlatformCatalog(): PlatformCatalog {
  return {
    pathways: readJson<PlatformPathwaysCatalog>('../../../config/platform-pathways.json'),
    modules: readJson<CapabilityModulesCatalog>('../../../config/capability-modules.json')
  };
}

export function getPathway(catalog: PlatformCatalog, pathwayId: string): PlatformPathway {
  const pathway = catalog.pathways.pathways.find((item) => item.id === pathwayId);
  if (!pathway) {
    throw new Error(`Unknown pathway: ${pathwayId}`);
  }
  return pathway;
}

function resolveDependencies(
  moduleMap: Map<string, CapabilityModule>,
  moduleId: string,
  resolved: Map<string, CapabilityModule>,
  visiting: Set<string>
): void {
  if (resolved.has(moduleId)) return;
  if (visiting.has(moduleId)) {
    throw new Error(`Capability dependency cycle detected at: ${moduleId}`);
  }
  const module = moduleMap.get(moduleId);
  if (!module) throw new Error(`Unknown capability module: ${moduleId}`);
  visiting.add(moduleId);
  for (const dependency of module.dependencies) {
    resolveDependencies(moduleMap, dependency, resolved, visiting);
  }
  visiting.delete(moduleId);
  resolved.set(moduleId, module);
}

export function composeApplication(
  catalog: PlatformCatalog,
  pathwayId: string,
  requestedCapabilities?: string[]
): CompositionPlan {
  const pathway = getPathway(catalog, pathwayId);
  const moduleMap = new Map(catalog.modules.modules.map((module) => [module.id, module]));
  const requested = requestedCapabilities?.length
    ? [...new Set(requestedCapabilities)]
    : pathway.capabilities.filter((capability) => moduleMap.has(capability));
  const resolved = new Map<string, CapabilityModule>();
  const unresolved: string[] = [];

  for (const capability of requested) {
    if (!moduleMap.has(capability)) {
      unresolved.push(capability);
      continue;
    }
    resolveDependencies(moduleMap, capability, resolved, new Set());
  }

  const resolvedCapabilities = [...resolved.values()];
  return {
    pathway,
    requestedCapabilities: requested,
    resolvedCapabilities,
    foundations: pathway.foundations,
    unresolvedCapabilities: unresolved,
    futureCapabilities: resolvedCapabilities
      .filter((module) => module.status === 'future')
      .map((module) => module.id)
  };
}

export function formatCompositionPlan(plan: CompositionPlan): string {
  return JSON.stringify({
    pathway: plan.pathway.id,
    pathwayStatus: plan.pathway.status,
    foundations: plan.foundations,
    requestedCapabilities: plan.requestedCapabilities,
    resolvedCapabilities: plan.resolvedCapabilities.map((module) => ({
      id: module.id,
      status: module.status,
      dependencies: module.dependencies
    })),
    unresolvedCapabilities: plan.unresolvedCapabilities,
    futureCapabilities: plan.futureCapabilities
  }, null, 2);
}
