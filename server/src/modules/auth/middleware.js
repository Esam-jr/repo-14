const { AppError } = require("../../errors");
const { authWarn } = require("../../logger");
const { verifyAccessToken } = require("./token");

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

function normalizeToArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

function asArray(value) {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function hasRequiredScopes(userScopes = {}, requiredScopes = {}) {
  for (const [key, required] of Object.entries(requiredScopes)) {
    const requiredValues = asArray(required);
    if (requiredValues.length === 0) {
      continue;
    }

    const userValues = asArray(userScopes[key]);
    const hasAny = requiredValues.some((item) => userValues.includes(item));
    if (!hasAny) {
      return false;
    }
  }

  return true;
}

function decodeAuth(token) {
  const payload = verifyAccessToken(token);
  return {
    userId: Number(payload.sub),
    role: payload.role,
    scopes: payload.scopes || {}
  };
}

function requireAuth(req, _res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new AppError(401, "unauthorized", "Authentication token is required.");
    }

    req.auth = decodeAuth(token);
    next();
  } catch (_error) {
    next(new AppError(401, "unauthorized", "Invalid or expired token."));
  }
}

function requireOptionalAuth(req, _res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return next();
    }

    req.auth = decodeAuth(token);
    return next();
  } catch (_error) {
    return next();
  }
}

function requireRole(roleOrArray, requiredScopes = null) {
  const allowedRoles = normalizeToArray(roleOrArray);

  return (req, _res, next) => {
    if (!req.auth) {
      return next(new AppError(401, "unauthorized", "Authentication required."));
    }

    if (!allowedRoles.includes(req.auth.role)) {
      authWarn("authorization_denied", {
        reason: "role_mismatch",
        userId: req.auth.userId,
        role: req.auth.role
      });
      return next(new AppError(403, "forbidden", "Insufficient role permissions."));
    }

    const scopeRequirement = typeof requiredScopes === "function"
      ? requiredScopes(req)
      : requiredScopes;

    if (scopeRequirement && !hasRequiredScopes(req.auth.scopes, scopeRequirement)) {
      authWarn("authorization_denied", {
        reason: "scope_mismatch",
        userId: req.auth.userId,
        role: req.auth.role
      });
      return next(new AppError(403, "forbidden", "Insufficient scope permissions."));
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireOptionalAuth,
  requireRole,
  hasRequiredScopes
};
