CREATE TABLE IF NOT EXISTS export_jobs (
  id BIGSERIAL PRIMARY KEY,
  requested_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_role TEXT NOT NULL,
  export_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_count INTEGER NOT NULL DEFAULT 0,
  csv_data TEXT NOT NULL,
  download_token UUID NOT NULL UNIQUE,
  download_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_export_jobs_status'
  ) THEN
    ALTER TABLE export_jobs
      ADD CONSTRAINT chk_export_jobs_status
      CHECK (status IN ('pending', 'completed', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_export_jobs_requested_by_created_at
  ON export_jobs(requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_jobs_download_expiry
  ON export_jobs(download_expires_at);
