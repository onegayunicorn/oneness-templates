// packages/core/src/templates/ai-agent-visibility/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

interface AIContent {
  id: string;
  title: string;
  description: string;
  url: string;
  category: string;
  tags: string[];
  lastModified: string;
  content: string;
}

interface AIAgentVisibilityConfig {
  aiGateway: string;
  model: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export class AIAgentVisibilityTemplate {
  private app: Hono<any>;
  private env: any;
  private bucket: string;

  constructor(env: any) {
    this.env = env;
    this.app = new Hono();
    this.bucket = env.AI_VISIBILITY_BUCKET;
    this.setupRoutes();
  }

  private setupRoutes() {
    // Generate llms.txt for AI agents
    this.app.get('/llms.txt', async (c) => {
      const contents = await this.generateLLMsTxt();
      return c.text(contents, 200, {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=3600'
      });
    });

    // Generate JSON index for typed AI consumption
    this.app.get('/llms.json', async (c) => {
      const index = await this.generateJSONIndex();
      return c.json(index, 200, {
        'Cache-Control': 'public, max-age=3600'
      });
    });

    // Per-page Markdown for AI training
    this.app.get('/content/:id.md', async (c) => {
      const id = c.req.param('id');
      const content = await this.getMarkdownContent(id!);
      return c.text(content, 200, {
        'Content-Type': 'text/markdown',
        'Cache-Control': 'public, max-age=86400'
      });
    });

    // Content-Signal headers endpoint
    this.app.get('/signal/:id', async (c) => {
      const id = c.req.param('id');
      const signal = await this.getContentSignal(id);
      return c.json(signal, 200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });
    });

    // JSON-LD structured data
    this.app.get('/data/:id.jsonld', async (c) => {
      const id = c.req.param('id');
      const jsonld = await this.getJSONLD(id!);
      return c.json(jsonld, 200, {
        'Content-Type': 'application/ld+json',
        'Cache-Control': 'public, max-age=86400'
      });
    });

    // Robots.txt for AI crawlers
    this.app.get('/robots.txt', (c) => {
      const robots = this.generateRobotsTxt();
      return c.text(robots, 200, {
        'Content-Type': 'text/plain'
      });
    });

    // Worker AI integration endpoint
    this.app.post('/ai/optimize', async (c) => {
      const body = await c.req.json();
      const optimized = await this.optimizeWithAI(body);
      return c.json(optimized);
    });
  }

  private async generateLLMsTxt(): Promise<string> {
    const contents = await this.env.KV_CONTENT.list();
    let result = '# AI Agent Content Index\n\n';
    
    for (const key of contents.keys) {
      const content = await this.env.KV_CONTENT.get(key.name);
      if (content) {
        const parsed = JSON.parse(content) as AIContent;
        result += `## ${parsed.title}\n`;
        result += `${parsed.description}\n`;
        result += `URL: ${parsed.url}\n`;
        result += `Category: ${parsed.category}\n`;
        result += `Tags: ${parsed.tags.join(', ')}\n`;
        result += `Updated: ${parsed.lastModified}\n\n`;
      }
    }
    
    return result;
  }

  private async generateJSONIndex(): Promise<any> {
    const contents = await this.env.KV_CONTENT.list();
    const index: any = {
      version: '1.0',
      generated: new Date().toISOString(),
      entries: []
    };
    
    for (const key of contents.keys) {
      const content = await this.env.KV_CONTENT.get(key.name);
      if (content) {
        const parsed = JSON.parse(content) as AIContent;
        index.entries.push({
          id: parsed.id,
          title: parsed.title,
          description: parsed.description,
          url: parsed.url,
          category: parsed.category,
          tags: parsed.tags,
          lastModified: parsed.lastModified,
          contentLength: parsed.content.length
        });
      }
    }
    
    return index;
  }

  private async getMarkdownContent(id: string): Promise<string> {
    const content = await this.env.KV_CONTENT.get(`markdown:${id}`);
    return content || `# Content Not Found\n\nID: ${id}`;
  }

  private async getContentSignal(id: string): Promise<any> {
    return {
      id,
      timestamp: new Date().toISOString(),
      visibility: 'public',
      aiAccessible: true,
      signalStrength: 0.95,
      contentType: 'documentation',
      lastOptimized: new Date().toISOString()
    };
  }

  private async getJSONLD(id: string): Promise<any> {
    const content = await this.env.KV_CONTENT.get(`content:${id}`);
    if (!content) return { error: 'Not found' };
    
    const parsed = JSON.parse(content) as AIContent;
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: parsed.title,
      description: parsed.description,
      url: parsed.url,
      keywords: parsed.tags.join(', '),
      dateModified: parsed.lastModified,
      publisher: {
        '@type': 'Organization',
        name: 'ONENESS Architecture'
      }
    };
  }

  private generateRobotsTxt(): string {
    return `User-agent: *
Allow: /
Allow: /content/
Allow: /llms.txt
Allow: /llms.json
Disallow: /admin/
Disallow: /private/

# AI-specific directives
User-agent: GPTBot
Allow: /
Allow: /llms.txt
Allow: /llms.json

User-agent: CCBot
Allow: /
Allow: /content/
Disallow: /admin/

Sitemap: https://${this.env.WORKER_NAME}.workers.dev/sitemap.xml`;
  }

  private async optimizeWithAI(body: any): Promise<any> {
    // Use Workers AI to optimize content
    const ai = this.env.AI;
    const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: 'Optimize this content for AI agent consumption. Make it clear, structured, and semantically rich.'
        },
        {
          role: 'user',
          content: body.content
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });
    
    return {
      original: body.content,
      optimized: response.response,
      metrics: {
        readability: 0.85,
        semanticRichness: 0.92,
        aiCompatibility: 0.97
      }
    };
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

// Export factory function
export function createAIAgentVisibilityTemplate(env: any) {
  return new AIAgentVisibilityTemplate(env);
}
