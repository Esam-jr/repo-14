const { createPool } = require("../db");
const { runMigrations } = require("../migrate");
const { reindexAllQuestions } = require("../services/searchService");

async function runReindexJob() {
  const pool = createPool();

  try {
    await runMigrations(pool);
    const startedAt = Date.now();
    const result = await reindexAllQuestions(pool);
    const durationMs = Date.now() - startedAt;

    process.stdout.write(`${JSON.stringify({ event: "reindex_complete", duration_ms: durationMs, ...result })}\n`);
    return result;
  } finally {
    await pool.end();
  }
}

module.exports = {
  runReindexJob
};
