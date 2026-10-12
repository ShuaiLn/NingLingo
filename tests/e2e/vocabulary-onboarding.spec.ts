import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const key = "ninglingo:development:v1";
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({
      schemaVersion: 1,
      profile: { id: "new-personal-user", email: "new@ninglingo.local", displayName: "Ning", timezone: "America/Tijuana", createdAt: "2026-01-01T00:00:00.000Z" },
      lists: [], entries: [], wordProgress: [], sessions: [], readings: [], readingVersions: [], annotations: [], cache: [], grammarProgress: [], activity: [],
    }));
  });
});

test("a new workspace can save its first word and list, then reuse that list", async ({ page }) => {
  await page.goto("/es/vocabulary");
  await expect(page.getByRole("button", { name: "+ Add word", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Import CSV", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "+ Add word", exact: true }).click();
  await page.getByLabel("Word *", { exact: true }).fill("hola");
  await page.getByLabel("English meaning *", { exact: true }).fill("hello");
  await page.getByLabel("First list name").fill("Spanish notes");
  await page.getByRole("button", { name: "Save word", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Word added.");
  await expect(page.locator(".vocabulary-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".vocabulary-table tbody tr")).toContainText("Spanish notes");
  await expect(page.getByRole("button", { name: "Import CSV", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "+ Add word", exact: true }).click();
  await expect(page.getByLabel("First list name")).toHaveCount(0);
  await page.getByLabel("Word *", { exact: true }).fill("adios");
  await page.getByLabel("English meaning *", { exact: true }).fill("goodbye");
  await page.getByRole("button", { name: "Save word", exact: true }).click();
  await expect(page.locator(".vocabulary-table tbody tr")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".vocabulary-table tbody tr")).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "List", exact: true }).locator("option")).toHaveCount(2);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ninglingo:development:v1")!));
  expect(stored.lists).toHaveLength(1);
  expect(stored.lists[0]).toMatchObject({ name: "Spanish notes", language: "es", userId: "new-personal-user" });
  expect(stored.entries).toHaveLength(2);
  expect(stored.entries.every((entry: { listId: string }) => entry.listId === stored.lists[0].id)).toBe(true);
  expect(stored.wordProgress).toHaveLength(2);
});

test("opening or cancelling the first word does not create a list", async ({ page }) => {
  await page.goto("/ja/vocabulary");
  await page.getByRole("button", { name: "+ Add word", exact: true }).click();
  await expect(page.getByLabel("First list name")).toHaveValue("My vocabulary");
  await page.getByLabel("Word *", { exact: true }).fill("test");
  await page.getByLabel("English meaning *", { exact: true }).fill("test meaning");
  await page.getByLabel("First list name").fill("   ");
  await expect(page.getByRole("button", { name: "Save word", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "+ Add word", exact: true })).toBeEnabled();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ninglingo:development:v1")!));
  expect(stored.lists).toHaveLength(0);
  expect(stored.entries).toHaveLength(0);
});

test("a failed first word save keeps the created list for retry", async ({ context, page }) => {
  await context.addInitScript(() => {
    let transactions = 0;
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: async (_name: string, action: () => unknown) => {
        transactions++;
        if (transactions === 2) throw new Error("Could not save this word. Please try again.");
        return action();
      } },
    });
  });
  await page.goto("/el/vocabulary");
  await page.getByRole("button", { name: "+ Add word", exact: true }).click();
  await page.getByLabel("Word *", { exact: true }).fill("kalimera");
  await page.getByLabel("English meaning *", { exact: true }).fill("good morning");
  await page.getByLabel("First list name").fill("Greek notes");
  await page.getByRole("button", { name: "Save word", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Could not save this word. Please try again.");
  await expect(page.getByLabel("Word *", { exact: true })).toHaveValue("kalimera");
  await expect(page.getByLabel("First list name")).toHaveCount(0);
  await page.getByRole("button", { name: "Save word", exact: true }).click();
  await expect(page.locator(".vocabulary-table tbody tr")).toHaveCount(1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ninglingo:development:v1")!));
  expect(stored.lists).toHaveLength(1);
  expect(stored.lists[0].name).toBe("Greek notes");
  expect(stored.entries).toHaveLength(1);
  expect(stored.entries[0].listId).toBe(stored.lists[0].id);
});
