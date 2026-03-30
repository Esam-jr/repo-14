const { Pool } = require("pg");

const DEFAULT_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.ETL_SIMILARITY_THRESHOLD || "0.78"
);

const TAG_SYNONYMS = new Map([
  ["machine learning", "ml"],
  ["machine-learning", "ml"],
  ["ai", "ml"],
  ["artificial intelligence", "ml"],
  ["careers", "career"],
  ["career prep", "career"],
  ["career-prep", "career"],
  ["soft skills", "soft-skills"],
  ["soft-skills", "soft-skills"],
  ["web dev", "web-development"],
  ["webdev", "web-development"]
]);

const KNOWLEDGE_POINT_RULES = [
  { code: "sql", regex: /\bsql|postgres|database|query\b/i },
  { code: "javascript", regex: /\bjavascript|node|express|svelte|vite\b/i },
  { code: "python", regex: /\bpython|pandas|numpy\b/i },
  { code: "career-readiness", regex: /\bresume|cv|interview|internship|career\b/i },
  { code: "data-science", regex: /\bdata science|analytics|model\b/i }
];

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeTag(rawTag) {
  const compact = normalizeText(rawTag).toLowerCase();
  if (!compact) {
    return null;
  }

  const mapped = TAG_SYNONYMS.get(compact) || compact;
  return mapped.replace(/\s+/g, "-");
}

function normalizeTags(tags) {
  const unique = new Set();
  for (const tag of tags || []) {
    const normalized = normalizeTag(tag);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

function inferKnowledgePoints(text) {
  const source = normalizeText(text);
  const inferred = [];

  for (const rule of KNOWLEDGE_POINT_RULES) {
    if (rule.regex.test(source)) {
      inferred.push(rule.code);
    }
  }

  return inferred;
}

function pickDuplicateCandidate(candidates, threshold) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((a, b) => Number(b.score) - Number(a.score));
  const best = sorted[0];
  if (Number(best.score) < threshold) {
    return null;
  }
  return best;
}

function parseTagsFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const raw = metadata.tags;
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    return raw.split(",").map((part) => part.trim());
  }
  return [];
}

async function fetchSourceRecords(client) {
  const questionsResult = await client.query(
    `
      SELECT
        q.id,
        q.title,
        q.body,
        q.metadata,
        COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tag_names
      FROM questions q
      LEFT JOIN question_tags qt ON qt.question_id = q.id
      LEFT JOIN tags t ON t.id = qt.tag_id
      GROUP BY q.id
      ORDER BY q.id ASC
    `
  );

  const resourcesResult = await client.query(
    `
      SELECT
        r.id,
        r.title,
        COALESCE(r.body, '') AS body,
        r.metadata
      FROM resources r
      ORDER BY r.id ASC
    `
  );

  const questionRecords = questionsResult.rows.map((row) => ({
    sourceType: "question",
    sourceId: Number(row.id),
    title: row.title,
    body: row.body,
    tags: row.tag_names || [],
    metadata: row.metadata || {}
  }));

  const resourceRecords = resourcesResult.rows.map((row) => ({
    sourceType: "resource",
    sourceId: Number(row.id),
    title: row.title,
    body: row.body,
    tags: parseTagsFromMetadata(row.metadata),
    metadata: row.metadata || {}
  }));

  return [...questionRecords, ...resourceRecords];
}

async function lookupDuplicateCandidate(client, cleanedRecord, threshold) {
  const combined = normalizeText(`${cleanedRecord.cleanedTitle} ${cleanedRecord.cleanedBody}`);

  const result = await client.query(
    `
      SELECT
        source_type,
        source_id,
        GREATEST(
          similarity($1, COALESCE(cleaned_title, '')),
          similarity($2, COALESCE(cleaned_body, '')),
          similarity($3, COALESCE(cleaned_title, '') || ' ' || COALESCE(cleaned_body, ''))
        ) AS score
      FROM cleaned_questions
      WHERE duplicate_of_source_id IS NULL
        AND NOT (source_type = $4 AND source_id = $5)
      ORDER BY score DESC
      LIMIT 5
    `,
    [
      cleanedRecord.cleanedTitle,
      cleanedRecord.cleanedBody,
      combined,
      cleanedRecord.sourceType,
      cleanedRecord.sourceId
    ]
  );

  const best = pickDuplicateCandidate(result.rows, threshold);
  if (!best) {
    return null;
  }

  return {
    duplicateOfSourceType: best.source_type,
    duplicateOfSourceId: Number(best.source_id),
    similarityScore: Number(best.score)
  };
}

