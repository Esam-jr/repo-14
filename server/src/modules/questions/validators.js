const { AppError } = require("../../errors");

const QUESTION_SORTABLE_FIELDS = new Set(["created_at", "updated_at", "difficulty", "status", "title"]);
const RESOURCE_SORTABLE_FIELDS = new Set(["created_at", "updated_at", "title", "resource_type"]);
const SORT_DIRECTIONS = new Set(["asc", "desc"]);

function parseIntInRange(value, min, max, defaultValue, field) {
  if (value == null || value === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(400, "validation_error", `${field} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

function parseIntWithMax(value, min, max, defaultValue, field) {
  if (value == null || value === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new AppError(400, "validation_error", `${field} must be an integer greater than or equal to ${min}.`);
  }

  return Math.min(parsed, max);
}

function parseDate(value, field) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "validation_error", `${field} must be a valid ISO date.`);
  }
  return date.toISOString();
}

function sanitizeString(value, max = 255) {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AppError(400, "validation_error", "Invalid string field.");
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > max) {
    throw new AppError(400, "validation_error", `Field exceeds max length of ${max}.`);
  }

  return trimmed;
}

function sanitizeOptionalEnum(value, allowed, field) {
  if (value == null || value === "") {
    return undefined;
  }
  if (!allowed.includes(value)) {
    throw new AppError(400, "validation_error", `${field} is invalid.`);
  }
  return value;
}

function sanitizeStringArray(value, maxItemLength = 80, field = "field") {
  if (value == null || value === "") {
    return undefined;
  }

  const rawItems = Array.isArray(value)
    ? value
    : String(value).split(",");

  const normalized = rawItems
    .map((item) => sanitizeString(item, maxItemLength))
    .filter(Boolean);

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > 25) {
    throw new AppError(400, "validation_error", `${field} supports at most 25 values.`);
  }

  return Array.from(new Set(normalized));
}

function parseSort(sortByRaw, sortDirRaw, allowedSortFields) {
  const sortBy = sortByRaw ? String(sortByRaw) : "created_at";
  if (!allowedSortFields.has(sortBy)) {
    throw new AppError(400, "validation_error", "sort_by is invalid.");
  }

  const sortDir = sortDirRaw ? String(sortDirRaw).toLowerCase() : "desc";
  if (!SORT_DIRECTIONS.has(sortDir)) {
    throw new AppError(400, "validation_error", "sort_dir must be asc or desc.");
  }

  return { sort_by: sortBy, sort_dir: sortDir };
}

function parseListQuery(query) {
  const page = parseIntInRange(query.page, 1, 100000, 1, "page");
  const perPage = parseIntWithMax(query.per_page, 1, 100, 25, "per_page");
  const sort = parseSort(query.sort_by, query.sort_dir, QUESTION_SORTABLE_FIELDS);

  const creatorId = query.creator_id == null || query.creator_id === ""
    ? undefined
    : parseIntInRange(query.creator_id, 1, Number.MAX_SAFE_INTEGER, undefined, "creator_id");

  return {
    filters: {
      q: sanitizeString(query.q, 200),
      question_type: sanitizeString(query.question_type, 50),
      difficulty: sanitizeString(query.difficulty, 50),
      tag: sanitizeStringArray(query.tag, 80, "tag"),
      knowledge_point: sanitizeString(query.knowledge_point, 80),
      creator_id: creatorId,
      status: sanitizeString(query.status, 50),
      start_date: parseDate(query.start_date, "start_date"),
      end_date: parseDate(query.end_date, "end_date"),
      school: sanitizeString(query.school, 120),
      major: sanitizeString(query.major, 120),
      class_section: sanitizeString(query.class_section, 120),
      cohort: sanitizeString(query.cohort, 120)
    },
    page,
    per_page: perPage,
    ...sort
  };
}

function parseResourceListQuery(query) {
  const page = parseIntInRange(query.page, 1, 100000, 1, "page");
  const perPage = parseIntWithMax(query.per_page, 1, 100, 25, "per_page");
  const sort = parseSort(query.sort_by, query.sort_dir, RESOURCE_SORTABLE_FIELDS);

  const creatorId = query.creator_id == null || query.creator_id === ""
    ? undefined
    : parseIntInRange(query.creator_id, 1, Number.MAX_SAFE_INTEGER, undefined, "creator_id");

  return {
    filters: {
      q: sanitizeString(query.q, 200),
      resource_type: sanitizeString(query.resource_type, 50),
      creator_id: creatorId,
      start_date: parseDate(query.start_date, "start_date"),
      end_date: parseDate(query.end_date, "end_date"),
      school: sanitizeString(query.school, 120),
      major: sanitizeString(query.major, 120),
      class_section: sanitizeString(query.class_section, 120),
      cohort: sanitizeString(query.cohort, 120)
    },
    page,
    per_page: perPage,
    ...sort
  };
}

function validateQuestionPayload(body, { partial = false } = {}) {
  const payload = {
    title: sanitizeString(body.title, 250),
    body: sanitizeString(body.body, 5000),
    question_type: sanitizeString(body.question_type, 50),
    difficulty: sanitizeString(body.difficulty, 50),
    status: sanitizeOptionalEnum(body.status, ["open", "closed", "archived"], "status"),
    school: sanitizeString(body.school, 120),
    major: sanitizeString(body.major, 120),
    class_section: sanitizeString(body.class_section, 120),
    cohort: sanitizeString(body.cohort, 120),
    knowledge_point: sanitizeString(body.knowledge_point, 80),
    metadata: body.metadata == null ? undefined : body.metadata,
    tags: body.tags
  };

  if (payload.metadata != null && (typeof payload.metadata !== "object" || Array.isArray(payload.metadata))) {
    throw new AppError(400, "validation_error", "metadata must be an object.");
  }

  if (payload.tags != null) {
    if (!Array.isArray(payload.tags) || payload.tags.some((tag) => typeof tag !== "string")) {
      throw new AppError(400, "validation_error", "tags must be an array of strings.");
    }
    payload.tags = payload.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }

  if (!partial) {
    if (!payload.title) {
      throw new AppError(400, "validation_error", "title is required.");
    }
    if (!payload.body) {
      throw new AppError(400, "validation_error", "body is required.");
    }
  }

  if (partial && Object.values(payload).every((value) => value === undefined)) {
    throw new AppError(400, "validation_error", "At least one field must be provided.");
  }

  return payload;
}

function validateResourcePayload(body, { partial = false } = {}) {
  const payload = {
    title: sanitizeString(body.title, 250),
    body: sanitizeString(body.body, 5000),
    resource_type: sanitizeString(body.resource_type, 50),
    url: sanitizeString(body.url, 500),
    school: sanitizeString(body.school, 120),
    major: sanitizeString(body.major, 120),
    class_section: sanitizeString(body.class_section, 120),
    cohort: sanitizeString(body.cohort, 120),
    metadata: body.metadata == null ? undefined : body.metadata
  };

  if (payload.metadata != null && (typeof payload.metadata !== "object" || Array.isArray(payload.metadata))) {
    throw new AppError(400, "validation_error", "metadata must be an object.");
  }

  if (!partial && !payload.title) {
    throw new AppError(400, "validation_error", "title is required.");
  }

  if (partial && Object.values(payload).every((value) => value === undefined)) {
    throw new AppError(400, "validation_error", "At least one field must be provided.");
  }

  return payload;
}

function validateSavedSearchPayload(body) {
  const label = sanitizeString(body.label, 120);
  if (!label) {
    throw new AppError(400, "validation_error", "label is required.");
  }

  const isFrequentlyUsed = body.is_frequently_used === true;

  const parsedFilters = parseListQuery(body.filters || {});

  return {
    label,
    is_frequently_used: isFrequentlyUsed,
    filters: parsedFilters
  };
}

module.exports = {
  parseListQuery,
  parseResourceListQuery,
  validateQuestionPayload,
  validateResourcePayload,
  validateSavedSearchPayload
};
