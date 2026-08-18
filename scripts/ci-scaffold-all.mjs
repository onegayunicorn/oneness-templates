import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const cli = join(root, 'packages', 'cli', 'dist', 'index.js');
const staging = join(root, '.ci-scaffold');
const templates = [
  'ai-agent-visibility',
  'ai-brand-visibility',
  'backend-openapi',
  'commerce-llms',
  'worker-d1',
  'saas-admin',
  'react-router-hono',
  'durable-chat',
  'multiplayer-globe',
  'r2-explorer',
  'text-to-image',
  'website-builder',
  'master',
  'cloudflare-api-starter',
  'sourcing-workflows',
  'universal-driver'
];

function run(command, args, cwd = root) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(cli)) {
  console.error(`Missing built CLI at ${cli}`);
  process.exit(1);
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

for (const template of templates) {
  const relativeDirectory = join('.ci-scaffold', template);
  const directory = join(root, relativeDirectory);
  run('node', [cli, 'init', template, '--name', `ci-${template}`, '--directory', relativeDirectory]);
  run('pnpm', ['install', '--ignore-workspace', '--no-frozen-lockfile', '--config.ignore-scripts=true'], directory);
  run('pnpm', ['typecheck'], directory);
  run('pnpm', ['build'], directory);
  run('pnpm', ['exec', 'vitest', 'run', '--passWithNoTests'], directory);
}

rmSync(staging, { recursive: true, force: true });
console.log(`\nValidated scaffolding, typecheck, build, and tests for ${templates.length} templates.`);
