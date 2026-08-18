import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type PathwayStatus = 'foundation' | 'future';
export type ModuleStatus = 'partial' | 'future';

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
  source?: string;
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

export interface CapabilityPlugin {
  id: string;
  version: string;
  apiVersion: '1';
  capabilities: CapabilityModule[];
}

export type CapabilityPluginExport = CapabilityPlugin | (() => CapabilityPlugin | Promise<CapabilityPlugin>);

const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

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
  if (!pathway) throw new Error(`Unknown pathway: ${pathwayId}`);
  return pathway;
}

export function validateCapabilityPlugin(plugin: CapabilityPlugin): CapabilityPlugin {
  if (!plugin || plugin.apiVersion !== '1') throw new Error('Unsupported capability plugin API version');
  if (!IDENTIFIER.test(plugin.id)) throw new Error(`Invalid plugin id: ${plugin.id}`);
  if (!plugin.version) throw new Error(`Plugin ${plugin.id} must declare a version`);
  if (!Array.isArray(plugin.capabilities) || plugin.capabilities.length === 0) {
    throw new Error(`Plugin ${plugin.id} must register at least one capability`);
  }
  const ids = new Set<string>();
  for (const capability of plugin.capabilities) {
    if (!IDENTIFIER.test(capability.id)) throw new Error(`Invalid capability id: ${capability.id}`);
    if (ids.has(capability.id)) throw new Error(`Duplicate capability in plugin ${plugin.id}: ${capability.id}`);
    ids.add(capability.id);
    if (!['partial', 'future'].includes(capability.status)) throw new Error(`Invalid status for capability ${capability.id}`);
    if (!Array.isArray(capability.dependencies) || capability.dependencies.some((dependency) => !IDENTIFIER.test(dependency))) {
      throw new Error(`Invalid dependencies for capability ${capability.id}`);
    }
    if (!Array.isArray(capability.concerns)) throw new Error(`Capability ${capability.id} must declare concerns`);
  }
  return plugin;
}

export class CapabilityPluginRegistry {
  private readonly plugins = new Map<string, CapabilityPlugin>();
  private readonly modules = new Map<string, CapabilityModule>();

  register(plugin: CapabilityPlugin): this {
    validateCapabilityPlugin(plugin);
    if (this.plugins.has(plugin.id)) throw new Error(`Capability plugin already registered: ${plugin.id}`);
    for (const capability of plugin.capabilities) {
      if (this.modules.has(capability.id)) throw new Error(`Capability module already registered: ${capability.id}`);
    }
    this.plugins.set(plugin.id, plugin);
    for (const capability of plugin.capabilities) {
      this.modules.set(capability.id, { ...capability, source: `plugin:${plugin.id}@${plugin.version}` });
    }
    return this;
  }

  registerMany(plugins: CapabilityPlugin[]): this {
    for (const plugin of plugins) this.register(plugin);
    return this;
  }

  listPlugins(): CapabilityPlugin[] { return [...this.plugins.values()]; }
  listModules(): CapabilityModule[] { return [...this.modules.values()]; }
}

export async function loadCapabilityPlugin(specifier: string): Promise<CapabilityPlugin> {
  const imported = await import(specifier) as { default?: CapabilityPluginExport; plugin?: CapabilityPluginExport };
  const candidate = imported.default ?? imported.plugin;
  if (!candidate) throw new Error(`Plugin ${specifier} must export default or named plugin`);
  const plugin = typeof candidate === 'function' ? await candidate() : candidate;
  return validateCapabilityPlugin(plugin);
}

export async function loadCapabilityPlugins(specifiers: string[], registry = new CapabilityPluginRegistry()): Promise<CapabilityPluginRegistry> {
  for (const specifier of specifiers) registry.register(await loadCapabilityPlugin(specifier));
  return registry;
}

function resolveDependencies(moduleMap: Map<string, CapabilityModule>, moduleId: string, resolved: Map<string, CapabilityModule>, visiting: Set<string>): void {
  if (resolved.has(moduleId)) return;
  if (visiting.has(moduleId)) throw new Error(`Capability dependency cycle detected at: ${moduleId}`);
  const module = moduleMap.get(moduleId);
  if (!module) throw new Error(`Unknown capability module: ${moduleId}`);
  visiting.add(moduleId);
  for (const dependency of module.dependencies) resolveDependencies(moduleMap, dependency, resolved, visiting);
  visiting.delete(moduleId);
  resolved.set(moduleId, module);
}

