// packages/shared/src/constants/index.ts
export const TEMPLATE_CATEGORIES = {
  AI: 'AI & Machine Learning',
  API: 'API & Backend',
  COMMERCE: 'E-Commerce & Payments',
  DATABASE: 'Database & Storage',
  FULLSTACK: 'Full Stack Applications',
  SAAS: 'SaaS & Admin',
  REAL_TIME: 'Real-time & WebSockets',
  MEDIA: 'Media & Content',
} as const;

export const TEMPLATE_DEPENDENCIES = {
  hono: 'hono',
  'hono-rate-limiter': 'hono-rate-limiter',
  'hono/jwt': '@hono/jwt',
  'hono/logger': '@hono/logger',
  'hono/swagger-ui': '@hono/swagger-ui',
  'hono/cors': '@hono/cors',
  '@hono/zod-openapi': '@hono/zod-openapi',
  'zod': 'zod',
  'recharts': 'recharts',
  'lucide-react': 'lucide-react',
  'react': 'react',
  'react-dom': 'react-dom',
} as const;

export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;

export const WORKER_NAMES = {
  'ai-agent-visibility': 'ai-agent-visibility',
  'ai-brand-visibility': 'ai-brand-visibility',
  'backend-openapi': 'backend-openapi',
  'commerce-llms': 'commerce-llms',
  'worker-d1': 'worker-d1',
  'saas-admin': 'saas-admin',
} as const;

export const DEFAULT_RATE_LIMITS = {
  free: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  },
  pro: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
  },
  enterprise: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10000,
  },
} as const;

export const API_PATHS = {
  HEALTH: '/health',
  STATS: '/stats',
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    VERIFY: '/auth/verify',
  },
  USERS: {
    ROOT: '/users',
    BY_ID: '/users/:id',
    PROFILE: '/users/profile',
  },
  ORGANIZATIONS: {
    ROOT: '/organizations',
    BY_ID: '/organizations/:id',
    MEMBERS: '/organizations/:id/members',
  },
  SUBSCRIPTIONS: {
    ROOT: '/subscriptions',
    BY_ID: '/subscriptions/:id',
  },
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const ERROR_MESSAGES = {
  NOT_FOUND: 'Resource not found',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Forbidden access',
  VALIDATION_ERROR: 'Validation error',
  RATE_LIMITED: 'Too many requests',
  INTERNAL_ERROR: 'Internal server error',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  DATABASE_ERROR: 'Database error',
  STORAGE_ERROR: 'Storage error',
  AI_ERROR: 'AI service error',
} as const;
