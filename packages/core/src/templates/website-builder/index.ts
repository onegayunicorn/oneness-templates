// packages/core/src/templates/website-builder/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { jwt } from 'hono/jwt';
import { rateLimiter } from 'hono-rate-limiter';

interface Website {
  id: string;
  userId: string;
  name: string;
  domain: string;
  template: string;
  status: 'draft' | 'published' | 'deleted';
  content: {
    pages: Page[];
    styles: Record<string, string>;
    scripts: Record<string, string>;
    settings: Record<string, any>;
  };
  analytics: {
    visitors: number;
    pageviews: number;
    createdAt: string;
    updatedAt: string;
    lastDeployed: string | null;
  };
}

interface Page {
  id: string;
  title: string;
  slug: string;
  path: string;
  type: 'home' | 'page' | 'blog' | 'product' | 'custom';
  sections: Section[];
  meta: {
    title: string;
    description: string;
    keywords: string[];
    ogImage?: string;
  };
  layout: {
    header: boolean;
    footer: boolean;
    sidebar: boolean;
    width: 'full' | 'contained';
  };
  status: 'draft' | 'published';
}

interface Section {
  id: string;
  type: 'hero' | 'features' | 'pricing' | 'cta' | 'testimonials' | 'gallery' | 'text' | 'image' | 'video';
  content: Record<string, any>;
  styles: Record<string, string>;
  order: number;
}

export class WebsiteBuilderTemplate {
  private app: Hono;
  private env: any;
  private jwtSecret: string;

  constructor(env: any) {
    this.env = env;
    this.jwtSecret = env.JWT_SECRET || 'your-secret-key-here';
    this.app = new Hono();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use('*', cors());
    this.app.use('*', logger());

    const limiter = rateLimiter({
      windowMs: 60 * 1000,
      limit: 100,
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
    });
    this.app.use('/api/*', limiter);

    // Auth for protected routes
    this.app.use('/api/websites/*', jwt({ secret: this.jwtSecret }));
    this.app.use('/api/publish/*', jwt({ secret: this.jwtSecret }));
  }

