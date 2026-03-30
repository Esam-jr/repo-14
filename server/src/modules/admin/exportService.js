const crypto = require("crypto");
const { AppError } = require("../../errors");
const { authInfo, authWarn } = require("../../logger");
const { SCOPED_KEYS } = require("../auth/constants");

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function hasScopeAccess(actor, rowScopes) {
  if (actor.role === "admin") {
    return true;
  }

  const actorScopes = parseJsonObject(actor.scopes);
  const scopes = parseJsonObject(rowScopes);
  let hasScopedConstraint = false;

  for (const key of SCOPED_KEYS) {
    const required = asArray(actorScopes[key]);
    if (required.length === 0) {
      continue;
    }
    hasScopedConstraint = true;

    const actual = asArray(scopes[key]);
    if (actual.length === 0) {
      return false;
    }

    if (!required.some((value) => actual.includes(value))) {
      return false;
    }
  }

  return hasScopedConstraint;
}

function csvEscape(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, "\"\"")}"`;
  }
  return str;
}

function toCsv(columns, rows) {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","));
  return [header, ...lines].join("\n");
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function exportTtlMinutes() {
  const parsed = Number.parseInt(process.env.EXPORT_LINK_TTL_MINUTES || "60", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 60;
}

function allowedExportRoles(role) {
  return ["admin", "faculty", "mentor"].includes(role);
}

async function fetchUsersExportRows(pool, actor, filters) {
  const params = [];
  const where = [];

  if (filters.q) {
    params.push(`%${String(filters.q).trim()}%`);
    where.push(`(email ILIKE $${params.length} OR COALESCE(profile->>'display_name', '') ILIKE $${params.length})`);
  }

  if (filters.role) {
    params.push(String(filters.role).trim().toLowerCase());
    where.push(`role = $${params.length}`);
  }

  const sql = `
    SELECT id, email, role, profile, scopes, is_frozen, created_at
    FROM users
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY id ASC
  `;

  const result = await pool.query(sql, params);
  const visible = result.rows.filter((row) => hasScopeAccess(actor, row.scopes));

  return visible.map((row) => {
    const scopes = parseJsonObject(row.scopes);
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      is_frozen: row.is_frozen,
      school: asArray(scopes.school).join("|"),
      major: asArray(scopes.major).join("|"),
      class_section: asArray(scopes.class_section).join("|"),
      cohort: asArray(scopes.cohort).join("|"),
      created_at: row.created_at
    };
  });
}

async function fetchPrivacyRequestsExportRows(pool, actor, filters) {
  const params = [];
  const where = [];

  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    where.push(`pr.status = $${params.length}`);
  }

  const sql = `
    SELECT
      pr.id,
      pr.user_id,
      pr.target_user_id,
      pr.status,
      pr.fields_requested,
      pr.reason,
      pr.expires_at,
      pr.created_at,
      tu.scopes AS target_scopes
    FROM privacy_requests pr
    JOIN users tu ON tu.id = pr.target_user_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY pr.id ASC
  `;

  const result = await pool.query(sql, params);
  const visible = result.rows.filter((row) => hasScopeAccess(actor, row.target_scopes));

  return visible.map((row) => ({
    id: row.id,
    requester_id: row.user_id,
    target_user_id: row.target_user_id,
    status: row.status,
    fields_requested: JSON.stringify(row.fields_requested || []),
    reason: row.reason || "",
    expires_at: row.expires_at,
    created_at: row.created_at
  }));
}

async function fetchQuestionsExportRows(pool, actor, filters) {
  const params = [];
  const where = [];

  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    where.push(`status = $${params.length}`);
  }

  if (filters.q) {
    params.push(`%${String(filters.q).trim()}%`);
    where.push(`(title ILIKE $${params.length} OR body ILIKE $${params.length})`);
  }

  for (const key of SCOPED_KEYS) {
    if (filters[key] === undefined) continue;
    params.push(String(filters[key]));
    where.push(`${key} = $${params.length}`);
  }

  const actorScopes = parseJsonObject(actor.scopes);
  let hasScopedConstraint = false;
  if (actor.role !== "admin") {
    for (const key of SCOPED_KEYS) {
      const values = asArray(actorScopes[key]);
      if (values.length === 0) continue;
      hasScopedConstraint = true;
      params.push(values);
      where.push(`${key} = ANY($${params.length})`);
    }
    if (!hasScopedConstraint) {
      return [];
    }
  }

  const sql = `
    SELECT id, title, status, creator_id, school, major, class_section, cohort, created_at
    FROM questions
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY id ASC
  `;

  const result = await pool.query(sql, params);
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    creator_id: row.creator_id,
    school: row.school || "",
    major: row.major || "",
    class_section: row.class_section || "",
    cohort: row.cohort || "",
    created_at: row.created_at
  }));
}

