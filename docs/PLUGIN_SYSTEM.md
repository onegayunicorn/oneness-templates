# ONENESS External Capability Plugin System

## Purpose

The ONENESS platform can now extend its built-in capability catalog at runtime through external packages. A plugin contributes one or more capability modules, while the existing resolver remains responsible for dependency ordering, cycle detection, unresolved capability reporting, and composition-plan generation.

## Plugin contract

External packages export either a default `CapabilityPlugin`, a named `plugin` export, or a factory returning a plugin:

```ts
import type { CapabilityPlugin } from '@oneness/platform';

const plugin: CapabilityPlugin = {
  id: 'acme-risk',
  version: '1.0.0',
  apiVersion: '1',
  capabilities: [
    {
      id: 'risk-scoring',
      status: 'partial',
      dependencies: ['identity'],
      concerns: ['risk-models', 'decision-support']
    }
  ]
};

export default plugin;
```

The package may also export an asynchronous factory when capability metadata must be assembled from local configuration:

```ts
export default async () => plugin;
```

| Field | Requirement |
|---|---|
| `id` | Stable kebab-case plugin identifier. It must be unique in a registry. |
| `version` | Plugin release version used for provenance and compatibility diagnostics. |
| `apiVersion` | Currently `'1'`. Unsupported versions are rejected before registration. |
| `capabilities` | One or more capability modules. Each module has an identifier, status, dependency list, and concerns. |

## Runtime lifecycle

The host creates a `CapabilityPluginRegistry`, loads package specifiers with `loadCapabilityPlugins`, and passes the registry into `composeApplication`:

```ts
const registry = await loadCapabilityPlugins(['@acme/oneness-risk']);
const plan = composeApplication(catalog, 'enterprise', ['risk-scoring'], registry);
```

Registration is deliberately explicit. Importing a package does not mutate global platform state. The registry rejects duplicate plugin identifiers, duplicate module identifiers within a plugin, and collisions with built-in catalog modules. Plugin modules are tagged with provenance such as `plugin:acme-risk@1.0.0` in composition output.

The CLI supports repeatable plugin specifiers:

```bash
oneness compose enterprise \
  --capabilities risk-scoring \
  --plugin @acme/oneness-risk
```

## Dependency behavior

Plugin capabilities may depend on built-in modules, other modules from the same plugin, or modules provided by another plugin loaded earlier. All dependencies must be resolvable in the final registry and catalog. The resolver performs a depth-first topological traversal and rejects dependency cycles. A requested identifier that is absent from both sources is reported in `unresolvedCapabilities` rather than silently ignored.

A plugin cannot replace or override a built-in capability. This prevents package load order from changing the semantics of the core catalog. A future compatibility layer may add explicit namespaces or versioned replacement policies, but those should be separate from the initial registration API.

## Security boundary

Plugins are trusted application code, not sandboxed data. Dynamic package loading executes the package with the host process's permissions. Production hosts should therefore load only allow-listed, pinned package versions, validate package provenance through the deployment supply chain, and run plugin loading during startup rather than per request. The registry validates metadata and dependency shape, but it does not make untrusted JavaScript safe.

The plugin contract is intentionally metadata-only in version 1. Capability modules do not receive filesystem, network, secret, or platform-service handles. If future plugins need executable generators or lifecycle hooks, those hooks should receive a narrowly scoped host context and be governed by explicit permissions, timeouts, audit events, and isolated worker processes.

## API surface

`@oneness/platform` exports `CapabilityPlugin`, `CapabilityPluginExport`, `CapabilityPluginRegistry`, `validateCapabilityPlugin`, `loadCapabilityPlugin`, and `loadCapabilityPlugins`. The existing synchronous resolver remains backwards compatible when no registry is supplied.

## Recommended package conventions

External authors should publish a package whose peer dependency accepts the supported `@oneness/platform` API range, keep capability identifiers stable after release, document all built-in and cross-plugin dependencies, and include a fixture that exercises composition against a representative pathway. Hosts should pin versions in deployment manifests and record the loaded plugin list alongside the generated composition plan.
