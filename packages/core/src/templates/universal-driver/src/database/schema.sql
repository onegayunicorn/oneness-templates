-- Devices
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  device_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Telemetry data
CREATE TABLE IF NOT EXISTS telemetry (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  metrics TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL,
  hardware TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Commands
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  command TEXT NOT NULL,
  parameters TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  response TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Digital twins
CREATE TABLE IF NOT EXISTS digital_twins (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  state TEXT NOT NULL,
  metrics TEXT,
  capabilities TEXT,
  last_sync TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_device_id ON telemetry(device_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry(created_at);
CREATE INDEX IF NOT EXISTS idx_commands_device_id ON commands(device_id);
CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
