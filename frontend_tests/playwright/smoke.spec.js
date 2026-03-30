import { test, expect } from "@playwright/test";

test("landing smoke", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page.getByRole("heading", { name: "CohortBridge" })).toBeVisible();
  await expect(page.getByRole("button", { name: "QuestionsList" })).toBeVisible();
});
