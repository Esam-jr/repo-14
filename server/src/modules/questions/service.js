const { AppError } = require("../../errors");
const { authInfo } = require("../../logger");
const { buildQuestionWhere } = require("./queryBuilder");
const {
  resolveQuestionIds,
  indexQuestionDocument,
  deleteQuestionDocument,
  reindexAllQuestions,
  getSearchEngine
} = require("../../services/searchService");

const QUESTION_SORT_COLUMN_MAP = {
  created_at: "q.created_at",
  updated_at: "q.updated_at",
  difficulty: "q.difficulty",
  status: "q.status",
  title: "q.title"
};

const RESOURCE_SORT_COLUMN_MAP = {
  created_at: "r.created_at",
  updated_at: "r.updated_at",
  title: "r.title",
  resource_type: "r.resource_type"
};

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function normalizeQuestionRow(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    question_type: row.question_type,
    difficulty: row.difficulty,
    status: row.status,
    creator_id: row.creator_id,
    school: row.school,
    major: row.major,
    class_section: row.class_section,
    cohort: row.cohort,
    metadata: row.metadata || {},
    tags: row.tags || [],
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeResourceRow(row) {
  return {
    id: row.id,
    creator_id: row.creator_id,
    title: row.title,
    body: row.body,
    resource_type: row.resource_type,
    url: row.url,
    school: row.school,
    major: row.major,
    class_section: row.class_section,
    cohort: row.cohort,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function buildResourceWhere(filters, values) {
  const clauses = [];

  if (filters.q) {
    values.push(`%${filters.q}%`);
    clauses.push(`(r.title ILIKE $${values.length} OR COALESCE(r.body, '') ILIKE $${values.length})`);
  }

  if (filters.resource_type) {
    values.push(filters.resource_type);
    clauses.push(`r.resource_type = $${values.length}`);
  }

  if (filters.creator_id) {
    values.push(filters.creator_id);
    clauses.push(`r.creator_id = $${values.length}`);
  }

  if (filters.start_date) {
    values.push(filters.start_date);
    clauses.push(`r.created_at >= $${values.length}`);
  }

  if (filters.end_date) {
    values.push(filters.end_date);
    clauses.push(`r.created_at <= $${values.length}`);
  }

  if (filters.school) {
    values.push(filters.school);
    clauses.push(`r.school = $${values.length}`);
  }

  if (filters.major) {
    values.push(filters.major);
    clauses.push(`r.major = $${values.length}`);
  }

  if (filters.cohort) {
    values.push(filters.cohort);
    clauses.push(`r.cohort = $${values.length}`);
  }

  if (clauses.length === 0) {
    return "";
  }

  return `WHERE ${clauses.join(" AND ")}`;
}

async function ensureTags(pool, tags) {
  if (!tags || tags.length === 0) {
    return [];
  }

  const ids = [];
  for (const tag of tags) {
    // eslint-disable-next-line no-await-in-loop
    const result = await pool.query(
      `INSERT INTO tags (name)
       VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tag]
    );
    ids.push(result.rows[0].id);
  }

  return ids;
}

async function setQuestionTags(pool, questionId, tags) {
  if (!tags) {
    return;
  }

  await pool.query("DELETE FROM question_tags WHERE question_id = $1", [questionId]);

  const ids = await ensureTags(pool, tags);
  for (const tagId of ids) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO question_tags (question_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT (question_id, tag_id) DO NOTHING`,
      [questionId, tagId]
    );
  }
}

async function listQuestions(pool, params) {
  const start = nowMs();
  const values = [];

  const searchIds = await resolveQuestionIds(pool, params.filters);
  const where = buildQuestionWhere(params.filters, values, { searchIds });

  const countResult = await pool.query(
    `SELECT COUNT(*)::bigint AS total
     FROM questions q
     ${where}`,
    values
  );

  const total = Number(countResult.rows[0].total);
  const offset = (params.page - 1) * params.per_page;

  const dataValues = [...values];
  dataValues.push(params.per_page);
  const limitParam = `$${dataValues.length}`;
  dataValues.push(offset);
  const offsetParam = `$${dataValues.length}`;

  const sortColumn = QUESTION_SORT_COLUMN_MAP[params.sort_by] || QUESTION_SORT_COLUMN_MAP.created_at;
  const sortDirection = params.sort_dir.toUpperCase() === "ASC" ? "ASC" : "DESC";

  const rows = await pool.query(
    `SELECT
      q.id,
      q.title,
      q.body,
      q.question_type,
      q.difficulty,
      q.status,
      q.creator_id,
      q.school,
      q.major,
      q.class_section,
      q.cohort,
      q.metadata,
      q.created_at,
      q.updated_at,
      COALESCE(ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
    FROM questions q
    LEFT JOIN question_tags qt ON qt.question_id = q.id
    LEFT JOIN tags t ON t.id = qt.tag_id
    ${where}
    GROUP BY q.id
    ORDER BY ${sortColumn} ${sortDirection}
    LIMIT ${limitParam} OFFSET ${offsetParam}`,
    dataValues
  );

  authInfo("questions_search", {
    engine: getSearchEngine(),
    q: params.filters.q || null,
    total,
    duration_ms: nowMs() - start
  });

  return {
    items: rows.rows.map(normalizeQuestionRow),
    pagination: {
      page: params.page,
      per_page: params.per_page,
      total,
      total_pages: Math.max(1, Math.ceil(total / params.per_page))
    }
  };
}

async function getQuestionById(pool, id) {
  const result = await pool.query(
    `SELECT
      q.id,
      q.title,
      q.body,
      q.question_type,
      q.difficulty,
      q.status,
      q.creator_id,
      q.school,
      q.major,
      q.class_section,
      q.cohort,
      q.metadata,
      q.created_at,
      q.updated_at,
      COALESCE(ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
    FROM questions q
    LEFT JOIN question_tags qt ON qt.question_id = q.id
    LEFT JOIN tags t ON t.id = qt.tag_id
    WHERE q.id = $1
    GROUP BY q.id`,
    [id]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "not_found", "Question not found.");
  }

  return normalizeQuestionRow(result.rows[0]);
}

async function createQuestion(pool, creatorId, payload) {
  const metadata = {
    ...(payload.metadata || {})
  };

  if (payload.knowledge_point) {
    metadata.knowledge_point = payload.knowledge_point;
  }

  const result = await pool.query(
    `INSERT INTO questions (
      title,
      body,
      question_type,
      difficulty,
      status,
      creator_id,
      school,
      major,
      class_section,
      cohort,
      metadata
    )
    VALUES (
      $1, $2,
      COALESCE($3, 'general'),
      COALESCE($4, 'beginner'),
      COALESCE($5, 'open'),
      $6, $7, $8, $9, $10, $11::jsonb
    )
    RETURNING id`,
    [
      payload.title,
      payload.body,
      payload.question_type,
      payload.difficulty,
      payload.status,
      creatorId,
      payload.school || null,
      payload.major || null,
      payload.class_section || null,
      payload.cohort || null,
      JSON.stringify(metadata)
    ]
  );

  const questionId = result.rows[0].id;
  await setQuestionTags(pool, questionId, payload.tags || []);
  await indexQuestionDocument(pool, questionId);
  return getQuestionById(pool, questionId);
}

async function patchQuestion(pool, questionId, actor, payload) {
  const existing = await pool.query(
    `SELECT id, creator_id, metadata FROM questions WHERE id = $1`,
    [questionId]
  );

  if (existing.rowCount === 0) {
    throw new AppError(404, "not_found", "Question not found.");
  }

  const row = existing.rows[0];
  if (actor.role !== "admin" && Number(row.creator_id) !== Number(actor.userId)) {
    throw new AppError(403, "forbidden", "You can only update your own questions.");
  }

  const sets = [];
  const values = [];

  function pushSet(column, value) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }

  if (payload.title !== undefined) pushSet("title", payload.title);
  if (payload.body !== undefined) pushSet("body", payload.body);
  if (payload.question_type !== undefined) pushSet("question_type", payload.question_type);
  if (payload.difficulty !== undefined) pushSet("difficulty", payload.difficulty);
  if (payload.status !== undefined) pushSet("status", payload.status);
  if (payload.school !== undefined) pushSet("school", payload.school);
  if (payload.major !== undefined) pushSet("major", payload.major);
  if (payload.class_section !== undefined) pushSet("class_section", payload.class_section);
  if (payload.cohort !== undefined) pushSet("cohort", payload.cohort);

  if (payload.metadata !== undefined || payload.knowledge_point !== undefined) {
    const metadata = {
      ...(row.metadata || {}),
      ...(payload.metadata || {})
    };

    if (payload.knowledge_point !== undefined) {
      metadata.knowledge_point = payload.knowledge_point;
    }

    pushSet("metadata", JSON.stringify(metadata));
    sets[sets.length - 1] = `metadata = $${values.length}::jsonb`;
  }

  if (sets.length > 0) {
    values.push(questionId);
    await pool.query(
      `UPDATE questions
       SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}`,
      values
    );
  }

  if (payload.tags !== undefined) {
    await setQuestionTags(pool, questionId, payload.tags);
  }

  await indexQuestionDocument(pool, questionId);
  return getQuestionById(pool, questionId);
}

async function deleteQuestion(pool, questionId, actor) {
  const result = await pool.query(
    "SELECT id, creator_id FROM questions WHERE id = $1",
    [questionId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "not_found", "Question not found.");
  }

  const row = result.rows[0];
  if (actor.role !== "admin" && Number(row.creator_id) !== Number(actor.userId)) {
    throw new AppError(403, "forbidden", "You can only delete your own questions.");
  }

  await pool.query("DELETE FROM questions WHERE id = $1", [questionId]);
  await deleteQuestionDocument(questionId);
}

async function listResources(pool, params) {
  const values = [];
  const where = buildResourceWhere(params.filters, values);

  const countResult = await pool.query(
    `SELECT COUNT(*)::bigint AS total FROM resources r ${where}`,
    values
  );

  const total = Number(countResult.rows[0].total);
  const offset = (params.page - 1) * params.per_page;

  const dataValues = [...values];
  dataValues.push(params.per_page);
  const limitParam = `$${dataValues.length}`;
  dataValues.push(offset);
  const offsetParam = `$${dataValues.length}`;

  const sortColumn = RESOURCE_SORT_COLUMN_MAP[params.sort_by] || RESOURCE_SORT_COLUMN_MAP.created_at;
  const sortDirection = params.sort_dir.toUpperCase() === "ASC" ? "ASC" : "DESC";

  const rows = await pool.query(
    `SELECT id, creator_id, title, body, resource_type, url, school, major, class_section, cohort, metadata, created_at, updated_at
     FROM resources r
     ${where}
     ORDER BY ${sortColumn} ${sortDirection}
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    dataValues
  );

  return {
    items: rows.rows.map(normalizeResourceRow),
    pagination: {
      page: params.page,
      per_page: params.per_page,
      total,
      total_pages: Math.max(1, Math.ceil(total / params.per_page))
    }
  };
}

async function getResourceById(pool, id) {
  const result = await pool.query(
    `SELECT id, creator_id, title, body, resource_type, url, school, major, class_section, cohort, metadata, created_at, updated_at
     FROM resources
     WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "not_found", "Resource not found.");
  }

  return normalizeResourceRow(result.rows[0]);
}

