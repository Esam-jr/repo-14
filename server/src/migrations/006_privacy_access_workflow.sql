ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE users ADD COLUMN IF NOT EXISTS employer_visibility TEXT NOT NULL DEFAULT 'private';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_phone_visibility'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_phone_visibility
      CHECK (phone_visibility IN ('public', 'cohort', 'advisor_mentor', 'private'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_email_visibility'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_email_visibility
      CHECK (email_visibility IN ('public', 'cohort', 'advisor_mentor', 'private'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_employer_visibility'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_employer_visibility
      CHECK (employer_visibility IN ('public', 'cohort', 'advisor_mentor', 'private'));
  END IF;
END $$;

ALTER TABLE privacy_requests
  ADD COLUMN IF NOT EXISTS target_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS fields_requested JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_note TEXT;

UPDATE privacy_requests
SET expires_at = COALESCE(expires_at, created_at + INTERVAL '14 days');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_privacy_requests_status'
  ) THEN
    ALTER TABLE privacy_requests
      ADD CONSTRAINT chk_privacy_requests_status
      CHECK (status IN ('pending', 'approved', 'denied', 'expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_privacy_requests_target_status ON privacy_requests(target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_expires_at ON privacy_requests(expires_at);

CREATE TABLE IF NOT EXISTS privacy_view_tokens (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES privacy_requests(id) ON DELETE CASCADE,
  requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  fields_granted JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_tokens_target_requester ON privacy_view_tokens(target_user_id, requester_id);
CREATE INDEX IF NOT EXISTS idx_privacy_tokens_expires ON privacy_view_tokens(expires_at);
