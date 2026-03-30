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

describe("admin APIs and scope-safe exports", () => {
  test("admin can create, update, and freeze users", async () => {
    const adminToken = await login(fixtures.adminEmail, fixtures.adminPassword);
    const email = `managed_${Date.now()}@example.com`;
    const password = "ManagedPass123!";

    const created = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email,
        password,
        role: "mentor",
        scopes: { school: ["Engineering"], cohort: ["2026"] }
      });

    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe("mentor");

    const updated = await request(app)
      .put("/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        id: created.body.user.id,
        role: "faculty"
      });

    expect(updated.status).toBe(200);
    expect(updated.body.user.role).toBe("faculty");

    const frozen = await request(app)
      .post(`/admin/users/${created.body.user.id}/freeze`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_frozen: true });

    expect(frozen.status).toBe(200);
    expect(frozen.body.user.is_frozen).toBe(true);

    const blockedLogin = await request(app)
      .post("/auth/login")
      .send({ email, password });

    expect(blockedLogin.status).toBe(403);
    expect(blockedLogin.body.error.code).toBe("account_frozen");
  });

  test("admin can approve privacy requests through admin endpoint", async () => {
    const studentToken = await login(fixtures.studentEmail, fixtures.studentPassword);
    const adminToken = await login(fixtures.adminEmail, fixtures.adminPassword);

    const created = await request(app)
      .post("/privacy_requests")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        target_user_id: fixtures.alumniId,
        fields_requested: ["email"],
        reason: "Need alumni contact for mentorship handoff"
      });

    expect(created.status).toBe(201);

    const approved = await request(app)
      .post(`/admin/privacy_requests/${created.body.request.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ note: "Approved from admin panel" });

    expect(approved.status).toBe(200);
    expect(approved.body.request.status).toBe("approved");
    expect(approved.body.view_token).toBeTruthy();
  });

  test("scope-limited exports prevent data leakage", async () => {
    const outOfScopeEmail = `out_scope_${Date.now()}@example.com`;

    await request(app).post("/auth/register").send({
      email: outOfScopeEmail,
      password: "StrongPass123!",
      role: "student",
      scopes: { school: ["Business"], cohort: ["2030"] }
    });

    const facultyToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);
    const studentToken = await login(fixtures.studentEmail, fixtures.studentPassword);
    const adminToken = await login(fixtures.adminEmail, fixtures.adminPassword);

    const forbidden = await request(app)
      .post("/admin/exports")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ export_type: "users", filters: {} });
    expect(forbidden.status).toBe(403);

    const facultyExport = await request(app)
      .post("/admin/exports")
      .set("Authorization", `Bearer ${facultyToken}`)
      .send({ export_type: "users", filters: {} });

    expect(facultyExport.status).toBe(201);
    expect(facultyExport.body.export.row_count).toBeGreaterThan(0);

    const facultyDownload = await request(app)
      .get(facultyExport.body.export.download_url)
      .set("Authorization", `Bearer ${facultyToken}`);

    expect(facultyDownload.status).toBe(200);
    expect(facultyDownload.text).toContain(fixtures.studentEmail);
    expect(facultyDownload.text).not.toContain(outOfScopeEmail);

    const adminExport = await request(app)
      .post("/admin/exports")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ export_type: "users", filters: {} });

    const adminDownload = await request(app)
      .get(adminExport.body.export.download_url)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(adminDownload.status).toBe(200);
    expect(adminDownload.text).toContain(outOfScopeEmail);
  });
});
