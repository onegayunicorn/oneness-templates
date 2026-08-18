-- Sourcing requests
CREATE TABLE IF NOT EXISTS sourcing_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template TEXT NOT NULL CHECK (template IN ('fixed', 'vague', 'launch')),
  status TEXT NOT NULL DEFAULT 'draft',
  data TEXT NOT NULL,
  results TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  rating REAL,
  products TEXT,
  price_min REAL,
  price_max REAL,
  lead_time INTEGER,
  certifications TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  price REAL,
  currency TEXT DEFAULT 'USD',
  supplier_id TEXT,
  rating REAL,
  specs TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- Workflow logs
CREATE TABLE IF NOT EXISTS workflow_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES sourcing_requests(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sourcing_user_id ON sourcing_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_template ON sourcing_requests(template);
CREATE INDEX IF NOT EXISTS idx_suppliers_country ON suppliers(country);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
