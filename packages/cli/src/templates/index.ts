// packages/cli/src/templates/index.ts
export const templates = [
  // ... existing templates ...
  {
    name: 'react-router-hono',
    description: 'React Router + Hono fullstack application with authentication and API',
    category: 'Fullstack',
    dependencies: ['hono', '@hono/zod-validator', 'zod', 'react', 'react-router-dom'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json', 'schema.sql']
  },
  {
    name: 'durable-chat',
    description: 'Real-time chat application using Durable Objects and WebSockets',
    category: 'Real-time',
    dependencies: ['hono'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json']
  },
  {
    name: 'multiplayer-globe',
    description: 'Real-time visitor location tracking on a 3D globe',
    category: 'Real-time',
    dependencies: ['hono'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json']
  },
  {
    name: 'r2-explorer',
    description: 'File explorer interface for Cloudflare R2 buckets',
    category: 'Storage',
    dependencies: ['hono', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json']
  },
  {
    name: 'text-to-image',
    description: 'AI image generation from text prompts using Workers AI',
    category: 'AI',
    dependencies: ['hono'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json']
  },
  {
    name: 'website-builder',
    description: 'Complete website building platform with drag-and-drop interface',
    category: 'SaaS',
    dependencies: ['hono'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json', 'schema.sql']
  },
  {
    name: 'master',
    description: 'Production-ready Cloudflare Worker API starter with D1, KV, authentication, rate limiting, and WebSockets',
    category: 'Fullstack',
    dependencies: ['hono', '@hono/zod-validator', 'zod', 'nanoid', 'hono-rate-limiter'],
    files: ['index.ts', 'wrangler.jsonc', 'tests/index.test.ts', 'README.md']
  },
  {
    name: 'cloudflare-api-starter',
    description: 'Typed Cloudflare Worker API with D1, KV caching, authentication, CRUD resources, and health checks',
    category: 'Fullstack',
    dependencies: ['hono', '@hono/zod-validator', 'zod', 'nanoid', 'hono-rate-limiter'],
    files: ['src/index.ts', 'wrangler.jsonc', 'src/database/schema.sql']
  },
  {
    name: 'sourcing-workflows',
    description: 'Commerce sourcing and business workflow automation with AI-assisted supplier discovery',
    category: 'Commerce',
    dependencies: ['hono', '@hono/zod-validator', 'zod', 'nanoid', 'hono-rate-limiter'],
    files: ['src/index.ts', 'wrangler.jsonc', 'src/database/schema.sql']
  },
  {
    name: 'universal-driver',
    description: 'Real-time hardware telemetry, device control, and digital twin management on Cloudflare Workers',
    category: 'IoT',
    dependencies: ['hono', '@hono/zod-validator', 'zod', 'nanoid', 'hono-rate-limiter'],
    files: ['src/index.ts', 'wrangler.jsonc', 'src/database/schema.sql']
  }
];
