const request = require("supertest");
const { createApp } = require("../server/src/app");

describe("/health (unit)", () => {
  test("returns ok when DB query succeeds", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    };
    const app = createApp(pool);

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  test("returns degraded when DB query fails", async () => {
    const pool = {
      query: jest.fn().mockRejectedValue(new Error("db down"))
    };
    const app = createApp(pool);

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "degraded", error: "database_unavailable" });
  });
});
