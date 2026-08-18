#!/usr/bin/env node
// packages/cli/src/index.ts
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import { CapabilityPluginRegistry, composeApplication, formatCompositionPlan, loadCapabilityPlugins, loadPlatformCatalog } from '@oneness/platform';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('oneness')
  .description('ONENESS Architecture CLI for template management')
  .version('2.0.0');

interface Template {
  name: string;
  description: string;
  category: string;
  dependencies: string[];
  files: string[];
}

const templates: Template[] = [
  {
    name: 'ai-agent-visibility',
    description: 'Make content visible to AI agents across every discovery surface',
    category: 'AI',
    dependencies: ['hono', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
    files: ['index.ts', 'wrangler.jsonc']
  },
  {
    name: 'ai-brand-visibility',
    description: 'Test AI model mentions of your brand across multiple LLMs',
    category: 'AI',
    dependencies: ['hono', 'hono-rate-limiter'],
    files: ['index.ts']
  },
  {
    name: 'backend-openapi',
    description: 'Complete backend API using Hono + D1 + Vitest',
    category: 'API',
    dependencies: ['hono', '@hono/zod-openapi', '@hono/swagger-ui'],
    files: ['index.ts']
  },
  {
    name: 'commerce-llms',
    description: 'Make your product catalog visible to AI agents',
    category: 'Commerce',
    dependencies: ['hono'],
    files: ['index.ts']
  },
  {
    name: 'worker-d1',
    description: 'Cloudflare Worker with native D1 database integration',
    category: 'Database',
    dependencies: ['hono', 'hono-rate-limiter'],
    files: ['index.ts']
  },
  {
    name: 'saas-admin',
    description: 'Admin dashboard with authentication and subscription management',
    category: 'SaaS',
    dependencies: ['hono', 'hono-rate-limiter'],
    files: ['index.ts']
  },
  {
    name: 'react-router-hono',
    description: 'React Router + Hono fullstack application with authentication and API',
    category: 'Fullstack',
    dependencies: ['hono', '@hono/zod-validator', 'zod', 'hono-rate-limiter'],
    files: ['index.ts', 'package.json']
  },
  {
    name: 'durable-chat',
    description: 'Real-time chat application using Durable Objects and WebSockets',
    category: 'Real-time',
    dependencies: ['hono', 'hono-rate-limiter'],
    files: ['index.ts']
  },
  {
    name: 'multiplayer-globe',
    description: 'Real-time visitor location tracking on a 3D globe',
    category: 'Real-time',
    dependencies: ['hono'],
    files: ['index.ts']
  },
  {
    name: 'r2-explorer',
    description: 'File explorer interface for Cloudflare R2 buckets',
    category: 'Storage',
    dependencies: ['hono', 'hono-rate-limiter', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
    files: ['index.ts']
  },
  {
    name: 'text-to-image',
    description: 'AI image generation from text prompts using Workers AI',
    category: 'AI',
    dependencies: ['hono', 'hono-rate-limiter'],
    files: ['index.ts']
  },
  {
    name: 'website-builder',
    description: 'Complete website building platform with drag-and-drop interface',
    category: 'SaaS',
    dependencies: ['hono', 'hono-rate-limiter'],
    files: ['index.ts']
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
    files: ['src/index.ts', 'wrangler.jsonc', 'src/database/schema.sql', 'tests/index.test.ts']
  },
  {
    name: 'sourcing-workflows',
    description: 'Commerce sourcing and business workflow automation with AI-assisted supplier discovery',
    category: 'Commerce',
    dependencies: ['hono', '@hono/zod-validator', 'zod', 'nanoid', 'hono-rate-limiter'],
    files: ['src/index.ts', 'wrangler.jsonc', 'src/database/schema.sql', 'tests/index.test.ts']
  },
  {
    name: 'universal-driver',
    description: 'Real-time hardware telemetry, device control, and digital twin management on Cloudflare Workers',
    category: 'IoT',
    dependencies: ['hono', '@hono/zod-validator', 'zod', 'nanoid', 'hono-rate-limiter'],
    files: ['src/index.ts', 'wrangler.jsonc', 'src/database/schema.sql', 'tests/index.test.ts']
  }
];

program
  .command('list')
  .description('List all available templates')
  .action(() => {
    console.log(chalk.blue.bold('\n📦 Available Templates\n'));
    const categories = new Map();
    for (const template of templates) {
      if (!categories.has(template.category)) categories.set(template.category, []);
      categories.get(template.category).push(template);
    }
    for (const [category, items] of categories) {
      console.log(chalk.green.bold(`\n${category}:`));
      for (const item of items as Template[]) {
        console.log(`  ${chalk.cyan('✦')} ${item.name}`);
        console.log(`    ${chalk.gray(item.description)}`);
      }
    }
    console.log();
  });

program
  .command('pathways')
  .description('List platform pathways from the machine-readable architecture catalog')
  .action(() => {
    const catalog = loadPlatformCatalog();
    console.log(JSON.stringify(catalog.pathways.pathways, null, 2));
  });

program
  .command('compose')
  .description('Resolve a pathway into a dependency-ordered capability composition plan')
  .argument('<pathway>', 'Pathway identifier, for example enterprise or procurement')
  .option('-c, --capabilities <capabilities>', 'Comma-separated capability module identifiers')
  .option('-p, --plugin <specifier>', 'External capability plugin package or module; repeatable', (value: string, previous: string[] = []) => [...previous, value], [])
  .action(async (pathway, options) => {
    try {
      const capabilities = options.capabilities
        ? options.capabilities.split(',').map((value: string) => value.trim()).filter(Boolean)
        : undefined;
      const registry = options.plugin.length
        ? await loadCapabilityPlugins(options.plugin, new CapabilityPluginRegistry())
        : undefined;
      const plan = composeApplication(loadPlatformCatalog(), pathway, capabilities, registry);
      console.log(formatCompositionPlan(plan));
      if (plan.unresolvedCapabilities.length > 0) process.exitCode = 2;
    } catch (error) {
      console.error(chalk.red(`❌ Composition failed: ${(error as Error).message}`));
      process.exitCode = 1;
    }
  });

program
  .command('init')
  .description('Initialize a new project from a template')
  .argument('[template]', 'Template name to use')
  .option('-n, --name <name>', 'Project name', 'my-oneness-app')
  .option('-d, --directory <dir>', 'Project directory', '.')
  .action(async (templateName, options) => {
    console.log(chalk.blue.bold('\n🚀 Initializing ONENESS Project\n'));
    if (!templateName) {
      const answers = await inquirer.prompt([
        { type: 'list', name: 'template', message: 'Select a template:', choices: templates.map(t => ({ name: `${t.name} - ${t.description}`, value: t.name })) },
        { type: 'input', name: 'projectName', message: 'Project name:', default: options.name },
        { type: 'input', name: 'directory', message: 'Project directory:', default: options.directory }
      ]);
      templateName = answers.template;
      options.name = answers.projectName;
      options.directory = answers.directory;
    }
    const template = templates.find(t => t.name === templateName);
    if (!template) {
      console.log(chalk.red(`❌ Template "${templateName}" not found`));
      console.log(chalk.gray('Run "oneness list" to see available templates'));
      process.exit(1);
    }
    const projectDir = path.join(process.cwd(), options.directory);
    console.log(chalk.cyan(`Creating project "${options.name}" in ${projectDir}`));
    await fs.ensureDir(projectDir);
    const templateDir = path.join(__dirname, '..', '..', 'core', 'src', 'templates', templateName);
    for (const file of template.files) {
      const src = path.join(templateDir, file);
      const dest = path.join(projectDir, file);
      await fs.ensureDir(path.dirname(dest));
      await fs.copy(src, dest);
    }
    const packageJson = {
      name: options.name,
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'wrangler dev',
        deploy: 'wrangler deploy',
        typecheck: 'tsc --noEmit',
        build: 'tsc --noEmit',
        test: 'vitest run'
      },
      dependencies: {} as Record<string, string>,
      devDependencies: {
        '@cloudflare/workers-types': '^4.20240821.0',
        'wrangler': '^4.0.0',
        'typescript': '^5.0.0',
        'vitest': '^3.2.4'
      }
    };
    const compatibleVersions: Record<string, string> = {
      hono: '^4.7.0',
      '@hono/zod-validator': '^0.4.0',
      zod: '^3.24.0',
      nanoid: '^5.1.0',
      'hono-rate-limiter': '^0.4.2',
      '@aws-sdk/client-s3': '^3.800.0',
      '@aws-sdk/s3-request-presigner': '^3.800.0',
      '@hono/zod-openapi': '^0.19.0',
      '@hono/swagger-ui': '^0.5.0'
    };
    for (const dep of template.dependencies) packageJson.dependencies[dep] = compatibleVersions[dep] || 'latest';
    await fs.writeJSON(path.join(projectDir, 'package.json'), packageJson, { spaces: 2 });
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', lib: ['ES2022'], strict: true,
        skipLibCheck: true, esModuleInterop: true, moduleResolution: 'node',
        resolveJsonModule: true, isolatedModules: true, noEmit: true,
        types: ['@cloudflare/workers-types']
      },
      include: ['src/**/*', 'index.ts', 'tests/**/*'],
      exclude: ['node_modules', 'dist']
    };
    await fs.writeJSON(path.join(projectDir, 'tsconfig.json'), tsconfig, { spaces: 2 });
    console.log(chalk.green('✅ Project initialized successfully!'));
    console.log(chalk.cyan('\nNext steps:'));
    console.log(chalk.gray(`  cd ${options.directory}`));
    console.log(chalk.gray('  npm install'));
    console.log(chalk.gray('  npm run dev'));
    console.log();
  });

