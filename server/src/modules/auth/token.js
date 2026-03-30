const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const DEV_FALLBACK_SECRET = "dev_only_change_me";
const isDev = process.env.NODE_ENV === "development";
let warnedDevFallback = false;

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (isDev) {
    if (!warnedDevFallback) {
      process.stderr.write(
        "[auth] JWT_SECRET is not set; using development fallback secret.\n"
      );
      warnedDevFallback = true;
    }
    return DEV_FALLBACK_SECRET;
  }

  throw new Error("JWT_SECRET is required in non-development environments");
}

function getAccessTtlSeconds() {
  return Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900);
}

function getRefreshTtlDays() {
  return Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function issueAccessToken(user) {
  const ttlSeconds = getAccessTtlSeconds();
  const token = jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      scopes: user.scopes || {},
      type: "access"
    },
    getJwtSecret(),
    { expiresIn: `${ttlSeconds}s` }
  );

  return {
    token,
    expiresIn: ttlSeconds
  };
}

function issueRefreshToken(userId) {
  const ttlDays = getRefreshTtlDays();
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    {
      sub: String(userId),
      jti,
      type: "refresh"
    },
    getJwtSecret(),
    { expiresIn: `${ttlDays}d` }
  );

  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  return {
    token,
    jti,
    expiresAt
  };
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, getJwtSecret());
  if (payload.type !== "access") {
    throw new Error("Invalid token type");
  }
  return payload;
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, getJwtSecret());
  if (payload.type !== "refresh") {
    throw new Error("Invalid token type");
  }
  return payload;
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/auth"
  };
}

module.exports = {
  hashToken,
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  refreshCookieOptions
};
