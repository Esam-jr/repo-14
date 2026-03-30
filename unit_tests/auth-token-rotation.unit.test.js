jest.mock("../server/src/logger", () => ({
  authInfo: jest.fn(),
  authWarn: jest.fn()
}));

const {
  refresh
} = require("../server/src/modules/auth/service");
const token = require("../server/src/modules/auth/token");
const repo = require("../server/src/modules/auth/repository");

jest.mock("../server/src/modules/auth/token");
jest.mock("../server/src/modules/auth/repository");

describe("token rotation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rotates refresh token and revokes previous token", async () => {
    token.verifyRefreshToken.mockReturnValue({ sub: "7", jti: "old-jti" });
    repo.findRefreshToken.mockResolvedValue({
      jti: "old-jti",
      user_id: 7,
      token_hash: "old-hash",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null
    });
    token.hashToken.mockImplementation((value) => (value === "refresh-token" ? "old-hash" : "new-hash"));
    repo.findUserById.mockResolvedValue({
      id: 7,
      email: "a@example.com",
      role: "student",
      scopes: { cohort: ["2026"] },
      profile: {},
      is_frozen: false
    });
    token.issueRefreshToken.mockReturnValue({
      token: "new-refresh-token",
      jti: "new-jti",
      expiresAt: new Date(Date.now() + 86_400_000)
    });
    token.issueAccessToken.mockReturnValue({ token: "new-access-token", expiresIn: 900 });
    repo.insertRefreshToken.mockResolvedValue();
    repo.revokeRefreshToken.mockResolvedValue();

    const result = await refresh({}, "refresh-token");

    expect(repo.insertRefreshToken).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ jti: "new-jti", userId: 7 })
    );
    expect(repo.revokeRefreshToken).toHaveBeenCalledWith({}, "old-jti", "new-jti");
    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBe("new-refresh-token");
  });
});
