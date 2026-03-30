const { SCOPED_KEYS, ROLES } = require("./constants");
const { AppError } = require("../../errors");

function isEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

function normalizeScopes(scopes) {
  if (scopes == null) {
    return {};
  }

  if (typeof scopes !== "object" || Array.isArray(scopes)) {
    throw new AppError(400, "validation_error", "scopes must be an object.");
  }

  const normalized = {};

  for (const key of SCOPED_KEYS) {
    if (scopes[key] == null) {
      continue;
    }

    const value = scopes[key];
    if (typeof value === "string") {
      normalized[key] = [value];
      continue;
    }

    if (Array.isArray(value) && value.every((x) => typeof x === "string")) {
      normalized[key] = Array.from(new Set(value));
      continue;
    }

    throw new AppError(400, "validation_error", `${key} scope must be a string or array of strings.`);
  }

  return normalized;
}

function validateRegisterInput(body) {
  const email = (body.email || "").toLowerCase().trim();
  const password = body.password;
  const role = body.role || "student";
  const profile = body.profile || {};
  const scopes = normalizeScopes(body.scopes);

  if (!isEmail(email)) {
    throw new AppError(400, "validation_error", "email is invalid.");
  }

  if (!isValidPassword(password)) {
    throw new AppError(400, "validation_error", "password must be 8-128 characters.");
  }

  if (!ROLES.includes(role)) {
    throw new AppError(400, "validation_error", "role is invalid.");
  }

  if (typeof profile !== "object" || Array.isArray(profile)) {
    throw new AppError(400, "validation_error", "profile must be an object.");
  }

  return { email, password, role, profile, scopes };
}

function validateLoginInput(body) {
  const email = (body.email || "").toLowerCase().trim();
  const password = body.password;

  if (!isEmail(email)) {
    throw new AppError(400, "validation_error", "email is invalid.");
  }

  if (typeof password !== "string" || password.length === 0) {
    throw new AppError(400, "validation_error", "password is required.");
  }

  return { email, password };
}

module.exports = {
  validateRegisterInput,
  validateLoginInput,
  normalizeScopes
};