async function createResource(pool, creatorId, payload) {
  const result = await pool.query(
    `INSERT INTO resources (
      creator_id,
      title,
      body,
      resource_type,
      url,
      school,
      major,
      class_section,
      cohort,
      metadata
    )
    VALUES ($1, $2, $3, COALESCE($4, 'link'), $5, $6, $7, $8, $9, $10::jsonb)
    RETURNING id`,
    [
      creatorId,
      payload.title,
      payload.body || null,
      payload.resource_type,
      payload.url || null,
      payload.school || null,
      payload.major || null,
      payload.class_section || null,
      payload.cohort || null,
      JSON.stringify(payload.metadata || {})
    ]
  );

  return getResourceById(pool, result.rows[0].id);
}

async function patchResource(pool, resourceId, actor, payload) {
  const existing = await pool.query("SELECT id, creator_id FROM resources WHERE id = $1", [resourceId]);
  if (existing.rowCount === 0) {
    throw new AppError(404, "not_found", "Resource not found.");
  }

  const row = existing.rows[0];
  if (actor.role !== "admin" && Number(row.creator_id) !== Number(actor.userId)) {
    throw new AppError(403, "forbidden", "You can only update your own resources.");
  }

  const sets = [];
  const values = [];

  function pushSet(column, value) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }

  if (payload.title !== undefined) pushSet("title", payload.title);
  if (payload.body !== undefined) pushSet("body", payload.body);
  if (payload.resource_type !== undefined) pushSet("resource_type", payload.resource_type);
  if (payload.url !== undefined) pushSet("url", payload.url);
  if (payload.school !== undefined) pushSet("school", payload.school);
  if (payload.major !== undefined) pushSet("major", payload.major);
  if (payload.class_section !== undefined) pushSet("class_section", payload.class_section);
  if (payload.cohort !== undefined) pushSet("cohort", payload.cohort);
  if (payload.metadata !== undefined) {
    pushSet("metadata", JSON.stringify(payload.metadata));
    sets[sets.length - 1] = `metadata = $${values.length}::jsonb`;
  }

  if (sets.length > 0) {
    values.push(resourceId);
    await pool.query(
      `UPDATE resources
       SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}`,
      values
    );
  }

  return getResourceById(pool, resourceId);
}

