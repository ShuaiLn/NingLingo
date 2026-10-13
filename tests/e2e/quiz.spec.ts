import { expect, test, type Page } from "@playwright/test";
import type { QuizSession, QuizType } from "../../src/domain/models";
import type { LocalDatabase } from "../../src/repositories/storage";

const storageKey = "ninglingo:development:v1";
const words = "word-ja-1,word-ja-2,word-ja-3,word-ja-4";

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    class DevelopmentUtterance {
      text: string;
      lang = "";
      rate = 1;
      voice: object | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: DevelopmentUtterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [
        { name: "Test Japanese", lang: "ja-JP" }, { name: "Test Spanish", lang: "es-ES" }, { name: "Test Greek", lang: "el-GR" },
      ],
      cancel: () => undefined,
      speak: (utterance: DevelopmentUtterance) => { window.setTimeout(() => utterance.onend?.(), 5); },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } });
  });
});

async function database(page: Page): Promise<LocalDatabase> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), storageKey);
  if (!raw) throw new Error("Development data has not loaded.");
  return JSON.parse(raw) as LocalDatabase;
}

async function latestSession(page: Page): Promise<QuizSession> {
  const data = await database(page);
  const session = data.sessions.at(-1);
  if (!session) throw new Error("No quiz session was created.");
  return session;
}

async function start(page: Page, title: string, wordIds = words): Promise<QuizSession> {
  await page.goto(`/ja/quiz?words=${wordIds}`);
  await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
  await expect(page.getByRole("button", { name: "Start practice", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page.locator(".quiz-question-card")).toBeVisible();
  return latestSession(page);
}

async function answer(page: Page, correct = true): Promise<QuizSession> {
  const session = await latestSession(page);
  const question = session.currentQuestion;
  if (!question) throw new Error("Expected an active question.");
  if (session.type === "typing") {
    await page.getByRole("textbox", { name: "English meaning" }).fill(correct ? question.acceptedAnswers[0] : "definitely not the answer");
    await page.getByRole("button", { name: "Check answer" }).click();
  } else {
    const index = question.choices.findIndex((choice) => correct ? choice.id === question.correctChoiceId : choice.id !== question.correctChoiceId);
    await page.locator(".quiz-choice-select").nth(index).click();
  }
  await expect(page.locator(".quiz-feedback")).toBeVisible();
  return latestSession(page);
}

async function continueQuestion(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".quiz-feedback")).toHaveCount(0);
}

for (const [type, title] of [
  ["word-meaning", "Word → Meaning"], ["meaning-word", "Meaning → Word"],
  ["typing", "Typing"], ["japanese-reading", "Japanese Reading"],
] satisfies [QuizType, string][]) {
  test(`${title} works through a complete two-word session`, async ({ page }) => {
    const first = await start(page, title, "word-ja-1,word-ja-2");
    expect(first.type).toBe(type);
    expect(first.entries).toHaveLength(2);
    expect(first.configuration.retryRange).toEqual([1, 1]);
    await answer(page);
    await continueQuestion(page);
    const complete = await answer(page);
    expect(complete.status).toBe("completed");
    expect(complete.settled).toBe(true);
    await page.getByRole("button", { name: "See results" }).click();
    await expect(page.getByText("A little more familiar.", { exact: true })).toBeVisible();
    await expect(page.locator(".quiz-result strong")).toHaveText("100%");
    const progress = (await database(page)).wordProgress.filter((word) => complete.entries.some((entry) => entry.id === word.wordId));
    expect(progress.every((word) => word.stage === 1 && word.settledSessionIds.includes(complete.id))).toBe(true);
  });
}

test("one-word typing corrects and retries immediately; multiple choice explains insufficient options", async ({ page }) => {
  await page.goto("/ja/quiz?words=word-ja-1");
  await expect(page.getByText("0 eligible words", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start practice", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Ineligible words")).toContainText("No enabled question type can use this word");
  await page.getByRole("button", { name: /^Typing/ }).click();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page.locator(".quiz-question-card")).toBeVisible();
  const first = await answer(page, false);
  expect(first.reservations[0]).toMatchObject({ position: 1, interval: 0 });
  await expect(page.locator(".quiz-feedback")).toContainText("The answer is dog");
  await continueQuestion(page);
  await expect(page.getByText("Try this one again", { exact: true })).toBeVisible();
  const complete = await answer(page, true);
  expect(complete.attempts.map((attempt) => attempt.kind)).toEqual(["initial", "retry"]);
  expect(complete.attempts.map((attempt) => attempt.position)).toEqual([0, 1]);
  await page.getByRole("button", { name: "See results" }).click();
  await expect(page.locator(".quiz-result strong")).toHaveText("0%");
});

