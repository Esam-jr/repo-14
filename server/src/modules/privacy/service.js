const crypto = require("crypto");
const { AppError } = require("../../errors");
const { authInfo } = require("../../logger");
const { redactedValue } = require("./redaction");
const { scopesOverlap } = require("./scopes");

function nowDate() {
  if (process.env.PRIVACY_NOW) {
    const d = new Date(process.env.PRIVACY_NOW);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function getUserById(pool, userId) {
  const result = await pool.query(
    `SELECT id, email, role, profile, scopes, is_frozen,
            phone_visibility, email_visibility, employer_visibility,
            created_at, updated_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}

async function getActiveGrantedFields(pool, requesterId, targetUserId) {
  const now = nowDate().toISOString();
  const result = await pool.query(
    `SELECT fields_granted
     FROM privacy_view_tokens
     WHERE requester_id = $1
       AND target_user_id = $2
       AND revoked_at IS NULL
       AND expires_at > $3`,
    [requesterId, targetUserId, now]
  );

  const granted = new Set();
  for (const row of result.rows) {
    const fields = row.fields_granted || [];
    for (const field of fields) granted.add(field);
  }

  return granted;
}

function canViewByVisibility(visibility, requester, target, field, grantedFields) {
  if (grantedFields && grantedFields.has(field)) {
    return true;
  }

  if (!requester) {
    return visibility === "public";
  }

  if (requester.userId === Number(target.id) || requester.role === "admin") {
    return true;
  }

  if (visibility === "public") {
    return true;
  }

  if (visibility === "private") {
    return false;
  }

  if (visibility === "cohort") {
    return scopesOverlap(requester.scopes || {}, target.scopes || {}, ["cohort"]);
  }

  if (visibility === "advisor_mentor") {
    if (!["faculty", "mentor", "admin"].includes(requester.role)) {
      return false;
    }
    return scopesOverlap(requester.scopes || {}, target.scopes || {});
  }

  return false;
}

function formatProfileResponse(target, requester, grantedFields) {
  const profile = target.profile || {};

  const fields = [
    { key: "phone", visibility: target.phone_visibility },
    { key: "email", visibility: target.email_visibility, source: target.email },
    { key: "employer", visibility: target.employer_visibility }
  ];

  const visible = {};
  for (const entry of fields) {
    const raw = entry.source !== undefined ? entry.source : profile[entry.key];
    const allowed = canViewByVisibility(entry.visibility, requester, target, entry.key, grantedFields);
    visible[entry.key] = allowed ? raw || null : redactedValue(entry.key, raw);
  }

  return {
    id: target.id,
    role: target.role,
    profile: {
      ...profile,
      phone: visible.phone,
      email: visible.email,
      employer: visible.employer
    },
    visibility: {
      phone_visibility: target.phone_visibility,
      email_visibility: target.email_visibility,
      employer_visibility: target.employer_visibility
    },
    scopes: target.scopes || {}
  };
}

async function patchPrivacySettings(pool, actor, targetUserId, payload) {
  if (actor.userId !== targetUserId || actor.role !== "alumni") {
    throw new AppError(403, "forbidden", "Only alumni can edit their own privacy settings.");
  }

  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(payload)) {
    values.push(value);
    sets.push(`${key} = $${values.length}`);
  }

  values.push(targetUserId);

  const result = await pool.query(
    `UPDATE users
     SET ${sets.join(", ")}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING id, phone_visibility, email_visibility, employer_visibility`,
    values
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "not_found", "User not found.");
  }

  return result.rows[0];
}

async function notify(pool, userId, type, title, body, metadata = {}) {
  await pool.query(
    `INSERT INTO notifications (user_id, type, status, title, body, metadata)
     VALUES ($1, $2, 'unread', $3, $4, $5::jsonb)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

async function findAdvisorIds(pool, targetUser) {
  const scopes = targetUser.scopes || {};
  const school = Array.isArray(scopes.school) ? scopes.school : [];
  const cohort = Array.isArray(scopes.cohort) ? scopes.cohort : [];

  const result = await pool.query(
    `SELECT id, scopes
     FROM users
     WHERE role IN ('faculty', 'mentor')`,
    []
  );

  const ids = [];
  for (const row of result.rows) {
    const rScopes = row.scopes || {};
    const rSchool = Array.isArray(rScopes.school) ? rScopes.school : [];
    const rCohort = Array.isArray(rScopes.cohort) ? rScopes.cohort : [];

    const schoolOverlap = school.length === 0 || rSchool.some((x) => school.includes(x));
    const cohortOverlap = cohort.length === 0 || rCohort.some((x) => cohort.includes(x));
    if (schoolOverlap && cohortOverlap) ids.push(row.id);
  }

  return ids;
}

async function createPrivacyRequest(pool, actor, payload) {
  if (actor.userId === payload.target_user_id) {
    throw new AppError(400, "validation_error", "Cannot request access to your own profile.");
  }

  const target = await getUserById(pool, payload.target_user_id);
  if (!target) {
    throw new AppError(404, "not_found", "Target user not found.");
  }

  if (target.role !== "alumni") {
    throw new AppError(400, "validation_error", "Privacy requests are only supported for alumni targets.");
  }

  const now = nowDate();
  const expiresAt = addDays(now, 14);

  const inserted = await pool.query(
    `INSERT INTO privacy_requests (
      user_id,
      target_user_id,
      request_type,
      status,
      details,
      fields_requested,
      reason,
      expires_at,
      created_at,
      updated_at
    )
    VALUES ($1, $2, 'profile_access', 'pending', $3::jsonb, $4::jsonb, $5, $6, $7, $7)
    RETURNING id, user_id, target_user_id, status, fields_requested, reason, expires_at, created_at`,
    [
      actor.userId,
      payload.target_user_id,
      JSON.stringify({ reason: payload.reason }),
      JSON.stringify(payload.fields_requested),
      payload.reason,
      expiresAt.toISOString(),
      now.toISOString()
    ]
  );

  const request = inserted.rows[0];

  await notify(
    pool,
    payload.target_user_id,
    "privacy_request_created",
    "New privacy access request",
    `A user has requested access to: ${payload.fields_requested.join(", ")}`,
    { request_id: request.id }
  );

  const advisorIds = await findAdvisorIds(pool, target);
  for (const advisorId of advisorIds) {
    // eslint-disable-next-line no-await-in-loop
    await notify(
      pool,
      advisorId,
      "privacy_request_created",
      "Privacy request needs review",
      `Review request #${request.id} for alumni user ${payload.target_user_id}.`,
      { request_id: request.id }
    );
  }

  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
     VALUES ($1, 'privacy_request_created', 'privacy_request', $2, $3::jsonb)`,
    [actor.userId, String(request.id), JSON.stringify({ fields_requested: payload.fields_requested })]
  );

  authInfo("privacy_request_created", { requestId: request.id, actorId: actor.userId, targetUserId: payload.target_user_id });

  return request;
}

async function expireIfNeeded(pool, request) {
  if (request.status !== "pending") return request;
  const now = nowDate();
  if (new Date(request.expires_at).getTime() > now.getTime()) return request;

  const updated = await pool.query(
    `UPDATE privacy_requests
     SET status = 'expired', updated_at = $2
     WHERE id = $1
     RETURNING *`,
    [request.id, now.toISOString()]
  );
  return updated.rows[0];
}

async function listPrivacyRequests(pool, actor) {
  const base = await pool.query(
    `SELECT pr.*, u.scopes AS requester_scopes, t.scopes AS target_scopes
     FROM privacy_requests pr
     JOIN users u ON u.id = pr.user_id
     JOIN users t ON t.id = pr.target_user_id
     ORDER BY pr.created_at DESC`,
    []
  );

  const visible = [];
  for (const row of base.rows) {
    let allowed = false;

    if (actor.role === "admin") {
      allowed = true;
    } else if (actor.role === "faculty") {
      allowed = scopesOverlap(actor.scopes || {}, row.target_scopes || {});
    }

    if (!allowed) continue;

    // eslint-disable-next-line no-await-in-loop
    const normalized = await expireIfNeeded(pool, row);
    visible.push(normalized);
  }

  return visible;
}

async function getPrivacyRequestById(pool, requestId) {
  const result = await pool.query(
    `SELECT * FROM privacy_requests WHERE id = $1`,
    [requestId]
  );

  return result.rows[0] || null;
}

async function reviewPrivacyRequest(pool, actor, requestId, decision, decisionNote = null) {
  if (!["admin", "faculty"].includes(actor.role)) {
    throw new AppError(403, "forbidden", "Only admins or department admins can review requests.");
  }

  const existing = await getPrivacyRequestById(pool, requestId);
  if (!existing) {
    throw new AppError(404, "not_found", "Privacy request not found.");
  }

  const request = await expireIfNeeded(pool, existing);
  const isExpiredAtReview = new Date(request.expires_at).getTime() <= nowDate().getTime();

  if (decision === "approve" && (request.status === "expired" || isExpiredAtReview)) {
    throw new AppError(410, "expired", "Request expired.");
  }

  if (request.status !== "pending") {
    throw new AppError(409, "invalid_state", `Request cannot be ${decision} from ${request.status} state.`);
  }

  if (actor.role === "faculty") {
    const target = await getUserById(pool, request.target_user_id);
    if (!target || !scopesOverlap(actor.scopes || {}, target.scopes || {})) {
      throw new AppError(403, "forbidden", "Department admin scope mismatch.");
    }
  }

  const now = nowDate().toISOString();
  const nextStatus = decision === "approve" ? "approved" : "denied";

  const updated = await pool.query(
    `UPDATE privacy_requests
     SET status = $2,
         reviewed_by = $3,
         reviewed_at = $4,
         decision_note = $5,
         updated_at = $4
     WHERE id = $1
     RETURNING *`,
    [requestId, nextStatus, actor.userId, now, decisionNote]
  );

  const finalRequest = updated.rows[0];

  let token = null;
  if (decision === "approve") {
    token = crypto.randomUUID();
    const tokenHash = hashToken(token);

    await pool.query(
      `INSERT INTO privacy_view_tokens (
        request_id,
        requester_id,
        target_user_id,
        token_hash,
        fields_granted,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        finalRequest.id,
        finalRequest.user_id,
        finalRequest.target_user_id,
        tokenHash,
        JSON.stringify(finalRequest.fields_requested || []),
        finalRequest.expires_at
      ]
    );
  }

  await notify(
    pool,
    finalRequest.user_id,
    "privacy_request_reviewed",
    `Privacy request ${decision}d`,
    `Your privacy access request #${finalRequest.id} was ${decision}d.`,
    { request_id: finalRequest.id, status: finalRequest.status }
  );

  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, 'privacy_request', $3, $4::jsonb)`,
    [actor.userId, `privacy_request_${decision}d`, String(finalRequest.id), JSON.stringify({ status: finalRequest.status })]
  );

  authInfo("privacy_request_reviewed", { requestId: finalRequest.id, decision: finalRequest.status, reviewerId: actor.userId });

  return {
    request: finalRequest,
    view_token: token
  };
}

async function getUserProfileForViewer(pool, targetUserId, requester) {
  const target = await getUserById(pool, targetUserId);
  if (!target) {
    throw new AppError(404, "not_found", "User not found.");
  }

  const grantedFields = requester
    ? await getActiveGrantedFields(pool, requester.userId, targetUserId)
    : new Set();

  return formatProfileResponse(target, requester, grantedFields);
}

module.exports = {
  patchPrivacySettings,
  createPrivacyRequest,
  listPrivacyRequests,
  reviewPrivacyRequest,
  getUserProfileForViewer
};
