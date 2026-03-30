const { runReindexJob } = require("../src/jobs/reindex");

runReindexJob().catch((error) => {
  process.stderr.write(`Reindex failed: ${error.message}\n`);
  process.exit(1);
});
