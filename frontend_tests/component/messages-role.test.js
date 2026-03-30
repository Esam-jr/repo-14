import { render } from "@testing-library/svelte";
import { describe, test, expect, vi } from "vitest";
import Messages from "../../client/src/pages/Messages.svelte";

vi.mock("../../client/src/lib/api", async () => {
  const actual = await vi.importActual("../../client/src/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async () => ({ items: [] }))
  };
});

describe("Messages role visibility", () => {
  test("shows denied state for non-staff roles", () => {
    const { getByTestId, queryByText } = render(Messages, {
      token: "token",
      auth: { userId: 1, role: "student", scopes: {} }
    });
    expect(getByTestId("messages-denied")).toBeInTheDocument();
    expect(queryByText("Send")).not.toBeInTheDocument();
  });

  test("shows compose controls for staff roles", () => {
    const { queryByTestId, getByText } = render(Messages, {
      token: "token",
      auth: { userId: 2, role: "faculty", scopes: {} }
    });
    expect(queryByTestId("messages-denied")).not.toBeInTheDocument();
    expect(getByText("Send")).toBeInTheDocument();
  });
});
