// packages/core/src/templates/universal-driver/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { streamSSE } from 'hono/streaming';
import { rateLimiter } from 'hono-rate-limiter';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { nanoid } from 'nanoid';

// Types
interface TelemetryData {
  deviceId: string;
  timestamp: string;
  metrics: {
    cpu: number;
    memory: number;
    temperature: number;
    battery: number;
    signalStrength: number;
    [key: string]: any;
  };
  location?: {
    lat: number;
    lng: number;
    altitude: number;
  };
  status: 'online' | 'offline' | 'error' | 'calibrating';
  hardware: {
    model: string;
    firmware: string;
    serial: string;
    peripherals: string[];
  };
}

interface HardwareState {
  deviceId: string;
  state: 'idle' | 'active' | 'standby' | 'error';
  operations: {
    current: string;
    progress: number;
    duration: number;
  };
  power: {
    voltage: number;
    current: number;
    power: number;
  };
  sensors: {
    [key: string]: {
      value: number;
      unit: string;
      timestamp: string;
    };
  };
}

interface DigitalTwin {
  id: string;
  deviceId: string;
  name: string;
  type: string;
  status: 'active' | 'inactive' | 'maintenance';
  metadata: {
    manufacturer: string;
    model: string;
    serial: string;
    firmware: string;
    location: string;
  };
  capabilities: string[];
  metrics: {
    uptime: number;
    performance: number;
    reliability: number;
    efficiency: number;
  };
  lastSync: string;
  state: HardwareState;
}

// Schemas
const TelemetrySchema = z.object({
  deviceId: z.string(),
  metrics: z.record(z.number()),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    altitude: z.number().optional()
  }).optional(),
  status: z.enum(['online', 'offline', 'error', 'calibrating']),
  hardware: z.object({
    model: z.string(),
    firmware: z.string(),
    serial: z.string(),
    peripherals: z.array(z.string())
  })
});

const CommandSchema = z.object({
  deviceId: z.string(),
  command: z.string(),
  parameters: z.record(z.any()).optional()
});

// Main Application
export class UniversalDriverTemplate {
  private app: Hono<{ Bindings: any }>;
  private env: any;
  private devices: Map<string, any>;
  private connections: Map<string, WebSocket>;

