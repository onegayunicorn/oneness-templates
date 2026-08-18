// packages/shared/src/types/index.ts
export interface WorkerContext {
  env: {
    DB: D1Database;
    KV: KVNamespace;
    AI: any;
    AI_GATEWAY: any;
    R2: R2Bucket;
    QUEUE: Queue<any>;
    [key: string]: any;
  };
  request: Request;
  waitUntil: (promise: Promise<any>) => void;
}

export interface TemplateConfig {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  commands: Record<string, string>;
}

export interface RouteConfig {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';
  handler: (context: WorkerContext) => Promise<Response>;
  middleware?: Middleware[];
  rateLimit?: RateLimitConfig;
}

export interface Middleware {
  name: string;
  handler: (context: WorkerContext) => Promise<WorkerContext>;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (context: WorkerContext) => string;
}

export interface D1Database {
  prepare: (sql: string) => D1PreparedStatement;
  batch: (statements: D1PreparedStatement[]) => Promise<D1Result[]>;
  exec: (sql: string) => Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind: (...values: any[]) => D1PreparedStatement;
  all: <T = any>() => Promise<D1Result<T>>;
  first: <T = any>() => Promise<T | null>;
  run: () => Promise<D1Result>;
}

export interface D1Result<T = any> {
  results: T[];
  meta: {
    rows_read: number;
    rows_written: number;
    duration: number;
    changes: number;
    last_row_id: number;
    changed_db: boolean;
    size_after: number;
  };
}

export interface D1ExecResult {
  results: any[];
  meta: {
    duration: number;
    changes: number;
  };
}

export interface KVNamespace {
  get: (key: string, options?: { type: 'text' | 'json' | 'arrayBuffer' | 'stream' }) => Promise<any>;
  put: (key: string, value: string | ReadableStream | ArrayBuffer | ArrayBufferView, options?: any) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string; limit?: number; cursor?: string }) => Promise<{
    keys: { name: string; expiration?: number; metadata?: any }[];
    cursor: string;
  }>;
}

export interface R2Bucket {
  put: (key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null, options?: any) => Promise<R2Object>;
  get: (key: string, options?: any) => Promise<R2Object | null>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string; delimiter?: string; limit?: number; cursor?: string }) => Promise<{
    objects: R2Object[];
    cursor: string;
  }>;
}

export interface R2Object {
  key: string;
  size: number;
  uploaded: Date;
  httpMetadata?: {
    contentType?: string;
    contentEncoding?: string;
    contentDisposition?: string;
    contentLanguage?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
  etag: string;
}

export interface Queue<T = any> {
  send: (message: T) => Promise<void>;
  sendBatch: (messages: T[]) => Promise<void>;
}
