const express = require("express");
const { AppError } = require("../../errors");
const { requireAuth, requireOptionalAuth } = require("../auth/middleware");
const { validatePrivacyPatch, validatePrivacyRequest } = require("./validators");
const {
  patchPrivacySettings,
  createPrivacyRequest,
  listPrivacyRequests,
  reviewPrivacyRequest,
  getUserProfileForViewer
} = require("./service");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function parseId(value, fieldName) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, "validation_error", `${fieldName} must be a positive integer.`);
  }
  return id;
}

function createPrivacyRouter(pool) {
  const router = express.Router();

  router.patch("/users/:id/privacy", requireAuth, asyncHandler(async (req, res) => {
    const userId = parseId(req.params.id, "id");
    const payload = validatePrivacyPatch(req.body || {});
    const result = await patchPrivacySettings(pool, req.auth, userId, payload);
    res.status(200).json({ privacy: result });
  }));

  router.get("/users/:id", requireOptionalAuth, asyncHandler(async (req, res) => {
    const userId = parseId(req.params.id, "id");
    const profile = await getUserProfileForViewer(pool, userId, req.auth || null);
    res.status(200).json({ user: profile });
  }));

  router.post("/privacy_requests", requireAuth, asyncHandler(async (req, res) => {
    const payload = validatePrivacyRequest(req.body || {});
    const created = await createPrivacyRequest(pool, req.auth, payload);
    res.status(201).json({ request: created });
  }));

  router.get("/privacy_requests", requireAuth, asyncHandler(async (req, res) => {
    if (!["admin", "faculty"].includes(req.auth.role)) {
      throw new AppError(403, "forbidden", "Only admins or department admins can list requests.");
    }

    const items = await listPrivacyRequests(pool, req.auth);
    res.status(200).json({ items });
  }));

  router.patch("/privacy_requests/:id/approve", requireAuth, asyncHandler(async (req, res) => {
    const requestId = parseId(req.params.id, "id");
    const reviewed = await reviewPrivacyRequest(pool, req.auth, requestId, "approve", req.body && req.body.note ? String(req.body.note) : null);
    res.status(200).json(reviewed);
  }));

  router.patch("/privacy_requests/:id/deny", requireAuth, asyncHandler(async (req, res) => {
    const requestId = parseId(req.params.id, "id");
    const reviewed = await reviewPrivacyRequest(pool, req.auth, requestId, "deny", req.body && req.body.note ? String(req.body.note) : null);
    res.status(200).json(reviewed);
  }));

  return router;
}

module.exports = {
  createPrivacyRouter
};
