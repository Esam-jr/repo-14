const request = require("supertest");
const { createPool } = require("../server/src/db");
const { runMigrations } = require("../server/src/migrate");
const { seedDatabase } = require("../server/src/seed");
const { createApp } = require("../server/src/app");

let pool;
let app;
let fixtures;

async function resetDatabase() {
  await pool.query(`
    TRUNCATE TABLE
      export_jobs,
      cleaned_questions,
      privacy_view_tokens,
      refresh_tokens,
      question_tags,
      messages,
      notifications,
      privacy_requests,
      saved_searches,
      audit_logs,
      resources,
      questions,
      knowledge_points,
      tags,
      message_templates,
      users
    RESTART IDENTITY CASCADE
  `);
}

async function login(email, password) {
  const res = await request(app).post("/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.access_token;
}

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://cohortbridge:cohortbridge@localhost:5432/cohortbridge";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret";
  process.env.NODE_ENV = process.env.NODE_ENV || "test";

  pool = createPool();
  await runMigrations(pool);
  await resetDatabase();
  fixtures = await seedDatabase(pool);
  app = createApp(pool);
});

afterAll(async () => {
  if (pool) {
    await resetDatabase();
    await pool.end();
  }
});

describe("security regression suite", () => {
  test("anonymous registration cannot self-assign privileged role", async () => {
    const email = `regression_admin_${Date.now()}@example.com`;
    const registerRes = await request(app)
      .post("/auth/register")
      .send({
        email,
        password: "StrongPass123!",
        role: "admin"
      });

    expect([400, 403]).toContain(registerRes.status);

    const user = await pool.query("SELECT id, role FROM users WHERE email = $1", [email]);
    expect(user.rowCount).toBe(0);
  });

  test("scoped faculty cannot browse out-of-scope questions", async () => {
    const adminToken = await login(fixtures.adminEmail, fixtures.adminPassword);
    const facultyToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);

    const created = await request(app)
      .post("/questions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Regression out-of-scope",
        body: "Business cohort question",
        question_type: "discussion",
        difficulty: "beginner",
        status: "open",
        school: "Business",
        major: "Finance",
        cohort: "2030"
      });

    expect(created.status).toBe(201);

    const denied = await request(app)
      .get("/questions")
      .set("Authorization", `Bearer ${facultyToken}`)
      .query({ cohort: "2030" });

    expect(denied.status).toBe(403);
  });

  test("template ownership blocks faculty tampering but allows admin override", async () => {
    const adminToken = await login(fixtures.adminEmail, fixtures.adminPassword);
    const facultyAToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);
    const password = "StrongPass123!";
    const facultyBEmail = `regression_faculty_b_${Date.now()}@example.com`;

    const createFacultyB = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: facultyBEmail,
        password,
        role: "faculty",
        scopes: { school: ["Engineering"], cohort: ["2026"] }
      });
    expect(createFacultyB.status).toBe(201);

    const facultyBToken = await login(facultyBEmail, password);

    const template = await request(app)
      .post("/templates")
      .set("Authorization", `Bearer ${facultyAToken}`)
      .send({
        name: "regression-template-a",
        subject: "A",
        body: "A body",
        variables: []
      });
    expect(template.status).toBe(201);
    const templateId = template.body.template.id;

    const forbiddenUpdate = await request(app)
      .patch(`/templates/${templateId}`)
      .set("Authorization", `Bearer ${facultyBToken}`)
      .send({
        name: "regression-template-b",
        subject: "B",
        body: "B body",
        variables: []
      });
    expect(forbiddenUpdate.status).toBe(403);

    const forbiddenDelete = await request(app)
      .delete(`/templates/${templateId}`)
      .set("Authorization", `Bearer ${facultyBToken}`);
    expect(forbiddenDelete.status).toBe(403);

    const adminUpdate = await request(app)
      .patch(`/templates/${templateId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "regression-template-admin",
        subject: "Admin",
        body: "Admin body",
        variables: []
      });
    expect(adminUpdate.status).toBe(200);

    const adminDelete = await request(app)
      .delete(`/templates/${templateId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminDelete.status).toBe(200);
  });
});
