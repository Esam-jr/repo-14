const express = require("express");
const cookieParser = require("cookie-parser");
const { createAuthRouter } = require("./modules/auth/routes");
const { createQuestionRouter } = require("./modules/questions/routes");
const { createPrivacyRouter } = require("./modules/privacy/routes");
const { createMessagingRouter } = require("./modules/messaging/routes");
const { createAdminRouter } = require("./modules/admin/routes");
const { errorResponse } = require("./errors");

function buildAllowedOrigins() {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || !raw.trim()) {
    return new Set([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://client:3000"
    ]);
  }

  return new Set(
    raw
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function corsMiddleware() {
  const allowedOrigins = buildAllowedOrigins();
  const allowHeaders = "Origin, X-Requested-With, Content-Type, Accept, Authorization";
  const allowMethods = "GET,POST,PATCH,PUT,DELETE,OPTIONS";

  return (req, res, next) => {
    const origin = req.headers.origin;
    const isAllowedOrigin = !origin || allowedOrigins.has(origin);

    if (isAllowedOrigin && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", allowHeaders);
      res.setHeader("Access-Control-Allow-Methods", allowMethods);
    }

    if (req.method === "OPTIONS") {
      if (isAllowedOrigin) {
        return res.status(204).end();
      }
      return res.status(403).json({
        error: {
          code: "cors_origin_denied",
          message: "Origin is not allowed"
        }
      });
    }

    return next();
  };
}

function createApp(pool) {
  const app = express();

  app.use(corsMiddleware());
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
  app.use(createAdminRouter(pool));

  app.use(errorResponse);

  return app;
}

module.exports = { createApp };
