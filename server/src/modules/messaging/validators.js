const { AppError } = require("../../errors");

const ALLOWED_SCOPE_KEYS = ["school", "major", "class_section", "cohort"];

function sanitizeString(value, field, max = 5000) {
  if (typeof value !== "string") {
    throw new AppError(400, "validation_error", `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError(400, "validation_error", `${field} is required.`);
  }
  if (trimmed.length > max) {
    throw new AppError(400, "validation_error", `${field} exceeds max length ${max}.`);
  }
  return trimmed;
}

function sanitizeOptionalString(value, field, max = 5000) {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new AppError(400, "validation_error", `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new AppError(400, "validation_error", `${field} exceeds max length ${max}.`);
  }
  return trimmed;
}

function normalizeScope(scope) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    throw new AppError(400, "validation_error", "scope must be an object.");
  }

  const normalized = {};
  for (const key of ALLOWED_SCOPE_KEYS) {
    const value = scope[key];
    if (value == null) continue;

    if (typeof value === "string") {
      normalized[key] = [value];
      continue;
    }

    if (Array.isArray(value) && value.every((x) => typeof x === "string")) {
      normalized[key] = Array.from(new Set(value));
      continue;
    }

    throw new AppError(400, "validation_error", `${key} scope must be a string or string array.`);
  }

  if (Object.keys(normalized).length === 0) {
    throw new AppError(400, "validation_error", "scope must include at least one key.");
  }

  return normalized;
}

function validateRecipientSelector(selector) {
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
    throw new AppError(400, "validation_error", "recipient_selector must be an object.");
  }

  const userIds = selector.user_ids;
  const scope = selector.scope;

  if (!userIds && !scope) {
    throw new AppError(400, "validation_error", "recipient_selector requires user_ids or scope.");
  }

  const result = {};

  if (userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new AppError(400, "validation_error", "user_ids must be a non-empty array.");
    }
    const parsedIds = Array.from(new Set(userIds.map((id) => Number.parseInt(id, 10))));
    if (parsedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new AppError(400, "validation_error", "user_ids must be positive integers.");
    }
    result.user_ids = parsedIds;
  }

  if (scope) {
    result.scope = normalizeScope(scope);
  }

  return result;
}

function validateTemplatePayload(body) {
  const name = sanitizeString(body.name, "name", 120);
  const subject = sanitizeString(body.subject, "subject", 250);
  const content = sanitizeString(body.body, "body", 5000);

  let variables = body.variables || [];
  if (!Array.isArray(variables) || variables.some((x) => typeof x !== "string")) {
    throw new AppError(400, "validation_error", "variables must be an array of strings.");
  }
  variables = Array.from(new Set(variables.map((x) => x.trim()).filter(Boolean)));

  return { name, subject, body: content, variables };
}

function validateSendPayload(body) {
  const recipientSelector = validateRecipientSelector(body.recipient_selector || {});
  const subject = sanitizeOptionalString(body.subject, "subject", 250);
  const content = sanitizeOptionalString(body.body, "body", 5000);
  const templateId = body.template_id == null ? null : Number.parseInt(body.template_id, 10);
  const isCritical = body.is_critical === true;
  const variables = body.variables == null ? {} : body.variables;

  if (templateId != null && (!Number.isInteger(templateId) || templateId <= 0)) {
    throw new AppError(400, "validation_error", "template_id must be a positive integer.");
  }

  if (!templateId && (!subject || !content)) {
    throw new AppError(400, "validation_error", "subject and body are required when template_id is not provided.");
  }

  if (variables && (typeof variables !== "object" || Array.isArray(variables))) {
    throw new AppError(400, "validation_error", "variables must be an object.");
  }

  return {
    recipient_selector: recipientSelector,
    template_id: templateId,
    subject,
    body: content,
    is_critical: isCritical,
    variables
  };
}

module.exports = {
  validateTemplatePayload,
  validateSendPayload,
  validateRecipientSelector,
  ALLOWED_SCOPE_KEYS
};
