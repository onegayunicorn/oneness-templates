// packages/core/src/templates/commerce-llms/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  brand: string;
  sku: string;
  availability: 'in_stock' | 'out_of_stock' | 'pre_order';
  images: string[];
  attributes: Record<string, any>;
  variants?: ProductVariant[];
  rating?: number;
  reviews?: number;
  createdAt: string;
  updatedAt: string;
}

interface ProductVariant {
  id: string;
  name: string;
  price: number;
  sku: string;
  attributes: Record<string, string>;
  stock: number;
}

interface ProductCategory {
  id: string;
  name: string;
  description: string;
  parentId?: string;
  children: ProductCategory[];
  productCount: number;
}

export class CommerceLLMsTemplate {
  private app: Hono;
  private env: any;

  constructor(env: any) {
    this.env = env;
    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Main llms.txt endpoint for AI agents
    this.app.get('/llms.txt', async (c) => {
      const products = await this.getProducts(c);
      const categories = await this.getCategories(c);
      
      const llmsTxt = this.generateLLMsTxt(products, categories);
      return c.text(llmsTxt, 200, {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=3600'
      });
    });

    // Structured product data for AI consumption
    this.app.get('/llms.json', async (c) => {
      const products = await this.getProducts(c);
      const categories = await this.getCategories(c);
      
      return c.json({
        version: '2.0',
        generated: new Date().toISOString(),
        totalProducts: products.length,
        totalCategories: categories.length,
        products: products.map(this.formatProductForAI),
        categories: categories.map(this.formatCategoryForAI),
        storeInfo: {
          name: this.env.STORE_NAME || 'ONENESS Commerce',
          url: `https://${this.env.WORKER_NAME}.workers.dev`,
          currency: 'USD',
          lastUpdated: new Date().toISOString()
        }
      }, 200, {
        'Cache-Control': 'public, max-age=3600'
      });
    });

    // AI-optimized product feed
    this.app.get('/ai-feed/feed.json', async (c) => {
      const products = await this.getProducts(c);
      return c.json({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: products.map((product: any, index: number) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: this.toSchemaOrg(product)
        }))
      }, 200, {
        'Cache-Control': 'public, max-age=3600'
      });
    });

    // Product embeddings endpoint
    this.app.post('/embeddings', async (c) => {
      const { query } = await c.req.json();
      const embeddings = await this.generateEmbeddings(query);
      return c.json(embeddings);
    });

    // Semantic search
    this.app.post('/search/semantic', async (c) => {
      const { query, limit } = await c.req.json();
      const results = await this.semanticSearch(query, limit || 10);
      return c.json({
        query,
        results,
        timestamp: new Date().toISOString()
      });
    });

    // Product recommendations
    this.app.post('/recommendations', async (c) => {
      const { productId, userId, limit } = await c.req.json();
      const recommendations = await this.getRecommendations(productId, userId, limit || 5);
      return c.json({
        productId,
        recommendations,
        timestamp: new Date().toISOString()
      });
    });

    // AI product description generator
    this.app.post('/ai/description', async (c) => {
      const { name, category, attributes } = await c.req.json();
      const description = await this.generateAIDescription(name, category, attributes);
      return c.json({ description });
    });
  }

  private async getProducts(c: any): Promise<Product[]> {
    const db = c.env.DB;
    const products = await db.prepare(
      'SELECT * FROM products WHERE availability != "out_of_stock"'
    ).all();
    return products.results as Product[];
  }

  private async getCategories(c: any): Promise<ProductCategory[]> {
    const db = c.env.DB;
    const categories = await db.prepare(
      'SELECT * FROM categories ORDER BY name ASC'
    ).all();
    return categories.results as ProductCategory[];
  }

  private generateLLMsTxt(products: Product[], categories: ProductCategory[]): string {
    let content = '# ONENESS Commerce AI Product Catalog\n\n';
    content += `# ${this.env.STORE_NAME || 'ONENESS Commerce'}\n`;
    content += `# ${new Date().toISOString()}\n\n`;
    
    content += '## Product Categories\n\n';
    for (const category of categories) {
      content += `- ${category.name} (${category.productCount} products): ${category.description}\n`;
      if (category.children.length > 0) {
        for (const child of category.children) {
          content += `  - ${child.name} (${child.productCount} products)\n`;
        }
      }
    }
    
    content += '\n## Product Catalog\n\n';
    for (const product of products) {
      content += `### ${product.name}\n`;
      content += `- **ID**: ${product.id}\n`;
      content += `- **Price**: $${product.price.toFixed(2)} ${product.currency}\n`;
      content += `- **Category**: ${product.category}\n`;
      content += `- **Brand**: ${product.brand}\n`;
      content += `- **Availability**: ${product.availability}\n`;
      if (product.rating) {
        content += `- **Rating**: ${product.rating} (${product.reviews || 0} reviews)\n`;
      }
      content += `- **Description**: ${product.description}\n`;
      content += `- **SKU**: ${product.sku}\n`;
      if (product.variants && product.variants.length > 0) {
        content += `- **Variants**: ${product.variants.length} options available\n`;
        for (const variant of product.variants) {
          content += `  - ${variant.name}: $${variant.price.toFixed(2)} (${variant.stock} in stock)\n`;
        }
      }
      content += '\n';
    }
    
    return content;
  }

  private formatProductForAI(product: Product): any {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      category: product.category,
      brand: product.brand,
      sku: product.sku,
      availability: product.availability,
      images: product.images,
      attributes: product.attributes,
      variants: product.variants?.map(v => ({
        name: v.name,
        price: v.price,
        sku: v.sku,
        attributes: v.attributes,
        stock: v.stock
      })),
      rating: product.rating,
      reviews: product.reviews,
      updatedAt: product.updatedAt
    };
  }

  private formatCategoryForAI(category: ProductCategory): any {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      parentId: category.parentId,
      productCount: category.productCount,
      children: category.children.map(c => c.id)
    };
  }

  private toSchemaOrg(product: Product): any {
    return {
      '@type': 'Product',
      name: product.name,
      description: product.description,
      sku: product.sku,
      brand: {
        '@type': 'Brand',
        name: product.brand
      },
      category: product.category,
      offers: {
        '@type': 'Offer',
        price: product.price,
        priceCurrency: product.currency,
        availability: product.availability === 'in_stock' 
          ? 'https://schema.org/InStock' 
          : 'https://schema.org/OutOfStock',
        url: `https://${this.env.WORKER_NAME}.workers.dev/products/${product.id}`
      },
      ...(product.rating && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: product.rating,
          reviewCount: product.reviews
        }
      }),
      image: product.images,
      ...(product.variants && {
        variation: product.variants.map(v => ({
          '@type': 'Product',
          name: v.name,
          sku: v.sku,
          offers: {
            '@type': 'Offer',
            price: v.price,
            priceCurrency: product.currency,
            availability: v.stock > 0 
              ? 'https://schema.org/InStock' 
              : 'https://schema.org/OutOfStock'
          }
        }))
      })
    };
  }

  private async generateEmbeddings(query: string): Promise<any> {
    const ai = this.env.AI;
    const response = await ai.run('@cf/baai/bge-base-en-v1.5', {
      text: query
    });
    return response;
  }

  private async semanticSearch(query: string, limit: number): Promise<any[]> {
    const db = this.env.DB;
    const products = await db.prepare(
      'SELECT * FROM products LIMIT 100'
    ).all();
    
    // In production, use vector search or AI-based similarity
    const embeddings = await this.generateEmbeddings(query);
    const results = products.results.map((product: any) => ({
      ...product,
      score: Math.random() // Placeholder - use actual similarity score
    }));
    
    return results
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit);
  }

  private async getRecommendations(productId: string, userId: string, limit: number): Promise<any[]> {
    const db = this.env.DB;
    const product = await db.prepare(
      'SELECT category, brand FROM products WHERE id = ?'
    ).bind(productId).first();
    
    if (!product) return [];
    
    const recommendations = await db.prepare(
      'SELECT * FROM products WHERE category = ? AND brand != ? AND availability = "in_stock" LIMIT ?'
    ).bind(product.category, product.brand, limit).all();
    
    return recommendations.results;
  }

  private async generateAIDescription(name: string, category: string, attributes: Record<string, any>): Promise<string> {
    const ai = this.env.AI;
    const prompt = `Generate a compelling product description for ${name} in category ${category}. 
    Attributes: ${JSON.stringify(attributes)}. 
    Make it SEO-friendly and appealing to customers.`;
    
    const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: 'You are a professional copywriter for an e-commerce platform. Create engaging product descriptions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    return response.response;
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createCommerceLLMsTemplate(env: any) {
  return new CommerceLLMsTemplate(env);
}
