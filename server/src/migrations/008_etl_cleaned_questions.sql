CREATE TABLE IF NOT EXISTS cleaned_questions (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('question', 'resource')),
  source_id BIGINT NOT NULL,
  original_title TEXT,
  original_body TEXT,
  cleaned_title TEXT NOT NULL,
  cleaned_body TEXT NOT NULL DEFAULT '',
  normalized_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  inferred_knowledge_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  duplicate_of_source_type TEXT,
  duplicate_of_source_id BIGINT,
  similarity_score REAL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  cleaned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_cleaned_questions_cleaned_at
  ON cleaned_questions(cleaned_at DESC);

CREATE INDEX IF NOT EXISTS idx_cleaned_questions_duplicate_ref
  ON cleaned_questions(duplicate_of_source_type, duplicate_of_source_id);

CREATE INDEX IF NOT EXISTS idx_cleaned_questions_fts
  ON cleaned_questions USING GIN (to_tsvector('english', COALESCE(cleaned_title, '') || ' ' || COALESCE(cleaned_body, '')));

CREATE INDEX IF NOT EXISTS idx_cleaned_questions_title_trgm
  ON cleaned_questions USING GIN (cleaned_title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cleaned_questions_body_trgm
  ON cleaned_questions USING GIN (cleaned_body gin_trgm_ops);
