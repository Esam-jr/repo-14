import { test, expect } from "@playwright/test";

function makeStudentToken() {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "999", role: "student" })).toString("base64url");
  return `${header}.${payload}.`;
}

test("landing smoke", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page.getByRole("heading", { name: "CohortBridge" })).toBeVisible();

  // If nav is collapsed (mobile/responsive), open it first.
  const menuToggle = page.getByRole("button", { name: "Menu" });
  if (await menuToggle.isVisible().catch(() => false)) {
    await menuToggle.click();
  }

  await expect(page.locator('[data-testid="nav-landing"]')).toBeVisible();
  await expect(page.locator('[data-testid="nav-questions"]')).toBeVisible();
  await expect(page.locator('[data-testid="nav-messages"]')).toBeVisible();
  await expect(page.locator('[data-testid="nav-admin"]')).toBeVisible();
  await expect(page.locator('[data-testid="nav-auth"]')).toBeVisible();
});

test("non-staff sees denied state on messaging route", async ({ page }) => {
  const token = makeStudentToken();
  await page.addInitScript((value) => {
    window.localStorage.setItem("cohortbridge_token", value);
    window.sessionStorage.setItem("cohortbridge_token", value);
  }, token);

  await page.goto("http://localhost:3000/#messages");
  const deniedFromAppGuard = page.locator('[data-testid="denied-messages"]');
  const deniedFromMessagesPage = page.locator('[data-testid="messages-denied"]');

  if (await deniedFromAppGuard.count()) {
    await expect(deniedFromAppGuard).toBeVisible();
  } else {
    await expect(deniedFromMessagesPage).toBeVisible();
  }
});
