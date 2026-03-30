function buildQuestionWhere(filters, values, options = {}) {
  const clauses = [];
  function pushScopeClause(column, filterValue) {
    if (filterValue == null) {
      return;
    }

    if (Array.isArray(filterValue)) {
      if (filterValue.length === 0) {
        clauses.push("FALSE");
        return;
      }
      values.push(filterValue);
      clauses.push(`${column} = ANY($${values.length}::text[])`);
      return;
    }

    values.push(filterValue);
    clauses.push(`${column} = $${values.length}`);
  }

  if (filters.q) {
    if (options.searchIds) {
      if (options.searchIds.length === 0) {
        clauses.push("FALSE");
      } else {
        values.push(options.searchIds);
        clauses.push(`q.id = ANY($${values.length}::bigint[])`);
      }
    } else {
      values.push(filters.q);
      const idx = values.length;
      clauses.push(`(
        q.search_vector @@ plainto_tsquery('english', $${idx})
        OR similarity(q.title, $${idx}) > 0.15
        OR similarity(q.body, $${idx}) > 0.15
      )`);
    }
  }

  if (filters.question_type) {
    values.push(filters.question_type);
    clauses.push(`q.question_type = $${values.length}`);
  }

  if (filters.difficulty) {
    values.push(filters.difficulty);
    clauses.push(`q.difficulty = $${values.length}`);
  }

  if (filters.creator_id) {
    values.push(filters.creator_id);
    clauses.push(`q.creator_id = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`q.status = $${values.length}`);
  }

  if (filters.start_date) {
    values.push(filters.start_date);
    clauses.push(`q.created_at >= $${values.length}`);
  }

  if (filters.end_date) {
    values.push(filters.end_date);
    clauses.push(`q.created_at <= $${values.length}`);
  }

  pushScopeClause("q.school", filters.school);
  pushScopeClause("q.major", filters.major);
  pushScopeClause("q.class_section", filters.class_section);
  pushScopeClause("q.cohort", filters.cohort);

  if (filters.tag) {
    values.push(filters.tag);
    clauses.push(`EXISTS (
      SELECT 1
      FROM question_tags qt2
      JOIN tags t2 ON t2.id = qt2.tag_id
      WHERE qt2.question_id = q.id AND t2.name = $${values.length}
    )`);
  }

  if (filters.knowledge_point) {
    values.push(filters.knowledge_point);
    clauses.push(`q.metadata->>'knowledge_point' = $${values.length}`);
  }

  if (clauses.length === 0) {
    return "";
  }

  return `WHERE ${clauses.join(" AND ")}`;
}

module.exports = {
  buildQuestionWhere
};