  constructor(env: any) {
    this.env = env;
    this.app = new Hono<{ Bindings: any }>();
    this.devices = new Map();
    this.connections = new Map();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware() {
    this.app.use('*', cors());
    this.app.use('*', logger());

    const limiter = rateLimiter({
      windowMs: 60 * 1000,
      limit: 500,
      keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown'
    });
    this.app.use('/api/*', limiter);
  }

  private setupRoutes() {
    // Health
    this.app.get('/api/health', (c) => {
      return c.json({
        status: 'healthy',
        version: '2.0.0',
        deviceCount: this.devices.size,
        connectionCount: this.connections.size,
        timestamp: new Date().toISOString()
      });
    });

    // Device registration
    this.app.post('/api/devices/register', zValidator('json', z.object({
      deviceId: z.string(),
      name: z.string(),
      type: z.string(),
      metadata: z.record(z.any())
    })), async (c) => {
      const data = await c.req.valid('json');
      const db = c.env.DB;

      const id = nanoid();
      const now = new Date().toISOString();

      await db.prepare(
        `INSERT INTO devices (id, device_id, name, type, metadata, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        data.deviceId,
        data.name,
        data.type,
        JSON.stringify(data.metadata),
        'active',
        now,
        now
      ).run();

      const device = {
        id,
        deviceId: data.deviceId,
        name: data.name,
        type: data.type,
        metadata: data.metadata,
        status: 'active',
        created_at: now,
        updated_at: now
      };

      this.devices.set(data.deviceId, device);

      return c.json({
        success: true,
        data: device
      }, 201);
    });

    // Telemetry ingestion
    this.app.post('/api/telemetry', zValidator('json', TelemetrySchema), async (c) => {
      const data = await c.req.valid('json');
      const db = c.env.DB;
      const kv = c.env.KV;

      const now = new Date().toISOString();

      // Store telemetry
      const id = nanoid();
      await db.prepare(
        `INSERT INTO telemetry (id, device_id, metrics, location, status, hardware, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        data.deviceId,
        JSON.stringify(data.metrics),
        data.location ? JSON.stringify(data.location) : null,
        data.status,
        JSON.stringify(data.hardware),
        now
      ).run();

      // Store latest in KV
      await kv.put(
        `telemetry:latest:${data.deviceId}`,
        JSON.stringify({
          ...data,
          timestamp: now
        })
      );

      // Update device status
      await db.prepare(
        'UPDATE devices SET status = ?, updated_at = ? WHERE device_id = ?'
      ).bind(data.status, now, data.deviceId).run();

      // Broadcast to WebSocket connections
      await this.broadcastTelemetry(data.deviceId, {
        ...data,
        timestamp: now
      });

      // Trigger AI agents
      await this.triggerAgents(data);

      return c.json({
        success: true,
        id,
        timestamp: now
      }, 201);
    });

    // Get latest telemetry
    this.app.get('/api/telemetry/:deviceId/latest', async (c) => {
      const deviceId = c.req.param('deviceId');
      const kv = c.env.KV;

      const data = await kv.get(`telemetry:latest:${deviceId}`);
      if (!data) {
        return c.json({ error: 'No telemetry found' }, 404);
      }

      return c.json({
        success: true,
        data: JSON.parse(data)
      });
    });

    // Get telemetry history
    this.app.get('/api/telemetry/:deviceId/history', async (c) => {
      const deviceId = c.req.param('deviceId');
      const db = c.env.DB;
      const { limit = '100', from, to } = c.req.query();

      let query = 'SELECT * FROM telemetry WHERE device_id = ?';
      const params: any[] = [deviceId];

      if (from) {
        query += ' AND created_at >= ?';
        params.push(from);
      }

      if (to) {
        query += ' AND created_at <= ?';
        params.push(to);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(parseInt(limit));

      const result = await db.prepare(query).bind(...params).all();

      return c.json({
        success: true,
        data: result.results.map(r => ({
          ...r,
          metrics: JSON.parse(r.metrics),
          location: r.location ? JSON.parse(r.location) : null,
          hardware: JSON.parse(r.hardware)
        }))
      });
    });

    // Send command to device
    this.app.post('/api/commands', zValidator('json', CommandSchema), async (c) => {
      const data = await c.req.valid('json');
      const db = c.env.DB;

      const id = nanoid();
      const now = new Date().toISOString();

      await db.prepare(
        `INSERT INTO commands (id, device_id, command, parameters, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        data.deviceId,
        data.command,
        JSON.stringify(data.parameters || {}),
        'queued',
        now,
        now
      ).run();

      // Send to device via WebSocket if connected
      const ws = this.connections.get(data.deviceId);
      if (ws) {
        ws.send(JSON.stringify({
          type: 'command',
          command: data.command,
          parameters: data.parameters,
          commandId: id
        }));
        await db.prepare(
          'UPDATE commands SET status = "sent" WHERE id = ?'
        ).bind(id).run();
      }

      return c.json({
        success: true,
        commandId: id,
        status: ws ? 'sent' : 'queued'
      });
    });

    // Get device state
    this.app.get('/api/devices/:deviceId/state', async (c) => {
      const deviceId = c.req.param('deviceId');
      const db = c.env.DB;

      const device = await db.prepare(
        'SELECT * FROM devices WHERE device_id = ?'
      ).bind(deviceId).first();

      if (!device) {
        return c.json({ error: 'Device not found' }, 404);
      }

      const latestTelemetry = await db.prepare(
        'SELECT * FROM telemetry WHERE device_id = ? ORDER BY created_at DESC LIMIT 1'
      ).bind(deviceId).first();

      const twin = await this.generateDigitalTwin(device, latestTelemetry);

      return c.json({
        success: true,
        data: twin
      });
    });

    // Digital Twin
    this.app.get('/api/twins/:deviceId', async (c) => {
      const deviceId = c.req.param('deviceId');
      const db = c.env.DB;

      const device = await db.prepare(
        'SELECT * FROM devices WHERE device_id = ?'
      ).bind(deviceId).first();

      if (!device) {
        return c.json({ error: 'Device not found' }, 404);
      }

      const telemetry = await db.prepare(
        'SELECT * FROM telemetry WHERE device_id = ? ORDER BY created_at DESC LIMIT 100'
      ).bind(deviceId).all();

      const twin = await this.generateDigitalTwin(device, telemetry.results[0]);

      return c.json({
        success: true,
        data: {
          ...twin,
          history: telemetry.results.map(r => ({
            metrics: JSON.parse(r.metrics),
            timestamp: r.created_at
          }))
        }
      });
    });

    // Analytics
    this.app.get('/api/analytics/:deviceId', async (c) => {
      const deviceId = c.req.param('deviceId');
      const db = c.env.DB;

      const metrics = await db.prepare(
        `SELECT 
          AVG(CAST(json_extract(metrics, '$.cpu') AS FLOAT)) as avg_cpu,
          AVG(CAST(json_extract(metrics, '$.memory') AS FLOAT)) as avg_memory,
          AVG(CAST(json_extract(metrics, '$.temperature') AS FLOAT)) as avg_temp,
          COUNT(*) as total_readings
         FROM telemetry 
         WHERE device_id = ?
         AND created_at >= datetime('now', '-24 hours')`
      ).bind(deviceId).first();

      return c.json({
        success: true,
        data: {
          deviceId,
          averages: metrics,
          period: '24h',
          timestamp: new Date().toISOString()
        }
      });
    });

    // SSE Stream
    this.app.get('/api/stream/:deviceId', async (c) => {
      const deviceId = c.req.param('deviceId');
      
      return streamSSE(c, async (stream) => {
        // Send initial state
        await stream.writeSSE({
          event: 'connected',
          data: JSON.stringify({
            deviceId,
            timestamp: new Date().toISOString()
          })
        });

        // Keep alive with heartbeat
        const interval = setInterval(async () => {
          await stream.writeSSE({
            event: 'heartbeat',
            data: JSON.stringify({
              timestamp: new Date().toISOString()
            })
          });
        }, 30000);

        stream.onAbort(() => {
          clearInterval(interval);
        });
      });
    });

    // Dashboard
    this.app.get('/dashboard', (c) => {
      return c.html(`<!DOCTYPE html>
        <html>
          <head>
            <title>Universal Driver Dashboard</title>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #0a0a0a;
                color: #e0e0e0;
                padding: 20px;
              }
              .container {
                max-width: 1400px;
                margin: 0 auto;
              }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 0;
                border-bottom: 1px solid #2a2a4a;
                margin-bottom: 30px;
              }
              .header h1 {
                font-size: 32px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
              }
              .stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
              }
              .stat-card {
                background: #1a1a2e;
                border: 1px solid #2a2a4a;
                border-radius: 12px;
                padding: 20px;
              }
              .stat-card .value {
                font-size: 28px;
                font-weight: bold;
                margin-bottom: 4px;
              }
              .stat-card .label {
                color: #888;
                font-size: 14px;
              }
              .grid {
                display: grid;
                grid-template-columns: 2fr 1fr;
                gap: 20px;
                margin-bottom: 30px;
              }
              .card {
                background: #1a1a2e;
                border: 1px solid #2a2a4a;
                border-radius: 12px;
                padding: 20px;
              }
              .card h3 {
                margin-bottom: 16px;
                color: #888;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 1px;
              }
              .card .chart-container {
                height: 300px;
              }
              .device-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
              }
              .device-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: #0a0a0a;
                border-radius: 8px;
                border-left: 3px solid #667eea;
              }
              .device-item .status {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                display: inline-block;
              }
              .status.online { background: #22c55e; }
              .status.offline { background: #ef4444; }
              .status.error { background: #f59e0b; }
              .telemetry-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 12px;
                margin-top: 12px;
              }
              .telemetry-item {
                background: #0a0a0a;
                padding: 12px;
                border-radius: 8px;
                text-align: center;
              }
              .telemetry-item .value {
                font-size: 20px;
                font-weight: bold;
              }
              .telemetry-item .label {
                font-size: 12px;
                color: #888;
                margin-top: 4px;
              }
              @media (max-width: 768px) {
                .grid {
                  grid-template-columns: 1fr;
                }
                .header h1 { font-size: 24px; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔧 Universal Driver v2.0</h1>
                <div>
                  <span id="connectionStatus" style="color: #22c55e;">● Connected</span>
                </div>
              </div>

              <div class="stats" id="stats"></div>

              <div class="grid">
                <div class="card">
                  <h3>📊 Real-time Telemetry</h3>
                  <div class="chart-container">
                    <canvas id="telemetryChart"></canvas>
                  </div>
                </div>
                <div class="card">
                  <h3>📱 Connected Devices</h3>
                  <div class="device-list" id="deviceList"></div>
                </div>
              </div>

              <div class="card">
                <h3>📡 Live Metrics</h3>
                <div class="telemetry-grid" id="liveMetrics"></div>
              </div>
            </div>

            <script>
              const ctx = document.getElementById('telemetryChart').getContext('2d');
              const chart = new Chart(ctx, {
                type: 'line',
                data: {
                  labels: [],
                  datasets: [
                    {
                      label: 'CPU',
                      data: [],
                      borderColor: '#667eea',
                      tension: 0.4
                    },
                    {
                      label: 'Memory',
                      data: [],
                      borderColor: '#22c55e',
                      tension: 0.4
                    },
                    {
                      label: 'Temperature',
                      data: [],
                      borderColor: '#f59e0b',
                      tension: 0.4
                    }
                  ]
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      labels: { color: '#e0e0e0' }
                    }
                  },
                  scales: {
                    y: {
                      grid: { color: '#2a2a4a' },
                      ticks: { color: '#e0e0e0' }
                    },
                    x: {
                      grid: { color: '#2a2a4a' },
                      ticks: { color: '#e0e0e0' }
                    }
                  }
                }
              });

              // WebSocket connection
              const ws = new WebSocket('ws://' + window.location.host + '/api/ws');
              
              ws.onopen = () => {
                console.log('WebSocket connected');
                document.getElementById('connectionStatus').textContent = '● Connected';
                document.getElementById('connectionStatus').style.color = '#22c55e';
              };

              ws.onclose = () => {
                console.log('WebSocket disconnected');
                document.getElementById('connectionStatus').textContent = '● Disconnected';
                document.getElementById('connectionStatus').style.color = '#ef4444';
              };

              ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'telemetry') {
                  updateTelemetry(data.data);
                }
              };

              function updateTelemetry(data) {
                // Update chart
                const time = new Date().toLocaleTimeString();
                chart.data.labels.push(time);
                chart.data.datasets[0].data.push(data.metrics.cpu || 0);
                chart.data.datasets[1].data.push(data.metrics.memory || 0);
                chart.data.datasets[2].data.push(data.metrics.temperature || 0);
                
                if (chart.data.labels.length > 50) {
                  chart.data.labels.shift();
                  chart.data.datasets.forEach(d => d.data.shift());
                }
                chart.update();

                // Update live metrics
                const metricsHtml = Object.entries(data.metrics).map(([key, value]) => \`
                  <div class="telemetry-item">
                    <div class="value">\${typeof value === 'number' ? value.toFixed(1) : value}</div>
                    <div class="label">\${key}</div>
                  </div>
                \`).join('');
                document.getElementById('liveMetrics').innerHTML = metricsHtml;
              }

              // Fetch initial data
              async function fetchDevices() {
                const response = await fetch('/api/devices');
                const result = await response.json();
                if (result.success) {
                  const list = document.getElementById('deviceList');
                  list.innerHTML = result.data.map(device => \`
                    <div class="device-item">
                      <div>
                        <span class="status \${device.status}"></span>
                        \${device.name}
                      </div>
                      <span style="color:#888;font-size:12px;">\${device.type}</span>
                    </div>
                  \`).join('');
                }
              }

              async function fetchStats() {
                const response = await fetch('/api/health');
                const result = await response.json();
                if (result.status === 'healthy') {
                  document.getElementById('stats').innerHTML = \`
                    <div class="stat-card">
                      <div class="value">\${result.deviceCount || 0}</div>
                      <div class="label">Active Devices</div>
                    </div>
                    <div class="stat-card">
                      <div class="value">\${result.connectionCount || 0}</div>
                      <div class="label">Connections</div>
                    </div>
                    <div class="stat-card">
                      <div class="value">99.8%</div>
                      <div class="label">Uptime</div>
                    </div>
                    <div class="stat-card">
                      <div class="value">1.2ms</div>
                      <div class="label">Avg Latency</div>
                    </div>
                  \`;
                }
              }

              // Initial load
              fetchDevices();
              fetchStats();

              // Refresh every 30 seconds
              setInterval(() => {
                fetchDevices();
                fetchStats();
              }, 30000);
            </script>
          </body>
        </html>`);
    });
  }

