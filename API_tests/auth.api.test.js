const request = require("supertest");
const { createPool } = require("../server/src/db");
const { runMigrations } = require("../server/src/migrate");
const { createApp } = require("../server/src/app");

let pool;
let app;

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://cohortbridge:cohortbridge@localhost:5432/cohortbridge";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret";
  pool = createPool();
  await runMigrations(pool);
  await pool.query("DELETE FROM refresh_tokens");
  await pool.query("DELETE FROM users");
  app = createApp(pool);
});

afterAll(async () => {
  if (pool) {
    await pool.query("DELETE FROM refresh_tokens");
    await pool.query("DELETE FROM users");
    await pool.end();
  }
});

describe("auth API", () => {
  test("register and login work", async () => {
    const email = `student_${Date.now()}@example.com`;
    const password = "StrongPass123!";

    const registerRes = await request(app)
      .post("/auth/register")
      .send({
        email,
        password,
        role: "student",
        scopes: { cohort: ["2026"], school: ["Engineering"] }
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.user.email).toBe(email);

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.access_token).toBeTruthy();
    expect(loginRes.headers["set-cookie"]).toBeDefined();
  });

  test("permission-enforced endpoint blocks student and allows admin", async () => {
    const studentEmail = `student_perm_${Date.now()}@example.com`;
    const adminEmail = `admin_perm_${Date.now()}@example.com`;
    const password = "StrongPass123!";

    await request(app).post("/auth/register").send({
      email: studentEmail,
      password,
      role: "student"
    });

    await request(app).post("/auth/register").send({
      email: adminEmail,
      password,
      role: "admin"
    });

    const studentLogin = await request(app).post("/auth/login").send({
      email: studentEmail,
      password
    });

    const adminLogin = await request(app).post("/auth/login").send({
      email: adminEmail,
      password
    });

    const deny = await request(app)
      .get("/auth/admin/panel")
      .set("Authorization", `Bearer ${studentLogin.body.access_token}`);

    const allow = await request(app)
      .get("/auth/admin/panel")
      .set("Authorization", `Bearer ${adminLogin.body.access_token}`);

    expect(deny.status).toBe(403);
    expect(allow.status).toBe(200);
  });

  test("scoped permission endpoint enforces cohort scope", async () => {
    const facultyEmail = `faculty_scope_${Date.now()}@example.com`;
    const password = "StrongPass123!";

    await request(app).post("/auth/register").send({
      email: facultyEmail,
      password,
      role: "faculty",
      scopes: { cohort: ["2026"], school: ["Engineering"] }
    });

    const loginRes = await request(app).post("/auth/login").send({ email: facultyEmail, password });
    const token = loginRes.body.access_token;

    const allowed = await request(app)
      .get("/auth/cohorts/2026/resource")
      .set("Authorization", `Bearer ${token}`);

    const denied = await request(app)
      .get("/auth/cohorts/9999/resource")
      .set("Authorization", `Bearer ${token}`);

    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(403);
  });
});
