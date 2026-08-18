# ONENESS Capability Resolution and Composition Engine

The platform expansion phase now includes an executable first milestone: machine-readable pathway and capability catalogs are loaded by `@oneness/platform`, resolved into dependency-ordered composition plans, and exposed through the CLI.

## Commands

After building the workspace, list pathways with:

```bash
node packages/cli/dist/index.js pathways
```

Resolve the default capability set for a pathway with:

```bash
node packages/cli/dist/index.js compose enterprise
```

Resolve an explicit capability composition with:

```bash
node packages/cli/dist/index.js compose enterprise \
  --capabilities identity,authorization
```

The resolver loads `config/platform-pathways.json` and `config/capability-modules.json`, selects the requested modules, recursively resolves dependencies, detects dependency cycles, reports unknown capabilities, and records future-status modules without presenting them as production implementations.

## Resolution model

```text
Pathway
  → Requested capabilities
  → Dependency closure
  → Ordered modules
  → Foundations and implementation status
  → Composition plan
```

A composition plan contains the pathway status, existing template foundations, requested capabilities, dependency-ordered modules, unresolved identifiers, and capabilities that remain future work. The current engine produces a plan; it does not yet generate application source files from a composition. The next implementation gate is to connect the resolved plan to template/module generators and generated-project validation.

## Package API

The `@oneness/platform` package exports:

- `loadPlatformCatalog()` for loading both JSON catalogs.
- `getPathway(catalog, pathwayId)` for validated pathway lookup.
- `composeApplication(catalog, pathwayId, capabilities?)` for dependency resolution.
- `formatCompositionPlan(plan)` for stable JSON output.

The package includes tests for catalog loading, pathway lookup, dependency ordering, unknown capabilities, future capability tracking, and invalid pathways.
