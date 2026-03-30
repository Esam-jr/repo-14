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

describe("privacy and access workflow", () => {
  test("alumni can set privacy toggles", async () => {
    const alumniToken = await login(fixtures.alumniEmail, fixtures.alumniPassword);

    const res = await request(app)
      .patch(`/users/${fixtures.alumniId}/privacy`)
      .set("Authorization", `Bearer ${alumniToken}`)
      .send({
        phone_visibility: "cohort",
        email_visibility: "private",
        employer_visibility: "advisor_mentor"
      });

    expect(res.status).toBe(200);
    expect(res.body.privacy.phone_visibility).toBe("cohort");
  });

  test("request creation notifies and stores expiry", async () => {
    const studentToken = await login(fixtures.studentEmail, fixtures.studentPassword);

    const res = await request(app)
      .post("/privacy_requests")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        target_user_id: fixtures.alumniId,
        fields_requested: ["email", "phone"],
        reason: "Need alumni outreach for project matching"
      });

    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe("pending");
    expect(new Date(res.body.request.expires_at).getTime()).toBeGreaterThan(Date.now());

    const notifCount = await pool.query(
      "SELECT COUNT(*)::int AS c FROM notifications WHERE type = 'privacy_request_created'"
    );
    expect(notifCount.rows[0].c).toBeGreaterThan(0);
  });

  test("expired request cannot be approved", async () => {
    const studentToken = await login(fixtures.studentEmail, fixtures.studentPassword);
    const advisorToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);

    const created = await request(app)
      .post("/privacy_requests")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        target_user_id: fixtures.alumniId,
        fields_requested: ["email"],
        reason: "Temporal test"
      });

    expect(created.status).toBe(201);

    process.env.PRIVACY_NOW = "2099-01-01T00:00:00.000Z";

    const approve = await request(app)
      .patch(`/privacy_requests/${created.body.request.id}/approve`)
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({ note: "Too late" });

    expect([409, 410]).toContain(approve.status);

    delete process.env.PRIVACY_NOW;
  });

  test("approval grants token and unredacts allowed fields", async () => {
    const studentToken = await login(fixtures.studentEmail, fixtures.studentPassword);
    const advisorToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);

    await request(app)
      .patch(`/users/${fixtures.alumniId}/privacy`)
      .set("Authorization", `Bearer ${await login(fixtures.alumniEmail, fixtures.alumniPassword)}`)
      .send({
        phone_visibility: "private",
        email_visibility: "private",
        employer_visibility: "private"
      });

    const created = await request(app)
      .post("/privacy_requests")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        target_user_id: fixtures.alumniId,
        fields_requested: ["email", "phone"],
        reason: "Need to contact alumni for hackathon"
      });

    expect(created.status).toBe(201);

    const before = await request(app)
      .get(`/users/${fixtures.alumniId}`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(before.status).toBe(200);
    expect(before.body.user.profile.phone).toBe("(555) ***-**34");
    expect(before.body.user.profile.email).toBe("a***@cohortbridge.dev");

    const approved = await request(app)
      .patch(`/privacy_requests/${created.body.request.id}/approve`)
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({ note: "Approved for mentorship outreach" });

    expect(approved.status).toBe(200);
    expect(approved.body.request.status).toBe("approved");
    expect(approved.body.view_token).toBeTruthy();

    const tokenCount = await pool.query(
      "SELECT COUNT(*)::int AS c FROM privacy_view_tokens WHERE request_id = $1",
      [created.body.request.id]
    );
    expect(tokenCount.rows[0].c).toBe(1);

    const after = await request(app)
      .get(`/users/${fixtures.alumniId}`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(after.status).toBe(200);
    expect(after.body.user.profile.phone).toBe("(555) 123-4434");
    expect(after.body.user.profile.email).toBe(fixtures.alumniEmail);
  });

  test("denial keeps fields redacted", async () => {
    const studentToken = await login(fixtures.studentEmail, fixtures.studentPassword);
    const advisorToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);

    const created = await request(app)
      .post("/privacy_requests")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        target_user_id: fixtures.alumniId,
        fields_requested: ["employer"],
        reason: "Need background context"
      });

    expect(created.status).toBe(201);

    const denied = await request(app)
      .patch(`/privacy_requests/${created.body.request.id}/deny`)
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({ note: "Not required" });

    expect(denied.status).toBe(200);
    expect(denied.body.request.status).toBe("denied");

    const after = await request(app)
      .get(`/users/${fixtures.alumniId}`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(after.status).toBe(200);
    expect(after.body.user.profile.employer).toMatch(/\*\*\*/);
  });
});
