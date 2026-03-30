const { hashPassword, verifyPassword } = require("../server/src/modules/auth/password");

describe("password hashing", () => {
  test("hashes and verifies passwords", async () => {
    const password = "StrongPass123!";
    const hash = await hashPassword(password);

    expect(hash).not.toEqual(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});
