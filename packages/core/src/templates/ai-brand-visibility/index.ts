// packages/core/src/templates/ai-brand-visibility/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { rateLimiter } from 'hono-rate-limiter';

interface BrandTest {
  id: string;
  brand: string;
  query: string;
  model: string;
  result: string;
  score: number;
  timestamp: string;
  mention: boolean;
}

export class AIBrandVisibilityTemplate {
  private app: Hono<any>;
  private env: any;

  constructor(env: any) {
    this.env = env;
    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Rate limiter for API endpoints
    const limiter = rateLimiter({
      windowMs: 60 * 1000, // 1 minute
      limit: 100, // 100 requests per minute
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
    });

    // Test brand visibility across multiple models
    this.app.post('/test', limiter, async (c) => {
      const { brand, query, models } = await c.req.json();
      
      const results = await this.testBrandAcrossModels(brand, query, models);
      await this.storeResults(results);
      
      return c.json({
        brand,
        query,
        timestamp: new Date().toISOString(),
        results,
        summary: this.generateSummary(results)
      });
    });

    // Get brand visibility score
    this.app.get('/score/:brand', async (c) => {
      const brand = c.req.param('brand');
      const score = await this.calculateBrandScore(brand);
      return c.json(score);
    });

    // Get historical trends
    this.app.get('/trends/:brand', async (c) => {
      const brand = c.req.param('brand');
      const trends = await this.getBrandTrends(brand);
      return c.json(trends);
    });

    // Get model comparison
    this.app.get('/compare/:brand', async (c) => {
      const brand = c.req.param('brand');
      const comparison = await this.compareModels(brand);
      return c.json(comparison);
    });

    // Webhook for model mentions
    this.app.post('/webhook', async (c) => {
      const data = await c.req.json();
      await this.processMention(data);
      return c.json({ success: true });
    });

    // Dashboard endpoint
    this.app.get('/dashboard/:brand', async (c) => {
      const brand = c.req.param('brand');
      const dashboard = await this.getDashboardData(brand);
      return c.json(dashboard);
    });
  }

  private async testBrandAcrossModels(brand: string, query: string, models?: string[]): Promise<any[]> {
    const modelList = models || ['gpt-5.4', 'claude-sonnet-4', 'gemini-3-flash', 'llama-4', 'mistral'];
    const results = [];
    
    for (const model of modelList) {
      const result = await this.queryModel(model, query);
      const mention = this.detectBrandMention(result, brand);
      
      results.push({
        model,
        result,
        mention,
        confidence: mention ? this.calculateConfidence(result, brand) : 0,
        timestamp: new Date().toISOString()
      });
    }
    
    return results;
  }

