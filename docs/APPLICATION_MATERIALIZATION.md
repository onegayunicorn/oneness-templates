# ONENESS Application Materialization

The ONENESS platform now has an initial application materialization layer that converts a dependency-ordered `CompositionPlan` into a deterministic, buildable TypeScript application skeleton.

## Lifecycle

```text
Pathway
  → Composition plan
  → Capability generators
  → Application materializer
  → Generated source
  → Typecheck / build / test
```

Materialization is intentionally separate from composition. The resolver decides **what** the application requires; generators decide **how** each selected capability is represented in source; the materializer assembles those generated files into a project directory.

## API

```ts
const plan = composeApplication(catalog, 'enterprise', ['authorization']);
const result = materializeApplication(plan, { projectName: 'enterprise-app' });
```

The result contains the project name, pathway, generated capability identifiers, and a list of `{ path, content }` files. This pure file-list result makes the materializer straightforward to test and allows hosts to choose their own filesystem, archive, or deployment writer.

The default generator emits one module per resolved capability at `src/capabilities/<id>.ts`. It preserves the module status, dependency list, and concerns as typed metadata. The first generator set recognizes common platform capabilities including identity, authorization, storage, audit, payments, AI, devices, and workflows; all other capabilities receive the same safe metadata generator using their catalog concerns.

## Generated layout

```text
enterprise-app/
├── ONENESS_COMPOSITION.json
├── README.md
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    └── capabilities/
        ├── identity.ts
        ├── organisations.ts
        └── authorization.ts
```

`ONENESS_COMPOSITION.json` records the pathway, foundations, requested capabilities, resolved dependency order, future capabilities, and plugin provenance. It is intended to become the input to later lockfile, approval, and deployment-composition services.

## CLI

The CLI writes the generated file list to disk:

```bash
oneness materialize enterprise \
  --name enterprise-app \
  --output ./generated/enterprise-app \
  --capabilities identity,authorization
```

External plugins can participate in the same materialization operation:

```bash
oneness materialize enterprise \
  --name enterprise-risk-app \
  --capabilities risk-scoring \
  --plugin @acme/oneness-risk
```

Unresolved capabilities fail materialization rather than producing a partial application. The generated package includes `typecheck`, `build`, and `test` scripts, establishing the validation hook for the next generated-project verification phase.

## Current boundary

This milestone generates a reliable application skeleton and capability metadata modules. It does not yet materialize provider-specific runtime implementations, install external service adapters, generate Cloudflare bindings, or deploy the result. Those are subsequent generator and supply-chain phases described in the platform expansion roadmap.
