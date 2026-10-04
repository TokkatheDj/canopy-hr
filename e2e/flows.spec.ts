import { expect, test, type Page } from "@playwright/test";

// The flows the README said were "verified by hand", now on every push - including the
// Oct 2026 fixes: a time-off request walks the whole approval chain and the balance drops by
// exactly the hours taken, and nobody (not even the admin) is offered their own request.

async function signIn(page: Page, role: "Admin" | "Manager" | "Employee") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(role, "i") }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** A weekday about `daysAhead` days out, as yyyy-mm-dd plus how the app writes it ("Jan 5"). */
function futureWeekday(daysAhead: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return {
    iso: d.toISOString().slice(0, 10),
    label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

/** Open the request dialog, pick a policy, and read "<Policy> (<n>h available)". */
async function openRequest(page: Page, policy: string): Promise<number> {
  await page.goto("/time-off");
  await page.getByRole("button", { name: /request time off/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  const option = page.getByRole("option", { name: new RegExp(`^${policy} \\(`) });
  const text = await option.innerText();
  await option.click();
  return Number(/\(([\d.]+)h available\)/.exec(text)![1]);
}

async function submitRequest(page: Page, day: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First day").fill(day);
  await dialog.getByLabel("Last day").fill(day);
  await dialog.getByLabel("Hours per day").fill("8");
  await dialog.getByRole("button", { name: /submit request/i }).click();
  await expect(dialog).toBeHidden();
}

async function approveInInbox(page: Page, requester: string, summary: string) {
  await page.goto("/inbox");
  const row = page.locator("div", { hasText: requester }).filter({ hasText: summary }).filter({ has: page.getByRole("button", { name: "Approve" }) }).last();
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved").first()).toBeVisible();
}

test("each demo role signs in and sees its home page", async ({ page }) => {
  for (const role of ["Admin", "Manager", "Employee"] as const) {
    await signIn(page, role);
    await page.goto("/home");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/something went wrong/i);
  }
});

test("time off: employee requests, manager then HR approve, the balance drops by the hours taken", async ({ page }) => {
  const day = futureWeekday(70);
  const summary = `Vacation ${day.label} – ${day.label} (8h)`;

  await signIn(page, "Employee");
  const before = await openRequest(page, "Vacation");
  await submitRequest(page, day.iso);

  await signIn(page, "Manager");
  await approveInInbox(page, "Riley Chen", summary);   // step 1: Riley's manager
  await signIn(page, "Admin");
  await approveInInbox(page, "Riley Chen", summary);   // step 2: HR

  await signIn(page, "Employee");
  const after = await openRequest(page, "Vacation");
  expect(Math.round((before - after) * 100) / 100).toBe(8);
});

test("nobody is offered their own request - not even the admin", async ({ page }) => {
  const day = futureWeekday(80);
  const summary = `Vacation ${day.label} – ${day.label} (8h)`;
  await signIn(page, "Admin");
  await openRequest(page, "Vacation");
  await submitRequest(page, day.iso);

  await page.goto("/inbox");
  const own = page.locator("div", { hasText: "Avery Collins" }).filter({ hasText: summary });
  await expect(own.getByRole("button", { name: "Approve" })).toHaveCount(0);
});
