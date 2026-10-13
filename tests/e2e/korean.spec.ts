import { expect, test } from "@playwright/test";
import korean from "../../content/grammar/generated/ko.json";

test("Korean Alphabet presents all 40 cards and plays Hangul names rather than romanization", async ({ page, context }) => {
  await context.addInitScript(() => {
    class NativeUtterance {
      text: string; lang = ""; rate = 1; voice: object | null = null;
      onend: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: NativeUtterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [{ name: "Korean", lang: "ko-KR" }], cancel: () => undefined,
      speak: (utterance: NativeUtterance) => { document.documentElement.dataset.koreanAudio = JSON.stringify({ text: utterance.text, lang: utterance.lang }); setTimeout(() => utterance.onend?.(), 5); },
      addEventListener: () => undefined, removeEventListener: () => undefined,
    } });
  });
  await page.goto("/ko/alphabet");
  await expect(page.locator(".alphabet-card")).toHaveCount(40);
  await expect(page.getByText("40 symbols", { exact: true })).toBeVisible();
  await expect(page.getByText(/Consonant audio reads the Korean letter name/u)).toBeVisible();
  await page.getByRole("button", { name: "Play letter name 기역", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-korean-audio", JSON.stringify({ text: "기역", lang: "ko-KR" }));
  await page.getByLabel("Letter group").selectOption("Basic vowels");
  await expect(page.locator(".alphabet-card")).toHaveCount(10);
  await page.getByRole("button", { name: "Play example syllable 아", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-korean-audio", JSON.stringify({ text: "아", lang: "ko-KR" }));
  await page.getByLabel("Letter group").selectOption("Tense consonants");
  await expect(page.locator(".alphabet-card")).toHaveCount(5);
  await expect(page.getByText(/ㄸ is not a final consonant/u)).toBeVisible();
});

for (const mobile of [false, true]) test(`Korean AI grammar is immediately available and saves actual exercise completion ${mobile ? "on mobile" : "on desktop"}`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/grammar");
  await expect(page.locator(".lesson-card")).toHaveCount(60);
  await expect(page.locator(".notice").filter({ hasText: "AI 编写，未经人工审核" })).toBeVisible();
  await page.goto(`/ko/grammar/${korean[0].id}`);
  await expect(page.getByRole("heading", { level: 1, name: korean[0].title })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("AI-authored; not human-reviewed");
  await expect(page.locator(".grammar-example")).toHaveCount(3);
  await expect(page.locator(".grammar-exercise")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Check answers", exact: true })).toBeDisabled();
  for (const [index, exercise] of korean[0].exercises.entries()) await page.locator(".grammar-exercise").nth(index).getByRole("radio").nth(exercise.correctIndex).check();
  await page.getByRole("button", { name: "Check answers", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "5 / 5 correct" })).toContainText("Lesson completed!");
  await page.reload();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("ninglingo:development:v1")!).grammarProgress);
  expect(progress).toEqual(expect.arrayContaining([expect.objectContaining({ pointId: korean[0].id, language: "ko", correct: 5, total: 5, completed: true, contentVersion: 1 })]));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
