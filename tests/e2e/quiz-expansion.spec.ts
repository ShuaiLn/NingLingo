import { expect, test, type Page } from "@playwright/test";
import type { QuizSession } from "../../src/domain/models";
import type { LocalDatabase } from "../../src/repositories/storage";

const storageKey = "ninglingo:development:v1";
async function data(page: Page): Promise<LocalDatabase> { return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey) as Promise<LocalDatabase>; }
async function latest(page: Page): Promise<QuizSession> { return (await data(page)).sessions.at(-1)!; }
async function setupTyping(page: Page, preference: string, words = "word-ja-1") {
  await page.goto(`/ja/quiz?words=${words}`);
  await page.getByRole("button", { name: /^Typing/ }).click();
  await page.getByRole("radio", { name: preference, exact: true }).check();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page.locator(".quiz-question-card")).toBeVisible();
}
async function submit(page: Page, correct = true) {
  const before = await latest(page), question = before.currentQuestion!;
  if (question.inputMode === "text" || before.type === "typing") {
    await page.locator(".quiz-typing input").fill(correct ? question.acceptedAnswers[0] : "definitely incorrect");
    await page.getByRole("button", { name: "Check answer", exact: true }).click();
  } else {
    await page.locator(".quiz-choice-select").nth(question.choices.findIndex(choice => correct ? choice.id === question.correctChoiceId : choice.id !== question.correctChoiceId)).click();
  }
  await expect.poll(async () => (await latest(page)).attempts.length).toBe(before.attempts.length + 1);
  return latest(page);
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    class Utterance { text: string; lang = ""; rate = 1; voice: object | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => ["ja-JP", "es-ES", "el-GR", "ko-KR", "en-US"].map(lang => ({ name: lang, lang })),
      cancel: () => { document.documentElement.dataset.audioCancels = String(Number(document.documentElement.dataset.audioCancels ?? "0") + 1); },
      speak: (utterance: Utterance) => { const spoken = JSON.parse(document.documentElement.dataset.spoken ?? "[]") as { text: string; lang: string }[]; spoken.push({ text: utterance.text, lang: utterance.lang }); document.documentElement.dataset.spoken = JSON.stringify(spoken); setTimeout(() => utterance.onend?.(), 5); },
      addEventListener: () => undefined, removeEventListener: () => undefined,
    } });
  });
});

