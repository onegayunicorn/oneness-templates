// packages/core/src/templates/text-to-image/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { rateLimiter } from 'hono-rate-limiter';

interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  style?: string;
}

interface GeneratedImage {
  id: string;
  prompt: string;
  url: string;
  timestamp: string;
  metadata: {
    width: number;
    height: number;
    steps: number;
    seed: number;
    style: string;
    model: string;
  };
}

export class TextToImageTemplate {
  private app: Hono;
  private env: any;

  constructor(env: any) {
    this.env = env;
    this.app = new Hono();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use('*', cors());
    this.app.use('*', logger());

    const limiter = rateLimiter({
      windowMs: 60 * 1000,
      limit: 20, // 20 requests per minute
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
    });
    this.app.use('/api/*', limiter);
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

    // Generate image
    this.app.post('/api/generate', async (c) => {
      const data = await c.req.json() as ImageGenerationRequest;
      
      if (!data.prompt) {
        return c.json({ error: 'Prompt is required' }, 400);
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      try {
        // Use Cloudflare Workers AI for image generation
        const ai = c.env.AI;
        const response = await ai.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
          prompt: data.prompt,
          negative_prompt: data.negativePrompt || '',
          width: data.width || 512,
          height: data.height || 512,
          steps: data.steps || 20,
          seed: data.seed || Math.floor(Math.random() * 1000000),
          style: data.style || 'photographic'
        });

        // Store image in R2
        const bucket = c.env.R2_BUCKET;
        const key = `generated/${id}.png`;
        const imageData = response.image;

        await bucket.put(key, imageData, {
          httpMetadata: {
            contentType: 'image/png',
            contentDisposition: `inline; filename="${id}.png"`
          }
        });

        // Generate signed URL
        const url = `https://${c.env.WORKER_NAME}.workers.dev/api/image/${id}`;

        // Store metadata in KV
        const metadata: GeneratedImage = {
          id,
          prompt: data.prompt,
          url,
          timestamp: now,
          metadata: {
            width: data.width || 512,
            height: data.height || 512,
            steps: data.steps || 20,
            seed: data.seed || 0,
            style: data.style || 'photographic',
            model: '@cf/stabilityai/stable-diffusion-xl-base-1.0'
          }
        };

        await c.env.KV_IMAGES.put(id, JSON.stringify(metadata));

        return c.json({
          success: true,
          data: {
            id,
            prompt: data.prompt,
            url,
            metadata: metadata.metadata,
            timestamp: now
          }
        }, 201);

      } catch (error) {
        return c.json({
          error: 'Image generation failed',
          details: (error as Error).message
        }, 500);
      }
    });

    // Get generated image
    this.app.get('/api/image/:id', async (c) => {
      const id = c.req.param('id');
      const bucket = c.env.R2_BUCKET;
      const key = `generated/${id}.png`;

      try {
        const object = await bucket.get(key);
        if (!object) {
          return c.json({ error: 'Image not found' }, 404);
        }

        const response = new Response(object.body);
        response.headers.set('Content-Type', 'image/png');
        response.headers.set('Cache-Control', 'public, max-age=31536000');
        return response;
      } catch (error) {
        return c.json({ error: 'Image not found' }, 404);
      }
    });

    // Get image metadata
    this.app.get('/api/metadata/:id', async (c) => {
      const id = c.req.param('id');
      
      const metadata = await c.env.KV_IMAGES.get(id);
      if (!metadata) {
        return c.json({ error: 'Image not found' }, 404);
      }

      return c.json({
        success: true,
        data: JSON.parse(metadata)
      });
    });

    // List generated images
    this.app.get('/api/images', async (c) => {
      const { limit = '20', cursor } = c.req.query();
      
      const images = await c.env.KV_IMAGES.list({
        limit: parseInt(limit),
        cursor: cursor
      });

      const data = [];
      for (const key of images.keys) {
        const metadata = await c.env.KV_IMAGES.get(key.name);
        if (metadata) {
          data.push(JSON.parse(metadata));
        }
      }

      return c.json({
        success: true,
        data,
        cursor: images.cursor,
        count: data.length
      });
    });

    // Delete image
    this.app.delete('/api/image/:id', async (c) => {
      const id = c.req.param('id');
      
      const bucket = c.env.R2_BUCKET;
      const key = `generated/${id}.png`;
      
      await bucket.delete(key);
      await c.env.KV_IMAGES.delete(id);

      return c.json({
        success: true,
        message: 'Image deleted successfully'
      });
    });