async function deleteResource(pool, resourceId, actor) {
  const result = await pool.query("SELECT id, creator_id FROM resources WHERE id = $1", [resourceId]);
  if (result.rowCount === 0) {
    throw new AppError(404, "not_found", "Resource not found.");
  }

  const row = result.rows[0];
  if (actor.role !== "admin" && Number(row.creator_id) !== Number(actor.userId)) {
    throw new AppError(403, "forbidden", "You can only delete your own resources.");
  }

  await pool.query("DELETE FROM resources WHERE id = $1", [resourceId]);
}

async function createSavedSearch(pool, userId, payload) {
  const result = await pool.query(
    `INSERT INTO saved_searches (user_id, name, label, query_text, filters, is_frequently_used)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (user_id, name)
     DO UPDATE SET
       label = EXCLUDED.label,
       query_text = EXCLUDED.query_text,
       filters = EXCLUDED.filters,
       is_frequently_used = EXCLUDED.is_frequently_used,
       updated_at = NOW()
     RETURNING id, user_id, label, filters, is_frequently_used, created_at, updated_at`,
    [
      userId,
      payload.label,
      payload.label,
      payload.filters.filters.q || "",
      JSON.stringify(payload.filters),
      payload.is_frequently_used
    ]
  );

  return result.rows[0];
}

