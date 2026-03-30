const { createPool } = require("./db");
const { runMigrations } = require("./migrate");
const { createApp } = require("./app");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prepareDatabase(pool, attempts = 20, delayMs = 2000) {
  let lastError;

  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query("SELECT 1");
      await runMigrations(pool);
      return;
    } catch (error) {
      lastError = error;
      process.stderr.write(
        `Database not ready (attempt ${i}/${attempts}): ${error.message}\n`
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function start() {
  const pool = createPool();
  await prepareDatabase(pool);

  const app = createApp(pool);
  const port = process.env.PORT || 4000;

  app.listen(port, "0.0.0.0", () => {
    process.stdout.write(`Server listening on ${port}\n`);
  });
}

start().catch((error) => {
  process.stderr.write(`Startup failure: ${error.message}\n`);
  process.exit(1);
});
