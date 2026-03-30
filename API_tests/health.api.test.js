const request = require("supertest");
const { createPool } = require("../server/src/db");
const { runMigrations } = require("../server/src/migrate");
const { createApp } = require("../server/src/app");

let pool;
let app;

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://cohortbridge:cohortbridge@localhost:5432/cohortbridge";
  pool = createPool();
  await runMigrations(pool);
  app = createApp(pool);
});

afterAll(async () => {
  if (pool) {
    await pool.end();
  }
});

describe("/health (API)", () => {
  test("returns ok against a real Postgres instance", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});