  private async queryModel(model: string, query: string): Promise<string> {
    // Use AI Gateway to route to different models
    const gateway = this.env.AI_GATEWAY;
    const response = await gateway.run(model, {
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. Answer the user\'s question concisely.'
        },
        {
          role: 'user',
          content: query
        }
      ],
      temperature: 0.2,
      max_tokens: 500
    });
    
    return response.response;
  }

  private detectBrandMention(text: string, brand: string): boolean {
    const normalizedText = text.toLowerCase();
    const normalizedBrand = brand.toLowerCase();
    return normalizedText.includes(normalizedBrand) ||
           normalizedText.includes(normalizedBrand.replace(/\s+/g, ''));
  }

  private calculateConfidence(text: string, brand: string): number {
    const normalizedText = text.toLowerCase();
    const normalizedBrand = brand.toLowerCase();
    const mentions = (normalizedText.match(new RegExp(normalizedBrand, 'g')) || []).length;
    const context = normalizedText.substring(
      Math.max(0, normalizedText.indexOf(normalizedBrand) - 50),
      Math.min(normalizedText.length, normalizedText.indexOf(normalizedBrand) + 50)
    );
    
    let confidence = 0.5;
    if (mentions > 0) confidence += 0.2;
    if (context.includes('innovative')) confidence += 0.1;
    if (context.includes('leading')) confidence += 0.1;
    if (context.includes('solution')) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  private generateSummary(results: any[]): any {
    const totalTests = results.length;
    const mentions = results.filter(r => r.mention).length;
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / totalTests;
    
    return {
      totalTests,
      mentions,
      mentionRate: (mentions / totalTests) * 100,
      averageConfidence: avgConfidence * 100,
      ranking: this.generateRanking(results)
    };
  }

  private generateRanking(results: any[]): any[] {
    return results
      .sort((a, b) => b.confidence - a.confidence)
      .map((r, index) => ({
        rank: index + 1,
        model: r.model,
        confidence: r.confidence,
        mention: r.mention
      }));
  }

  private async storeResults(results: any[]): Promise<void> {
    await this.env.KV_BRAND.put(
      `test:${Date.now()}`,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        results
      })
    );
  }

  private async calculateBrandScore(brand: string): Promise<any> {
    const tests = await this.env.KV_BRAND.list({ prefix: `test:` });
    let scores = [];
    
    for (const key of tests.keys) {
      const data = await this.env.KV_BRAND.get(key.name);
      if (data) {
        const parsed = JSON.parse(data);
        const relevant = parsed.results.filter((r: any) => 
          r.brand === brand || brand.includes(r.brand)
        );
        scores.push(...relevant);
      }
    }
    
    const avgScore = scores.reduce((sum: number, r: any) => sum + r.confidence, 0) / scores.length;
    const mentionRate = scores.filter((r: any) => r.mention).length / scores.length;
    
    return {
      brand,
      averageScore: avgScore * 100,
      mentionRate: mentionRate * 100,
      totalTests: scores.length,
      lastUpdated: new Date().toISOString()
    };
  }

  private async getBrandTrends(brand: string): Promise<any> {
    const tests = await this.env.KV_BRAND.list({ prefix: `test:` });
    const trends: any[] = [];
    
    for (const key of tests.keys) {
      const data = await this.env.KV_BRAND.get(key.name);
      if (data) {
        const parsed = JSON.parse(data);
        const relevant = parsed.results.filter((r: any) => 
          r.brand === brand || brand.includes(r.brand)
        );
        if (relevant.length > 0) {
          trends.push({
            timestamp: parsed.timestamp,
            score: relevant.reduce((sum: number, r: any) => sum + r.confidence, 0) / relevant.length
          });
        }
      }
    }
    
    return {
      brand,
      trends: trends.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    };
  }

  private async compareModels(brand: string): Promise<any> {
    const tests = await this.env.KV_BRAND.list({ prefix: `test:` });
    const modelScores: any = {};
    
    for (const key of tests.keys) {
      const data = await this.env.KV_BRAND.get(key.name);
      if (data) {
        const parsed = JSON.parse(data);
        for (const result of parsed.results) {
          if (!modelScores[result.model]) {
            modelScores[result.model] = {
              total: 0,
              mentions: 0,
              confidenceSum: 0
            };
          }
          modelScores[result.model].total++;
          if (result.mention) modelScores[result.model].mentions++;
          modelScores[result.model].confidenceSum += result.confidence;
        }
      }
    }
    
    return Object.entries(modelScores).map(([model, data]: [string, any]) => ({
      model,
      totalTests: data.total,
      mentionRate: (data.mentions / data.total) * 100,
      averageConfidence: (data.confidenceSum / data.total) * 100
    }));
  }

  private async processMention(data: any): Promise<void> {
    const { brand, source, content, timestamp } = data;
    const mention = this.detectBrandMention(content, brand);
    
    await this.env.KV_BRAND.put(
      `mention:${Date.now()}`,
      JSON.stringify({
        brand,
        source,
        content,
        timestamp,
        mention
      })
    );
  }

  private async getDashboardData(brand: string): Promise<any> {
    const [score, trends, comparison] = await Promise.all([
      this.calculateBrandScore(brand),
      this.getBrandTrends(brand),
      this.compareModels(brand)
    ]);
    
    return {
      brand,
      score,
      trends,
      comparison,
      lastUpdated: new Date().toISOString()
    };
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createAIBrandVisibilityTemplate(env: any) {
  return new AIBrandVisibilityTemplate(env);
}
