const { createPool } = require("../src/db");
const { runMigrations } = require("../src/migrate");
const { listQuestions } = require("../src/modules/questions/service");

async function benchmark() {
  const pool = createPool();

  try {
    await runMigrations(pool);

    const cases = [
      {
        label: "keyword+scope",
        params: {
          filters: { q: "rbac", school: "Engineering", status: "open" },
          sort_by: "created_at",
          sort_dir: "desc",
          page: 1,
          per_page: 25
        }
      },
      {
        label: "tag+difficulty",
        params: {
          filters: { tag: "sql", difficulty: "intermediate" },
          sort_by: "updated_at",
          sort_dir: "desc",
          page: 1,
          per_page: 25
        }
      },
      {
        label: "creator+date-range",
        params: {
          filters: {
            creator_id: 1,
            start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            end_date: new Date().toISOString()
          },
          sort_by: "created_at",
          sort_dir: "asc",
          page: 1,
          per_page: 25
        }
      }
    ];

    for (const entry of cases) {
      const started = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const result = await listQuestions(pool, entry.params);
      const duration = Date.now() - started;

      process.stdout.write(`${JSON.stringify({
        event: "search_benchmark",
        label: entry.label,
        duration_ms: duration,
        total: result.pagination.total,
        returned: result.items.length
      })}\n`);
    }
  } finally {
    await pool.end();
  }
}

benchmark().catch((error) => {
  process.stderr.write(`Benchmark failed: ${error.message}\n`);
  process.exit(1);
});
