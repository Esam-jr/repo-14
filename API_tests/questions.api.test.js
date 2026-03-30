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

describe("questions + saved searches API", () => {
  test("supports combined filters with AND logic", async () => {
    const token = await login(fixtures.studentEmail, fixtures.studentPassword);

    const createOne = await request(app)
      .post("/questions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "RBAC for engineering cohort",
        body: "How do we enforce status and scope together?",
        question_type: "discussion",
        difficulty: "intermediate",
        status: "open",
        school: "Engineering",
        major: "Computer Science",
        cohort: "2026",
        tags: ["rbac", "sql"],
        knowledge_point: "KP-RBAC-001"
      });

    expect(createOne.status).toBe(201);

    const createTwo = await request(app)
      .post("/questions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Different question should not match",
        body: "No overlap on difficulty or tag.",
        question_type: "discussion",
        difficulty: "beginner",
        status: "open",
        school: "Engineering",
        major: "Computer Science",
        cohort: "2026",
        tags: ["other"],
        knowledge_point: "KP-OTHER"
      });

    expect(createTwo.status).toBe(201);

    const list = await request(app)
      .get("/questions")
      .query({
        q: "scope",
        difficulty: "intermediate",
        tag: "sql",
        knowledge_point: "KP-RBAC-001",
        school: "Engineering",
        cohort: "2026",
        status: "open"
      });

    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    expect(list.body.items.some((q) => q.title === "RBAC for engineering cohort")).toBe(true);
    expect(list.body.items.some((q) => q.title === "Different question should not match")).toBe(false);
  });

  test("supports sorting and per_page boundary (max 100)", async () => {
    const token = await login(fixtures.studentEmail, fixtures.studentPassword);

    const created = [];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post("/questions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: `Sort Case ${i}`,
          body: `Body ${i}`,
          difficulty: i % 2 === 0 ? "advanced" : "beginner",
          status: "open"
        });
      created.push(res.body.question.id);
    }

    const sorted = await request(app)
      .get("/questions")
      .query({
        sort_by: "title",
        sort_dir: "asc",
        per_page: 500,
        page: 1
      });

    expect(sorted.status).toBe(200);
    expect(sorted.body.pagination.per_page).toBe(100);
    expect(sorted.body.items.length).toBeGreaterThanOrEqual(3);

    const titles = sorted.body.items.map((x) => x.title);
    const sortedTitles = [...titles].sort();
    expect(titles).toEqual(sortedTitles);
  });

  test("creates, lists, and applies saved searches", async () => {
    const token = await login(fixtures.studentEmail, fixtures.studentPassword);

    const save = await request(app)
      .post("/saved_searches")
      .set("Authorization", `Bearer ${token}`)
      .send({
        label: "Engineering Open SQL",
        is_frequently_used: true,
        filters: {
          status: "open",
          school: "Engineering",
          tag: "sql",
          sort_by: "created_at",
          sort_dir: "desc",
          page: 1,
          per_page: 25
        }
      });

    expect(save.status).toBe(201);
    expect(save.body.saved_search.label).toBe("Engineering Open SQL");
    expect(save.body.saved_search.is_frequently_used).toBe(true);

    const listSaved = await request(app)
      .get("/saved_searches")
      .set("Authorization", `Bearer ${token}`);

    expect(listSaved.status).toBe(200);
    expect(listSaved.body.items.length).toBeGreaterThan(0);

    const savedId = save.body.saved_search.id;
    const apply = await request(app)
      .post(`/saved_searches/${savedId}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({ page: 1, per_page: 10 });

    expect(apply.status).toBe(200);
    expect(apply.body.saved_search.id).toBe(savedId);
    expect(apply.body.pagination.page).toBe(1);
    expect(apply.body.pagination.per_page).toBe(10);
    expect(Array.isArray(apply.body.items)).toBe(true);
  });

  test("resource API supports filtered list and CRUD ownership", async () => {
    const token = await login(fixtures.studentEmail, fixtures.studentPassword);

    const create = await request(app)
      .post("/resources")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "DB Transactions Guide",
        body: "Practical notes for transaction boundaries",
        resource_type: "note",
        school: "Engineering",
        major: "Computer Science",
        cohort: "2026",
        metadata: { level: "advanced" }
      });

    expect(create.status).toBe(201);
    const resourceId = create.body.resource.id;

    const filtered = await request(app)
      .get("/resources")
      .query({
        q: "transaction",
        resource_type: "note",
        school: "Engineering",
        cohort: "2026",
        sort_by: "title",
        sort_dir: "asc",
        page: 1,
        per_page: 25
      });

    expect(filtered.status).toBe(200);
    expect(filtered.body.items.some((r) => r.id === resourceId)).toBe(true);

    const patch = await request(app)
      .patch(`/resources/${resourceId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "DB Transactions Guide v2" });

    expect(patch.status).toBe(200);
    expect(patch.body.resource.title).toBe("DB Transactions Guide v2");
  });

  test("admin reindex endpoint is role-protected", async () => {
    const studentToken = await login(fixtures.studentEmail, fixtures.studentPassword);
    const adminToken = await login(fixtures.adminEmail, fixtures.adminPassword);

    const deny = await request(app)
      .post("/admin/reindex")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(deny.status).toBe(403);

    const allow = await request(app)
      .post("/admin/reindex")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(allow.status).toBe(200);
    expect(allow.body.ok).toBe(true);
    expect(allow.body.result).toBeDefined();
  });
});