test("Always show waits with full details; Never show advances and still displays all summary attempts", async ({ page }) => {
  await setupTyping(page, "Always show");
  await submit(page);
  await expect(page.locator(".quiz-feedback")).toBeVisible();
  await expect(page.locator(".quiz-answer-details")).toContainText("English meaning");
  await expect(page.getByRole("button", { name: "See results", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "See results", exact: true }).click();
  await expect(page.getByRole("region", { name: "Quiz Summary" })).toContainText("Initial: Correct");
  await page.getByRole("button", { name: "New practice", exact: false }).click();
  await page.getByRole("radio", { name: "Never show", exact: true }).check();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await submit(page, false);
  await expect(page.locator(".quiz-feedback")).toHaveCount(0);
  await expect(page.getByText("Try this one again", { exact: true })).toBeVisible();
  await submit(page);
  const summary = page.getByRole("region", { name: "Quiz Summary" });
  await expect(summary).toContainText("Initial: Incorrect");
  await expect(summary).toContainText("Final: Correct");
  await expect(summary).toContainText("Attempts: 2");
  await expect(summary.locator(".quiz-summary-attempts li")).toHaveCount(2);
});

test("Only when incorrect skips correct feedback and preserves two wrong attempts in the final summary", async ({ page }) => {
  await setupTyping(page, "Only when incorrect");
  await submit(page, false);
  await expect(page.locator(".quiz-feedback")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await submit(page, false);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await submit(page);
  await expect(page.locator(".quiz-feedback")).toHaveCount(0);
  const summary = page.getByRole("region", { name: "Quiz Summary" });
  await expect(summary).toContainText("Initial: Incorrect");
  await expect(summary).toContainText("Final: Correct");
  await expect(summary).toContainText("Attempts: 3");
  await expect(summary).toContainText("Correct: 1");
  await expect(summary).toContainText("Incorrect: 2");
  await expect(summary.locator(".quiz-summary-metrics")).toContainText("33%");
  await expect(summary.locator(".quiz-summary-metrics")).toContainText("0%");
  const finished = await latest(page);
  await page.goto(`/ja/quiz?session=${finished.id}`);
  await expect(page.getByRole("region", { name: "Quiz Summary" }).locator(".quiz-summary-attempts li")).toHaveCount(3);
});

test("resume restores its saved presentation after another session changes the default", async ({ page }) => {
  await setupTyping(page, "Never show", "word-ja-1,word-ja-2");
  const saved = await latest(page);
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await page.getByRole("radio", { name: "Always show", exact: true }).check();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await page.getByRole("button", { name: "End practice", exact: true }).click();
  await page.goto(`/ja/quiz?session=${saved.id}`);
  await expect(page.locator(".quiz-question-card")).toBeVisible();
  await page.locator(".quiz-typing input").fill(saved.currentQuestion!.acceptedAnswers[0]);
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.locator(".quiz-feedback")).toHaveCount(0);
  await expect(page.getByText(/Question 2/)).toBeVisible();
  expect((await data(page)).sessions.find(session => session.id === saved.id)?.presentation).toBe("never");
});

test("ended sessions with zero answers reopen from history with 0/0 and no tested words", async ({ page }) => {
  await setupTyping(page, "Never show");
  const session = await latest(page);
  await page.getByRole("button", { name: "End practice", exact: true }).click();
  await expect(page.getByRole("region", { name: "Quiz Summary" })).toContainText("0/0");
  await expect(page.locator(".quiz-summary-word")).toHaveCount(0);
  await page.goto("/ja/progress");
  await page.getByRole("link", { name: "Open Summary", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(session.id));
  await expect(page.getByRole("region", { name: "Quiz Summary" })).toContainText("Accuracy —");
});

test("manual care persists through correct settlement; Remove suppresses care until a new incorrect answer", async ({ page }) => {
  await page.goto("/ja/vocabulary");
  const row = page.locator("tbody tr").filter({ has: page.getByRole("checkbox", { name: "Select 犬", exact: true }) });
  await row.getByRole("button", { name: "Add word-ja-1 to Words that need care", exact: true }).click();
  await expect(row).toContainText("Needs care · manual");
  await setupTyping(page, "Never show");
  await submit(page);
  await expect(page.locator(".quiz-summary-word")).toContainText("Needs care · manual");
  await page.getByRole("button", { name: "Remove word-ja-1 from Words that need care", exact: true }).click();
  await expect(page.locator(".quiz-summary-word")).toContainText("Automatic care suppressed");
  await page.getByRole("button", { name: "New practice", exact: false }).click();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await submit(page, false); await submit(page);
  await expect(page.locator(".quiz-summary-word")).toContainText("Needs care · automatic");
});

test("switching word details never carries another word's pending care state", async ({ page }) => {
  await page.goto("/ja/vocabulary");
  const dog = page.locator("tbody tr").filter({ has: page.getByRole("checkbox", { name: "Select 犬", exact: true }) });
  const cat = page.locator("tbody tr").filter({ has: page.getByRole("checkbox", { name: "Select 猫", exact: true }) });
  await dog.getByRole("button", { name: "Details", exact: true }).click();
  const details = page.getByRole("region", { name: "Word details", exact: true });
  await details.getByRole("button", { name: "Add word-ja-1 to Words that need care", exact: true }).click();
  await expect(details).toContainText("Needs care · manual");
  await cat.getByRole("button", { name: "Details", exact: true }).click();
  await expect(details).toContainText("No care marker");
  await expect(details.getByRole("button", { name: "Add word-ja-2 to Words that need care", exact: true })).toBeEnabled();
  await dog.getByRole("button", { name: "Details", exact: true }).click();
  await expect(details).toContainText("Needs care · manual");
});

test("latest full details are separate from frozen answers; deleted words retain history and disable care", async ({ page }) => {
  await setupTyping(page, "Never show"); await submit(page);
  const session = await latest(page);
  await page.evaluate(({ key, wordId }) => {
    const db = JSON.parse(localStorage.getItem(key)!); const word = db.entries.find((entry: { id: string }) => entry.id === wordId);
    word.translation = "latest meaning"; word.notes = "latest notes";
    word.examples = [{ id: "new-example", text: "新しい例", reading: "あたらしいれい", translation: "latest example translation" }];
    word.relatedWords = [{ id: "new-related", word: "子犬", reading: "こいぬ", translation: "puppy", relationType: "derived" }];
    localStorage.setItem(key, JSON.stringify(db));
  }, { key: storageKey, wordId: session.entries[0].id });
  await page.reload();
  await page.getByRole("button", { name: "Open Summary", exact: true }).click();
  const summary = page.locator(".quiz-summary-word");
  await expect(summary).toContainText("Frozen correct answer: dog");
  await expect(summary).toContainText("latest meaning");
  await expect(summary).toContainText("latest notes");
  await expect(summary).toContainText("latest example translation");
  await expect(summary).toContainText("puppy");
  await page.evaluate(({ key, wordId }) => { const db = JSON.parse(localStorage.getItem(key)!); db.entries = db.entries.filter((entry: { id: string }) => entry.id !== wordId); localStorage.setItem(key, JSON.stringify(db)); }, { key: storageKey, wordId: session.entries[0].id });
  await page.goto(`/ja/quiz?session=${session.id}`);
  await expect(page.locator(".quiz-summary-word")).toContainText("Historical word snapshot");
  await expect(page.getByRole("button", { name: "Add word-ja-1 to Words that need care", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove word-ja-1 from Words that need care", exact: true })).toBeDisabled();
});

test("normal four-language mixing needs no pairs or cross-language directions", async ({ page }) => {
  await page.goto("/ja/quiz?words=word-ja-1,word-es-2,word-el-3,word-ko-4");
  await page.getByRole("button", { name: /^Typing/ }).click();
  for (const name of ["Spanish", "Greek", "Korean"]) await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByRole("radio", { name: "Never show", exact: true }).check();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  const initial = await latest(page);
  expect(initial.languages?.slice().sort()).toEqual(["el", "es", "ja", "ko"]);
  expect(initial.questionTemplates.every(question => question.type === "typing" && question.targetLanguage === "en")).toBe(true);
  expect((await data(page)).wordPairs ?? []).toHaveLength(0);
  for (let index = 0; index < 4; index++) await submit(page);
  await expect(page.locator(".quiz-summary-word")).toHaveCount(4);
});

test("disabled word sets cannot contribute tested words, contexts or distractors", async ({ page }) => {
  await page.goto("/ja/quiz");
  await expect(page.getByRole("button", { name: /^Typing/ })).toBeVisible();
  await page.evaluate(key => {
    const db = JSON.parse(localStorage.getItem(key)!);
    db.lists.push({ ...db.lists.find((list: { language: string }) => list.language === "ja"), id: "excluded-ja-list", name: "Excluded sample" });
    db.entries.push({ ...db.entries.find((entry: { language: string }) => entry.language === "ja"), id: "excluded-ja-word", listId: "excluded-ja-list", word: "森", reading: "もり", translation: "forest" });
    localStorage.setItem(key, JSON.stringify(db));
  }, storageKey);
  await page.reload();
  await page.getByRole("button", { name: /^Typing/ }).click();
  await page.getByRole("checkbox", { name: "Japanese: Excluded sample", exact: true }).uncheck();
  await expect(page.locator(".quiz-word-list")).not.toContainText("forest");
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page.locator(".quiz-question-card")).toBeVisible();
  const session = await latest(page);
  expect(session.entries.every(entry => entry.listId !== "excluded-ja-list")).toBe(true);
  expect(session.questionTemplates.every(question => question.contextWordId !== "excluded-ja-word" && question.choices.every(choice => choice.id !== "excluded-ja-word"))).toBe(true);
});

test("cross-language directions are explicit and pair confirmation, editing and deletion persist", async ({ page }) => {
  await page.goto("/ja/quiz?words=word-ja-1,word-ja-2,word-ko-1,word-ko-2");
  await page.getByRole("checkbox", { name: "Korean", exact: true }).check();
  await page.getByRole("button", { name: /^Cross-language typing/ }).click();
  await expect(page.getByRole("button", { name: "Start practice", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Japanese → Korean", exact: true }).check();
  await expect(page.locator(".quiz-pair-row")).toHaveCount(2);
  await page.locator(".quiz-pair-row").first().getByRole("button", { name: "Confirm pair", exact: true }).click();
  await expect(page.locator(".quiz-pair-row").filter({ hasText: "confirmed" })).toHaveCount(1);
  await page.locator(".quiz-pair-row").filter({ hasText: "confirmed" }).getByRole("button", { name: "Edit pair", exact: true }).click();
  await page.getByRole("combobox", { name: "Target word", exact: true }).selectOption("word-ko-2");
  await page.getByRole("button", { name: "Save pair", exact: true }).click();
  await expect.poll(async () => (await data(page)).wordPairs?.filter(pair => pair.status === "confirmed").map(pair => pair.targetWordId)).toEqual(["word-ko-2"]);
  await page.locator(".quiz-pair-row").filter({ hasText: "confirmed" }).getByRole("button", { name: "Delete pair", exact: true }).click();
  await page.getByRole("radio", { name: "Never show", exact: true }).check();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  const session = await latest(page);
  expect(session.questionTemplates.every(question => question.sourceLanguage === "ja" && question.targetLanguage === "ko")).toBe(true);
});

test("Korean listening hides spelling and automatic audio plays native Hangul once per displayed question", async ({ page }) => {
  await page.goto("/ko/quiz?words=word-ko-1");
  await page.getByRole("button", { name: /^Listening → Spelling/ }).click();
  await page.getByRole("checkbox", { name: "Automatically play each new question", exact: true }).check();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page.locator(".quiz-prompt")).toHaveText("Listen and spell the word");
  await expect.poll(() => page.locator("html").getAttribute("data-spoken")).toContain('"text":"개"');
  const spoken = await page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!));
  expect(spoken).toEqual([{ text: "개", lang: "ko-KR" }]);
  await page.locator(".quiz-typing input").fill("wrong"); await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.locator(".quiz-feedback")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!).length)).toBe(1);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!).length)).toBe(2);
  await page.getByRole("button", { name: "Replay listening question", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!).length)).toBe(3);
});

