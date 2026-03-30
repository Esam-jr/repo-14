ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(body, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_questions_search_vector ON questions USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_questions_title_trgm_v2 ON questions USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_questions_body_trgm_v2 ON questions USING GIN (body gin_trgm_ops);