async function listSavedSearches(pool, userId) {
  const result = await pool.query(
    `SELECT id, user_id, COALESCE(label, name) AS label, filters, is_frequently_used, created_at, updated_at
     FROM saved_searches
     WHERE user_id = $1
     ORDER BY is_frequently_used DESC, updated_at DESC`,
    [userId]
  );
  return result.rows;
}

async function applySavedSearch(pool, userId, searchId, overrides = {}) {
  const saved = await pool.query(
    `SELECT id, COALESCE(label, name) AS label, filters, is_frequently_used
     FROM saved_searches
     WHERE id = $1 AND user_id = $2`,
    [searchId, userId]
  );

  if (saved.rowCount === 0) {
    throw new AppError(404, "not_found", "Saved search not found.");
  }

  const row = saved.rows[0];
  const parsed = {
    ...(row.filters || {})
  };

  if (overrides.page != null) parsed.page = overrides.page;
  if (overrides.per_page != null) parsed.per_page = overrides.per_page;
  if (overrides.sort_by != null) parsed.sort_by = overrides.sort_by;
  if (overrides.sort_dir != null) parsed.sort_dir = overrides.sort_dir;

  const results = await listQuestions(pool, parsed);

  return {
    saved_search: {
      id: row.id,
      label: row.label,
      is_frequently_used: row.is_frequently_used,
      filters: row.filters
    },
    ...results
  };
}

async function runAdminReindex(pool) {
  return reindexAllQuestions(pool);
}

module.exports = {
  listQuestions,
  getQuestionById,
  createQuestion,
  patchQuestion,
  deleteQuestion,
  listResources,
  getResourceById,
  createResource,
  patchResource,
  deleteResource,
  createSavedSearch,
  listSavedSearches,
  applySavedSearch,
  runAdminReindex
};
