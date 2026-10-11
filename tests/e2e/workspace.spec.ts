import { expect, test } from "@playwright/test";
import { grammarSeeds } from "../../src/data/grammar";

test("all main pages render across three languages and mobile navigation fits", async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const language of ["ja", "es", "el"]) {
    for (const section of ["", "vocabulary", "quiz", "reading", "grammar", "alphabet", "progress", "settings"]) {
      await page.goto(`/${language}/${section}`);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator(".loading-state")).toHaveCount(0);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/el");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("CSV previews mixed rows, imports valid rows, exports UTF8 and edits accepted answers", async ({ page }) => {
  await page.goto("/es/vocabulary");
  await expect(page.getByRole("button", { name: "+ Add word", exact: true })).toBeEnabled();
  const csv = '\uFEFFword,reading,translation,type,category,example,notes\r\nprueba,,test,noun,testing,"a, b","line 1\nline 2"\r\nprueba,,test,noun,testing,,\r\nprueba,,proof,noun,testing,,\r\ninvalid,,,noun,,,\r\n';
  await page.getByLabel("Upload UTF-8 CSV").setInputFiles({ name: "test.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await expect(page.getByText("2 valid", { exact: true })).toBeVisible();
  await expect(page.getByText("1 duplicates", { exact: true })).toBeVisible();
  await expect(page.getByText("1 invalid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm import of 2 valid rows" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 2 words");
  await page.getByLabel("Search", { exact: true }).fill("prueba");
  await expect(page.locator(".vocabulary-table tbody tr")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export shown CSV" }).click();
  expect((await download).suggestedFilename()).toBe("ninglingo-es-vocabulary.csv");
  await page.locator(".vocabulary-table tbody tr").first().getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Additional accepted English answers").fill("trial\nexamination");
  await page.getByRole("button", { name: "Save word", exact: true }).click();
  await expect(page.getByText("Also: trial, examination", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel("Search", { exact: true }).fill("prueba");
  await expect(page.locator(".vocabulary-table tbody tr")).toHaveCount(2);
  await expect(page.getByText("Also: trial, examination", { exact: true })).toBeVisible();
});

test("Reading supports lookup, manual annotation, version warning and vocabulary addition", async ({ page }) => {
  await page.goto("/el/reading");
  await page.getByRole("button", { name: "New reading", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Accent practice");
  await page.getByRole("textbox", { name: "Text", exact: true }).fill("Καλημέρα φίλε. Αύριο θα διαβάσω.");
  await page.getByRole("button", { name: "Save reading", exact: true }).click();
  await expect(page.locator(".reading-body")).toContainText("Καλημέρα");
  await page.getByRole("button", { name: "Look up Καλημέρα", exact: true }).click();
  await expect(page.getByText("Development translation placeholder", { exact: true })).toBeVisible();
  await page.getByLabel("English meaning", { exact: true }).fill("good morning");
  await page.getByRole("button", { name: "Add to Vocabulary", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Word added to Vocabulary");
  await page.getByRole("button", { name: "Save annotation", exact: true }).click();
  await expect(page.getByText("Manual annotation", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Look up Καλημέρα", exact: true }).click();
  await expect(page.getByLabel("English meaning", { exact: true })).toHaveValue("good morning");
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page.getByRole("textbox", { name: "Text", exact: true }).fill("Καλημέρα φίλε. Άλλη ιστορία.");
  await expect(page.getByRole("button", { name: "Save reading", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Clear 1 existing annotation" }).check();
  await page.getByRole("button", { name: "Save reading", exact: true }).click();
  await expect(page.getByText("Version 2 · 0 annotations", { exact: true })).toBeVisible();
  await page.goto("/el/vocabulary");
  await page.getByLabel("Search", { exact: true }).fill("Καλημέρα");
  await expect(page.locator(".vocabulary-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".vocabulary-table")).toContainText("good morning");
});

test("grammar exercises complete at 80%, update dashboard, and timezone validates gracefully", async ({ page }) => {
  await page.goto("/ja/grammar");
  await page.getByRole("link", { name: "Start lesson", exact: true }).first().click();
  await expect(page.getByText("80% to complete", { exact: true })).toBeVisible();
  const pointId = page.url().split("/").pop();
  const point = grammarSeeds.find(lesson => lesson.id === pointId)!;
  expect(point.exercises.length).toBeGreaterThanOrEqual(5);
  for (let index = 0; index < point.exercises.length; index++) {
    const exercise = point.exercises[index];
    const choice = index === 4 ? (exercise.correctIndex + 1) % exercise.choices.length : exercise.correctIndex;
    await page.locator("fieldset.grammar-exercise").nth(index).getByRole("radio").nth(choice).check();
  }
  await page.getByRole("button", { name: "Check answers", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("4 / 5 correct · 80%. Lesson completed!");
  await page.goto("/ja");
  await expect(page.getByRole("heading", { name: "Welcome back, Ning." })).toBeVisible();
  await expect(page.locator(".week-chart .week-count").last()).toHaveText("5");
  await page.goto("/ja/progress");
  await expect(page.locator(".metric").nth(2)).toContainText("1/1");
  await expect(page.getByText("Learning streak · all languages", { exact: true })).toBeVisible();
  await page.goto("/ja/settings");
  await page.getByLabel("Learning timezone").fill("invalid/");
  await expect(page.getByText("Enter a valid timezone to preview the learning day.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("valid IANA timezone");
  await page.getByLabel("Learning timezone").fill("Asia/Tokyo");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Settings saved");
  await page.reload();
  await expect(page.getByLabel("Learning timezone")).toHaveValue("Asia/Tokyo");
});

