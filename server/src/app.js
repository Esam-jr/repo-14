const express = require("express");
const cookieParser = require("cookie-parser");
const { createAuthRouter } = require("./modules/auth/routes");
const { createQuestionRouter } = require("./modules/questions/routes");
const { createPrivacyRouter } = require("./modules/privacy/routes");
const { createMessagingRouter } = require("./modules/messaging/routes");
const { errorResponse } = require("./errors");

function createApp(pool) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ status: "ok" });
    } catch (_error) {
      res.status(503).json({ status: "degraded", error: "database_unavailable" });
    }
  });

  app.use("/auth", createAuthRouter(pool));
  app.use(createQuestionRouter(pool));
  app.use(createPrivacyRouter(pool));
  app.use(createMessagingRouter(pool));

  app.use(errorResponse);

  return app;
}

module.exports = { createApp };
