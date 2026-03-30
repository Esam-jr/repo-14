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

describe("messaging persistence", () => {
  test("group send persists per-recipient messages and audit traceability", async () => {
    const advisorToken = await login(fixtures.advisorEmail, fixtures.advisorPassword);
    const subject = `Persistence broadcast ${Date.now()}`;

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
        subject,
        body: "Testing per-recipient persistence.",
        is_critical: false
      });

    expect(send.status).toBe(201);
    expect(send.body.recipient_count).toBeGreaterThan(1);
    expect(Array.isArray(send.body.messages)).toBe(true);
    expect(send.body.messages.length).toBe(send.body.recipient_count);

    const messageRows = await pool.query(
      `SELECT id, recipient_id
       FROM messages
       WHERE subject = $1
       ORDER BY id ASC`,
      [subject]
    );
    expect(messageRows.rowCount).toBe(send.body.recipient_count);

    const notificationRows = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM notifications n
       JOIN messages m ON m.id = n.message_id
       WHERE m.subject = $1`,
      [subject]
    );
    expect(notificationRows.rows[0].c).toBe(send.body.recipient_count);

    const audit = await pool.query(
      `SELECT action, target_type, metadata
       FROM audit_logs
       WHERE action = 'message_sent'
       ORDER BY created_at DESC
       LIMIT 1`
    );

    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].target_type).toBe("message_batch");
    expect(Array.isArray(audit.rows[0].metadata.recipients)).toBe(true);
    expect(audit.rows[0].metadata.recipients.length).toBe(send.body.recipient_count);
  });
});
