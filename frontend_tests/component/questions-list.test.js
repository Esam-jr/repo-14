import { render, fireEvent } from "@testing-library/svelte";
import { describe, test, expect } from "vitest";
import QuestionsList from "../../client/src/pages/QuestionsList.svelte";

describe("QuestionsList component", () => {
  test("renders Apply and Reset controls", async () => {
    const { getByText } = render(QuestionsList, { token: "" });

    expect(getByText("Apply")).toBeInTheDocument();
    expect(getByText("Reset")).toBeInTheDocument();
  });

  test("allows resetting filters", async () => {
    const { getByPlaceholderText, getByText } = render(QuestionsList, { token: "" });

    const keywordInput = getByPlaceholderText("Keyword");
    await fireEvent.input(keywordInput, { target: { value: "rbac" } });
    expect(keywordInput.value).toBe("rbac");

    await fireEvent.click(getByText("Reset"));
    expect(keywordInput.value).toBe("");
  });
});
