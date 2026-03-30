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

function makeToken(role) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "1", role })).toString("base64url");
  return `${header}.${payload}.`;
}

describe("Messages role visibility", () => {
  test("shows denied state for non-staff roles", () => {
    const { getByTestId, queryByText } = render(Messages, { token: makeToken("student") });
    expect(getByTestId("messages-denied")).toBeInTheDocument();
    expect(queryByText("Send")).not.toBeInTheDocument();
  });

  test("shows compose controls for staff roles", () => {
    const { queryByTestId, getByText } = render(Messages, { token: makeToken("faculty") });
    expect(queryByTestId("messages-denied")).not.toBeInTheDocument();
    expect(getByText("Send")).toBeInTheDocument();
  });
});
