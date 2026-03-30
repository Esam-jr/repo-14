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

describe("auth role lockdown", () => {
  test("public register cannot self-assign admin role", async () => {
    const email = `lockdown_admin_${Date.now()}@example.com`;
    const password = "StrongPass123!";

    const registerRes = await request(app)
      .post("/auth/register")
      .send({
        email,
        password,
        role: "admin"
      });

    expect([400, 403]).toContain(registerRes.status);

    const userQuery = await pool.query(
      "SELECT id, role FROM users WHERE email = $1",
      [email]
    );
    expect(userQuery.rowCount).toBe(0);
  });

  test("admin can create another admin via /admin/users", async () => {
    const adminToken = await login(fixtures.adminEmail, fixtures.adminPassword);
    const email = `created_admin_${Date.now()}@example.com`;
    const password = "StrongPass123!";

    const createRes = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email,
        password,
        role: "admin",
        scopes: { school: ["Engineering"], cohort: ["2026"] }
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.user.role).toBe("admin");
    expect(createRes.body.user.email).toBe(email);
  });
});
