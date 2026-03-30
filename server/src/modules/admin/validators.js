const { AppError } = require("../../errors");
const { ROLES, SCOPED_KEYS } = require("../auth/constants");

const EXPORT_TYPES = ["users", "privacy_requests", "questions"];

function ensureObject(value, fieldName) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(400, "validation_error", `${fieldName} must be an object.`);
  }
  return value;
}

function normalizeScopes(value) {
  const raw = ensureObject(value, "scopes");
  const scopes = {};

  for (const key of SCOPED_KEYS) {
    if (!(key in raw)) continue;
    const input = Array.isArray(raw[key]) ? raw[key] : [raw[key]];
    const normalized = input
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (normalized.length > 0) {
      scopes[key] = normalized;
    }
  }

  return scopes;
}

function validateAdminCreateUser(body) {
  const payload = ensureObject(body, "body");
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const role = String(payload.role || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    throw new AppError(400, "validation_error", "email must be a valid email address.");
  }

  if (password.length < 8) {
    throw new AppError(400, "validation_error", "password must be at least 8 characters.");
  }

  if (!ROLES.includes(role)) {
    throw new AppError(400, "validation_error", `role must be one of: ${ROLES.join(", ")}.`);
  }

  return {
    email,
    password,
    role,
    profile: ensureObject(payload.profile || {}, "profile"),
    scopes: normalizeScopes(payload.scopes || {})
  };
}

function validateAdminUpdateUser(body) {
  const payload = ensureObject(body, "body");
  const id = Number.parseInt(payload.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, "validation_error", "id must be a positive integer.");
  }

  const update = { id };

  if (payload.role !== undefined) {
    const role = String(payload.role || "").trim().toLowerCase();
    if (!ROLES.includes(role)) {
      throw new AppError(400, "validation_error", `role must be one of: ${ROLES.join(", ")}.`);
    }
    update.role = role;
  }

  if (payload.scopes !== undefined) {
    update.scopes = normalizeScopes(payload.scopes);
  }

  if (payload.profile !== undefined) {
    update.profile = ensureObject(payload.profile, "profile");
  }

  if (payload.is_frozen !== undefined) {
    update.is_frozen = Boolean(payload.is_frozen);
  }

  if (Object.keys(update).length === 1) {
    throw new AppError(400, "validation_error", "At least one update field is required.");
  }

  return update;
}

function validateFreezePayload(body) {
  const payload = ensureObject(body || {}, "body");
  if (payload.is_frozen === undefined) {
    return { is_frozen: true };
  }
  return { is_frozen: Boolean(payload.is_frozen) };
}

function validateAdminExportPayload(body) {
  const payload = ensureObject(body || {}, "body");
  const exportType = String(payload.export_type || "").trim().toLowerCase();
  if (!EXPORT_TYPES.includes(exportType)) {
    throw new AppError(
      400,
      "validation_error",
      `export_type must be one of: ${EXPORT_TYPES.join(", ")}.`
    );
  }

  return {
    export_type: exportType,
    filters: ensureObject(payload.filters || {}, "filters")
  };
}

module.exports = {
  validateAdminCreateUser,
  validateAdminUpdateUser,
  validateFreezePayload,
  validateAdminExportPayload,
  EXPORT_TYPES
};
