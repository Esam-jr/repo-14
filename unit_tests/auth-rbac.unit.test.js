const { requireRole, hasRequiredScopes } = require("../server/src/modules/auth/middleware");

describe("RBAC middleware", () => {
  test("allows matching role", () => {
    const middleware = requireRole(["admin", "faculty"]);
    const req = { auth: { userId: 1, role: "admin", scopes: {} } };
    const next = jest.fn();

    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test("denies non-matching role", () => {
    const middleware = requireRole("admin");
    const req = { auth: { userId: 1, role: "student", scopes: {} } };
    const next = jest.fn();

    middleware(req, {}, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("forbidden");
  });

  test("checks scope constraints", () => {
    expect(
      hasRequiredScopes(
        { school: ["Engineering"], cohort: ["2026"] },
        { school: ["Engineering"], cohort: ["2026", "2027"] }
      )
    ).toBe(true);

    expect(
      hasRequiredScopes(
        { school: ["Business"], cohort: ["2025"] },
        { school: ["Engineering"] }
      )
    ).toBe(false);
  });
});
