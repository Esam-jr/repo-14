jest.mock("../server/src/logger", () => ({
  authInfo: jest.fn(),
  authWarn: jest.fn()
}));

jest.mock("../server/src/modules/auth/password", () => ({
  hashPassword: jest.fn(async () => "hashed-password"),
  verifyPassword: jest.fn(async () => true)
}));

jest.mock("../server/src/modules/auth/token", () => ({
  hashToken: jest.fn(() => "hashed-token"),
  issueAccessToken: jest.fn(() => ({ token: "access-token", expiresIn: 900 })),
  issueRefreshToken: jest.fn(() => ({
    token: "refresh-token",
    jti: "refresh-jti",
    expiresAt: new Date(Date.now() + 86400000)
  })),
  verifyRefreshToken: jest.fn(() => ({ sub: "1", jti: "refresh-jti" }))
}));

jest.mock("../server/src/modules/auth/repository", () => ({
  createUser: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  insertRefreshToken: jest.fn(async () => {}),
  findRefreshToken: jest.fn(),
  revokeRefreshToken: jest.fn(async () => {}),
  revokeAllRefreshTokensForUser: jest.fn(async () => {})
}));

const { authInfo, authWarn } = require("../server/src/logger");
const repository = require("../server/src/modules/auth/repository");
const { register, login } = require("../server/src/modules/auth/service");

describe("auth logging PII redaction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("register logs masked/hash email without raw email", async () => {
    const email = "student.logging@example.com";
    repository.createUser.mockResolvedValueOnce({
      id: 11,
      email,
      role: "student",
      profile: {},
      scopes: {},
      is_frozen: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await register({}, { email, password: "StrongPass123!", role: "student", profile: {}, scopes: {} });

    expect(authInfo).toHaveBeenCalled();
    const meta = authInfo.mock.calls[0][1];
    expect(meta.email).toBeUndefined();
    expect(meta.email_hash).toBeTruthy();
    expect(meta.email_hint).toBe("s***@example.com");
    expect(JSON.stringify(meta)).not.toContain(email);
  });

  test("login failure logs no raw email", async () => {
    const email = "missing.user@example.com";
    repository.findUserByEmail.mockResolvedValueOnce(null);

    await expect(login({}, email, "StrongPass123!")).rejects.toMatchObject({
      statusCode: 401,
      code: "invalid_credentials"
    });

    expect(authWarn).toHaveBeenCalled();
    const meta = authWarn.mock.calls[0][1];
    expect(meta.email).toBeUndefined();
    expect(meta.email_hash).toBeTruthy();
    expect(meta.email_hint).toBe("m***@example.com");
    expect(JSON.stringify(meta)).not.toContain(email);
  });
});
