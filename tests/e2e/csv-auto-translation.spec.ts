import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const language of ["ja", "es", "el"]) {
  test(`${language}: word-only CSV stays editable, imports a resolved subset atomically, and retains unresolved rows`, async ({ page }) => {
    await page.goto(`/${language}/vocabulary`);
    await expect(page.getByRole("button", { name: "+ Add word", exact: true })).toBeEnabled();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("ninglingo:development:v1")!));
    const first = `csv-${language}-manual`;
    const second = `csv-${language}-unresolved`;
    await page.getByLabel("Upload UTF-8 CSV").setInputFiles({ name: "words.csv", mimeType: "text/csv", buffer: Buffer.from(`word\n${first}\n${second}`, "utf8") });
    const preview = page.getByRole("region", { name: "CSV import preview" });
    await expect(preview.getByText("2 unresolved", { exact: true })).toBeVisible();
    await expect(preview.getByRole("button", { name: "Confirm import of 0 valid rows", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ninglingo:development:v1")!).entries.length)).toBe(before.entries.length);
    await preview.getByLabel("English meaning for CSV line 2", { exact: true }).fill("manual English meaning");
    await expect(preview.getByText("1 valid", { exact: true })).toBeVisible();
    await preview.getByRole("button", { name: "Confirm import of 1 valid rows", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Imported 1 words");
    await expect(preview.getByLabel("English meaning for CSV line 2", { exact: true })).toHaveCount(0);
    await expect(preview.getByLabel("English meaning for CSV line 3", { exact: true })).toHaveValue("");
    await expect(preview.getByText(/no English meaning/)).toBeVisible();
    const partial = await page.evaluate(() => JSON.parse(localStorage.getItem("ninglingo:development:v1")!));
    expect(partial.entries.length).toBe(before.entries.length + 1);
    expect(partial.wordProgress.length).toBe(before.wordProgress.length + 1);
    const entry = partial.entries.find((row: { word: string }) => row.word === first);
    expect(entry).toMatchObject({ translation: "manual English meaning", reading: "", example: "", type: "", category: "" });
    expect(partial.entries.some((row: { word: string }) => row.word === second)).toBe(false);
    await preview.getByLabel("English meaning for CSV line 3", { exact: true }).fill("second meaning");
    await preview.getByRole("button", { name: "Confirm import of 1 valid rows", exact: true }).click();
    await expect(preview).toHaveCount(0);
    await page.reload();
    await page.getByLabel("Search", { exact: true }).fill(`csv-${language}`);
    await expect(page.locator(".vocabulary-table tbody tr")).toHaveCount(2);
  });
}

test("CSV provided meanings survive lookup and edits recompute duplicate classification", async ({ page }) => {
  await page.goto("/es/vocabulary");
  await expect(page.getByRole("button", { name: "+ Add word", exact: true })).toBeEnabled();
  await page.getByLabel("Upload UTF-8 CSV").setInputFiles({ name: "legacy.csv", mimeType: "text/csv", buffer: Buffer.from("notes,translation,word,reading,type,category,example\nkeep this,given meaning,csv-legacy,,,,\n,given meaning,csv-legacy,,,,\n,,csv-missing,,,,", "utf8") });
  const preview = page.getByRole("region", { name: "CSV import preview" });
  await expect(preview.getByLabel("English meaning for CSV line 2", { exact: true })).toHaveValue("given meaning");
  await expect(preview.getByText("1 duplicates", { exact: true })).toBeVisible();
  await expect(preview.getByText(/no English meaning/)).toBeVisible();
  await expect(preview.getByLabel("English meaning for CSV line 2", { exact: true })).toHaveValue("given meaning");
  await preview.getByLabel("English meaning for CSV line 3", { exact: true }).fill("different meaning");
  await expect(preview.getByText("2 valid", { exact: true })).toBeVisible();
  await expect(preview.getByText("0 duplicates", { exact: true })).toBeVisible();
  await preview.getByLabel("English meaning for CSV line 3", { exact: true }).fill("given meaning");
  await expect(preview.getByText("1 duplicates", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Close preview", exact: true }).click();
  await expect(preview).toHaveCount(0);
});

test("CSV template places word and translation first and leaves the legacy export format intact", async ({ page }) => {
  await page.goto("/ja/vocabulary");
  await expect(page.getByRole("button", { name: "+ Add word", exact: true })).toBeEnabled();
  const templateDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV template", exact: true }).click();
  const templatePath = await (await templateDownload).path();
  expect((await readFile(templatePath!, "utf8")).replace(/^\uFEFF/, "").split("\r\n")[0]).toBe("word,translation,reading,type,category,example,notes");
  const exportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export shown CSV", exact: true }).click();
  const exportPath = await (await exportDownload).path();
  expect((await readFile(exportPath!, "utf8")).replace(/^\uFEFF/, "").split("\r\n")[0]).toBe("word,reading,translation,type,category,example,notes");
});
