const { AppError } = require("../../errors");

async function createUser(pool, { email, passwordHash, role, profile, scopes }) {
  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, profile, scopes)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING id, email, role, profile, scopes, created_at, updated_at, is_frozen`,
      [email, passwordHash, role, JSON.stringify(profile || {}), JSON.stringify(scopes || {})]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError(409, "email_exists", "An account with this email already exists.");
    }
    throw error;
  }
}

async function findUserByEmail(pool, email) {
  const result = await pool.query(
    `SELECT id, email, password_hash, role, profile, scopes, created_at, updated_at, is_frozen
     FROM users
     WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(pool, id) {
  const result = await pool.query(
    `SELECT id, email, role, profile, scopes, created_at, updated_at, is_frozen
     FROM users
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function insertRefreshToken(pool, { jti, userId, tokenHash, expiresAt }) {
  await pool.query(
    `INSERT INTO refresh_tokens (jti, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [jti, userId, tokenHash, expiresAt]
  );
}

async function findRefreshToken(pool, jti) {
  const result = await pool.query(
    `SELECT jti, user_id, token_hash, expires_at, revoked_at, replaced_by_jti
     FROM refresh_tokens
     WHERE jti = $1`,
    [jti]
  );
  return result.rows[0] || null;
}

async function revokeRefreshToken(pool, jti, replacedByJti = null) {
  await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(), replaced_by_jti = COALESCE($2, replaced_by_jti)
     WHERE jti = $1 AND revoked_at IS NULL`,
    [jti, replacedByJti]
  );
}

async function revokeAllRefreshTokensForUser(pool, userId) {
  await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  insertRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser
};