test("wrong-answer reservation survives save, refresh and resume in another tab", async ({ page, context }) => {
  const first = await start(page, "Typing");
  const incorrectWord = first.currentQuestion!.wordId;
  const afterError = await answer(page, false);
  expect(afterError.reservations).toEqual([{ wordId: incorrectWord, position: 4, interval: 3 }]);
  await continueQuestion(page);
  await page.getByRole("button", { name: "Save & exit" }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();

  const other = await context.newPage();
  await other.goto(`/ja/quiz?session=${first.id}`);
  await expect(other.locator(".quiz-question-card")).toBeVisible();
  let current = await latestSession(other);
  expect(current.attempts).toHaveLength(1);
  expect(current.reservations).toEqual(afterError.reservations);
  expect(current.questionTemplates).toEqual(first.questionTemplates);
  for (let step = 1; step <= 3; step += 1) {
    expect(current.currentQuestion!.wordId).not.toBe(incorrectWord);
    current = await answer(other);
    await continueQuestion(other);
  }
  current = await latestSession(other);
  expect(current.currentQuestion).toMatchObject({ wordId: incorrectWord, position: 4, kind: "retry" });
  current = await answer(other);
  expect(current.status).toBe("completed");
  expect(current.attempts).toHaveLength(5);
  const progress = (await database(other)).wordProgress.find((word) => word.wordId === incorrectWord)!;
  expect(progress.stage).toBe(0);
  expect(progress.firstAttempts).toBe(1);
  expect(progress.firstCorrect).toBe(0);
});

test("reading hints and prompt/option audio never submit an answer", async ({ page }) => {
  await start(page, "Japanese Reading", "word-ja-1,word-ja-2");
  await expect(page.locator(".quiz-reading")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Reading", exact: true }).click();
  await expect(page.locator(".quiz-reading")).toHaveCount(1);
  await page.locator(".quiz-prompt-tools .audio-button").click();
  expect((await latestSession(page)).attempts).toHaveLength(0);
  await page.getByRole("button", { name: "Hide Reading", exact: true }).click();
  await expect(page.locator(".quiz-reading")).toHaveCount(0);
  await answer(page);
  await continueQuestion(page);
  await expect(page.locator(".quiz-reading")).toHaveCount(0);
  await page.getByRole("button", { name: "End practice", exact: true }).click();
  await page.getByRole("button", { name: "New practice" }).click();
  await page.getByRole("button", { name: /^Meaning → Word/ }).click();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page.locator(".quiz-choice .audio-button")).toHaveCount(2);
  await page.locator(".quiz-choice .audio-button").first().click();
  expect((await latestSession(page)).attempts).toHaveLength(0);
  await expect(page.locator(".quiz-feedback")).toHaveCount(0);
});

test("editing vocabulary never changes a saved quiz's frozen choices", async ({ page }) => {
  const first = await start(page, "Word → Meaning", "word-ja-1,word-ja-2");
  const target = first.entries.find((entry) => entry.id === first.currentQuestion!.wordId)!;
  await page.getByRole("button", { name: "Save & exit" }).click();
  await page.goto("/ja/vocabulary");
  await expect(page.getByRole("heading", { name: "Vocabulary", exact: true })).toBeVisible();
  const row = page.locator("tbody tr").filter({ has: page.getByRole("checkbox", { name: `Select ${target.word}`, exact: true }) });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "English meaning *", exact: true }).fill("changed after the quiz began");
  await page.getByRole("textbox", { name: /Additional accepted English answers/ }).fill("new explicit answer");
  await page.getByRole("button", { name: "Save word", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Word updated.");
  await page.goto(`/ja/quiz?session=${first.id}`);
  await expect(page.locator(".quiz-question-card")).toBeVisible();
  const restored = await latestSession(page);
  expect(restored.questionTemplates).toEqual(first.questionTemplates);
  expect(restored.entries.find((entry) => entry.id === target.id)?.translation).toBe(target.translation);
  expect((await database(page)).entries.find((entry) => entry.id === target.id)?.translation).toBe("changed after the quiz began");
  const answered = await answer(page);
  expect(answered.attempts[0].correct).toBe(true);
});

test("separate tab answers produce a version conflict and load latest state", async ({ page, context }) => {
  const first = await start(page, "Typing", "word-ja-1,word-ja-2");
  const other = await context.newPage();
  await other.goto(`/ja/quiz?session=${first.id}`);
  await expect(other.locator(".quiz-question-card")).toBeVisible();
  await page.getByRole("textbox", { name: "English meaning" }).fill(first.currentQuestion!.acceptedAnswers[0]);
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.locator("main [role='alert']")).toContainText("latest version has been loaded");
  expect((await latestSession(page)).attempts).toHaveLength(0);
  await answer(page);
  await other.getByRole("textbox", { name: "English meaning" }).fill("different answer from other tab");
  await other.getByRole("button", { name: "Check answer" }).click();
  await expect(other.locator("main [role='alert']")).toContainText("latest version has been loaded");
  await expect(other.getByText(/Question 2/)).toBeVisible();
  expect((await latestSession(other)).attempts).toHaveLength(1);
});

test("due URL selects only due words and a foreign-language session is rejected", async ({ page }) => {
  await page.goto("/ja/quiz?due=1");
  await expect(page.getByRole("button", { name: "Start practice", exact: true })).toBeEnabled();
  const data = await database(page);
  const japanese = data.entries.filter((entry) => entry.language === "ja");
  await expect(page.locator(".quiz-word-list input:checked")).toHaveCount(japanese.length);
  const session = await start(page, "Typing", "word-ja-1");
  await page.getByRole("button", { name: "Save & exit" }).click();
  await page.goto(`/es/quiz?session=${session.id}`);
  await expect(page.locator("main [role='alert']")).toContainText("different language");
  await expect(page.locator(".quiz-question-card")).toHaveCount(0);
});
