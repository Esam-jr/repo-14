import { test, expect } from "@playwright/test";

function makeStudentToken() {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "999", role: "student" })).toString("base64url");
  return `${header}.${payload}.`;
}

async function mockStudentSession(page) {
  await page.route("**/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: 999,
          email: "student.fixture@cohortbridge.dev",
          role: "student",
          scopes: { cohort: ["2026"], school: ["Engineering"] }
        }
      })
    });
  });
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
  await expect(page.locator('[data-testid="nav-resources"]')).toBeVisible();
  await expect(page.locator('[data-testid="nav-messages"]')).toBeVisible();
  await expect(page.locator('[data-testid="nav-admin"]')).toBeVisible();
  await expect(page.locator('[data-testid="nav-auth"]')).toBeVisible();
});

test("non-staff sees denied state on messaging route", async ({ page }) => {
  const token = makeStudentToken();
  await mockStudentSession(page);
  await page.addInitScript((value) => {
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

test("resources route renders for authenticated user", async ({ page }) => {
  const token = makeStudentToken();
  await mockStudentSession(page);
  await page.addInitScript((value) => {
    window.sessionStorage.setItem("cohortbridge_token", value);
  }, token);

  await page.goto("http://localhost:3000/#resources");
  await expect(page.getByTestId("resources-list-page")).toBeVisible();
  await expect(page.getByTestId("nav-share-resource")).toBeVisible();
  await page.goto("http://localhost:3000/#share-resource");
  await expect(page.getByTestId("share-resource-page")).toBeVisible();
});
