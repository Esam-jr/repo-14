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

describe("messaging and notifications", () => {
  test("template rendering substitutes variables server-side", async () => {
    const advisorToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);

    const template = await request(app)
      .post("/templates")
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({
        name: "cohort-deadline",
        subject: "Deadline for {{cohort}}",
        body: "Submit by {{deadline}}",
        variables: ["cohort", "deadline"]
      });

    expect(template.status).toBe(201);

    const send = await request(app)
      .post("/messages/send")
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({
        recipient_selector: { user_ids: [fixtures.studentId] },
        template_id: template.body.template.id,
        variables: {
          cohort: "2026",
          deadline: "May 12"
        },
        is_critical: false
      });

    expect(send.status).toBe(201);
    expect(send.body.message.subject).toBe("Deadline for 2026");
    expect(send.body.message.body).toBe("Submit by May 12");
  });

  test("group targeting resolves recipients by scope", async () => {
    const advisorToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);

    const send = await request(app)
      .post("/messages/send")
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({
        recipient_selector: {
          scope: {
            school: ["Engineering"],
            cohort: ["2026"]
          }
        },
        subject: "Engineering cohort update",
        body: "Please check your dashboard.",
        is_critical: false
      });

    expect(send.status).toBe(201);
    expect(send.body.recipient_count).toBeGreaterThan(0);
    expect(send.body.recipient_ids).toContain(fixtures.studentId);
  });

  test("read/unread toggles work", async () => {
    const advisorToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);
    const studentToken = await login(fixtures.studentEmail, fixtures.studentPassword);

    const send = await request(app)
      .post("/messages/send")
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({
        recipient_selector: { user_ids: [fixtures.studentId] },
        subject: "Read toggle test",
        body: "Mark me read/unread",
        is_critical: false
      });

    expect(send.status).toBe(201);

    const listInitial = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${studentToken}`)
      .query({ read: "false" });

    expect(listInitial.status).toBe(200);
    expect(listInitial.body.items.length).toBeGreaterThan(0);

    const target = listInitial.body.items.find((n) => n.subject === "Read toggle test");
    expect(target).toBeTruthy();

    const markRead = await request(app)
      .patch(`/notifications/${target.id}/read`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ is_read: true });

    expect(markRead.status).toBe(200);
    expect(markRead.body.notification.is_read).toBe(true);

    const unreadAfter = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${studentToken}`)
      .query({ read: "false" });

    expect(unreadAfter.status).toBe(200);
    expect(unreadAfter.body.items.some((x) => x.id === target.id)).toBe(false);
  });

  test("muted notifications are hidden unless critical", async () => {
    const advisorToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);
    const studentToken = await login(fixtures.studentEmail, fixtures.studentPassword);

    const nonCritical = await request(app)
      .post("/messages/send")
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({
        recipient_selector: { user_ids: [fixtures.studentId] },
        subject: "Mute me",
        body: "Non critical",
        is_critical: false
      });

    expect(nonCritical.status).toBe(201);

    const notifList = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${studentToken}`);

    const toMute = notifList.body.items.find((x) => x.subject === "Mute me");
    expect(toMute).toBeTruthy();

    const mute = await request(app)
      .patch(`/notifications/${toMute.id}/mute`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({});

    expect(mute.status).toBe(200);
    expect(mute.body.notification.muted_until).toBeTruthy();

    const afterMute = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(afterMute.status).toBe(200);
    expect(afterMute.body.items.some((x) => x.id === toMute.id)).toBe(false);

    const critical = await request(app)
      .post("/messages/send")
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({
        recipient_selector: { user_ids: [fixtures.studentId] },
        subject: "Critical notice",
        body: "This must still appear",
        is_critical: true
      });

    expect(critical.status).toBe(201);

    const criticalList = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(criticalList.status).toBe(200);
    expect(criticalList.body.items.some((x) => x.subject === "Critical notice")).toBe(true);
  });
});