async function upsertCleanedQuestion(client, payload) {
  await client.query(
    `
      INSERT INTO cleaned_questions (
        source_type,
        source_id,
        original_title,
        original_body,
        cleaned_title,
        cleaned_body,
        normalized_tags,
        inferred_knowledge_points,
        duplicate_of_source_type,
        duplicate_of_source_id,
        similarity_score,
        metadata,
        cleaned_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::jsonb, NOW(), NOW()
      )
      ON CONFLICT (source_type, source_id)
      DO UPDATE SET
        original_title = EXCLUDED.original_title,
        original_body = EXCLUDED.original_body,
        cleaned_title = EXCLUDED.cleaned_title,
        cleaned_body = EXCLUDED.cleaned_body,
        normalized_tags = EXCLUDED.normalized_tags,
        inferred_knowledge_points = EXCLUDED.inferred_knowledge_points,
        duplicate_of_source_type = EXCLUDED.duplicate_of_source_type,
        duplicate_of_source_id = EXCLUDED.duplicate_of_source_id,
        similarity_score = EXCLUDED.similarity_score,
        metadata = EXCLUDED.metadata,
        cleaned_at = NOW(),
        updated_at = NOW()
    `,
    [
      payload.sourceType,
      payload.sourceId,
      payload.originalTitle,
      payload.originalBody,
      payload.cleanedTitle,
      payload.cleanedBody,
      JSON.stringify(payload.normalizedTags),
      JSON.stringify(payload.knowledgePoints),
      payload.duplicateOfSourceType,
      payload.duplicateOfSourceId,
      payload.similarityScore,
      JSON.stringify(payload.metadata || {})
    ]
  );
}

async function insertAuditLog(client, action, metadata) {
  await client.query(
    `
      INSERT INTO audit_logs (action, target_type, target_id, metadata)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      action,
      "etl",
      metadata?.targetId ? String(metadata.targetId) : null,
      JSON.stringify(metadata || {})
    ]
  );
}

function logJson(level, event, details) {
  const payload = {
    level,
    event,
    time: new Date().toISOString(),
    ...details
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

async function runEtl(options = {}) {
  const threshold =
    Number.isFinite(options.similarityThreshold) && options.similarityThreshold > 0
      ? options.similarityThreshold
      : DEFAULT_SIMILARITY_THRESHOLD;
  const dryRun = Boolean(options.dryRun);
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for ETL");
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  const summary = {
    processed: 0,
    deduplicated: 0,
    threshold
  };

  try {
    await client.query("BEGIN");
    const records = await fetchSourceRecords(client);

    for (const record of records) {
      const cleanedTitle = normalizeText(record.title);
      const cleanedBody = normalizeText(record.body);
      const normalizedTags = normalizeTags([
        ...(record.tags || []),
        ...parseTagsFromMetadata(record.metadata)
      ]);
      const knowledgePoints = inferKnowledgePoints(
        [cleanedTitle, cleanedBody, normalizedTags.join(" ")].join(" ")
      );

      const duplicate = await lookupDuplicateCandidate(
        client,
        {
          sourceType: record.sourceType,
          sourceId: record.sourceId,
          cleanedTitle,
          cleanedBody
        },
        threshold
      );

      if (duplicate) {
        summary.deduplicated += 1;
      }

      if (!dryRun) {
        await upsertCleanedQuestion(client, {
          sourceType: record.sourceType,
          sourceId: record.sourceId,
          originalTitle: record.title,
          originalBody: record.body,
          cleanedTitle,
          cleanedBody,
          normalizedTags,
          knowledgePoints,
          duplicateOfSourceType: duplicate ? duplicate.duplicateOfSourceType : null,
          duplicateOfSourceId: duplicate ? duplicate.duplicateOfSourceId : null,
          similarityScore: duplicate ? duplicate.similarityScore : null,
          metadata: record.metadata || {}
        });

        await insertAuditLog(client, "etl_cleanse_record", {
          targetId: `${record.sourceType}:${record.sourceId}`,
          source_type: record.sourceType,
          source_id: record.sourceId,
          is_duplicate: Boolean(duplicate),
          duplicate_of: duplicate
            ? `${duplicate.duplicateOfSourceType}:${duplicate.duplicateOfSourceId}`
            : null
        });
      }

      summary.processed += 1;
    }

    if (!dryRun) {
      await insertAuditLog(client, "etl_cleanse_completed", {
        processed: summary.processed,
        deduplicated: summary.deduplicated,
        threshold
      });
    }

    await client.query("COMMIT");
    logJson("info", "etl_completed", summary);
    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    logJson("error", "etl_failed", { message: error.message });
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runEtl().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  runEtl,
  normalizeTag,
  normalizeTags,
  inferKnowledgePoints,
  pickDuplicateCandidate
};
