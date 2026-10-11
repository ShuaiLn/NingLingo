import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("Vocabulary persists translated examples, pronunciation, notes, and all six explicit relations", async ({ page }) => {
  await page.goto("/es/vocabulary");
  await page.getByRole("button", { name: "+ Add word", exact: true }).click();
  await page.getByLabel("Word *", { exact: true }).fill("cafetera");
  await page.getByLabel("English meaning *", { exact: true }).fill("coffee maker");
  await page.getByLabel("Reading / pronunciation", { exact: true }).fill("ka.feˈte.ɾa");
  await page.getByLabel("Part of speech", { exact: true }).fill("noun");
  await page.getByRole("combobox", { name: "Category", exact: true }).first().fill("kitchen");
  await page.getByLabel("Notes", { exact: true }).fill("Explicit forms from my personal notes.");
  for (const [index, text, translation] of [[1, "La cafetera es nueva.", "The coffee maker is new."], [2, "Limpio la cafetera.", "I clean the coffee maker."]] as const) {
    await page.getByRole("button", { name: "Add example", exact: true }).click();
    await page.getByRole("textbox", { name: `Sentence ${index}`, exact: true }).fill(text);
    await page.getByLabel(`Example ${index} English translation`, { exact: true }).fill(translation);
  }
  const types = ["derived", "compound", "synonym", "antonym", "word_form", "related"];
  for (let index = 0; index < types.length; index++) {
    await page.getByRole("button", { name: "Add related word", exact: true }).click();
    await page.getByLabel(`Related word ${index + 1}`, { exact: true }).fill(`café-${index + 1}`);
    await page.getByRole("combobox", { name: `Related word ${index + 1} relation`, exact: true }).selectOption(types[index]);
    await page.getByLabel(`Related word ${index + 1} English translation`, { exact: true }).fill(`explicit relation ${index + 1}`);
  }
  await page.getByRole("button", { name: "Save word", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Word added");
  await page.reload(); await page.getByLabel("Search", { exact: true }).fill("cafetera");
  const row = page.locator(".vocabulary-table tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Pronunciation: ka.feˈte.ɾa");
  await expect(row).toContainText("The coffee maker is new.");
  await expect(row).toContainText("I clean the coffee maker.");
  await row.getByText("Related words (6)", { exact: true }).click();
  for (const type of types) await expect(row.getByText(type.replaceAll("_", " "), { exact: true })).toBeVisible();
  await row.getByText("Notes", { exact: true }).click();
  await expect(row.getByText("Explicit forms from my personal notes.", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export shown CSV", exact: true }).click();
  const path = await (await downloadPromise).path();
  expect(path).not.toBeNull();
  const csv = await readFile(path!, "utf8");
  expect(csv.replace(/^\ufeff/, "").split("\r\n")[0]).toBe("word,reading,translation,type,category,example,notes");
  expect(csv).toContain("La cafetera es nueva.");
  expect(csv).not.toContain("Limpio la cafetera.");
});

test("Japanese examples use explicit ruby/kana and shared audio without changing progress", async ({ page, context }) => {
  await context.addInitScript(() => {
    class Utterance { text: string; lang = ""; rate = 1; voice: object | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => [{ name: "Test Japanese", lang: "ja-JP" }], cancel: () => undefined, speak: (utterance: Utterance) => { document.documentElement.dataset.lastSpoken = utterance.text; setTimeout(() => utterance.onend?.(), 1); }, addEventListener: () => undefined, removeEventListener: () => undefined } });
  });
  await page.goto("/ja/vocabulary");
  await page.getByRole("button", { name: "+ Add word", exact: true }).click();
  await page.getByLabel("Word *", { exact: true }).fill("子犬");
  await page.getByLabel("English meaning *", { exact: true }).fill("puppy");
  await page.getByLabel("Reading (existing kana only)", { exact: true }).fill("こいぬ");
  await page.getByRole("button", { name: "Add example", exact: true }).click();
  await page.getByRole("textbox", { name: "Sentence 1", exact: true }).fill("子犬が好きです。");
  await page.getByLabel("Example 1 English translation", { exact: true }).fill("I like puppies.");
  await page.getByLabel("Example 1 reading / pronunciation", { exact: true }).fill("こいぬがすきです。");
  await page.getByRole("button", { name: "Save word", exact: true }).click();
  await page.getByLabel("Search", { exact: true }).fill("子犬");
  await expect(page.locator(".vocabulary-example rt")).toHaveText("コイヌガスキデス。");
  const before = await page.evaluate(() => localStorage.getItem("ninglingo:development:v1"));
  await page.getByRole("button", { name: "Play example 1 of 子犬", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-last-spoken", "こいぬがすきです。");
  expect(await page.evaluate(() => localStorage.getItem("ninglingo:development:v1"))).toBe(before);
  await page.getByRole("combobox", { name: "Kana display", exact: true }).selectOption("hiragana");
  await expect(page.locator(".vocabulary-example rt")).toHaveText("こいぬがすきです。");
});

test("legacy Greek CSV examples remain editable with honest missing translations and explicit word forms", async ({ page }) => {
  await page.goto("/el/vocabulary");
  await expect(page.getByRole("button", { name: "+ Add word", exact: true })).toBeEnabled();
  await page.getByLabel("Upload UTF-8 CSV").setInputFiles({ name: "greek.csv", mimeType: "text/csv", buffer: Buffer.from("word,reading,translation,type,category,example,notes\r\nγράφω,,write,verb,actions,Γράφω ένα γράμμα.,", "utf8") });
  await page.getByRole("button", { name: "Confirm import of 1 valid rows", exact: true }).click();
  await page.getByLabel("Search", { exact: true }).fill("γράφω");
  const row = page.locator(".vocabulary-table tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("English translation not added");
  await expect(row.locator("ruby")).toHaveCount(0);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Sentence 1", exact: true })).toHaveValue("Γράφω ένα γράμμα.");
  await expect(page.getByLabel("Example 1 reading / pronunciation", { exact: true })).toHaveValue("");
  await page.getByLabel("Example 1 English translation", { exact: true }).fill("I write a letter.");
  await page.getByRole("button", { name: "Add related word", exact: true }).click();
  await page.getByLabel("Related word 1", { exact: true }).fill("έγραψα");
  await page.getByRole("combobox", { name: "Related word 1 relation", exact: true }).selectOption("word_form");
  await page.getByLabel("Related word 1 English translation", { exact: true }).fill("I wrote");
  await page.getByRole("button", { name: "Save word", exact: true }).click();
  await page.reload(); await page.getByLabel("Search", { exact: true }).fill("έγραψα");
  await expect(row).toHaveCount(1);
  await row.getByText("Related words (1)", { exact: true }).click();
  await expect(row).toContainText("έγραψα");
  await expect(row).toContainText("I write a letter.");
});
