const { createPool } = require("../src/db");
const { runMigrations } = require("../src/migrate");
const { seedDatabase } = require("../src/seed");

async function main() {
  const pool = createPool();

  try {
    await runMigrations(pool);
    const result = await seedDatabase(pool);
    process.stdout.write(`${JSON.stringify({ seeded: true, fixtures: result })}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Seeding failed: ${error.message}\n`);
  process.exit(1);
});
