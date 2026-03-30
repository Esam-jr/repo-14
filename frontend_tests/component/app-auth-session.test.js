import { render, waitFor } from "@testing-library/svelte";
import { describe, test, expect, vi, beforeEach } from "vitest";
import App from "../../client/src/App.svelte";

const mockFetchVerifiedSession = vi.fn();

vi.mock("../../client/src/lib/api", async () => {
  const actual = await vi.importActual("../../client/src/lib/api");
  return {
    ...actual,
    getStoredToken: vi.fn(() => "forged.admin.claim.token"),
    storeToken: vi.fn(),
    clearStoredToken: vi.fn(),
    fetchVerifiedSession: (...args) => mockFetchVerifiedSession(...args)
  };
});

describe("App server-verified auth gating", () => {
  beforeEach(() => {
    mockFetchVerifiedSession.mockReset();
  });

  test("keeps privileged controls locked when /auth/me verifies non-staff user", async () => {
    mockFetchVerifiedSession.mockResolvedValueOnce({
      userId: 33,
      role: "student",
      scopes: { cohort: ["2026"] }
    });

    const { getByTestId } = render(App);

    await waitFor(() => {
      expect(getByTestId("nav-questions")).toBeEnabled();
      expect(getByTestId("nav-admin")).toBeDisabled();
      expect(getByTestId("nav-messages")).toBeDisabled();
    });
  });
});