test("mobile keyboard submission reaches an accessible full summary", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupTyping(page, "Never show");
  await page.getByRole("textbox", { name: "English meaning", exact: true }).fill("dog");
  await page.getByRole("textbox", { name: "English meaning", exact: true }).press("Enter");
  await expect(page.getByRole("region", { name: "Quiz Summary" })).toBeVisible();
  await expect(page.locator(".quiz-summary-word")).toContainText("Initial: Correct");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("automatic audio waits for Continue, plays on retry and resume, and remembers the toggle before starting", async ({ page }) => {
  await page.goto("/ja/quiz?words=word-ja-1,word-ja-2");
  await page.getByRole("checkbox", { name: "Automatically play each new question", exact: true }).check();
  await expect.poll(async () => (await data(page)).quizPreferences?.vocabularyAutoAudio).toBe(true);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Automatically play each new question", exact: true })).toBeChecked();
  await page.getByRole("button", { name: /^Typing/ }).click();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken ?? "[]").length)).toBe(1);
  const first = await latest(page), firstWord = first.entries.find(entry => entry.id === first.currentQuestion!.wordId)!.word;
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!)[0].text)).toBe(firstWord);
  await submit(page, false);
  await expect(page.locator(".quiz-feedback")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!).length)).toBe(1);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!).length)).toBe(2);
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!).length)).toBe(3);
  await submit(page);
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!).length)).toBe(3);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!).length)).toBe(4);
  const spoken = await page.evaluate(() => JSON.parse(document.documentElement.dataset.spoken!));
  expect(spoken[3]).toMatchObject({ text: firstWord, lang: "ja-JP" });
});

