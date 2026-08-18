# ONENESS Templates

ONENESS Templates is a TypeScript monorepo containing reusable Cloudflare Workers and full-stack application templates. The source material includes AI visibility, AI brand visibility, OpenAPI backends, commerce and content discovery, D1 workers, SaaS administration, React Router + Hono, Durable Objects chat, multiplayer globe, R2 exploration, text-to-image, and website-builder templates.

## Repository layout

| Path | Purpose |
| --- | --- |
| `packages/core` | Template implementations and exports. |
| `packages/cli` | `oneness` command-line interface for listing, initializing, and deploying templates. |
| `packages/shared` | Shared types and constants. |
| `docs/guides` | Getting-started documentation. |

## Development

This repository uses pnpm workspaces. Install dependencies with `pnpm install`, then run `pnpm typecheck` and `pnpm test`. Build all packages with `pnpm build`.

The templates target Cloudflare Workers and therefore require environment bindings such as D1, KV, R2, Durable Objects, Workers AI, or AI Gateway depending on the selected template. Replace placeholder configuration values before deployment, and do not commit secrets.

## CLI

After building, use `pnpm cli list` to list templates. To initialize a project, use `pnpm cli init <template> --name <project-name> --directory <directory>`.

## Security note

Some source templates intentionally contain simplified authentication examples for demonstration. Production deployments must use secure password hashing, a strong secret supplied through environment bindings, input validation, and appropriately restricted CORS and rate limits.

## License

MIT