export function composeApplication(catalog: PlatformCatalog, pathwayId: string, requestedCapabilities?: string[], registry?: CapabilityPluginRegistry): CompositionPlan {
  const pathway = getPathway(catalog, pathwayId);
  const moduleMap = new Map(catalog.modules.modules.map((module) => [module.id, module]));
  for (const module of registry?.listModules() ?? []) {
    if (moduleMap.has(module.id)) throw new Error(`Plugin capability conflicts with catalog module: ${module.id}`);
    moduleMap.set(module.id, module);
  }
  const requested = requestedCapabilities?.length ? [...new Set(requestedCapabilities)] : pathway.capabilities.filter((capability) => moduleMap.has(capability));
  const resolved = new Map<string, CapabilityModule>();
  const unresolved: string[] = [];
  for (const capability of requested) {
    if (!moduleMap.has(capability)) { unresolved.push(capability); continue; }
    resolveDependencies(moduleMap, capability, resolved, new Set());
  }
  const resolvedCapabilities = [...resolved.values()];
  return {
    pathway,
    requestedCapabilities: requested,
    resolvedCapabilities,
    foundations: pathway.foundations,
    unresolvedCapabilities: unresolved,
    futureCapabilities: resolvedCapabilities.filter((module) => module.status === 'future').map((module) => module.id)
  };
}

export function formatCompositionPlan(plan: CompositionPlan): string {
  return JSON.stringify({
    pathway: plan.pathway.id,
    pathwayStatus: plan.pathway.status,
    foundations: plan.foundations,
    requestedCapabilities: plan.requestedCapabilities,
    resolvedCapabilities: plan.resolvedCapabilities.map((module) => ({ id: module.id, status: module.status, dependencies: module.dependencies, source: module.source })),
    unresolvedCapabilities: plan.unresolvedCapabilities,
    futureCapabilities: plan.futureCapabilities
  }, null, 2);
}


export interface GeneratedFile {
  path: string;
  content: string;
}

export interface MaterializationOptions {
  projectName: string;
  outputDirectory?: string;
}

export interface MaterializationResult {
  projectName: string;
  pathway: string;
  files: GeneratedFile[];
  generatedCapabilities: string[];
}

export type CapabilityGenerator = (module: CapabilityModule) => GeneratedFile[];

const generatorConcerns: Record<string, string[]> = {
  identity: ['authentication', 'profiles', 'service identities'],
  authorization: ['RBAC', 'ABAC', 'policy evaluation'],
  storage: ['relational persistence', 'key-value storage', 'object storage'],
  audit: ['immutable records', 'correlation', 'retention'],
  payments: ['payment adapters', 'ledger', 'settlement'],
  ai: ['model routing', 'agents', 'tools'],
  devices: ['registration', 'telemetry', 'commands'],
  workflows: ['state machines', 'approvals', 'scheduling']
};

function capabilitySource(module: CapabilityModule): string {
  const concerns = generatorConcerns[module.id] ?? module.concerns;
  return `/** Generated by ONENESS application materialization. */\nexport const capability = ${JSON.stringify({
    id: module.id,
    status: module.status,
    dependencies: module.dependencies,
    concerns
  }, null, 2)} as const;\n\nexport function describeCapability(): string {\n  return capability.id;\n}\n`;
}

export function createCapabilityGenerator(): CapabilityGenerator {
  return (module) => [{
    path: `src/capabilities/${module.id}.ts`,
    content: capabilitySource(module)
  }];
}

export function materializeApplication(plan: CompositionPlan, options: MaterializationOptions, generator = createCapabilityGenerator()): MaterializationResult {
  if (!IDENTIFIER.test(options.projectName)) throw new Error(`Invalid project name: ${options.projectName}`);
  const capabilityFiles = plan.resolvedCapabilities.flatMap(generator);
  const composition = {
    schemaVersion: '1',
    projectName: options.projectName,
    pathway: plan.pathway.id,
    pathwayStatus: plan.pathway.status,
    foundations: plan.foundations,
    requestedCapabilities: plan.requestedCapabilities,
    resolvedCapabilities: plan.resolvedCapabilities.map((module) => ({
      id: module.id,
      status: module.status,
      dependencies: module.dependencies,
      source: module.source ?? 'catalog'
    })),
    unresolvedCapabilities: plan.unresolvedCapabilities,
    futureCapabilities: plan.futureCapabilities
  };
  const files: GeneratedFile[] = [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: options.projectName,
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: {
          typecheck: 'tsc --noEmit',
          build: 'tsc',
          test: 'node --test'
        },
        devDependencies: { typescript: '^5.0.0' }
      }, null, 2) + '\n'
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          declaration: true,
          outDir: 'dist',
          rootDir: 'src'
        },
        include: ['src/**/*']
      }, null, 2) + '\n'
    },
    {
      path: 'src/index.ts',
      content: `export const application = ${JSON.stringify({
        projectName: options.projectName,
        pathway: plan.pathway.id,
        capabilities: plan.resolvedCapabilities.map((module) => module.id)
      }, null, 2)} as const;\n`
    },
    {
      path: 'ONENESS_COMPOSITION.json',
      content: JSON.stringify(composition, null, 2) + '\n'
    },
    {
      path: 'README.md',
      content: `# ${options.projectName}\n\nGenerated from the ONENESS ${plan.pathway.id} pathway. Run pnpm typecheck, pnpm build, and pnpm test to validate the generated project.\n`
    },
    ...capabilityFiles
  ];
  return {
    projectName: options.projectName,
    pathway: plan.pathway.id,
    files,
    generatedCapabilities: plan.resolvedCapabilities.map((module) => module.id)
  };
}
