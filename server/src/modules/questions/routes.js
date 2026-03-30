const express = require("express");
const { AppError } = require("../../errors");
const { requireAuth, requireRole } = require("../auth/middleware");
const {
  parseListQuery,
  parseResourceListQuery,
  validateQuestionPayload,
  validateResourcePayload,
  validateSavedSearchPayload
} = require("./validators");
const {
  listQuestions,
  getQuestionById,
  createQuestion,
  patchQuestion,
  deleteQuestion,
  listResources,
  getResourceById,
  createResource,
  patchResource,
  deleteResource,
  createSavedSearch,
  listSavedSearches,
  applySavedSearch,
  runAdminReindex
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

function createQuestionRouter(pool) {
  const router = express.Router();

  router.get("/questions", asyncHandler(async (req, res) => {
    const parsed = parseListQuery(req.query || {});
    const result = await listQuestions(pool, parsed);
    res.status(200).json(result);
  }));

  router.post("/questions", requireAuth, asyncHandler(async (req, res) => {
    const payload = validateQuestionPayload(req.body || {}, { partial: false });
    const question = await createQuestion(pool, req.auth.userId, payload);
    res.status(201).json({ question });
  }));

  router.get("/questions/:id", asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "id");
    const question = await getQuestionById(pool, id);
    res.status(200).json({ question });
  }));

  router.patch("/questions/:id", requireAuth, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "id");
    const payload = validateQuestionPayload(req.body || {}, { partial: true });
    const question = await patchQuestion(pool, id, req.auth, payload);
    res.status(200).json({ question });
  }));

  router.delete("/questions/:id", requireAuth, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "id");
    await deleteQuestion(pool, id, req.auth);
    res.status(200).json({ ok: true });
  }));

  router.get("/resources", asyncHandler(async (req, res) => {
    const parsed = parseResourceListQuery(req.query || {});
    const result = await listResources(pool, parsed);
    res.status(200).json(result);
  }));

  router.post("/resources", requireAuth, asyncHandler(async (req, res) => {
    const payload = validateResourcePayload(req.body || {}, { partial: false });
    const resource = await createResource(pool, req.auth.userId, payload);
    res.status(201).json({ resource });
  }));

  router.get("/resources/:id", asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "id");
    const resource = await getResourceById(pool, id);
    res.status(200).json({ resource });
  }));

  router.patch("/resources/:id", requireAuth, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "id");
    const payload = validateResourcePayload(req.body || {}, { partial: true });
    const resource = await patchResource(pool, id, req.auth, payload);
    res.status(200).json({ resource });
  }));

  router.delete("/resources/:id", requireAuth, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "id");
    await deleteResource(pool, id, req.auth);
    res.status(200).json({ ok: true });
  }));

  router.post("/saved_searches", requireAuth, asyncHandler(async (req, res) => {
    const payload = validateSavedSearchPayload(req.body || {});
    const savedSearch = await createSavedSearch(pool, req.auth.userId, payload);
    res.status(201).json({ saved_search: savedSearch });
  }));

  router.get("/saved_searches", requireAuth, asyncHandler(async (req, res) => {
    const searches = await listSavedSearches(pool, req.auth.userId);
    res.status(200).json({ items: searches });
  }));

  router.post("/saved_searches/:id/apply", requireAuth, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "id");
    const body = req.body || {};
    const parsed = parseListQuery(body);
    const overrides = {};
    if (body.page !== undefined) overrides.page = parsed.page;
    if (body.per_page !== undefined) overrides.per_page = parsed.per_page;
    if (body.sort_by !== undefined) overrides.sort_by = parsed.sort_by;
    if (body.sort_dir !== undefined) overrides.sort_dir = parsed.sort_dir;
    const results = await applySavedSearch(pool, req.auth.userId, id, overrides);
    res.status(200).json(results);
  }));

  router.post("/admin/reindex", requireAuth, requireRole("admin"), asyncHandler(async (_req, res) => {
    const result = await runAdminReindex(pool);
    res.status(200).json({ ok: true, result });
  }));

  return router;
}

module.exports = {
  createQuestionRouter
};
