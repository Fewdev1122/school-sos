-- Migration 002: Add incident images support

CREATE TABLE IF NOT EXISTS incident_images (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  data TEXT NOT NULL,  -- base64 encoded image data
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_images_incident_id ON incident_images(incident_id);
