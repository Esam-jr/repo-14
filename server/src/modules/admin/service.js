const { AppError } = require("../../errors");
const { authInfo } = require("../../logger");
const { hashPassword } = require("../auth/password");
const { createUser } = require("../auth/repository");
const { sanitizeUser } = require("../auth/service");
const { listPrivacyRequests, reviewPrivacyRequest } = require("../privacy/service");
const { hasScopeAccess } = require("./exportService");

async function getUserById(pool, id) {
  const result = await pool.query(
    `SELECT id, email, role, profile, scopes, is_frozen, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

function canManageUsers(actor) {
  return actor.role === "admin";
}

async function listUsers(pool, actor, query) {
  if (!["admin", "faculty", "mentor"].includes(actor.role)) {
    throw new AppError(403, "forbidden", "Not allowed to list users.");
  }

  const page = Number.isInteger(query.page) ? query.page : 1;
  const perPage = Number.isInteger(query.per_page) ? query.per_page : 25;

  const params = [];
  const where = [];

  if (query.q) {
    params.push(`%${query.q}%`);
    where.push(`(email ILIKE $${params.length} OR COALESCE(profile->>'display_name', '') ILIKE $${params.length})`);
  }

  if (query.role) {
    params.push(query.role);
    where.push(`role = $${params.length}`);
  }

  if (query.is_frozen !== undefined) {
    params.push(Boolean(query.is_frozen));
    where.push(`is_frozen = $${params.length}`);
  }

  const sql = `
    SELECT id, email, role, profile, scopes, is_frozen, created_at, updated_at
    FROM users
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC
  `;

  const result = await pool.query(sql, params);
  const visible = result.rows.filter((row) => hasScopeAccess(actor, row.scopes));

  const total = visible.length;
  const offset = (page - 1) * perPage;
  const items = visible.slice(offset, offset + perPage).map((row) => sanitizeUser(row));

  return { items, page, per_page: perPage, total };
}

async function createAdminUser(pool, actor, payload) {
  if (!canManageUsers(actor)) {
    throw new AppError(403, "forbidden", "Only admins can create users.");
  }

  const passwordHash = await hashPassword(payload.password);
  const user = await createUser(pool, {
    email: payload.email,
    passwordHash,
    role: payload.role,
    profile: payload.profile,
    scopes: payload.scopes
  });

  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
     VALUES ($1, 'admin_user_created', 'user', $2, $3::jsonb)`,
    [actor.userId, String(user.id), JSON.stringify({ role: user.role })]
  );

  authInfo("admin_user_created", { actorId: actor.userId, targetUserId: user.id, role: user.role });
  return sanitizeUser(user);
}

async function updateAdminUser(pool, actor, payload) {
  if (!canManageUsers(actor)) {
    throw new AppError(403, "forbidden", "Only admins can update users.");
  }

  const sets = [];
  const values = [];

  if (payload.role !== undefined) {
    values.push(payload.role);
    sets.push(`role = $${values.length}`);
  }

  if (payload.scopes !== undefined) {
    values.push(JSON.stringify(payload.scopes));
    sets.push(`scopes = $${values.length}::jsonb`);
  }

  if (payload.profile !== undefined) {
    values.push(JSON.stringify(payload.profile));
    sets.push(`profile = $${values.length}::jsonb`);
  }

  if (payload.is_frozen !== undefined) {
    values.push(Boolean(payload.is_frozen));
    sets.push(`is_frozen = $${values.length}`);
  }

  values.push(payload.id);
  const result = await pool.query(
    `UPDATE users
     SET ${sets.join(", ")}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING id, email, role, profile, scopes, is_frozen, created_at, updated_at`,
    values
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "not_found", "User not found.");
  }

  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
     VALUES ($1, 'admin_user_updated', 'user', $2, $3::jsonb)`,
    [actor.userId, String(payload.id), JSON.stringify({ fields: Object.keys(payload).filter((k) => k !== "id") })]
  );

  authInfo("admin_user_updated", { actorId: actor.userId, targetUserId: payload.id });
  return sanitizeUser(result.rows[0]);
}

async function freezeUser(pool, actor, userId, isFrozen) {
  if (!canManageUsers(actor)) {
    throw new AppError(403, "forbidden", "Only admins can freeze users.");
  }

  const user = await getUserById(pool, userId);
  if (!user) {
    throw new AppError(404, "not_found", "User not found.");
  }

  const result = await pool.query(
    `UPDATE users
     SET is_frozen = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, role, profile, scopes, is_frozen, created_at, updated_at`,
    [userId, isFrozen]
  );

  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, 'user', $3, $4::jsonb)`,
    [
      actor.userId,
      isFrozen ? "admin_user_frozen" : "admin_user_unfrozen",
      String(userId),
      JSON.stringify({ is_frozen: isFrozen })
    ]
  );

  authInfo(isFrozen ? "admin_user_frozen" : "admin_user_unfrozen", {
    actorId: actor.userId,
    targetUserId: userId
  });

  return sanitizeUser(result.rows[0]);
}

async function approvePrivacyRequestAsAdmin(pool, actor, requestId, note = null) {
  return reviewPrivacyRequest(pool, actor, requestId, "approve", note);
}

async function denyPrivacyRequestAsAdmin(pool, actor, requestId, note = null) {
  return reviewPrivacyRequest(pool, actor, requestId, "deny", note);
}

async function listAdminPrivacyRequests(pool, actor) {
  return listPrivacyRequests(pool, actor);
}

module.exports = {
  listUsers,
  createAdminUser,
  updateAdminUser,
  freezeUser,
  approvePrivacyRequestAsAdmin,
  denyPrivacyRequestAsAdmin,
  listAdminPrivacyRequests
};
