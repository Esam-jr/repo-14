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

describe("messaging template ownership", () => {
  test("faculty ownership is enforced and admin delegation can override", async () => {
    const facultyAToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);
    const adminToken = await login(fixtures.adminEmail, fixtures.adminPassword);

    const facultyBEmail = `faculty_b_${Date.now()}@example.com`;
    const password = "StrongPass123!";

    const facultyBCreate = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: facultyBEmail,
        password,
        role: "faculty",
        scopes: { school: ["Engineering"], cohort: ["2026"] }
      });

    expect(facultyBCreate.status).toBe(201);

    const facultyBToken = await login(facultyBEmail, password);

    const created = await request(app)
      .post("/templates")
      .set("Authorization", `Bearer ${facultyAToken}`)
      .send({
        name: "faculty-a-template",
        subject: "Subject A",
        body: "Body A",
        variables: []
      });

    expect(created.status).toBe(201);
    const templateId = created.body.template.id;

    const listForFacultyB = await request(app)
      .get("/templates")
      .set("Authorization", `Bearer ${facultyBToken}`);

    expect(listForFacultyB.status).toBe(200);
    expect(listForFacultyB.body.items.some((t) => Number(t.id) === Number(templateId))).toBe(false);

    const forbiddenUpdate = await request(app)
      .patch(`/templates/${templateId}`)
      .set("Authorization", `Bearer ${facultyBToken}`)
      .send({
        name: "faculty-b-update-attempt",
        subject: "Updated by B",
        body: "Should be forbidden",
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
        name: "admin-updated-template",
        subject: "Updated by admin",
        body: "Admin override works",
        variables: []
      });

    expect(adminUpdate.status).toBe(200);
    expect(adminUpdate.body.template.name).toBe("admin-updated-template");

    const listForAdmin = await request(app)
      .get("/templates")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listForAdmin.status).toBe(200);
    expect(listForAdmin.body.items.some((t) => Number(t.id) === Number(templateId))).toBe(true);

    const adminDelete = await request(app)
      .delete(`/templates/${templateId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(adminDelete.status).toBe(200);
    expect(adminDelete.body.ok).toBe(true);
  });
});
