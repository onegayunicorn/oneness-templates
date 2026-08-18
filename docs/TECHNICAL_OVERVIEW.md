# ONENESS Templates: Complete Technical Overview

> **Document status:** Current as of 18 August 2026  
> **Repository:** [onegayunicorn/oneness-templates](https://github.com/onegayunicorn/oneness-templates)  
> **Default branch:** `master`  
> **Author:** Manus AI

## 1. Executive Summary

ONENESS Templates is a pnpm-managed TypeScript monorepo for generating Cloudflare Workers and Hono-based application starters. It combines a reusable template catalog, a command-line initializer, shared package infrastructure, Cloudflare binding declarations, template-local tests, and GitHub Actions automation.

The repository currently registers **16 templates**. The CLI can list them and scaffold a new project with the required source files, package manifest, TypeScript configuration, and dependency declarations. The CI pipeline validates the workspace and then independently scaffolds, installs, typechecks, builds, and tests every registered template on every push. [1] [2]

The implementation was assembled from the supplied template content, normalized into a consistent repository layout, repaired for TypeScript and Cloudflare compatibility, extended with four custom workflow-oriented templates, and verified in both generated-project and local Wrangler preview environments.

## 2. Repository and Package Architecture

The repository is organized as a small workspace rather than as a single deployable Worker. The root package defines the common lifecycle commands, while each package owns its own source and compiler configuration.

| Location | Responsibility |
| --- | --- |
| `packages/core` | Template implementations, Cloudflare bindings, schemas, worker handlers, and template tests. |
| `packages/cli` | `oneness list`, `oneness init`, deployment, build, and project information commands. |
| `packages/shared` | Shared TypeScript types, constants, and utility exports. |
| `packages/core/src/templates` | The 16 template directories and their source/configuration files. |
| `scripts/ci-scaffold-all.mjs` | Reusable all-template scaffold/build/test matrix used by CI. |
| `.github/workflows/ci.yml` | GitHub Actions workflow executed on every push and by manual dispatch. |
| `docs/TECHNICAL_OVERVIEW.md` | This technical record. |

The root scripts are intentionally simple: `pnpm typecheck` recursively typechecks workspace packages, `pnpm test` recursively runs package tests, and `pnpm build` recursively builds the packages. The core package uses TypeScript and Vitest; the CLI uses TypeScript and Commander-based command handling; the shared package is a type-only utility layer. [3] [4]

## 3. Template Catalog

The catalog contains general-purpose application templates, specialized Cloudflare examples, and four custom templates extracted from the supplied material.

| Template | Primary purpose | Important dependencies or bindings |
| --- | --- | --- |
| `ai-agent-visibility` | Expose content through AI discovery surfaces, Markdown, JSON-LD, `llms.txt`, and related metadata. | Hono, S3 client, S3 presigner. |
| `ai-brand-visibility` | Track and score brand visibility across AI model responses. | Hono, CORS, rate limiting. |
| `backend-openapi` | Build an OpenAPI-described D1 API with Swagger UI. | Hono, `@hono/zod-openapi`, `@hono/swagger-ui`. |
| `commerce-llms` | Make commerce/product information discoverable to AI agents. | Hono and CORS. |
| `worker-d1` | Minimal Cloudflare Worker with D1 integration. | Hono, CORS, rate limiting. |
| `saas-admin` | Authentication, organization, user, subscription, and administrative operations. | Hono, JWT, CORS, rate limiting. |
| `react-router-hono` | React Router/Hono-oriented full-stack starter surface. | Hono, Zod validation, JWT, rate limiting. |
| `durable-chat` | Durable Object-backed real-time chat and WebSocket behavior. | Hono, JWT, logger, rate limiting. |
| `multiplayer-globe` | Real-time visitor/location presence on a globe interface. | Hono, CORS, logger. |
| `r2-explorer` | R2 bucket listing, upload, download, signed URLs, and object management. | Hono, AWS S3 client/presigner, JWT, rate limiting. |
| `text-to-image` | Workers AI image generation from text prompts. | Hono, CORS, logger, rate limiting. |
| `website-builder` | Website creation, page/content management, publishing, and analytics. | Hono, JWT, CORS, logger, rate limiting. |
| `master` | Production-oriented API starter with D1, KV, authentication, rate limiting, queues, R2, Workers AI, SSE, and WebSockets. | Hono, Zod validation, Zod, Nano ID, rate limiting; D1, KV, Queue, R2, AI, Durable Objects. |
| `cloudflare-api-starter` | Typed Cloudflare API with CRUD resources, authentication, cache middleware, and health checks. | Hono, Zod validation, Zod, Nano ID, rate limiting; D1, KV, Queue, R2, AI. |
| `sourcing-workflows` | Supplier discovery, sourcing requests, quote comparison, procurement, and launch workflows. | Hono, Zod validation, Zod, Nano ID, rate limiting; D1 and Workers AI. |
| `universal-driver` | Device registration, telemetry, commands, digital twins, and hardware status. | Hono, Zod validation, Zod, Nano ID, rate limiting; D1, KV, Queue, Workers AI. |

The active registry is maintained in `packages/cli/src/index.ts`. The CI workflow verifies that the registry count remains 16 and that every declared source/configuration path exists before attempting to scaffold projects. [2]

## 4. CLI Design and Scaffolding Flow

The CLI is distributed as `@oneness/cli` and exposes the `oneness` executable. Its central operation is `oneness init`.

A typical initialization command is:

```bash
pnpm --filter @oneness/cli build
node packages/cli/dist/index.js init master \
  --name my-oneness-api \
  --directory ./my-oneness-api
```

The initializer performs the following operations:

1. It resolves the selected template from the registry.
2. It creates the requested destination directory.
3. It copies each registry-declared template file from `packages/core/src/templates/<template>` into the project directory.
4. It generates a project `package.json` with `dev`, `deploy`, `typecheck`, `build`, and `test` scripts.
5. It adds Cloudflare Workers types, Wrangler, TypeScript, and Vitest as development dependencies.
6. It applies compatible versions for common runtime packages such as Hono, Zod, `@hono/zod-validator`, Nano ID, rate limiting, OpenAPI tooling, and AWS S3 clients.
7. It generates a strict TypeScript configuration that includes both root-level `index.ts` files and nested `src/**/*` files, as well as `tests/**/*`.

The generated `build` command is deliberately `tsc --noEmit`. These templates are Worker applications, not Vite browser applications, so using a Vite build would incorrectly require an HTML application entrypoint. The generated test command is `vitest run`, and CI invokes Vitest with `--passWithNoTests` for templates that do not yet contain dedicated tests. [2]

The CLI also includes `list`, `deploy`, `build`, and `info` commands. Deployment remains an operator-controlled action and is not executed by CI.

## 5. Cloudflare Runtime Model

The templates target Cloudflare Workers and use bindings supplied through Wrangler configuration or test fixtures. Depending on the template, bindings include the following.

| Binding | Usage in the repository |
| --- | --- |
| D1 | Relational data for users, resources, sourcing requests, telemetry, devices, websites, and workflow records. |
| KV | Caching, sessions, rate limiting, visitor presence, and lightweight state. |
| R2 | Object storage, file uploads, signed downloads, previews, and asset management. |
| Queue | Asynchronous processing for API, workflow, and device events. |
| Workers AI | Text, image, embedding, and AI-assisted workflow operations. |
| Durable Objects | Real-time chat, WebSockets, presence, and room coordination. |
| JWT secret and environment variables | Authentication and environment-specific behavior. |

The master template now exports the configured `WebSocketRoom` Durable Object class and declares `index.ts` as its Wrangler entrypoint. This is important because the CLI scaffolds the master entrypoint at the project root rather than under `src/`. The correction was validated through a local Wrangler preview and published in commit [`a1c9871`](https://github.com/onegayunicorn/oneness-templates/commit/a1c9871). [5] [6]

Local preview tests use Wrangler’s local emulation. D1 schemas are applied with commands such as:

```bash
pnpm exec wrangler d1 execute sourcing_db \
  --local \
  --config wrangler.local.jsonc \
  --file=src/database/schema.sql
```

Deployment-only routes and custom domains are removed from temporary local configuration copies. This prevents local preview startup from validating production routing metadata or requiring a Cloudflare account.

## 6. Testing Strategy

Testing is performed at four levels.

### 6.1 Workspace validation

The root workspace runs recursive typechecking, tests, and builds. This catches errors in the template package, CLI package, and shared package before any generated project is tested.

### 6.2 Template structural validation

The workflow parses the CLI registry, requires exactly 16 registered templates, and checks every declared file path against the template directory. This prevents registry drift, missing files, and broken initialization metadata.

### 6.3 Generated-project validation

`scripts/ci-scaffold-all.mjs` builds the CLI and iterates over every registered template. For each template it performs a clean scaffold, isolated dependency installation, generated-project typecheck, generated-project build, and Vitest execution. The staging directory is deleted after validation.

### 6.4 Local Wrangler end-to-end validation

Four binding-heavy projects were scaffolded and run as local Wrangler previews:

| Project | End-to-end checks |
| --- | --- |
| `master` | Preview startup and `GET /api/health`, including local D1/KV/R2/Queue/AI status reporting. |
| `cloudflare-api-starter` | Preview startup and `GET /api/health`. |
| `sourcing-workflows` | Local D1 schema application, `GET /api/health`, and `GET /api/workflows`. |
| `universal-driver` | Local D1 schema application and `GET /api/health`. |

The local preview exercise initially exposed a missing D1 schema for the sourcing workflow endpoint, which was resolved by applying its supplied schema before exercising database-backed routes. It also exposed the master entrypoint and Durable Object export mismatch described above.

The final repository validation after these changes passed with **12 tests passing and 1 Cloudflare-runtime WebSocket test skipped**. The skipped test requires a Cloudflare WebSocket runtime and is intentionally isolated from Node-based Vitest execution. The full workspace typecheck and build also passed.

## 7. GitHub Actions CI/CD

The workflow is defined in `.github/workflows/ci.yml` and runs on every `push` to any branch. It also supports `workflow_dispatch` for manual execution. The job runs on Ubuntu with Node.js 22 and uses the pnpm version declared by the root `packageManager` field.

The workflow sequence is:

```text
checkout
  -> setup pnpm
  -> setup Node.js
  -> install workspace dependencies
  -> workspace typecheck
  -> workspace tests
  -> workspace build
  -> verify 16 registry entries and declared files
  -> scaffold/typecheck/build/test all 16 templates
```

The workflow uses concurrency cancellation per branch so obsolete in-progress runs are stopped when a newer push arrives. It requests only `contents: read` permissions.

The first CI attempt failed before validation because the workflow redundantly specified pnpm 10 while `package.json` already declared `pnpm@10.0.0`. The workflow was corrected by removing the duplicate action-level version. The next run, [ONENESS CI run `32125289930`](https://github.com/onegayunicorn/oneness-templates/actions/runs/32125289930), completed successfully for commit `42342ea`; all workspace checks, file verification, and all-template scaffolding checks passed. [7]

## 8. Engineering Corrections Completed

The implementation required several compatibility and correctness repairs beyond extraction.

| Area | Correction |
| --- | --- |
| Nested browser scripts | Escaped nested backticks and `${...}` expressions in Multiplayer Globe and R2 Explorer so generated client-side JavaScript remains syntactically valid. |
| Cloudflare bindings | Added Workers runtime typings and corrected Hono environment generics and binding access. |
| JWT middleware | Supplied the required HS256 algorithm configuration. |
| Hono static handling | Aligned static-file handling with the installed Hono API. |
| R2 SDK | Corrected R2 command imports, list-object invocation, and response typing. |
| OpenAPI | Corrected parameter access and handler context typing. |
| Zod compatibility | Updated record and pagination schemas so generated projects compile with the pinned Zod 3-compatible dependency set. |
| Strict TypeScript | Added explicit annotations for route parameters, database result callbacks, promise arrays, form-data casts, and KV key mappings. |
| CLI registry | Corrected stale paths and restored the complete 16-template catalog. |
| Master preview | Corrected the root entrypoint and exported `WebSocketRoom`. |
| CI setup | Removed duplicate pnpm version configuration in GitHub Actions. |

## 9. Commit and Release History

The main implementation milestones are recorded in the public Git history.

| Commit | Summary |
| --- | --- |
| `5f611c4` | Initial ONENESS template system. |
| `d21f92f` | Fixed embedded template literals in Globe and R2 templates. |
| `1a57dff` | Fixed Cloudflare binding and template type errors. |
| `b2cbb33` | Added custom Cloudflare workflow templates and tests. |
| `aaf9f5a` | Fixed master template CLI scaffolding metadata. |
| `81776e2` | Added all-template GitHub Actions CI. |
| `42342ea` | Fixed pnpm setup in GitHub Actions. |
| `a1c9871` | Fixed master local preview entrypoint and Durable Object export. |

The canonical repository is [github.com/onegayunicorn/oneness-templates](https://github.com/onegayunicorn/oneness-templates). The working tree was clean after the final local preview fixes were committed and pushed.

## 10. Operational Usage

For repository development, use the following commands from the repository root:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

To list available templates after building the CLI:

```bash
pnpm --filter @oneness/cli build
node packages/cli/dist/index.js list
```

To scaffold a project:

```bash
node packages/cli/dist/index.js init sourcing-workflows \
  --name sourcing-demo \
  --directory ./sourcing-demo
```

To validate every template locally in the same manner as CI:

```bash
pnpm --filter @oneness/cli build
node scripts/ci-scaffold-all.mjs
```

To run a Cloudflare Worker locally, use a project-specific Wrangler configuration and initialize any D1 schema required by the route under test. Production routes, resource identifiers, API tokens, and secrets must be supplied by the operator; placeholders included in the templates are not deployment credentials.

## 11. Known Limitations and Recommended Next Steps

The repository is a strong scaffold and validation system, but the templates remain starters rather than fully provisioned production services. Several templates do not yet include dedicated tests, so generated-project CI uses `--passWithNoTests` for those projects. Cloudflare-only behavior such as WebSocket upgrades, real Workers AI execution, queue delivery, remote R2 access, and production D1 behavior requires a real Cloudflare preview environment with provisioned resources.

The next logical improvements are to add template-local tests for the remaining six direct templates, add a dedicated local-preview harness that automatically applies D1 schemas, and add a separate authenticated deployment workflow for Cloudflare preview environments. Secrets should be stored in GitHub Actions or Cloudflare secret stores rather than in repository files or command history.

## References

[1]: ../package.json "ONENESS root workspace package manifest"

[2]: ../packages/cli/src/index.ts "ONENESS CLI registry and scaffolding implementation"

[3]: ../packages/core/package.json "Core template package manifest"

[4]: ../packages/shared/package.json "Shared package manifest"

[5]: ../packages/core/src/templates/master/index.ts "Master template Worker, bindings, routes, tests support, and Durable Object export"

[6]: ../packages/core/src/templates/master/wrangler.jsonc "Master template Wrangler configuration"

[7]: ../.github/workflows/ci.yml "ONENESS GitHub Actions workflow"
