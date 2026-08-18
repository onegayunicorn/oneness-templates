// packages/core/src/templates/r2-explorer/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { jwt } from 'hono/jwt';
import { rateLimiter } from 'hono-rate-limiter';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

interface FileItem {
  key: string;
  size: number;
  lastModified: string;
  isDirectory: boolean;
  contentType?: string;
  etag?: string;
}

export class R2ExplorerTemplate {
  private app: Hono<any>;
  private env: any;
  private s3Client: S3Client;
  private bucket: string;

  constructor(env: any) {
    this.env = env;
    this.bucket = env.R2_BUCKET || 'r2-explorer';
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY
      }
    });
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
  }

  private setupRoutes() {
    // Auth middleware for protected routes
    const auth = jwt({ secret: this.env.JWT_SECRET || 'your-secret-key', alg: 'HS256' });

    // Public endpoints
    this.app.get('/api/health', (c) => {
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // List files
    this.app.get('/api/files', async (c) => {
      const { prefix = '', delimiter = '/' } = c.req.query();
      
      const command = {
        Bucket: this.bucket,
        Prefix: prefix,
        Delimiter: delimiter
      };

      const response = await this.s3Client.send(new ListObjectsV2Command(command)) as any;
      
      const files: FileItem[] = [];
      
      // Files
      if (response.Contents) {
        for (const item of response.Contents) {
          if (!item.Key) continue;
          // Skip the prefix itself if it's returned
          if (item.Key === prefix) continue;
          
          files.push({
            key: item.Key,
            size: item.Size || 0,
            lastModified: item.LastModified?.toISOString() || new Date().toISOString(),
            isDirectory: false,
            contentType: 'application/octet-stream',
            etag: item.ETag
          });
        }
      }
      
      // Directories
      if (response.CommonPrefixes) {
        for (const prefix of response.CommonPrefixes) {
          if (!prefix.Prefix) continue;
          files.push({
            key: prefix.Prefix,
            size: 0,
            lastModified: new Date().toISOString(),
            isDirectory: true
          });
        }
      }
      
      return c.json({
        success: true,
        data: files,
        count: files.length,
        path: prefix
      });
    });

    // Upload file (protected)
    this.app.post('/api/upload', auth, async (c) => {
      const formData = await c.req.formData();
      const file = formData.get('file') as File;
      const path = formData.get('path') as string || '';
      
      if (!file) {
        return c.json({ error: 'No file provided' }, 400);
      }
      
      const key = `${path}${file.name}`;
      const arrayBuffer = await file.arrayBuffer();
      
      const command = {
        Bucket: this.bucket,
        Key: key,
        Body: new Uint8Array(arrayBuffer),
        ContentType: file.type || 'application/octet-stream'
      };
      
      await this.s3Client.send(new PutObjectCommand(command));
      
      return c.json({
        success: true,
        message: 'File uploaded successfully',
        file: {
          key,
          name: file.name,
          size: file.size,
          type: file.type
        }
      });
    });

    // Get signed URL for file
    this.app.get('/api/signed/:key*', auth, async (c) => {
      const key = c.req.path.replace('/api/signed/', '');
      const { expires = '3600' } = c.req.query();
      
      const command = {
        Bucket: this.bucket,
        Key: key
      };
      
      const url = await getSignedUrl(this.s3Client, new GetObjectCommand(command), {
        expiresIn: parseInt(expires)
      });
      
      return c.json({
        success: true,
        url,
        expires: parseInt(expires)
      });
    });

    // Download file
    this.app.get('/api/download/:key*', async (c) => {
      const key = c.req.path.replace('/api/download/', '');
      
      const command = {
        Bucket: this.bucket,
        Key: key
      };
      
      const response = await this.s3Client.send(new GetObjectCommand(command));
      
      const stream = response.Body as ReadableStream;
      const headers = new Headers();
      headers.set('Content-Type', response.ContentType || 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
      
      return new Response(stream, { headers });
    });

    // Preview file
    this.app.get('/api/preview/:key*', async (c) => {
      const key = c.req.path.replace('/api/preview/', '');
      
      const command = {
        Bucket: this.bucket,
        Key: key
      };
      
      const response = await this.s3Client.send(new GetObjectCommand(command));
      
      // Detect file type for preview
      const contentType = response.ContentType || 'application/octet-stream';
      const isImage = contentType.startsWith('image/');
      const isText = contentType.startsWith('text/');
      const isPDF = contentType === 'application/pdf';
      
      if (isImage || isPDF) {
        const stream = response.Body as ReadableStream;
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        return new Response(stream, { headers });
      }
      
      if (isText) {
        const text = await response.Body?.transformToString('utf-8');
        return c.html(`<pre style="background:#1a1a1a;color:#fff;padding:20px;font-family:monospace;min-height:100vh;margin:0;">${text}</pre>`);
      }
      
      // For other files, provide metadata
      return c.json({
        success: true,
        metadata: {
          key,
          size: response.ContentLength,
          contentType: response.ContentType,
          lastModified: response.LastModified
        }
      });
    });

    // Delete file (protected)
    this.app.delete('/api/delete/:key*', auth, async (c) => {
      const key = c.req.path.replace('/api/delete/', '');
      
      const command = {
        Bucket: this.bucket,
        Key: key
      };
      
      await this.s3Client.send(new DeleteObjectCommand(command));
      
      return c.json({
        success: true,
        message: 'File deleted successfully'
      });
    });

    // Create folder (protected)
    this.app.post('/api/folder', auth, async (c) => {
      const { path, name } = await c.req.json();
      
      const key = `${path || ''}${name}/`;
      
      const command = {
        Bucket: this.bucket,
        Key: key,
        Body: ''
      };
      
      await this.s3Client.send(new PutObjectCommand(command));
      
      return c.json({
        success: true,
        message: 'Folder created successfully',
        folder: { key, name }
      });
    });

    // Get bucket info
    this.app.get('/api/info', async (c) => {
      const command = {
        Bucket: this.bucket,
        MaxKeys: 1
      };
      
      const response = await this.s3Client.send(new ListObjectsV2Command(command)) as any;
      
      return c.json({
        success: true,
        bucket: this.bucket,
        region: 'auto',
        objectCount: response.KeyCount || 0,
        isTruncated: response.IsTruncated || false
      });
    });

    // Search files
    this.app.get('/api/search', async (c) => {
      const { q, prefix = '' } = c.req.query();
      
      if (!q) {
        return c.json({ error: 'Search query required' }, 400);
      }
      
      const command = {
        Bucket: this.bucket,
        Prefix: prefix
      };
      
      const response = await this.s3Client.send(new ListObjectsV2Command(command)) as any;
      
      const results = [];
      if (response.Contents) {
        for (const item of response.Contents) {
          if (!item.Key) continue;
          const name = item.Key.split('/').pop() || '';
          if (name.toLowerCase().includes(q.toLowerCase())) {
            results.push({
              key: item.Key,
              name,
              size: item.Size || 0,
              lastModified: item.LastModified?.toISOString() || new Date().toISOString()
            });
          }
        }
      }
      
      return c.json({
        success: true,
        data: results,
        count: results.length,
        query: q
      });
    });

    // Serve SPA
    this.app.get('*', (c) => {
      return c.html(`<!DOCTYPE html>
        <html>
          <head>
            <title>R2 Explorer</title>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #0a0a0a;
                color: #e0e0e0;
                min-height: 100vh;
              }
              .header {
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                padding: 20px 30px;
                border-bottom: 1px solid #2a2a4a;
                display: flex;
                align-items: center;
                justify-content: space-between;
              }
              .header h1 {
                font-size: 24px;
                font-weight: 700;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
              }
              .header .stats {
                color: #888;
                font-size: 14px;
              }
              .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
              }
              .search-box {
                background: #1a1a2e;
                border: 1px solid #2a2a4a;
                border-radius: 8px;
                padding: 12px 16px;
                margin-bottom: 20px;
                display: flex;
                align-items: center;
                gap: 12px;
              }
              .search-box input {
                flex: 1;
                background: transparent;
                border: none;
                color: #e0e0e0;
                outline: none;
                font-size: 14px;
              }
              .search-box input::placeholder {
                color: #666;
              }
              .breadcrumb {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 0;
                color: #888;
                font-size: 14px;
                flex-wrap: wrap;
              }
              .breadcrumb span {
                cursor: pointer;
                color: #667eea;
              }
              .breadcrumb span:hover {
                text-decoration: underline;
              }
              .file-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                gap: 16px;
              }
              .file-item {
                background: #1a1a2e;
                border: 1px solid #2a2a4a;
                border-radius: 8px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.3s;
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                min-height: 120px;
                justify-content: center;
              }
              .file-item:hover {
                border-color: #667eea;
                transform: translateY(-2px);
                box-shadow: 0 4px 20px rgba(102, 126, 234, 0.2);
              }
              .file-item .icon {
                font-size: 32px;
                margin-bottom: 8px;
              }
              .file-item .name {
                font-size: 13px;
                word-break: break-all;
                color: #e0e0e0;
              }
              .file-item .size {
                font-size: 11px;
                color: #666;
                margin-top: 4px;
              }
              .upload-area {
                border: 2px dashed #2a2a4a;
                border-radius: 8px;
                padding: 40px;
                text-align: center;
                margin-bottom: 20px;
                transition: all 0.3s;
                cursor: pointer;
              }
              .upload-area:hover {
                border-color: #667eea;
                background: rgba(102, 126, 234, 0.05);
              }
              .upload-area .icon {
                font-size: 48px;
                color: #667eea;
              }
              .upload-area p {
                color: #888;
                margin-top: 12px;
              }
              .upload-progress {
                margin-top: 12px;
                width: 100%;
                height: 4px;
                background: #2a2a4a;
                border-radius: 2px;
                overflow: hidden;
                display: none;
              }
              .upload-progress .bar {
                height: 100%;
                background: linear-gradient(90deg, #667eea, #764ba2);
                width: 0%;
                transition: width 0.3s;
              }
              .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                z-index: 1000;
                justify-content: center;
                align-items: center;
                backdrop-filter: blur(10px);
              }
              .modal.active {
                display: flex;
              }
              .modal-content {
                background: #1a1a2e;
                border: 1px solid #2a2a4a;
                border-radius: 12px;
                padding: 30px;
                max-width: 90%;
                max-height: 90%;
                overflow: auto;
                position: relative;
              }
              .modal-content .close {
                position: absolute;
                top: 10px;
                right: 10px;
                background: none;
                border: none;
                color: #888;
                font-size: 24px;
                cursor: pointer;
              }
              .modal-content .close:hover {
                color: #fff;
              }
              .modal-content img {
                max-width: 100%;
                max-height: 70vh;
                border-radius: 4px;
              }
              .modal-content pre {
                background: #0a0a0a;
                padding: 20px;
                border-radius: 4px;
                max-height: 70vh;
                overflow: auto;
                font-size: 12px;
                white-space: pre-wrap;
                word-wrap: break-word;
              }
              .modal-content .actions {
                display: flex;
                gap: 8px;
                margin-top: 16px;
                justify-content: center;
              }
              .modal-content .actions button {
                background: #2a2a4a;
                border: none;
                color: #e0e0e0;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.3s;
              }
              .modal-content .actions button:hover {
                background: #3a3a5a;
              }
              .modal-content .actions button.danger:hover {
                background: #dc3545;
              }
              @media (max-width: 600px) {
                .file-grid {
                  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                }
                .header h1 { font-size: 18px; }
                .header .stats { font-size: 12px; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>📁 R2 Explorer</h1>
              <div class="stats">
                <span id="fileCount">0</span> files
              </div>
            </div>

            <div class="container">
              <div class="search-box">
                <input type="text" id="searchInput" placeholder="Search files..." />
                <button onclick="searchFiles()" style="background:#667eea;border:none;color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer;">Search</button>
              </div>

              <div class="upload-area" onclick="document.getElementById('fileInput').click()">
                <div class="icon">⬆️</div>
                <p>Click to upload files</p>
                <input type="file" id="fileInput" multiple style="display:none" />
                <div class="upload-progress" id="uploadProgress">
                  <div class="bar" id="progressBar"></div>
                </div>
              </div>

              <div class="breadcrumb" id="breadcrumb">
                <span onclick="navigateTo('')">📂 Root</span>
              </div>

              <div class="file-grid" id="fileGrid"></div>
            </div>

            <div class="modal" id="modal">
              <div class="modal-content">
                <button class="close" onclick="closeModal()">✕</button>
                <div id="modalBody"></div>
                <div class="actions">
                  <button onclick="downloadCurrentFile()">📥 Download</button>
                  <button class="danger" onclick="deleteCurrentFile()">🗑️ Delete</button>
                </div>
              </div>
            </div>

            <script>
              let currentPath = '';
              let currentFiles = [];
              let selectedFile = null;

              // Load files
              async function loadFiles(path = '') {
                currentPath = path;
                const response = await fetch(\`/api/files?prefix=\${encodeURIComponent(path)}\`);
                const result = await response.json();
                
                if (result.success) {
                  currentFiles = result.data;
                  renderFiles(currentFiles);
                  updateBreadcrumb(path);
                  document.getElementById('fileCount').textContent = result.count;
                }
              }

              // Render files
              function renderFiles(files) {
                const grid = document.getElementById('fileGrid');
                grid.innerHTML = '';
                
                if (files.length === 0) {
                  grid.innerHTML = '<p style="color:#666;text-align:center;grid-column:1/-1;padding:40px;">No files in this directory</p>';
                  return;
                }
                
                // Sort: directories first, then files
                files.sort((a, b) => {
                  if (a.isDirectory && !b.isDirectory) return -1;
                  if (!a.isDirectory && b.isDirectory) return 1;
                  return a.key.localeCompare(b.key);
                });
                
                files.forEach(file => {
                  const div = document.createElement('div');
                  div.className = 'file-item';
                  
                  const icon = file.isDirectory ? '📁' : getFileIcon(file.key);
                  const name = file.isDirectory ? file.key.split('/').slice(-2, -1)[0] + '/' : file.key.split('/').pop();
                  const size = file.isDirectory ? '' : formatSize(file.size);
                  
                  div.innerHTML = \`
                    <div class="icon">\${icon}</div>
                    <div class="name">\${name}</div>
                    <div class="size">\${size}</div>
                  \`;
                  
                  div.onclick = () => {
                    if (file.isDirectory) {
                      loadFiles(file.key);
                    } else {
                      previewFile(file.key);
                    }
                  };
                  
                  grid.appendChild(div);
                });
              }

              // Get file icon
              function getFileIcon(filename) {
                const ext = filename.split('.').pop()?.toLowerCase();
                const icons = {
                  'pdf': '📄',
                  'doc': '📄',
                  'docx': '📄',
                  'xls': '📊',
                  'xlsx': '📊',
                  'ppt': '📊',
                  'pptx': '📊',
                  'jpg': '🖼️',
                  'jpeg': '🖼️',
                  'png': '🖼️',
                  'gif': '🖼️',
                  'svg': '🖼️',
                  'mp4': '🎬',
                  'mov': '🎬',
                  'mp3': '🎵',
                  'wav': '🎵',
                  'zip': '📦',
                  'rar': '📦',
                  'txt': '📝',
                  'md': '📝',
                  'json': '📝',
                  'xml': '📝',
                  'html': '🌐',
                  'css': '🎨',
                  'js': '⚡',
                  'ts': '⚡',
                  'py': '🐍',
                  'rb': '💎',
                  'java': '☕',
                  'c': '⚙️',
                  'cpp': '⚙️'
                };
                return icons[ext] || '📄';
              }

              // Format size
              function formatSize(bytes) {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
              }

              // Update breadcrumb
              function updateBreadcrumb(path) {
                const breadcrumb = document.getElementById('breadcrumb');
                const parts = path.split('/').filter(p => p);
                let html = '<span onclick="navigateTo(\'\')">📂 Root</span>';
                
                let currentPath = '';
                parts.forEach((part, index) => {
                  currentPath += part + '/';
                  const isLast = index === parts.length - 1;
                  html += \` <span>›</span> \`;
                  if (isLast) {
                    html += \`<span style="color:#e0e0e0">\${part}</span>\`;
                  } else {
                    html += \`<span onclick="navigateTo('\${currentPath}')">\${part}</span>\`;
                  }
                });
                
                breadcrumb.innerHTML = html;
              }

              // Navigate to path
              function navigateTo(path) {
                loadFiles(path);
              }

              // Preview file
              async function previewFile(key) {
                selectedFile = key;
                const modal = document.getElementById('modal');
                const body = document.getElementById('modalBody');
                
                // Check if image
                const isImage = /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(key);
                const isText = /\.(txt|md|json|xml|html|css|js|ts|py|rb|java|c|cpp)$/i.test(key);
                
                if (isImage) {
                  body.innerHTML = \`<img src="/api/preview/\${encodeURIComponent(key)}" alt="\${key}" />\`;
                } else if (isText) {
                  const response = await fetch(\`/api/preview/\${encodeURIComponent(key)}\`);
                  const text = await response.text();
                  body.innerHTML = \`<pre>\${escapeHtml(text)}</pre>\`;
                } else {
                  body.innerHTML = \`<p style="color:#888;">Preview not available for this file type</p>\`;
                }
                
                modal.classList.add('active');
              }

              // Close modal
              function closeModal() {
                document.getElementById('modal').classList.remove('active');
              }

              // Download current file
              function downloadCurrentFile() {
                if (selectedFile) {
                  window.location.href = \`/api/download/\${encodeURIComponent(selectedFile)}\`;
                }
              }

              // Delete current file
              async function deleteCurrentFile() {
                if (!selectedFile) return;
                if (!confirm(\`Delete \${selectedFile}?\`)) return;
                
                const response = await fetch(\`/api/delete/\${encodeURIComponent(selectedFile)}\`, {
                  method: 'DELETE'
                });
                const result = await response.json();
                
                if (result.success) {
                  closeModal();
                  loadFiles(currentPath);
                } else {
                  alert('Error deleting file');
                }
              }

              // Search files
              async function searchFiles() {
                const query = document.getElementById('searchInput').value.trim();
                if (!query) {
                  loadFiles(currentPath);
                  return;
                }
                
                const response = await fetch(\`/api/search?q=\${encodeURIComponent(query)}&prefix=\${encodeURIComponent(currentPath)}\`);
                const result = await response.json();
                
                if (result.success) {
                  renderFiles(result.data);
                }
              }

              // Upload files
              document.getElementById('fileInput').addEventListener('change', async (e) => {
                const files = e.target.files;
                const progress = document.getElementById('uploadProgress');
                const bar = document.getElementById('progressBar');
                
                progress.style.display = 'block';
                
                for (let i = 0; i < files.length; i++) {
                  const file = files[i];
                  const formData = new FormData();
                  formData.append('file', file);
                  formData.append('path', currentPath);
                  
                  const xhr = new XMLHttpRequest();
                  xhr.open('POST', '/api/upload');
                  
                  xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                      const percent = (e.loaded / e.total) * 100;
                      bar.style.width = percent + '%';
                    }
                  };
                  
                  xhr.onload = () => {
                    if (xhr.status === 200) {
                      loadFiles(currentPath);
                    }
                  };
                  
                  xhr.send(formData);
                }
                
                // Reset after upload
                setTimeout(() => {
                  progress.style.display = 'none';
                  bar.style.width = '0%';
                }, 2000);
              });

              // Escape HTML
              function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
              }

              // Close modal on background click
              document.getElementById('modal').addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                  closeModal();
                }
              });

              // Keyboard shortcuts
              document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeModal();
              });

              // Search on enter
              document.getElementById('searchInput').addEventListener('keyup', (e) => {
                if (e.key === 'Enter') searchFiles();
              });

              // Initial load
              loadFiles('');
            </script>
          </body>
        </html>`);
    });
  }

  public async handle(request: Request, env: any): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

export function createR2ExplorerTemplate(env: any) {
  return new R2ExplorerTemplate(env);
}