program
  .command('deploy')
  .description('Deploy a template to Cloudflare Workers')
  .option('-e, --env <env>', 'Environment (production, staging)', 'production')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n🚀 Deploying to Cloudflare Workers\n'));
    try {
      const { stdout, stderr } = await execAsync('wrangler deploy', { env: { ...process.env, CLOUDFLARE_ENV: options.env } });
      if (stderr) console.log(chalk.yellow('⚠️ ', stderr));
      console.log(stdout);
      console.log(chalk.green('✅ Deployment successful!'));
    } catch (error) {
      console.log(chalk.red('❌ Deployment failed:', (error as Error).message));
      process.exit(1);
    }
  });

program
  .command('build')
  .description('Build the current project')
  .action(async () => {
    console.log(chalk.blue.bold('\n🔨 Building project\n'));
    try {
      const { stdout, stderr } = await execAsync('vite build');
      if (stderr) console.log(chalk.yellow('⚠️ ', stderr));
      console.log(stdout);
      console.log(chalk.green('✅ Build completed successfully!'));
    } catch (error) {
      console.log(chalk.red('❌ Build failed:', (error as Error).message));
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show project information')
  .action(async () => {
    const packageJson = await fs.readJSON('package.json');
    const wranglerJson = await fs.readJSON('wrangler.jsonc').catch(() => null);
    console.log(chalk.blue.bold('\n📊 Project Information\n'));
    console.log(chalk.cyan('Name:'), packageJson.name);
    console.log(chalk.cyan('Version:'), packageJson.version);
    console.log(chalk.cyan('Scripts:'));
    for (const [name, script] of Object.entries(packageJson.scripts || {})) console.log(`  ${chalk.gray(name)}: ${script}`);
    console.log(chalk.cyan('Dependencies:'), Object.keys(packageJson.dependencies || {}).length);
    console.log(chalk.cyan('Dev Dependencies:'), Object.keys(packageJson.devDependencies || {}).length);
    if (wranglerJson) {
      console.log(chalk.cyan('Worker Name:'), wranglerJson.name || 'Not set');
      console.log(chalk.cyan('Compatibility Date:'), wranglerJson.compatibility_date || 'Not set');
    }
    console.log();
  });

program.parse();
