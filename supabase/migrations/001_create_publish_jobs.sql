-- ABBA Broker: Publish Jobs Table
-- Run this migration in your Supabase SQL editor

-- Create enum type for publish status
CREATE TYPE publish_status AS ENUM (
  'queued',
  'packaging',
  'uploading',
  'building',
  'deploying',
  'ready',
  'failed',
  'cancelled'
);

-- Create publish_jobs table
CREATE TABLE publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status publish_status NOT NULL DEFAULT 'queued',
  app_id INTEGER NOT NULL,
  app_name TEXT,
  profile_id TEXT,
  bundle_hash TEXT NOT NULL,
  bundle_size INTEGER NOT NULL,
  bundle_path TEXT,
  vercel_deployment_id TEXT,
  vercel_project_id TEXT,
  url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_publish_jobs_status ON publish_jobs(status);
CREATE INDEX idx_publish_jobs_app_id ON publish_jobs(app_id);
CREATE INDEX idx_publish_jobs_created_at ON publish_jobs(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_publish_jobs_updated_at
  BEFORE UPDATE ON publish_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (optional but recommended)
-- Enable RLS
ALTER TABLE publish_jobs ENABLE ROW LEVEL SECURITY;

-- Create policy for service role (full access)
CREATE POLICY "Service role has full access"
  ON publish_jobs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions to service role
GRANT ALL ON publish_jobs TO service_role;