test("delayed voices enable listening without automatic replay duplication", async ({ page, context }) => {
  await context.addInitScript(() => {
    let loaded = false;
    const callbacks = new Set<() => void>();
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => loaded ? [{ name: "Delayed Korean", lang: "ko-KR" }] : [],
      addEventListener: (_name: string, callback: () => void) => callbacks.add(callback), removeEventListener: (_name: string, callback: () => void) => callbacks.delete(callback),
      cancel: () => undefined, speak: (utterance: { text: string; onend?: () => void }) => { document.documentElement.dataset.delayedSpoken = String(Number(document.documentElement.dataset.delayedSpoken ?? "0") + 1); setTimeout(() => utterance.onend?.(), 1); },
    } });
    (window as unknown as { loadQuizVoices: () => void }).loadQuizVoices = () => { loaded = true; callbacks.forEach(callback => callback()); };
  });
  await page.goto("/ko/quiz?words=word-ko-1");
  await page.getByRole("button", { name: /^Listening → Spelling/ }).click();
  await expect(page.getByRole("button", { name: "Start practice", exact: true })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { loadQuizVoices: () => void }).loadQuizVoices());
  await expect(page.getByRole("button", { name: "Start practice", exact: true })).toBeEnabled();
  await page.getByRole("checkbox", { name: "Automatically play each new question", exact: true }).check();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-delayed-spoken", "1");
  await page.evaluate(() => (window as unknown as { loadQuizVoices: () => void }).loadQuizVoices());
  await expect(page.locator("html")).toHaveAttribute("data-delayed-spoken", "1");
});

test("missing Korean voice disables listening but normal questions and failed audio remain answerable", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => [{ name: "Only Japanese", lang: "ja-JP" }], addEventListener: () => undefined, removeEventListener: () => undefined, cancel: () => undefined, speak: (utterance: { onerror?: () => void }) => setTimeout(() => utterance.onerror?.(), 1) } });
  });
  await page.goto("/ko/quiz?words=word-ko-1");
  await page.getByRole("button", { name: /^Listening → Spelling/ }).click();
  await expect(page.getByRole("button", { name: "Start practice", exact: true })).toBeDisabled();
  await expect(page.getByText(/Listening unavailable: Korean/)).toBeVisible();
  await page.getByRole("button", { name: /^Typing/ }).click();
  await page.getByRole("radio", { name: "Never show", exact: true }).check();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page.locator(".quiz-prompt-tools .audio-button")).toHaveAttribute("aria-disabled", "true");
  await submit(page);
  await expect(page.getByRole("region", { name: "Quiz Summary" })).toBeVisible();
  await page.goto("/ja/quiz?words=word-ja-1");
  await page.getByRole("button", { name: /^Typing/ }).click();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await page.locator(".quiz-prompt-tools .audio-button").click();
  await page.locator(".quiz-typing input").fill("dog");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("region", { name: "Quiz Summary" })).toBeVisible();
});
