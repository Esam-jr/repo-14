import { render, fireEvent } from "@testing-library/svelte";
import { describe, test, expect, vi } from "vitest";
import ResourcesList from "../../client/src/pages/ResourcesList.svelte";

vi.mock("../../client/src/lib/api", async () => {
  const actual = await vi.importActual("../../client/src/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async () => ({
      items: [
        {
          id: 101,
          title: "Employer networking checklist",
          body: "Use informational interviews and maintain alumni follow-up cadence.",
          resource_type: "employer_tip",
          cohort: "2026",
          created_at: "2026-03-30T00:00:00.000Z"
        }
      ],
      pagination: { page: 1, per_page: 25, total: 1, total_pages: 1 }
    }))
  };
});

describe("ResourcesList component", () => {
  test("renders apply and reset controls", () => {
    const { getByText } = render(ResourcesList, { token: "" });
    expect(getByText("Apply")).toBeInTheDocument();
    expect(getByText("Reset")).toBeInTheDocument();
  });

  test("allows resetting keyword filter", async () => {
    const { getByPlaceholderText, getByText } = render(ResourcesList, { token: "" });
    const keywordInput = getByPlaceholderText("Keyword");
    await fireEvent.input(keywordInput, { target: { value: "reflection" } });
    expect(keywordInput.value).toBe("reflection");

    await fireEvent.click(getByText("Reset"));
    expect(keywordInput.value).toBe("");
  });
});