    // Serve UI
    this.app.get('*', (c) => {
      return c.html(`<!DOCTYPE html>
        <html>
          <head>
            <title>Text to Image App</title>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
                color: #e0e0e0;
                min-height: 100vh;
              }
              .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                text-align: center;
                padding: 40px 0;
              }
              .header h1 {
                font-size: 48px;
                font-weight: 800;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-size: 200% 200%;
                animation: gradient 4s ease infinite;
              }
              @keyframes gradient {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
              }
              .header p {
                color: #888;
                font-size: 18px;
                margin-top: 8px;
              }
              .generator {
                background: rgba(26, 26, 46, 0.8);
                backdrop-filter: blur(10px);
                border: 1px solid #2a2a4a;
                border-radius: 16px;
                padding: 30px;
                margin-bottom: 30px;
              }
              .generator textarea {
                width: 100%;
                padding: 16px;
                background: #0a0a0a;
                border: 1px solid #2a2a4a;
                border-radius: 8px;
                color: #e0e0e0;
                font-size: 16px;
                resize: vertical;
                min-height: 100px;
                font-family: inherit;
              }
              .generator textarea:focus {
                outline: none;
                border-color: #667eea;
              }
              .generator .options {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 16px;
                margin-top: 16px;
              }
              .generator .options label {
                display: flex;
                flex-direction: column;
                gap: 4px;
                font-size: 14px;
                color: #888;
              }
              .generator .options input,
              .generator .options select {
                padding: 8px 12px;
                background: #0a0a0a;
                border: 1px solid #2a2a4a;
                border-radius: 4px;
                color: #e0e0e0;
                font-size: 14px;
              }
              .generator .options input:focus,
              .generator .options select:focus {
                outline: none;
                border-color: #667eea;
              }
              .generator .actions {
                display: flex;
                gap: 12px;
                margin-top: 20px;
              }
              .generator .actions button {
                padding: 12px 30px;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
              }
              .btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #fff;
              }
              .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
              }
              .btn-primary:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
              }
              .btn-secondary {
                background: #2a2a4a;
                color: #e0e0e0;
              }
              .btn-secondary:hover {
                background: #3a3a5a;
              }
              .gallery {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 20px;
                margin-top: 20px;
              }
              .gallery-item {
                background: rgba(26, 26, 46, 0.8);
                border: 1px solid #2a2a4a;
                border-radius: 12px;
                overflow: hidden;
                transition: all 0.3s;
                cursor: pointer;
              }
              .gallery-item:hover {
                transform: translateY(-4px);
                border-color: #667eea;
                box-shadow: 0 8px 30px rgba(102, 126, 234, 0.2);
              }
              .gallery-item img {
                width: 100%;
                aspect-ratio: 1;
                object-fit: cover;
                display: block;
              }
              .gallery-item .info {
                padding: 12px 16px;
              }
              .gallery-item .info .prompt {
                font-size: 13px;
                color: #e0e0e0;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
              }
              .gallery-item .info .timestamp {
                font-size: 11px;
                color: #666;
                margin-top: 4px;
              }
              .loading {
                display: none;
                text-align: center;
                padding: 40px;
              }
              .loading.active {
                display: block;
              }
              .loading .spinner {
                width: 48px;
                height: 48px;
                border: 3px solid #2a2a4a;
                border-top-color: #667eea;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin: 0 auto 16px;
              }
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
              .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.9);
                z-index: 1000;
                justify-content: center;
                align-items: center;
                backdrop-filter: blur(10px);
              }
              .modal.active {
                display: flex;
              }
              .modal-content {
                max-width: 90%;
                max-height: 90%;
                position: relative;
              }
              .modal-content img {
                max-width: 100%;
                max-height: 80vh;
                border-radius: 8px;
              }
              .modal-content .close {
                position: absolute;
                top: -40px;
                right: 0;
                background: none;
                border: none;
                color: #fff;
                font-size: 32px;
                cursor: pointer;
              }
              @media (max-width: 600px) {
                .header h1 { font-size: 32px; }
                .gallery {
                  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                }
                .generator .options {
                  grid-template-columns: 1fr;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎨 Text to Image</h1>
                <p>Generate images from text descriptions using AI</p>
              </div>

              <div class="generator">
                <textarea id="prompt" placeholder="Describe the image you want to generate...">A beautiful sunset over a futuristic city with neon lights and flying cars</textarea>
                
                <div class="options">
                  <label>
                    Negative Prompt
                    <input type="text" id="negativePrompt" placeholder="ugly, blurry, distorted" />
                  </label>
                  <label>
                    Width
                    <select id="width">
                      <option value="512">512</option>
                      <option value="768" selected>768</option>
                      <option value="1024">1024</option>
                    </select>
                  </label>
                  <label>
                    Height
                    <select id="height">
                      <option value="512">512</option>
                      <option value="768" selected>768</option>
                      <option value="1024">1024</option>
                    </select>
                  </label>
                  <label>
                    Steps
                    <input type="number" id="steps" value="20" min="10" max="50" />
                  </label>
                  <label>
                    Style
                    <select id="style">
                      <option value="photographic">Photographic</option>
                      <option value="digital-art">Digital Art</option>
                      <option value="oil-painting">Oil Painting</option>
                      <option value="watercolor">Watercolor</option>
                      <option value="cartoon">Cartoon</option>
                      <option value="anime">Anime</option>
                    </select>
                  </label>
                </div>

                <div class="actions">
                  <button class="btn-primary" id="generateBtn" onclick="generateImage()">🚀 Generate</button>
                  <button class="btn-secondary" onclick="document.getElementById('prompt').value = ''">Clear</button>
                </div>
              </div>

              <div class="loading" id="loading">
                <div class="spinner"></div>
                <p style="color:#888;">Generating image...</p>
              </div>

              <div class="gallery" id="gallery"></div>
            </div>

            <div class="modal" id="modal" onclick="closeModal()">
              <div class="modal-content">
                <button class="close">✕</button>
                <img id="modalImage" src="" alt="Generated image" />
              </div>
            </div>

            <script>
              let images = [];
              let generationCount = 0;

              // Generate image
              async function generateImage() {
                const prompt = document.getElementById('prompt').value.trim();
                if (!prompt) {
                  alert('Please enter a prompt');
                  return;
                }

                const btn = document.getElementById('generateBtn');
                const loading = document.getElementById('loading');
                
                btn.disabled = true;
                loading.classList.add('active');

                try {
                  const response = await fetch('/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      prompt,
                      negativePrompt: document.getElementById('negativePrompt').value,
                      width: parseInt(document.getElementById('width').value),
                      height: parseInt(document.getElementById('height').value),
                      steps: parseInt(document.getElementById('steps').value),
                      style: document.getElementById('style').value
                    })
                  });

                  const result = await response.json();
                  
                  if (result.success) {
                    images.unshift(result.data);
                    renderGallery();
                  } else {
                    alert('Error: ' + (result.error || 'Image generation failed'));
                  }
                } catch (error) {
                  alert('Error: ' + error.message);
                }

                btn.disabled = false;
                loading.classList.remove('active');
              }

              // Render gallery
              function renderGallery() {
                const gallery = document.getElementById('gallery');
                gallery.innerHTML = '';

                images.forEach(image => {
                  const div = document.createElement('div');
                  div.className = 'gallery-item';
                  div.innerHTML = \`
                    <img src="\${image.url}" alt="\${image.prompt}" loading="lazy" />
                    <div class="info">
                      <div class="prompt">\${image.prompt}</div>
                      <div class="timestamp">\${new Date(image.timestamp).toLocaleString()}</div>
                    </div>
                  \`;
                  div.onclick = () => openModal(image.url);
                  gallery.appendChild(div);
                });
              }

              // Open modal
              function openModal(url) {
                document.getElementById('modalImage').src = url;
                document.getElementById('modal').classList.add('active');
              }

              // Close modal
              function closeModal() {
                document.getElementById('modal').classList.remove('active');
              }

              // Load gallery
              async function loadGallery() {
                try {
                  const response = await fetch('/api/images?limit=50');
                  const result = await response.json();
                  if (result.success) {
                    images = result.data;
                    renderGallery();
                  }
                } catch (error) {
                  console.error('Error loading gallery:', error);
                }
              }

              // Keyboard shortcuts
              document.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  generateImage();
                }
                if (e.key === 'Escape') {
                  closeModal();
                }
              });

              // Load gallery on startup
              loadGallery();
            </script>
          </body>
        </html>`);
    });
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createTextToImageTemplate(env: any) {
  return new TextToImageTemplate(env);
}
