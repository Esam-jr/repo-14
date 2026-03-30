const { createPool } = require("../src/db");
const { runMigrations } = require("../src/migrate");

async function main() {
  const pool = createPool();
  try {
    await runMigrations(pool);
    process.stdout.write("Migrations completed successfully.\n");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Migration failed: ${error.message}\n`);
  process.exit(1);
});
