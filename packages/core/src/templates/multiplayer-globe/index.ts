// packages/core/src/templates/multiplayer-globe/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

interface Visitor {
  id: string;
  lat: number;
  lng: number;
  country: string;
  city: string;
  timestamp: string;
  userAgent: string;
  color: string;
}

// Durable Object for managing real-time visitors
export class VisitorTracker {
  private state: DurableObjectState;
  private env: any;
  private visitors: Map<string, Visitor>;
  private websockets: Map<string, WebSocket>;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.visitors = new Map();
    this.websockets = new Map();
    this.loadState();
  }

  private async loadState() {
    const stored = await this.state.storage.get('visitors');
    if (stored) {
      const data = JSON.parse(stored as string);
      for (const [id, visitor] of Object.entries(data)) {
        this.visitors.set(id, visitor as Visitor);
      }
    }
  }

  private async saveState() {
    const data = Object.fromEntries(this.visitors);
    await this.state.storage.put('visitors', JSON.stringify(data));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleWebSocket(server);
      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    const router = new Hono();
    router.use('*', cors());
    router.use('*', logger());

    // Get all visitors
    router.get('/', async (c) => {
      const visitorList = Array.from(this.visitors.values());
      return c.json({
        success: true,
        data: visitorList,
        count: visitorList.length,
        timestamp: new Date().toISOString()
      });
    });

    // Add visitor
    router.post('/', async (c) => {
      const data = await c.req.json();
      
      const visitor: Visitor = {
        id: crypto.randomUUID(),
        lat: data.lat || 0,
        lng: data.lng || 0,
        country: data.country || 'Unknown',
        city: data.city || 'Unknown',
        timestamp: new Date().toISOString(),
        userAgent: data.userAgent || 'Unknown',
        color: this.getRandomColor()
      };
      
      this.visitors.set(visitor.id, visitor);
      await this.saveState();
      
      // Broadcast to all connected clients
      await this.broadcast({
        type: 'visitor_joined',
        data: visitor
      });
      
      return c.json({
        success: true,
        data: visitor
      }, 201);
    });

    // Remove visitor
    router.delete('/:id', async (c) => {
      const id = c.req.param('id');
      
      if (this.visitors.has(id)) {
        this.visitors.delete(id);
        await this.saveState();
        
        await this.broadcast({
          type: 'visitor_left',
          data: { id }
        });
        
        return c.json({
          success: true,
          message: 'Visitor removed'
        });
      }
      
      return c.json({
        error: 'Visitor not found'
      }, 404);
    });

    // Get visitor count
    router.get('/count', async (c) => {
      return c.json({
        success: true,
        count: this.visitors.size
      });
    });

    return router.fetch(request);
  }

  private async handleWebSocket(ws: WebSocket) {
    ws.accept();
    const id = crypto.randomUUID();
    this.websockets.set(id, ws);

    // Send initial visitor list
    ws.send(JSON.stringify({
      type: 'init',
      data: Array.from(this.visitors.values())
    }));

    ws.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        
        if (data.type === 'update_position') {
          const visitor = this.visitors.get(data.id);
          if (visitor) {
            visitor.lat = data.lat;
            visitor.lng = data.lng;
            visitor.timestamp = new Date().toISOString();
            await this.saveState();
            
            await this.broadcast({
              type: 'position_update',
              data: visitor
            });
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.addEventListener('close', () => {
      this.websockets.delete(id);
    });
  }

  private async broadcast(message: any) {
    const serialized = JSON.stringify(message);
    const promises = [];
    
    for (const [id, ws] of this.websockets) {
      try {
        ws.send(serialized);
      } catch (error) {
        this.websockets.delete(id);
      }
    }
    
    await Promise.allSettled(promises);
  }

  private getRandomColor(): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
      '#BB8FCE', '#85C1E9', '#F1948A', '#82E0AA'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

// Main Worker
export class MultiplayerGlobeTemplate {
  private app: Hono<any>;
  private env: any;

  constructor(env: any) {
    this.env = env;
    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.use('*', cors());
    this.app.use('*', logger());

    // Serve static assets
    this.app.get('/', async (c) => {
      return c.html(`<!DOCTYPE html>
        <html>
          <head>
            <title>Multiplayer Globe</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                background: #0a0a0a; 
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              }
              #globe {
                width: 100vw;
                height: 100vh;
              }
              .info {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                color: white;
                background: rgba(0,0,0,0.7);
                padding: 12px 24px;
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.1);
                backdrop-filter: blur(10px);
                font-size: 14px;
                text-align: center;
                z-index: 10;
              }
              .info .count {
                font-size: 24px;
                font-weight: bold;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
              }
            </style>
          </head>
          <body>
            <div id="globe"></div>
            <div class="info">
              🌍 <span class="count" id="visitorCount">0</span> active visitors
            </div>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
            <script>
              // Globe implementation
              const container = document.getElementById('globe');
              const scene = new THREE.Scene();
              const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
              const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
              renderer.setSize(window.innerWidth, window.innerHeight);
              renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
              container.appendChild(renderer.domElement);

              // Create globe
              const geometry = new THREE.SphereGeometry(5, 64, 64);
              const texture = new THREE.TextureLoader().load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg');
              const material = new THREE.MeshPhongMaterial({
                map: texture,
                transparent: true,
                opacity: 0.9,
                shininess: 5
              });
              const globe = new THREE.Mesh(geometry, material);
              scene.add(globe);

              // Add atmosphere glow
              const glowGeometry = new THREE.SphereGeometry(5.2, 64, 64);
              const glowMaterial = new THREE.MeshPhongMaterial({
                color: 0x4CAF50,
                transparent: true,
                opacity: 0.1,
                side: THREE.BackSide
              });
              const glow = new THREE.Mesh(glowGeometry, glowMaterial);
              scene.add(glow);

              // Stars
              const starsGeometry = new THREE.BufferGeometry();
              const starsCount = 3000;
              const starsPositions = new Float32Array(starsCount * 3);
              for (let i = 0; i < starsCount * 3; i++) {
                starsPositions[i] = (Math.random() - 0.5) * 200;
              }
              starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
              const starsMaterial = new THREE.PointsMaterial({
                color: 0xffffff,
                size: 0.2,
                transparent: true
              });
              const stars = new THREE.Points(starsGeometry, starsMaterial);
              scene.add(stars);

              // Lights
              const ambientLight = new THREE.AmbientLight(0x404040);
              scene.add(ambientLight);
              
              const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
              directionalLight.position.set(10, 10, 10);
              scene.add(directionalLight);
              
              const backLight = new THREE.DirectionalLight(0x4CAF50, 0.5);
              backLight.position.set(-10, -10, -10);
              scene.add(backLight);

              camera.position.z = 12;

              // Visitors as 3D markers
              const markers = new THREE.Group();
              scene.add(markers);

              let visitors = [];
              let ws = null;

              // Connect to WebSocket
              function connectWebSocket() {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = \`\${protocol}//\${window.location.host}/api/visitors/ws\`;
                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                  console.log('WebSocket connected');
                  // Register visitor
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      fetch('/api/visitors', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          lat: position.coords.latitude,
                          lng: position.coords.longitude,
                          country: 'Unknown',
                          city: 'Unknown',
                          userAgent: navigator.userAgent
                        })
                      });
                    },
                    () => {
                      // Fallback: random position
                      fetch('/api/visitors', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          lat: (Math.random() - 0.5) * 180,
                          lng: (Math.random() - 0.5) * 360,
                          country: 'Unknown',
                          city: 'Unknown',
                          userAgent: navigator.userAgent
                        })
                      });
                    }
                  );
                };

                ws.onmessage = (event) => {
                  const data = JSON.parse(event.data);
                  
                  if (data.type === 'init') {
                    visitors = data.data;
                    updateMarkers();
                    updateCounter();
                  } else if (data.type === 'visitor_joined') {
                    visitors.push(data.data);
                    updateMarkers();
                    updateCounter();
                  } else if (data.type === 'visitor_left') {
                    visitors = visitors.filter(v => v.id !== data.data.id);
                    updateMarkers();
                    updateCounter();
                  } else if (data.type === 'position_update') {
                    const index = visitors.findIndex(v => v.id === data.data.id);
                    if (index !== -1) {
                      visitors[index] = data.data;
                      updateMarkers();
                    }
                  }
                };

                ws.onclose = () => {
                  setTimeout(connectWebSocket, 3000);
                };
              }

              function updateMarkers() {
                // Clear old markers
                while(markers.children.length > 0) {
                  markers.remove(markers.children[0]);
                }

                // Add new markers
                visitors.forEach(visitor => {
                  const lat = visitor.lat * Math.PI / 180;
                  const lng = visitor.lng * Math.PI / 180;
                  
                  const x = 5 * Math.cos(lat) * Math.cos(lng);
                  const y = 5 * Math.sin(lat);
                  const z = 5 * Math.cos(lat) * Math.sin(lng);

                  const marker = new THREE.Mesh(
                    new THREE.SphereGeometry(0.15, 8, 8),
                    new THREE.MeshPhongMaterial({
                      color: visitor.color || '#FF6B6B',
                      emissive: visitor.color || '#FF6B6B',
                      emissiveIntensity: 0.5
                    })
                  );
                  marker.position.set(x, y, z);
                  markers.add(marker);

                  // Add glow ring
                  const ring = new THREE.Mesh(
                    new THREE.RingGeometry(0.2, 0.3, 16),
                    new THREE.MeshBasicMaterial({
                      color: visitor.color || '#FF6B6B',
                      transparent: true,
                      opacity: 0.3,
                      side: THREE.DoubleSide
                    })
                  );
                  ring.position.set(x, y, z);
                  ring.lookAt(new THREE.Vector3(0, 0, 0));
                  markers.add(ring);
                });
              }

              function updateCounter() {
                document.getElementById('visitorCount').textContent = visitors.length;
              }

              // Animation
              let isDragging = false;
              let previousMousePosition = { x: 0, y: 0 };
              let rotation = { x: 0, y: 0 };

              renderer.domElement.addEventListener('mousedown', (e) => {
                isDragging = true;
                previousMousePosition = { x: e.clientX, y: e.clientY };
              });

              renderer.domElement.addEventListener('mousemove', (e) => {
                if (isDragging) {
                  const deltaX = e.clientX - previousMousePosition.x;
                  const deltaY = e.clientY - previousMousePosition.y;
                  rotation.y += deltaX * 0.005;
                  rotation.x += deltaY * 0.005;
                  previousMousePosition = { x: e.clientX, y: e.clientY };
                }
              });

              renderer.domElement.addEventListener('mouseup', () => {
                isDragging = false;
              });

              window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
              });

              function animate() {
                requestAnimationFrame(animate);
                
                if (!isDragging) {
                  rotation.y += 0.002;
                }
                
                globe.rotation.x = rotation.x;
                globe.rotation.y = rotation.y;
                glow.rotation.x = rotation.x;
                glow.rotation.y = rotation.y;
                markers.rotation.x = rotation.x;
                markers.rotation.y = rotation.y;
                stars.rotation.x += 0.0001;
                stars.rotation.y += 0.0001;

                renderer.render(scene, camera);
              }

              connectWebSocket();
              animate();

              // Handle page unload
              window.addEventListener('beforeunload', () => {
                if (ws) {
                  ws.close();
                }
              });
            </script>
          </body>
        </html>`);
    });

    // Proxy to visitor tracker
    this.app.all('/api/visitors/*', async (c) => {
      const id = this.env.VISITOR_TRACKER.idFromName('global');
      const stub = this.env.VISITOR_TRACKER.get(id);
      return stub.fetch(c.req.raw);
    });

    // WebSocket endpoint
    this.app.get('/api/visitors/ws', async (c) => {
      const id = this.env.VISITOR_TRACKER.idFromName('global');
      const stub = this.env.VISITOR_TRACKER.get(id);
      return stub.fetch(c.req.raw);
    });
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createMultiplayerGlobeTemplate(env: any) {
  return new MultiplayerGlobeTemplate(env);
}
