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

describe("scope enforcement for /questions and /resources", () => {
  test("faculty cannot query out-of-scope questions and can query in-scope", async () => {
    const facultyToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);

    const outOfScope = await request(app)
      .get("/questions")
      .set("Authorization", `Bearer ${facultyToken}`)
      .query({ cohort: "2030" });

    expect(outOfScope.status).toBe(403);

    const inScope = await request(app)
      .get("/questions")
      .set("Authorization", `Bearer ${facultyToken}`)
      .query({ school: "Engineering", cohort: "2026" });

    expect(inScope.status).toBe(200);
    expect(Array.isArray(inScope.body.items)).toBe(true);
    expect(inScope.body.items.length).toBeGreaterThan(0);
  });

  test("faculty cannot query out-of-scope resources and can query in-scope", async () => {
    const facultyToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);

    const outOfScope = await request(app)
      .get("/resources")
      .set("Authorization", `Bearer ${facultyToken}`)
      .query({ school: "Business" });

    expect(outOfScope.status).toBe(403);

    const inScope = await request(app)
      .get("/resources")
      .set("Authorization", `Bearer ${facultyToken}`)
      .query({ school: "Engineering", cohort: "2026" });

    expect(inScope.status).toBe(200);
    expect(Array.isArray(inScope.body.items)).toBe(true);
    expect(inScope.body.items.length).toBeGreaterThan(0);
  });
});
