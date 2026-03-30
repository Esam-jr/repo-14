const { AppError } = require("../../errors");

const VISIBILITY_VALUES = ["public", "cohort", "advisor_mentor", "private"];
const PRIVACY_FIELDS = ["phone", "email", "employer"];

function sanitizeVisibility(value, field) {
  if (!VISIBILITY_VALUES.includes(value)) {
    throw new AppError(400, "validation_error", `${field} is invalid.`);
  }
  return value;
}

function validatePrivacyPatch(body) {
  const payload = {};

  if (body.phone_visibility !== undefined) {
    payload.phone_visibility = sanitizeVisibility(body.phone_visibility, "phone_visibility");
  }
  if (body.email_visibility !== undefined) {
    payload.email_visibility = sanitizeVisibility(body.email_visibility, "email_visibility");
  }
  if (body.employer_visibility !== undefined) {
    payload.employer_visibility = sanitizeVisibility(body.employer_visibility, "employer_visibility");
  }

  if (Object.keys(payload).length === 0) {
    throw new AppError(400, "validation_error", "At least one visibility field is required.");
  }

  return payload;
}

function validatePrivacyRequest(body) {
  const targetUserId = Number.parseInt(body.target_user_id, 10);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new AppError(400, "validation_error", "target_user_id must be a positive integer.");
  }

  if (!Array.isArray(body.fields_requested) || body.fields_requested.length === 0) {
    throw new AppError(400, "validation_error", "fields_requested must be a non-empty array.");
  }

  const fields = Array.from(new Set(body.fields_requested.map((x) => String(x))));
  if (fields.some((f) => !PRIVACY_FIELDS.includes(f))) {
    throw new AppError(400, "validation_error", "fields_requested contains unsupported fields.");
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 1000) {
    throw new AppError(400, "validation_error", "reason is required and must be <= 1000 chars.");
  }

  return {
    target_user_id: targetUserId,
    fields_requested: fields,
    reason
  };
}

module.exports = {
  validatePrivacyPatch,
  validatePrivacyRequest,
  VISIBILITY_VALUES,
  PRIVACY_FIELDS
};