function buildDownloadUrl(job) {
  return `/admin/exports/download/${job.download_token}`;
}

async function createExportJob(pool, actor, payload) {
  if (!allowedExportRoles(actor.role)) {
    throw new AppError(403, "forbidden", "Only admins or scoped staff can export data.");
  }

  let rows = [];
  let columns = [];

  if (payload.export_type === "users") {
    rows = await fetchUsersExportRows(pool, actor, payload.filters);
    columns = ["id", "email", "role", "is_frozen", "school", "major", "class_section", "cohort", "created_at"];
  } else if (payload.export_type === "privacy_requests") {
    rows = await fetchPrivacyRequestsExportRows(pool, actor, payload.filters);
    columns = ["id", "requester_id", "target_user_id", "status", "fields_requested", "reason", "expires_at", "created_at"];
  } else if (payload.export_type === "questions") {
    rows = await fetchQuestionsExportRows(pool, actor, payload.filters);
    columns = ["id", "title", "status", "creator_id", "school", "major", "class_section", "cohort", "created_at"];
  } else {
    throw new AppError(400, "validation_error", "Unsupported export_type.");
  }

  const now = new Date();
  const expiresAt = addMinutes(now, exportTtlMinutes());
  const downloadToken = crypto.randomUUID();
  const csvData = toCsv(columns, rows);

  const inserted = await pool.query(
    `
      INSERT INTO export_jobs (
        requested_by,
        requester_role,
        export_type,
        status,
        scope_snapshot,
        filters,
        row_count,
        csv_data,
        download_token,
        download_expires_at,
        completed_at
      )
      VALUES ($1, $2, $3, 'completed', $4::jsonb, $5::jsonb, $6, $7, $8, $9, NOW())
      RETURNING id, requested_by, export_type, status, row_count, download_token, download_expires_at, created_at
    `,
    [
      actor.userId,
      actor.role,
      payload.export_type,
      JSON.stringify(actor.scopes || {}),
      JSON.stringify(payload.filters || {}),
      rows.length,
      csvData,
      downloadToken,
      expiresAt.toISOString()
    ]
  );

  const job = inserted.rows[0];

  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
     VALUES ($1, 'admin_export_created', 'export_job', $2, $3::jsonb)`,
    [
      actor.userId,
      String(job.id),
      JSON.stringify({
        export_type: job.export_type,
        row_count: job.row_count,
        scope_snapshot: actor.scopes || {}
      })
    ]
  );

  authInfo("admin_export_created", {
    actorId: actor.userId,
    exportJobId: job.id,
    exportType: job.export_type,
    rowCount: job.row_count
  });

  return {
    id: job.id,
    export_type: job.export_type,
    status: job.status,
    row_count: job.row_count,
    download_url: buildDownloadUrl(job),
    download_expires_at: job.download_expires_at,
    created_at: job.created_at
  };
}

async function listExportJobs(pool, actor) {
  if (!allowedExportRoles(actor.role)) {
    throw new AppError(403, "forbidden", "Not allowed to list export jobs.");
  }

  const params = [];
  const where = [];
  if (actor.role !== "admin") {
    params.push(actor.userId);
    where.push(`requested_by = $${params.length}`);
  }

  const result = await pool.query(
    `
      SELECT id, requested_by, export_type, status, row_count, download_token, download_expires_at, created_at
      FROM export_jobs
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT 50
    `,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    requested_by: row.requested_by,
    export_type: row.export_type,
    status: row.status,
    row_count: row.row_count,
    download_url: buildDownloadUrl(row),
    download_expires_at: row.download_expires_at,
    created_at: row.created_at
  }));
}

async function getExportDownload(pool, actor, token) {
  if (!allowedExportRoles(actor.role)) {
    throw new AppError(403, "forbidden", "Not allowed to download exports.");
  }

  const result = await pool.query(
    `
      SELECT id, requested_by, csv_data, export_type, download_expires_at
      FROM export_jobs
      WHERE download_token = $1
      LIMIT 1
    `,
    [token]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "not_found", "Export not found.");
  }

  const item = result.rows[0];
  if (new Date(item.download_expires_at).getTime() <= Date.now()) {
    throw new AppError(410, "expired", "Export link expired.");
  }

  if (actor.role !== "admin" && Number(item.requested_by) !== Number(actor.userId)) {
    authWarn("admin_export_download_denied", {
      actorId: actor.userId,
      exportJobId: item.id
    });
    throw new AppError(403, "forbidden", "Cannot access this export.");
  }

  return {
    filename: `${item.export_type}_export_${item.id}.csv`,
    csv: item.csv_data
  };
}

module.exports = {
  createExportJob,
  listExportJobs,
  getExportDownload,
  hasScopeAccess
};
