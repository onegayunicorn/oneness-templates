#!/usr/bin/env node
// packages/cli/src/index.ts
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
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
    dependencies: ['hono', '@aws-sdk/client-s3'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json']
  },
  {
    name: 'ai-brand-visibility',
    description: 'Test AI model mentions of your brand across multiple LLMs',
    category: 'AI',
    dependencies: ['hono', 'hono-rate-limiter'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json']
  },
  {
    name: 'backend-openapi',
    description: 'Complete backend API using Hono + D1 + Vitest',
    category: 'API',
    dependencies: ['hono', '@hono/zod-openapi', '@hono/swagger-ui'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json', 'vitest.config.ts']
  },
  {
    name: 'commerce-llms',
    description: 'Make your product catalog visible to AI agents',
    category: 'Commerce',
    dependencies: ['hono'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json']
  },
  {
    name: 'worker-d1',
    description: 'Cloudflare Worker with native D1 database integration',
    category: 'Database',
    dependencies: ['hono', 'hono-rate-limiter'],
    files: ['src/index.ts', 'wrangler.jsonc', 'package.json', 'schema.sql']
  },
  {
    name: 'saas-admin',
    description: 'Admin dashboard with authentication and subscription management',
    category: 'SaaS',
    dependencies: ['hono', 'hono/jwt', 'hono-rate-limiter'],
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

program
  .command('list')
  .description('List all available templates')
  .action(() => {
    console.log(chalk.blue.bold('\n📦 Available Templates\n'));
    const categories = new Map();
    
    for (const template of templates) {
      if (!categories.has(template.category)) {
        categories.set(template.category, []);
      }
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
  .command('init')
  .description('Initialize a new project from a template')
  .argument('[template]', 'Template name to use')
  .option('-n, --name <name>', 'Project name', 'my-oneness-app')
  .option('-d, --directory <dir>', 'Project directory', '.')
  .action(async (templateName, options) => {
    console.log(chalk.blue.bold('\n🚀 Initializing ONENESS Project\n'));
    
    // If template not provided, show interactive selection
    if (!templateName) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'template',
          message: 'Select a template:',
          choices: templates.map(t => ({
            name: `${t.name} - ${t.description}`,
            value: t.name
          }))
        },
        {
          type: 'input',
          name: 'projectName',
          message: 'Project name:',
          default: options.name
        },
        {
          type: 'input',
          name: 'directory',
          message: 'Project directory:',
          default: options.directory
        }
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
    
    // Create project directory
    await fs.ensureDir(projectDir);
    
    // Copy template files
    const templateDir = path.join(__dirname, '..', '..', 'core', 'src', 'templates', templateName);
    for (const file of template.files) {
      const src = path.join(templateDir, file);
      const dest = path.join(projectDir, file);
      await fs.ensureDir(path.dirname(dest));
      await fs.copy(src, dest);
    }
    
    // Generate package.json
    const packageJson = {
      name: options.name,
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'wrangler dev',
        deploy: 'wrangler deploy',
        build: 'vite build',
        test: 'vitest'
      },
      dependencies: {},
      devDependencies: {
        '@cloudflare/workers-types': '^4.20240821.0',
        'wrangler': '^4.0.0',
        'typescript': '^5.0.0',
        'vite': '^5.0.0'
      }
    };
    
    for (const dep of template.dependencies) {
      packageJson.dependencies[dep] = 'latest';
    }
    
    await fs.writeJSON(path.join(projectDir, 'package.json'), packageJson, { spaces: 2 });
    
    // Create tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        lib: ['ES2022'],
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        moduleResolution: 'node',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        types: ['@cloudflare/workers-types']
      },
      include: ['src/**/*'],
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
      const { stdout, stderr } = await execAsync('wrangler deploy', {
        env: { ...process.env, CLOUDFLARE_ENV: options.env }
      });
      
      if (stderr) {
        console.log(chalk.yellow('⚠️ ', stderr));
      }
      
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
      
      if (stderr) {
        console.log(chalk.yellow('⚠️ ', stderr));
      }
      
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
    for (const [name, script] of Object.entries(packageJson.scripts || {})) {
      console.log(`  ${chalk.gray(name)}: ${script}`);
    }
    console.log(chalk.cyan('Dependencies:'), Object.keys(packageJson.dependencies || {}).length);
    console.log(chalk.cyan('Dev Dependencies:'), Object.keys(packageJson.devDependencies || {}).length);
    
    if (wranglerJson) {
      console.log(chalk.cyan('Worker Name:'), wranglerJson.name || 'Not set');
      console.log(chalk.cyan('Compatibility Date:'), wranglerJson.compatibility_date || 'Not set');
    }
    console.log();
  });

program.parse();
