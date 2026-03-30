const { AppError } = require("../../errors");
const { authInfo, authWarn } = require("../../logger");
const { hashPassword, verifyPassword } = require("./password");
const {
  hashToken,
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken
} = require("./token");
const {
  createUser,
  findUserByEmail,
  findUserById,
  insertRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser
} = require("./repository");

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    profile: user.profile || {},
    scopes: user.scopes || {},
    is_frozen: !!user.is_frozen,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

async function register(pool, payload) {
  const passwordHash = await hashPassword(payload.password);
  const user = await createUser(pool, {
    email: payload.email,
    passwordHash,
    role: payload.role,
    profile: payload.profile,
    scopes: payload.scopes
  });

  authInfo("register_success", { userId: user.id, email: user.email, role: user.role });

  return sanitizeUser(user);
}

async function login(pool, email, password) {
  const user = await findUserByEmail(pool, email);

  if (!user) {
    authWarn("login_failure", { email, reason: "invalid_credentials" });
    throw new AppError(401, "invalid_credentials", "Invalid email or password.");
  }

  if (user.is_frozen) {
    authWarn("account_freeze", { userId: user.id, email: user.email, reason: "frozen_login_attempt" });
    throw new AppError(403, "account_frozen", "Account is frozen.");
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    authWarn("login_failure", { userId: user.id, email, reason: "invalid_credentials" });
    throw new AppError(401, "invalid_credentials", "Invalid email or password.");
  }

  const access = issueAccessToken(user);
  const refresh = issueRefreshToken(user.id);
  await insertRefreshToken(pool, {
    jti: refresh.jti,
    userId: user.id,
    tokenHash: hashToken(refresh.token),
    expiresAt: refresh.expiresAt
  });

  authInfo("login_success", { userId: user.id, email: user.email, role: user.role });

  return {
    user: sanitizeUser(user),
    accessToken: access.token,
    accessTokenExpiresIn: access.expiresIn,
    refreshToken: refresh.token
  };
}

async function refresh(pool, token) {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (_error) {
    throw new AppError(401, "invalid_refresh_token", "Invalid refresh token.");
  }

  const row = await findRefreshToken(pool, payload.jti);
  if (!row || Number(row.user_id) !== Number(payload.sub)) {
    throw new AppError(401, "invalid_refresh_token", "Invalid refresh token.");
  }

  if (row.revoked_at) {
    await revokeAllRefreshTokensForUser(pool, row.user_id);
    authWarn("token_reuse_detected", { userId: row.user_id, jti: row.jti });
    throw new AppError(401, "invalid_refresh_token", "Invalid refresh token.");
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new AppError(401, "refresh_token_expired", "Refresh token expired.");
  }

  if (hashToken(token) !== row.token_hash) {
    await revokeAllRefreshTokensForUser(pool, row.user_id);
    authWarn("token_hash_mismatch", { userId: row.user_id, jti: row.jti });
    throw new AppError(401, "invalid_refresh_token", "Invalid refresh token.");
  }

  const user = await findUserById(pool, row.user_id);
  if (!user) {
    throw new AppError(401, "invalid_refresh_token", "Invalid refresh token.");
  }

  if (user.is_frozen) {
    authWarn("account_freeze", { userId: user.id, reason: "refresh_blocked" });
    throw new AppError(403, "account_frozen", "Account is frozen.");
  }

  const nextRefresh = issueRefreshToken(user.id);
  await insertRefreshToken(pool, {
    jti: nextRefresh.jti,
    userId: user.id,
    tokenHash: hashToken(nextRefresh.token),
    expiresAt: nextRefresh.expiresAt
  });
  await revokeRefreshToken(pool, row.jti, nextRefresh.jti);

  const nextAccess = issueAccessToken(user);

  authInfo("token_refresh", { userId: user.id, previousJti: row.jti, nextJti: nextRefresh.jti });

  return {
    user: sanitizeUser(user),
    accessToken: nextAccess.token,
    accessTokenExpiresIn: nextAccess.expiresIn,
    refreshToken: nextRefresh.token
  };
}

async function logout(pool, refreshToken) {
  if (!refreshToken) {
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    await revokeRefreshToken(pool, payload.jti);
    authInfo("logout", { userId: Number(payload.sub), jti: payload.jti });
  } catch (_error) {
    // Always return success to avoid token probing.
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  sanitizeUser
};
