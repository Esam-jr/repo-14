function buildQuestionWhere(filters, values) {
  const clauses = [];

  if (filters.q) {
    values.push(filters.q);
    clauses.push(`to_tsvector('english', COALESCE(q.title, '') || ' ' || COALESCE(q.body, '')) @@ plainto_tsquery('english', $${values.length})`);
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

  if (filters.school) {
    values.push(filters.school);
    clauses.push(`q.school = $${values.length}`);
  }

  if (filters.major) {
    values.push(filters.major);
    clauses.push(`q.major = $${values.length}`);
  }

  if (filters.cohort) {
    values.push(filters.cohort);
    clauses.push(`q.cohort = $${values.length}`);
  }

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