  private setupRoutes() {
    // Health check
    this.app.get('/api/health', (c) => {
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Auth endpoints
    this.app.post('/api/auth/login', async (c) => {
      const { email, password } = await c.req.json();
      const db = c.env.DB;

      const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      
      if (!user || password !== user.password) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      const token = await this.generateToken(user);
      return c.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      });
    });

    this.app.post('/api/auth/register', async (c) => {
      const { email, password, name } = await c.req.json();
      const db = c.env.DB;

      const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      if (existing) {
        return c.json({ error: 'User already exists' }, 400);
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await db.prepare(
        'INSERT INTO users (id, email, password, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, email, password, name, now, now).run();

      const token = await this.generateToken({ id, email, name });
      return c.json({
        success: true,
        token,
        user: { id, email, name }
      });
    });

    // Website CRUD
    this.app.get('/api/websites', async (c) => {
      const payload = c.get('jwtPayload');
      const db = c.env.DB;

      const websites = await db.prepare(
        'SELECT * FROM websites WHERE user_id = ? AND status != "deleted"'
      ).bind(payload.sub).all();

      return c.json({
        success: true,
        data: websites.results
      });
    });

    this.app.post('/api/websites', async (c) => {
      const payload = c.get('jwtPayload');
      const { name, template, domain } = await c.req.json();
      const db = c.env.DB;

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const defaultContent = this.getDefaultContent(template);

      await db.prepare(
        `INSERT INTO websites (id, user_id, name, domain, template, status, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        payload.sub,
        name,
        domain || `${id}.website.onegayunicorn.com`,
        template || 'default',
        'draft',
        JSON.stringify(defaultContent),
        now,
        now
      ).run();

      const website = await db.prepare('SELECT * FROM websites WHERE id = ?').bind(id).first();

      return c.json({
        success: true,
        data: website
      }, 201);
    });

    this.app.get('/api/websites/:id', async (c) => {
      const payload = c.get('jwtPayload');
      const id = c.req.param('id');
      const db = c.env.DB;

      const website = await db.prepare(
        'SELECT * FROM websites WHERE id = ? AND user_id = ?'
      ).bind(id, payload.sub).first();

      if (!website) {
        return c.json({ error: 'Website not found' }, 404);
      }

      return c.json({
        success: true,
        data: website
      });
    });

    this.app.put('/api/websites/:id', async (c) => {
      const payload = c.get('jwtPayload');
      const id = c.req.param('id');
      const data = await c.req.json();
      const db = c.env.DB;

      const existing = await db.prepare(
        'SELECT * FROM websites WHERE id = ? AND user_id = ?'
      ).bind(id, payload.sub).first();

      if (!existing) {
        return c.json({ error: 'Website not found' }, 404);
      }

      const updates = [];
      const values = [];

      for (const [key, value] of Object.entries(data)) {
        if (key !== 'id' && key !== 'user_id' && key !== 'created_at') {
          updates.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (updates.length === 0) {
        return c.json({ error: 'No fields to update' }, 400);
      }

      const now = new Date().toISOString();
      values.push(now);
      values.push(id);

      await db.prepare(
        `UPDATE websites SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`
      ).bind(...values).run();

      const website = await db.prepare('SELECT * FROM websites WHERE id = ?').bind(id).first();

      return c.json({
        success: true,
        data: website
      });
    });

    this.app.delete('/api/websites/:id', async (c) => {
      const payload = c.get('jwtPayload');
      const id = c.req.param('id');
      const db = c.env.DB;

      const result = await db.prepare(
        'UPDATE websites SET status = "deleted", updated_at = ? WHERE id = ? AND user_id = ?'
      ).bind(new Date().toISOString(), id, payload.sub).run();

      if (result.meta.changes === 0) {
        return c.json({ error: 'Website not found' }, 404);
      }

      return c.json({
        success: true,
        message: 'Website deleted successfully'
      });
    });

    // Content management
    this.app.put('/api/websites/:id/content', async (c) => {
      const payload = c.get('jwtPayload');
      const id = c.req.param('id');
      const { content } = await c.req.json();
      const db = c.env.DB;

      const website = await db.prepare(
        'SELECT * FROM websites WHERE id = ? AND user_id = ?'
      ).bind(id, payload.sub).first();

      if (!website) {
        return c.json({ error: 'Website not found' }, 404);
      }

      const now = new Date().toISOString();
      await db.prepare(
        'UPDATE websites SET content = ?, updated_at = ? WHERE id = ?'
      ).bind(JSON.stringify(content), now, id).run();

      return c.json({
        success: true,
        message: 'Content updated successfully'
      });
    });

    // Publish website
    this.app.post('/api/publish/:id', async (c) => {
      const payload = c.get('jwtPayload');
      const id = c.req.param('id');
      const db = c.env.DB;

      const website = await db.prepare(
        'SELECT * FROM websites WHERE id = ? AND user_id = ?'
      ).bind(id, payload.sub).first();

      if (!website) {
        return c.json({ error: 'Website not found' }, 404);
      }

      const now = new Date().toISOString();
      
      // Deploy to Cloudflare Pages/Workers
      const deployment = await this.deployWebsite(website);
      
      await db.prepare(
        'UPDATE websites SET status = "published", updated_at = ?, last_deployed = ? WHERE id = ?'
      ).bind(now, now, id).run();

      return c.json({
        success: true,
        message: 'Website published successfully',
        url: deployment.url
      });
    });

    // Get published website
    this.app.get('/site/:id/*', async (c) => {
      const id = c.req.param('id');
      const path = c.req.path.replace(`/site/${id}`, '');
      
      const db = c.env.DB;
      const website = await db.prepare(
        'SELECT * FROM websites WHERE id = ? AND status = "published"'
      ).bind(id).first();

      if (!website) {
        return c.text('Website not found', 404);
      }

      const content = JSON.parse(website.content);
      const page = this.findPage(content, path);

      if (!page) {
        return c.text('Page not found', 404);
      }

      const html = this.renderPage(page, website);
      return c.html(html);
    });

    // Analytics
    this.app.post('/api/analytics/:id', async (c) => {
      const id = c.req.param('id');
      const data = await c.req.json();
      
      await c.env.KV_ANALYTICS.put(
        `visit:${id}:${Date.now()}`,
        JSON.stringify({
          ...data,
          timestamp: new Date().toISOString()
        })
      );

      return c.json({ success: true });
    });

    this.app.get('/api/analytics/:id/stats', async (c) => {
      const payload = c.get('jwtPayload');
      const id = c.req.param('id');
      
      const visits = await c.env.KV_ANALYTICS.list({ prefix: `visit:${id}:` });
      
      return c.json({
        success: true,
        stats: {
          totalVisits: visits.keys.length,
          uniqueVisitors: new Set(visits.keys.map(k => k.name.split(':')[2])).size
        }
      });
    });
  }

  private getDefaultContent(template: string): any {
    const templates = {
      default: {
        pages: [
          {
            id: crypto.randomUUID(),
            title: 'Home',
            slug: 'home',
            path: '/',
            type: 'home',
            sections: [
              {
                id: crypto.randomUUID(),
                type: 'hero',
                order: 0,
                content: {
                  title: 'Welcome to Your New Website',
                  subtitle: 'Build something amazing with our website builder',
                  cta: 'Get Started',
                  ctaLink: '#',
                  image: '/api/placeholder/1200/600'
                },
                styles: {
                  background: '#667eea',
                  textColor: '#ffffff',
                  padding: '100px 20px'
                }
              },
              {
                id: crypto.randomUUID(),
                type: 'features',
                order: 1,
                content: {
                  title: 'Features',
                  items: [
                    { icon: '🚀', title: 'Fast', description: 'Lightning fast loading times' },
                    { icon: '🎨', title: 'Customizable', description: 'Complete design control' },
                    { icon: '📱', title: 'Responsive', description: 'Looks great on any device' }
                  ]
                },
                styles: {
                  background: '#f8f9fa',
                  padding: '60px 20px'
                }
              }
            ],
            meta: {
              title: 'Home',
              description: 'Welcome to our website',
              keywords: ['website', 'builder']
            },
            layout: {
              header: true,
              footer: true,
              sidebar: false,
              width: 'contained'
            },
            status: 'published'
          }
        ],
        styles: {
          'global': {
            fontFamily: 'system-ui, -apple-system, sans-serif',
            colors: {
              primary: '#667eea',
              secondary: '#764ba2',
              background: '#ffffff',
              text: '#333333'
            }
          }
        },
        scripts: {},
        settings: {
          siteName: 'My Website',
          description: 'Created with ONENESS Website Builder',
          favicon: '/favicon.ico',
          googleAnalytics: ''
        }
      }
    };

    return templates[template as keyof typeof templates] || templates.default;
  }

  private findPage(content: any, path: string): any {
    return content.pages.find((p: any) => p.path === path) ||
           content.pages.find((p: any) => p.path === '/');
  }

  private renderPage(page: any, website: any): string {
    const content = JSON.parse(website.content);
    const settings = content.settings || {};
    
    let sectionsHtml = '';
    for (const section of page.sections.sort((a: any, b: any) => a.order - b.order)) {
      sectionsHtml += this.renderSection(section);
    }

    return `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${page.meta.title} - ${settings.siteName}</title>
          <meta name="description" content="${page.meta.description}" />
          <meta name="keywords" content="${page.meta.keywords.join(', ')}" />
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: ${content.styles.global.fontFamily};
              color: ${content.styles.global.colors.text};
              background: ${content.styles.global.colors.background};
            }
            .container {
              max-width: 1200px;
              margin: 0 auto;
              padding: 0 20px;
            }
            ${this.generateStyles(content.styles)}
          </style>
          <script>
            // Analytics
            document.addEventListener('DOMContentLoaded', () => {
              fetch('/api/analytics/${website.id}', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  page: '${page.path}',
                  referrer: document.referrer,
                  userAgent: navigator.userAgent
                })
              });
            });
          </script>
        </head>
        <body>
          ${sectionsHtml}
          ${this.renderAnalytics(website)}
        </body>
      </html>`;
  }

  private renderSection(section: any): string {
    const styles = section.styles || {};
    const content = section.content || {};

    switch (section.type) {
      case 'hero':
        return `
          <section style="background: ${styles.background || '#667eea'}; color: ${styles.textColor || '#ffffff'}; padding: ${styles.padding || '100px 20px'}; text-align: center;">
            <div class="container">
              <h1 style="font-size: 48px; margin-bottom: 20px;">${content.title || 'Hero Section'}</h1>
              <p style="font-size: 20px; margin-bottom: 30px; opacity: 0.9;">${content.subtitle || ''}</p>
              ${content.cta ? `<a href="${content.ctaLink || '#'}" style="display: inline-block; background: #ffffff; color: #333; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">${content.cta}</a>` : ''}
            </div>
          </section>
        `;

      case 'features':
        return `
          <section style="background: ${styles.background || '#f8f9fa'}; padding: ${styles.padding || '60px 20px'};">
            <div class="container">
              <h2 style="text-align: center; font-size: 36px; margin-bottom: 40px;">${content.title || 'Features'}</h2>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px;">
                ${(content.items || []).map((item: any) => `
                  <div style="text-align: center; padding: 30px; background: #ffffff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                    <div style="font-size: 48px; margin-bottom: 16px;">${item.icon || '🚀'}</div>
                    <h3 style="margin-bottom: 12px;">${item.title || 'Feature'}</h3>
                    <p style="color: #666;">${item.description || ''}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          </section>
        `;

      case 'cta':
        return `
          <section style="background: ${styles.background || '#667eea'}; color: #ffffff; padding: ${styles.padding || '80px 20px'}; text-align: center;">
            <div class="container">
              <h2 style="font-size: 36px; margin-bottom: 16px;">${content.title || 'Ready to Get Started?'}</h2>
              <p style="font-size: 18px; margin-bottom: 30px; opacity: 0.9;">${content.subtitle || ''}</p>
              <a href="${content.ctaLink || '#'}" style="display: inline-block; background: #ffffff; color: #333; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 18px;">${content.cta || 'Get Started'}</a>
            </div>
          </section>
        `;

      default:
        return `<div>Section type ${section.type} not implemented</div>`;
    }
  }

  private generateStyles(styles: any): string {
    const global = styles.global || {};
    return `
      h1, h2, h3, h4, h5, h6 {
        color: ${global.colors?.primary || '#333'};
      }
      a {
        color: ${global.colors?.primary || '#667eea'};
      }
      a:hover {
        opacity: 0.8;
      }
    `;
  }

  private renderAnalytics(website: any): string {
    const content = JSON.parse(website.content);
    const settings = content.settings || {};
    
    if (!settings.googleAnalytics) return '';
    
    return `
      <!-- Google Analytics -->
      <script async src="https://www.googletagmanager.com/gtag/js?id=${settings.googleAnalytics}"></script>
      <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${settings.googleAnalytics}');
      </script>
    `;
  }

  private async deployWebsite(website: any): Promise<any> {
    // In production, this would deploy to Cloudflare Pages
    // For now, we just return the URL
    const url = `https://${website.domain}`;
    return { url };
  }

  private async generateToken(user: any): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
    };
    return JSON.stringify(payload);
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createWebsiteBuilderTemplate(env: any) {
  return new WebsiteBuilderTemplate(env);
}
