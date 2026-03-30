async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const migrationId = "001_init";
  const existing = await pool.query(
    "SELECT id FROM schema_migrations WHERE id = $1",
    [migrationId]
  );

  if (existing.rowCount > 0) {
    return;
  }

  await pool.query("BEGIN");
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cohorts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(
      "INSERT INTO schema_migrations (id) VALUES ($1)",
      [migrationId]
    );

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

module.exports = { runMigrations };
