async function ensureMigrationTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function isApplied(pool, id) {
  const existing = await pool.query(
    "SELECT id FROM schema_migrations WHERE id = $1",
    [id]
  );
  return existing.rowCount > 0;
}

async function markApplied(pool, id) {
  await pool.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
}

async function migration001(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cohorts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function migration002(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      scopes JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_frozen BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      jti UUID PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      replaced_by_jti UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);
  `);
}

async function runMigrations(pool) {
  await ensureMigrationTable(pool);

  const migrations = [
    { id: "001_init", up: migration001 },
    { id: "002_auth_users", up: migration002 }
  ];

  for (const migration of migrations) {
    // eslint-disable-next-line no-await-in-loop
    const applied = await isApplied(pool, migration.id);
    if (applied) {
      // eslint-disable-next-line no-continue
      continue;
    }

    await pool.query("BEGIN");
    try {
      // eslint-disable-next-line no-await-in-loop
      await migration.up(pool);
      // eslint-disable-next-line no-await-in-loop
      await markApplied(pool, migration.id);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
}

module.exports = { runMigrations };
