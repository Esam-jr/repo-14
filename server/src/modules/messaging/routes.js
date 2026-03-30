const express = require("express");
const { AppError } = require("../../errors");
const { requireAuth } = require("../auth/middleware");
const { validateTemplatePayload, validateSendPayload } = require("./validators");
const {
  createTemplate,
  listTemplates,
  updateTemplate,
  deleteTemplate,
  sendMessage,
  listNotifications,
  setNotificationRead,
  muteNotification
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

function createMessagingRouter(pool) {
  const router = express.Router();

  router.post("/templates", requireAuth, asyncHandler(async (req, res) => {
    const payload = validateTemplatePayload(req.body || {});
    const template = await createTemplate(pool, req.auth, payload);
    res.status(201).json({ template });
  }));

  router.get("/templates", requireAuth, asyncHandler(async (req, res) => {
    const templates = await listTemplates(pool, req.auth);
    res.status(200).json({ items: templates });
  }));

  router.patch("/templates/:id", requireAuth, asyncHandler(async (req, res) => {
    const templateId = parseId(req.params.id, "id");
    const payload = validateTemplatePayload(req.body || {});
    const template = await updateTemplate(pool, req.auth, templateId, payload);
    res.status(200).json({ template });
  }));

  router.delete("/templates/:id", requireAuth, asyncHandler(async (req, res) => {
    const templateId = parseId(req.params.id, "id");
    await deleteTemplate(pool, req.auth, templateId);
    res.status(200).json({ ok: true });
  }));

  router.post("/messages/send", requireAuth, asyncHandler(async (req, res) => {
    const payload = validateSendPayload(req.body || {});
    const result = await sendMessage(pool, req.auth, payload);
    res.status(201).json(result);
  }));

  router.get("/notifications", requireAuth, asyncHandler(async (req, res) => {
    const items = await listNotifications(pool, req.auth, req.query || {});
    res.status(200).json({ items });
  }));

  router.patch("/notifications/:id/read", requireAuth, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "id");
    const isRead = req.body && req.body.is_read === false ? false : true;
    const notification = await setNotificationRead(pool, req.auth, id, isRead);
    res.status(200).json({ notification });
  }));

  router.patch("/notifications/:id/mute", requireAuth, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "id");
    const notification = await muteNotification(pool, req.auth, id);
    res.status(200).json({ notification });
  }));

  return router;
}

module.exports = {
  createMessagingRouter
};