  private setupWebSocket() {
    this.app.get('/api/ws', (c) => {
      const upgradeHeader = c.req.header('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return c.text('Expected websocket', 426);
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      
      // Store connection
      const id = nanoid();
      this.connections.set(id, server);

      server.addEventListener('message', async (event: any) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'register') {
            const deviceId = data.deviceId;
            if (deviceId) {
              this.connections.set(deviceId, server);
              server.send(JSON.stringify({
                type: 'registered',
                deviceId,
                timestamp: new Date().toISOString()
              }));
            }
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });

      server.addEventListener('close', () => {
        // Remove connection
        for (const [key, ws] of this.connections) {
          if (ws === server) {
            this.connections.delete(key);
            break;
          }
        }
      });

      // Send initial connection event
      server.send(JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
        message: 'Connected to Universal Driver'
      }));

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    });
  }

  private async broadcastTelemetry(deviceId: string, data: any) {
    const message = JSON.stringify({
      type: 'telemetry',
      deviceId,
      data
    });

    for (const [key, ws] of this.connections) {
      try {
        ws.send(message);
      } catch (error) {
        this.connections.delete(key);
      }
    }
  }

  private async triggerAgents(data: any) {
    // Queue for AI processing
    await this.env.QUEUE.send({
      type: 'telemetry_analysis',
      data,
      timestamp: new Date().toISOString()
    });
  }

  private async generateDigitalTwin(device: any, telemetry: any): Promise<DigitalTwin> {
    return {
      id: device.id,
      deviceId: device.device_id,
      name: device.name,
      type: device.type,
      status: device.status,
      metadata: JSON.parse(device.metadata),
      capabilities: ['telemetry', 'control', 'monitoring'],
      metrics: {
        uptime: 99.8,
        performance: 92,
        reliability: 98,
        efficiency: 87
      },
      lastSync: new Date().toISOString(),
      state: telemetry ? {
        deviceId: device.device_id,
        state: 'active',
        operations: {
          current: 'idle',
          progress: 100,
          duration: 0
        },
        power: {
          voltage: 3.3,
          current: 0.5,
          power: 1.65
        },
        sensors: {
          temperature: {
            value: parseFloat(JSON.parse(telemetry.metrics).temperature || '25'),
            unit: '°C',
            timestamp: telemetry.created_at
          }
        }
      } : {
        deviceId: device.device_id,
        state: 'idle',
        operations: { current: 'idle', progress: 0, duration: 0 },
        power: { voltage: 0, current: 0, power: 0 },
        sensors: {}
      }
    };
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const template = new UniversalDriverTemplate(env);
    return template.handle(request, env);
  }
};
