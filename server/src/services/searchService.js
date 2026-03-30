const { authWarn, authInfo } = require("../logger");

const SEARCH_ENGINE = (process.env.SEARCH_ENGINE || "postgres").toLowerCase();
const MEILI_HOST = process.env.MEILI_HOST || "http://meilisearch:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const INDEX_NAME = "questions";

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

async function timed(label, fn) {
  const start = nowMs();
  try {
    const result = await fn();
    authInfo("search_timing", { label, engine: SEARCH_ENGINE, duration_ms: nowMs() - start });
    return result;
  } catch (error) {
    authWarn("search_timing_error", { label, engine: SEARCH_ENGINE, duration_ms: nowMs() - start, error: error.message });
    throw error;
  }
}

async function meiliRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${MEILI_HOST}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(MEILI_API_KEY ? { Authorization: `Bearer ${MEILI_API_KEY}` } : {}),
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Meilisearch ${response.status}: ${body.slice(0, 200)}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureMeiliIndex() {
  await meiliRequest(`/indexes/${INDEX_NAME}`, {
    method: "PUT",
    body: JSON.stringify({ uid: INDEX_NAME, primaryKey: "id" })
  });

  await meiliRequest(`/indexes/${INDEX_NAME}/settings/filterable-attributes`, {
    method: "PUT",
    body: JSON.stringify(["creator_id", "status", "school", "major", "class_section", "cohort", "difficulty", "question_type"])
  });
}

function buildMeiliFilters(filters) {
  const clauses = [];
  const exactFields = ["question_type", "difficulty", "creator_id", "status", "school", "major", "cohort"];

  for (const field of exactFields) {
    const value = filters[field];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number") {
      clauses.push(`${field} = ${value}`);
    } else {
      const escaped = String(value).replace(/"/g, '\\"');
      clauses.push(`${field} = "${escaped}"`);
    }
  }

  return clauses.length > 0 ? clauses.join(" AND ") : undefined;
}

async function postgresKeywordIds(pool, keyword, limit = 500) {
  const result = await pool.query(
    `SELECT id
     FROM questions
     WHERE (
       search_vector @@ plainto_tsquery('english', $1)
       OR similarity(title, $1) > 0.15
       OR similarity(body, $1) > 0.15
     )
     ORDER BY ts_rank_cd(search_vector, plainto_tsquery('english', $1)) DESC, created_at DESC
     LIMIT $2`,
    [keyword, limit]
  );

  return result.rows.map((x) => Number(x.id));
}

async function resolveQuestionIds(pool, filters) {
  if (!filters.q) return null;

  if (SEARCH_ENGINE !== "meilisearch") {
    return null;
  }

  try {
    return await timed("meili_search", async () => {
      await ensureMeiliIndex();
      const payload = {
        q: filters.q,
        limit: 500,
        attributesToRetrieve: ["id"],
        filter: buildMeiliFilters(filters)
      };
      const result = await meiliRequest(`/indexes/${INDEX_NAME}/search`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return (result.hits || []).map((hit) => Number(hit.id));
    });
  } catch (error) {
    authWarn("meili_unavailable_fallback", { error: error.message });
    return timed("postgres_fallback_search", async () => postgresKeywordIds(pool, filters.q, 500));
  }
}

async function getQuestionDocument(pool, questionId) {
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
      q.created_at,
      q.updated_at,
      COALESCE(ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
    FROM questions q
    LEFT JOIN question_tags qt ON qt.question_id = q.id
    LEFT JOIN tags t ON t.id = qt.tag_id
    WHERE q.id = $1
    GROUP BY q.id`,
    [questionId]
  );

  return result.rows[0] || null;
}

async function indexQuestionDocument(pool, questionId) {
  if (SEARCH_ENGINE !== "meilisearch") return;

  try {
    const doc = await getQuestionDocument(pool, questionId);
    if (!doc) return;
    await ensureMeiliIndex();
    await timed("meili_index_question", async () => meiliRequest(`/indexes/${INDEX_NAME}/documents`, {
      method: "POST",
      body: JSON.stringify([doc])
    }));
  } catch (error) {
    authWarn("meili_index_failed", { questionId, error: error.message });
  }
}

async function deleteQuestionDocument(questionId) {
  if (SEARCH_ENGINE !== "meilisearch") return;

  try {
    await ensureMeiliIndex();
    await timed("meili_delete_question", async () => meiliRequest(`/indexes/${INDEX_NAME}/documents/${questionId}`, {
      method: "DELETE"
    }));
  } catch (error) {
    authWarn("meili_delete_failed", { questionId, error: error.message });
  }
}

async function reindexAllQuestions(pool) {
  if (SEARCH_ENGINE !== "meilisearch") {
    return { engine: SEARCH_ENGINE, indexed: 0, skipped: true };
  }

  await ensureMeiliIndex();

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
      q.created_at,
      q.updated_at,
      COALESCE(ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
    FROM questions q
    LEFT JOIN question_tags qt ON qt.question_id = q.id
    LEFT JOIN tags t ON t.id = qt.tag_id
    GROUP BY q.id
    ORDER BY q.id ASC`
  );

  await timed("meili_reindex_all", async () => meiliRequest(`/indexes/${INDEX_NAME}/documents`, {
    method: "POST",
    body: JSON.stringify(rows.rows)
  }));

  return { engine: SEARCH_ENGINE, indexed: rows.rowCount, skipped: false };
}

function getSearchEngine() {
  return SEARCH_ENGINE === "meilisearch" ? "meilisearch" : "postgres";
}

module.exports = {
  getSearchEngine,
  resolveQuestionIds,
  indexQuestionDocument,
  deleteQuestionDocument,
  reindexAllQuestions
};
