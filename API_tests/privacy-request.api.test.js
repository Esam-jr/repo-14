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

async function registerUser(payload) {
  const res = await request(app).post("/auth/register").send(payload);
  expect(res.status).toBe(201);
  return res.body.user;
}

async function login(email, password) {
  const res = await request(app).post("/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.access_token;
}

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://cohortbridge:cohortbridge@localhost:5432/cohortbridge";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret";
  delete process.env.PRIVACY_NOW;

  pool = createPool();
  await runMigrations(pool);
  await resetDatabase();
  fixtures = await seedDatabase(pool);
  app = createApp(pool);
});

afterAll(async () => {
  delete process.env.PRIVACY_NOW;
  if (pool) {
    await resetDatabase();
    await pool.end();
  }
});

describe("privacy request flow", () => {
  test("create request, expire approval, then approve fresh request and verify token grant", async () => {
    const stamp = Date.now();
    const alumniEmail = `privacy_alumni_${stamp}@example.com`;
    const requesterEmail = `privacy_student_${stamp}@example.com`;
    const facultyEmail = `privacy_faculty_${stamp}@example.com`;
    const password = "StrongPass123!";

    const adminToken = await login(fixtures.adminEmail, fixtures.adminPassword);

    const alumniCreate = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: alumniEmail,
        password,
        role: "alumni",
        profile: {
          display_name: "Privacy Alumni",
          phone: "(555) 999-1234",
          employer: "Confidential Corp"
        },
        scopes: { school: ["Engineering"], major: ["Computer Science"], cohort: ["2026"] }
      });
    expect(alumniCreate.status).toBe(201);
    const alumni = alumniCreate.body.user;

    const requester = await registerUser({
      email: requesterEmail,
      password,
      role: "student",
      scopes: { school: ["Engineering"], major: ["Computer Science"], cohort: ["2026"] }
    });

    const facultyCreate = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: facultyEmail,
        password,
        role: "faculty",
        scopes: { school: ["Engineering"], major: ["Computer Science"], cohort: ["2026"] }
      });
    expect(facultyCreate.status).toBe(201);

    const alumniToken = await login(alumniEmail, password);
    const requesterToken = await login(requesterEmail, password);
    const facultyToken = await login(facultyEmail, password);

    const privacySet = await request(app)
      .patch(`/users/${alumni.id}/privacy`)
      .set("Authorization", `Bearer ${alumniToken}`)
      .send({
        phone_visibility: "private",
        email_visibility: "private",
        employer_visibility: "private"
      });
    expect(privacySet.status).toBe(200);

    const created = await request(app)
      .post("/privacy_requests")
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({
        target_user_id: alumni.id,
        fields_requested: ["email", "phone"],
        reason: "Need approved alumni contact for mentorship follow-up"
      });

    expect(created.status).toBe(201);
    expect(created.body.request.id).toBeTruthy();
    expect(created.body.request.expires_at).toBeTruthy();

    const anonymousView = await request(app).get(`/users/${alumni.id}`);
    expect(anonymousView.status).toBe(200);
    expect(anonymousView.body.user.profile.email).not.toBe(alumniEmail);

    const expiredAt = new Date(created.body.request.expires_at);
    process.env.PRIVACY_NOW = new Date(expiredAt.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const expiredApprove = await request(app)
      .post(`/admin/privacy_requests/${created.body.request.id}/approve`)
      .set("Authorization", `Bearer ${facultyToken}`)
      .send({ note: "Should fail due to expiry" });

    expect(expiredApprove.status).toBe(410);

    delete process.env.PRIVACY_NOW;

    const secondRequest = await request(app)
      .post("/privacy_requests")
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({
        target_user_id: alumni.id,
        fields_requested: ["email"],
        reason: "Fresh request after expiry"
      });

    expect(secondRequest.status).toBe(201);

    const approved = await request(app)
      .post(`/admin/privacy_requests/${secondRequest.body.request.id}/approve`)
      .set("Authorization", `Bearer ${facultyToken}`)
      .send({ note: "Approved by faculty reviewer" });

    expect(approved.status).toBe(200);
    expect(approved.body.request.status).toBe("approved");
    expect(approved.body.view_token).toBeTruthy();

    const tokenCount = await pool.query(
      "SELECT COUNT(*)::int AS c FROM privacy_view_tokens WHERE request_id = $1",
      [secondRequest.body.request.id]
    );
    expect(tokenCount.rows[0].c).toBe(1);

    const requesterView = await request(app)
      .get(`/users/${alumni.id}`)
      .set("Authorization", `Bearer ${requesterToken}`);

    expect(requesterView.status).toBe(200);
    expect(requesterView.body.user.profile.email).toBe(alumniEmail);
  });
});
