import { test, expect } from "@playwright/test";

test("landing smoke", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page.getByRole("heading", { name: "CohortBridge" })).toBeVisible();

  // If nav is collapsed (mobile/responsive), open it first.
  const menuToggle = page.getByRole("button", { name: "Menu" });
  if (await menuToggle.isVisible().catch(() => false)) {
    await menuToggle.click();
  }

  const questionsByTestId = page.getByTestId("nav-questions");
  if (await questionsByTestId.count()) {
    await expect(questionsByTestId).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: /Questions|QuestionsList/i })).toBeVisible();
  }

  const loginByTestId = page.getByTestId("nav-login");
  if (await loginByTestId.count()) {
    await expect(loginByTestId).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: /Login|Register/i })).toBeVisible();
  }
});
