const express = require("express");

function createApp(pool) {
  const app = express();

  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ status: "ok" });
    } catch (error) {
      res.status(503).json({ status: "degraded", error: "database_unavailable" });
    }
  });

  return app;
}

module.exports = { createApp };
