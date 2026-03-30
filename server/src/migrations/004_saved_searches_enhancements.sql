ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS is_frequently_used BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE saved_searches
SET label = name
WHERE label IS NULL;

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_frequent_updated
  ON saved_searches(user_id, is_frequently_used DESC, updated_at DESC);
