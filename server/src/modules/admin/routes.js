const express = require("express");
const { AppError } = require("../../errors");
const { requireAuth, requireRole } = require("../auth/middleware");
const {
  validateAdminCreateUser,
  validateAdminUpdateUser,
  validateFreezePayload,
  validateAdminExportPayload
} = require("./validators");
const {
  listUsers,
  createAdminUser,
  updateAdminUser,
  freezeUser,
  approvePrivacyRequestAsAdmin,
  denyPrivacyRequestAsAdmin,
  listAdminPrivacyRequests
} = require("./service");
const { createExportJob, listExportJobs, getExportDownload } = require("./exportService");

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

function parseUsersQuery(query) {
  const page = Number.parseInt(query.page || "1", 10);
  const perPage = Number.parseInt(query.per_page || "25", 10);
  const parsed = {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    per_page: Number.isInteger(perPage) && perPage > 0 ? Math.min(perPage, 100) : 25
  };

  if (query.q !== undefined) parsed.q = String(query.q || "").trim();
  if (query.role !== undefined) parsed.role = String(query.role || "").trim().toLowerCase();
  if (query.is_frozen !== undefined) {
    const value = String(query.is_frozen).toLowerCase();
    if (value === "true" || value === "false") {
      parsed.is_frozen = value === "true";
    }
  }
  return parsed;
}

function createAdminRouter(pool) {
  const router = express.Router();

  router.get("/admin/users", requireAuth, requireRole(["admin", "faculty", "mentor"]), asyncHandler(async (req, res) => {
    const query = parseUsersQuery(req.query || {});
    const result = await listUsers(pool, req.auth, query);
    res.status(200).json(result);
  }));

  router.post("/admin/users", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
    const payload = validateAdminCreateUser(req.body || {});
    const user = await createAdminUser(pool, req.auth, payload);
    res.status(201).json({ user });
  }));

  router.put("/admin/users", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
    const payload = validateAdminUpdateUser(req.body || {});
    const user = await updateAdminUser(pool, req.auth, payload);
    res.status(200).json({ user });
  }));

  router.post("/admin/users/:id/freeze", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "id");
    const payload = validateFreezePayload(req.body || {});
    const user = await freezeUser(pool, req.auth, id, payload.is_frozen);
    res.status(200).json({ user });
  }));

  router.get("/admin/privacy_requests", requireAuth, requireRole(["admin", "faculty"]), asyncHandler(async (req, res) => {
    const items = await listAdminPrivacyRequests(pool, req.auth);
    res.status(200).json({ items });
  }));

  router.post("/admin/privacy_requests/:id/approve", requireAuth, requireRole(["admin", "faculty"]), asyncHandler(async (req, res) => {
    const requestId = parseId(req.params.id, "id");
    const note = req.body && req.body.note ? String(req.body.note) : null;
    const result = await approvePrivacyRequestAsAdmin(pool, req.auth, requestId, note);
    res.status(200).json(result);
  }));

  router.post("/admin/privacy_requests/:id/deny", requireAuth, requireRole(["admin", "faculty"]), asyncHandler(async (req, res) => {
    const requestId = parseId(req.params.id, "id");
    const note = req.body && req.body.note ? String(req.body.note) : null;
    const result = await denyPrivacyRequestAsAdmin(pool, req.auth, requestId, note);
    res.status(200).json(result);
  }));

  router.post("/admin/exports", requireAuth, requireRole(["admin", "faculty", "mentor"]), asyncHandler(async (req, res) => {
    const payload = validateAdminExportPayload(req.body || {});
    const created = await createExportJob(pool, req.auth, payload);
    res.status(201).json({ export: created });
  }));

  router.get("/admin/exports", requireAuth, requireRole(["admin", "faculty", "mentor"]), asyncHandler(async (req, res) => {
    const items = await listExportJobs(pool, req.auth);
    res.status(200).json({ items });
  }));

  router.get("/admin/exports/download/:token", requireAuth, requireRole(["admin", "faculty", "mentor"]), asyncHandler(async (req, res) => {
    const data = await getExportDownload(pool, req.auth, req.params.token);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${data.filename}"`);
    res.status(200).send(data.csv);
  }));

  return router;
}

module.exports = {
  createAdminRouter
};
