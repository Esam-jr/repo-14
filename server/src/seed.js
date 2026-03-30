const { hashPassword } = require("./modules/auth/password");

async function upsertUser(pool, input) {
  const passwordHash = await hashPassword(input.password);

  const result = await pool.query(
    `INSERT INTO users (
      email,
      password_hash,
      role,
      profile,
      scopes,
      is_public,
      visibility,
      phone_visibility,
      email_visibility,
      employer_visibility
    )
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10)
     ON CONFLICT (email)
     DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       profile = EXCLUDED.profile,
       scopes = EXCLUDED.scopes,
       is_public = EXCLUDED.is_public,
       visibility = EXCLUDED.visibility,
       phone_visibility = EXCLUDED.phone_visibility,
       email_visibility = EXCLUDED.email_visibility,
       employer_visibility = EXCLUDED.employer_visibility,
       updated_at = NOW()
     RETURNING id, email`,
    [
      input.email,
      passwordHash,
      input.role,
      JSON.stringify(input.profile || {}),
      JSON.stringify(input.scopes || {}),
      !!input.isPublic,
      input.visibility || "private",
      input.phoneVisibility || "private",
      input.emailVisibility || "private",
      input.employerVisibility || "private"
    ]
  );

  return result.rows[0];
}

async function ensureTag(pool, name) {
  const result = await pool.query(
    `INSERT INTO tags (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name]
  );
  return result.rows[0].id;
}

async function ensureKnowledgePoint(pool, code, title, description) {
  const result = await pool.query(
    `INSERT INTO knowledge_points (code, title, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (code)
     DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
     RETURNING id`,
    [code, title, description]
  );
  return result.rows[0].id;
}

async function ensureQuestion(pool, input) {
  const existing = await pool.query(
    `SELECT id FROM questions WHERE creator_id = $1 AND title = $2 LIMIT 1`,
    [input.creatorId, input.title]
  );

  if (existing.rowCount > 0) {
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
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
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    RETURNING id`,
    [
      input.title,
      input.body,
      input.questionType,
      input.difficulty,
      input.status,
      input.creatorId,
      input.school,
      input.major,
      input.classSection,
      input.cohort,
      JSON.stringify(input.metadata || {})
    ]
  );

  return inserted.rows[0].id;
}

async function seedDatabase(pool) {
  const admin = await upsertUser(pool, {
    email: "admin.fixture@cohortbridge.dev",
    password: "SeedAdmin123!",
    role: "admin",
    profile: { display_name: "Fixture Admin" },
    scopes: { school: ["Engineering"], cohort: ["2026"] },
    isPublic: true,
    visibility: "public"
  });

  const advisor = await upsertUser(pool, {
    email: "advisor.fixture@cohortbridge.dev",
    password: "SeedAdvisor123!",
    role: "faculty",
    profile: { display_name: "Fixture Advisor" },
    scopes: { school: ["Engineering"], cohort: ["2026"] },
    isPublic: true,
    visibility: "school"
  });

  const alumni = await upsertUser(pool, {
    email: "alumni.fixture@cohortbridge.dev",
    password: "SeedAlumni123!",
    role: "alumni",
    profile: {
      display_name: "Fixture Alumni",
      phone: "(555) 123-4434",
      employer: "CohortBridge Labs"
    },
    scopes: { school: ["Engineering"], major: ["Computer Science"], cohort: ["2026"] },
    isPublic: false,
    visibility: "cohort",
    phoneVisibility: "private",
    emailVisibility: "private",
    employerVisibility: "advisor_mentor"
  });

  const student = await upsertUser(pool, {
    email: "student.fixture@cohortbridge.dev",
    password: "SeedStudent123!",
    role: "student",
    profile: { display_name: "Fixture Student" },
    scopes: { school: ["Engineering"], major: ["Computer Science"], cohort: ["2026"] },
    isPublic: false,
    visibility: "cohort"
  });

  const tagSql = await ensureTag(pool, "sql");
  const tagAuth = await ensureTag(pool, "auth");

  await ensureKnowledgePoint(pool, "KP-RBAC-001", "RBAC Fundamentals", "Role and scope based authorization basics.");

  const questionId = await ensureQuestion(pool, {
    title: "How do I model role scopes for a cohort?",
    body: "Need guidance on combining role checks with cohort and major filtering.",
    questionType: "discussion",
    difficulty: "intermediate",
    status: "open",
    creatorId: student.id,
    school: "Engineering",
    major: "Computer Science",
    classSection: "A",
    cohort: "2026",
    metadata: { fixture: true, knowledge_point: "KP-RBAC-001" }
  });

  await pool.query(
    `INSERT INTO question_tags (question_id, tag_id)
     VALUES ($1, $2)
     ON CONFLICT (question_id, tag_id) DO NOTHING`,
    [questionId, tagSql]
  );

  await pool.query(
    `INSERT INTO question_tags (question_id, tag_id)
     VALUES ($1, $2)
     ON CONFLICT (question_id, tag_id) DO NOTHING`,
    [questionId, tagAuth]
  );

  await pool.query(
    `INSERT INTO resources (creator_id, title, body, resource_type, url, school, major, cohort, metadata)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM resources WHERE creator_id = $1 AND title = $2
     )`,
    [
      admin.id,
      "RBAC Design Notes",
      "A quick primer for role and scope enforcement.",
      "note",
      "https://example.com/rbac-notes",
      "Engineering",
      "Computer Science",
      "2026",
      JSON.stringify({ fixture: true, format: "markdown" })
    ]
  );

  await pool.query(
    `INSERT INTO messages (sender_id, recipient_id, question_id, body, status, metadata)
     SELECT $1, $2, $3, $4, $5, $6::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM messages
       WHERE sender_id = $1 AND recipient_id = $2 AND question_id = $3 AND body = $4
     )`,
    [admin.id, student.id, questionId, "Thanks for the question. Start with cohort-level scopes.", "sent", JSON.stringify({ fixture: true })]
  );

  await pool.query(
    `INSERT INTO notifications (user_id, type, status, title, body, metadata)
     SELECT $1, $2, $3, $4, $5, $6::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND title = $4
     )`,
    [student.id, "message", "unread", "New mentor response", "You have a response on your question.", JSON.stringify({ fixture: true })]
  );

  await pool.query(
    `INSERT INTO privacy_requests (user_id, target_user_id, request_type, status, reason, fields_requested, details, expires_at)
     SELECT $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW() + INTERVAL '14 days'
     WHERE NOT EXISTS (
       SELECT 1 FROM privacy_requests WHERE user_id = $1 AND target_user_id = $2 AND request_type = $3
     )`,
    [student.id, alumni.id, "profile_access", "pending", "Need to verify alumni contact for mentorship.", JSON.stringify(["email"]), JSON.stringify({ fixture: true })]
  );

  await pool.query(
    `INSERT INTO saved_searches (user_id, name, label, query_text, filters, is_frequently_used)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (user_id, name)
     DO UPDATE SET
       label = EXCLUDED.label,
       query_text = EXCLUDED.query_text,
       filters = EXCLUDED.filters,
       is_frequently_used = EXCLUDED.is_frequently_used,
       updated_at = NOW()`,
    [
      student.id,
      "Open CS Questions",
      "Open CS Questions",
      "rbac scope",
      JSON.stringify({
        filters: {
          status: "open",
          major: "Computer Science"
        },
        page: 1,
        per_page: 25,
        sort_by: "created_at",
        sort_dir: "desc"
      }),
      true
    ]
  );

  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata, ip_address, user_agent)
     SELECT $1, $2, $3, $4, $5::jsonb, $6, $7
     WHERE NOT EXISTS (
       SELECT 1 FROM audit_logs WHERE actor_id = $1 AND action = $2 AND target_type = $3 AND target_id = $4
     )`,
    [admin.id, "seed_run", "question", String(questionId), JSON.stringify({ fixture: true }), "127.0.0.1", "seed-script"]
  );

  return {
    adminEmail: "admin.fixture@cohortbridge.dev",
    adminPassword: "SeedAdmin123!",
    adminId: Number(admin.id),
    advisorEmail: "advisor.fixture@cohortbridge.dev",
    advisorPassword: "SeedAdvisor123!",
    advisorId: Number(advisor.id),
    alumniEmail: "alumni.fixture@cohortbridge.dev",
    alumniPassword: "SeedAlumni123!",
    studentEmail: "student.fixture@cohortbridge.dev",
    studentPassword: "SeedStudent123!",
    studentId: Number(student.id),
    alumniId: Number(alumni.id),
    questionId: Number(questionId)
  };
}

module.exports = {
  seedDatabase
};
