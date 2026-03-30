const fs = require("fs");
const path = require("path");

async function ensureMigrationTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function isApplied(pool, id) {
  const result = await pool.query(
    "SELECT id FROM schema_migrations WHERE id = $1",
    [id]
  );
  return result.rowCount > 0;
}

async function markApplied(pool, id) {
  await pool.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
}

function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, "migrations");
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

async function runMigrations(pool) {
  await ensureMigrationTable(pool);

  const files = getMigrationFiles();
  const migrationsDir = path.join(__dirname, "migrations");

  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    const applied = await isApplied(pool, file);
    if (applied) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

    await pool.query("BEGIN");
    try {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(sql);
      // eslint-disable-next-line no-await-in-loop
      await markApplied(pool, file);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
}

module.exports = { runMigrations };
