import { expect, test, type Page } from "@playwright/test";
import { alphabetEntries } from "../../src/data/alphabet";
import { createAlphabetQuizSession } from "../../src/domain/alphabet-quiz";
import type { AlphabetQuizSession, LanguageCode } from "../../src/domain/models";
import type { LocalDatabase } from "../../src/repositories/storage";

const storageKey = "ninglingo:development:v1";

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    class TestUtterance {
      text: string;
      lang = "";
      rate = 1;
      voice: object | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: TestUtterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [{ name: "Japanese", lang: "ja-JP" }, { name: "Spanish", lang: "es-ES" }, { name: "Greek", lang: "el-GR" }, { name: "Korean", lang: "ko-KR" }],
      cancel: () => undefined,
      speak: (utterance: TestUtterance) => { document.documentElement.dataset.alphabetSpoken = utterance.text; window.setTimeout(() => utterance.onend?.(), 5); },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } });
  });
});

async function database(page: Page): Promise<LocalDatabase> {
  const raw = await page.evaluate(key => window.localStorage.getItem(key), storageKey);
  if (!raw) throw new Error("Development database is unavailable.");
  return JSON.parse(raw) as LocalDatabase;
}

async function latest(page: Page): Promise<AlphabetQuizSession> {
  const session = (await database(page)).alphabetSessions.at(-1);
  if (!session) throw new Error("No alphabet quiz was created.");
  return session;
}

async function prepare(page: Page, language: LanguageCode, symbols: string[]): Promise<AlphabetQuizSession> {
  await page.goto(`/${language}/alphabet`);
  await expect(page.getByRole("button", { name: "Start alphabet quiz", exact: true })).toBeEnabled();
  const data = await database(page);
  const itemIds = symbols.map(symbol => {
    const item = alphabetEntries.find(candidate => candidate.language === language && candidate.symbol === symbol);
    if (!item) throw new Error(`Missing test character ${symbol}.`);
    return item.id;
  });
  const session = createAlphabetQuizSession({ id: crypto.randomUUID(), userId: data.profile.id, language, itemIds, randomSeed: 13, learningDate: "2026-10-11" });
  await page.evaluate(({ key, session }) => {
    const data = JSON.parse(window.localStorage.getItem(key)!);
    data.alphabetSessions.push(session);
    window.localStorage.setItem(key, JSON.stringify(data));
  }, { key: storageKey, session });
  await page.goto(`/${language}/alphabet?session=${session.id}`);
  await expect(page.locator(".alphabet-quiz-card")).toBeVisible();
  return latest(page);
}

async function answer(page: Page, value: string) {
  await page.getByRole("textbox", { name: "Pronunciation", exact: true }).fill(value);
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.locator(".quiz-feedback")).toBeVisible();
  return latest(page);
}

for (const [language, group] of [["ja", "Hiragana"], ["es", "Alphabet"], ["el", "Final sigma"]] satisfies [LanguageCode, string][]) {
  test(`${language} starts the selected Alphabet group and retains All groups browsing`, async ({ page }) => {
    await page.goto(`/${language}/alphabet`);
    await expect(page.getByRole("button", { name: "Start alphabet quiz", exact: true })).toBeEnabled();
    const entries = alphabetEntries.filter(item => item.language === language);
    await expect(page.locator(".alphabet-card")).toHaveCount(entries.length);
    await page.getByLabel("Letter group").selectOption(group);
    const selected = entries.filter(item => item.group === group);
    await expect(page.locator(".alphabet-card")).toHaveCount(selected.length);
    await page.getByRole("button", { name: "Start alphabet quiz", exact: true }).click();
    await expect(page.locator(".alphabet-quiz-card")).toBeVisible();
    const session = await latest(page);
    expect(session.items.map(item => item.itemId).sort()).toEqual(selected.map(item => item.id).sort());
    expect(new URL(page.url()).searchParams.get("session")).toBe(session.id);
    await expect(page.locator(".alphabet-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Check answer", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "End alphabet quiz", exact: true }).click();
    await expect(page.getByText("Alphabet practice ended", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "New alphabet quiz", exact: true }).click();
    await page.getByLabel("Letter group").selectOption("");
    await expect(page.locator(".alphabet-card")).toHaveCount(entries.length);
    await page.getByRole("button", { name: "Start alphabet quiz", exact: true }).click();
    await expect(page.locator(".alphabet-quiz-card")).toBeVisible();
    expect((await latest(page)).items).toHaveLength(entries.length);
  });
}

for (const [language, symbol, accepted, rejected] of [
  ["ja", "あ", "  AH  ", "wrong"],
  ["es", "B b", "b", "be"],
  ["es", "H h", "silent", "h"],
  ["el", "β", "v", "b"],
  ["el", "δ", "dh", "th"],
] satisfies [LanguageCode, string, string, string][]) {
  test(`${language} ${symbol} rejects ${rejected} and accepts ${accepted.trim()} on its single-character retry`, async ({ page }) => {
    const initial = await prepare(page, language, [symbol]);
    const before = (await database(page)).wordProgress;
    const incorrect = await answer(page, rejected);
    expect(incorrect.attempts[0].correct).toBe(false);
    expect(incorrect.reservations[0]).toMatchObject({ itemId: initial.items[0].itemId, position: 1, interval: 0 });
    await expect(page.locator(".quiz-feedback")).toContainText(`The standard pronunciation is ${initial.items[0].pronunciationAnswers[0]}.`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Try this one again", { exact: true })).toBeVisible();
    const completed = await answer(page, accepted);
    expect(completed.status).toBe("completed");
    expect(completed.attempts.map(attempt => [attempt.kind, attempt.correct])).toEqual([["initial", false], ["retry", true]]);
    await expect(page.getByRole("button", { name: "Save & exit", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "End alphabet quiz", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "See results", exact: true }).click();
    await expect(page.locator(".quiz-result strong")).toHaveText("0%");
    expect((await database(page)).wordProgress).toEqual(before);
  });
}

test("letter-name and association hints and audio change no records, and reset on next question and resume", async ({ page }) => {
  const initial = await prepare(page, "ja", ["あ", "い"]);
  const original = await database(page);
  const item = initial.items.find(candidate => candidate.itemId === initial.currentQuestion!.itemId)!;
  await expect(page.locator(".alphabet-name-hint")).toHaveCount(0);
  await expect(page.locator(".alphabet-association-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Letter Name", exact: true }).click();
  await expect(page.locator(".alphabet-name-hint")).toHaveText(item.name);
  await expect(page.locator(".alphabet-association-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Association", exact: true }).click();
  await expect(page.locator(".alphabet-association-hint")).toContainText(item.pronunciation);
  await expect(page.locator(".alphabet-association-hint")).toContainText(item.exampleTranslation);
  await page.locator(".alphabet-association-hint .audio-button").first().click();
  expect(await database(page)).toEqual(original);
  await answer(page, item.pronunciationAnswers[0]);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".alphabet-name-hint")).toHaveCount(0);
  await expect(page.locator(".alphabet-association-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Association", exact: true }).click();
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume alphabet quiz", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Resume alphabet quiz", exact: true }).click();
  await expect(page.locator(".alphabet-quiz-card")).toBeVisible();
  await expect(page.locator(".alphabet-association-hint")).toHaveCount(0);
  expect((await latest(page)).items).toEqual(initial.items);
  await page.goto("/ja/progress");
  const history = page.getByRole("region", { name: "Alphabet practice history", exact: true });
  await expect(history.locator(".alphabet-accuracy")).toHaveText("100%");
  await expect(history.getByRole("link", { name: "Resume alphabet quiz", exact: true })).toBeVisible();
  await expect(page.getByText("Learning streak · all languages", { exact: true }).locator("..")).toContainText("1 days");
  expect((await database(page)).sessions).toHaveLength(0);
});

test("a saved snapshot supplies characters, names, associations, audio and all answers after reload", async ({ page }) => {
  const initial = await prepare(page, "el", ["ς"]);
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  // Deliberately use fixture content different from current static Alphabet data.
  // If any resumed UI or grading re-resolves static content, these assertions fail.
  await page.evaluate(({ key, id }) => {
    const data = JSON.parse(window.localStorage.getItem(key)!);
    const session = data.alphabetSessions.find((candidate: { id: string }) => candidate.id === id);
    Object.assign(session.items[0], { symbol: "Frozen character", name: "Frozen name", pronunciation: "Frozen hint", example: "Frozen example", exampleTranslation: "Frozen meaning", audioText: "Frozen audio", exampleReading: "Frozen reading", pronunciationAnswers: ["frozen", "alternate"] });
    for (const question of [...session.questionTemplates, ...session.questions, session.currentQuestion]) Object.assign(question, { prompt: "Frozen character", acceptedAnswers: ["frozen", "alternate"] });
    window.localStorage.setItem(key, JSON.stringify(data));
  }, { key: storageKey, id: initial.id });
  await page.goto(`/el/alphabet?session=${initial.id}`);
  await expect(page.locator(".alphabet-quiz-symbol")).toHaveText("Frozen character");
  await page.getByRole("button", { name: "Show Letter Name", exact: true }).click();
  await expect(page.locator(".alphabet-name-hint")).toHaveText("Frozen name");
  await page.getByRole("button", { name: "Show Association", exact: true }).click();
  await expect(page.locator(".alphabet-association-hint")).toContainText("Frozen hint");
  await expect(page.locator(".alphabet-association-hint")).toContainText("Frozen example");
  await expect(page.locator(".alphabet-association-hint")).toContainText("Frozen meaning");
  await page.locator(".alphabet-association-hint .audio-button").first().click();
  await expect(page.locator("html")).toHaveAttribute("data-alphabet-spoken", "Frozen audio");
  await page.locator(".alphabet-association-hint .audio-button").last().click();
  await expect(page.locator("html")).toHaveAttribute("data-alphabet-spoken", "Frozen example");
  const current = await latest(page);
  expect(current.items[0]).toMatchObject({ audioText: "Frozen audio", exampleReading: "Frozen reading", pronunciationAnswers: ["frozen", "alternate"] });
  await answer(page, "s");
  await expect(page.locator(".quiz-feedback")).toContainText("The standard pronunciation is frozen.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Resume alphabet quiz", exact: true }).click();
  await expect(page.locator(".alphabet-quiz-symbol")).toHaveText("Frozen character");
  await expect(page.locator(".alphabet-association-hint")).toHaveCount(0);
  expect((await latest(page)).items).toEqual(current.items);
  const completed = await answer(page, "alternate");
  expect(completed.attempts.map(attempt => attempt.correct)).toEqual([false, true]);
});

test("another tab resumes or answers and conflicts load its latest version without adding attempts", async ({ page, context }) => {
  const initial = await prepare(page, "ja", ["あ", "い"]);
  const other = await context.newPage();
  await other.goto(`/ja/alphabet?session=${initial.id}`);
  await expect(other.locator(".alphabet-quiz-card")).toBeVisible();
  await page.getByRole("textbox", { name: "Pronunciation", exact: true }).fill(initial.currentQuestion!.acceptedAnswers[0]);
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.locator("main [role='alert']")).toContainText("latest version has been loaded");
  expect((await latest(page)).attempts).toHaveLength(0);
  await answer(page, initial.currentQuestion!.acceptedAnswers[0]);
  await other.getByRole("textbox", { name: "Pronunciation", exact: true }).fill("stale answer");
  await other.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(other.locator("main [role='alert']")).toContainText("latest version has been loaded");
  await expect(other.locator(".alphabet-association-hint")).toHaveCount(0);
  expect((await latest(page)).attempts).toHaveLength(1);
  await other.goto(`/es/alphabet?session=${initial.id}`);
  await expect(other.locator("main [role='alert']")).toContainText("different language");
  await expect(other.locator(".alphabet-quiz-card")).toHaveCount(0);
});

test("older completed Alphabet history remains accessible through Show more", async ({ page }) => {
  const initial = await prepare(page, "el", ["ς"]);
  const sessions = Array.from({ length: 13 }, (_, index): AlphabetQuizSession => ({
    ...initial, id: crypto.randomUUID(), status: "ended", currentQuestion: null,
    updatedAt: new Date(Date.UTC(2026, 9, 11, 0, index)).toISOString(),
  }));
  await page.evaluate(({ key, sessions }) => {
    const data = JSON.parse(window.localStorage.getItem(key)!);
    data.alphabetSessions = sessions;
    window.localStorage.setItem(key, JSON.stringify(data));
  }, { key: storageKey, sessions });
  await page.goto("/el/progress");
  const history = page.getByRole("region", { name: "Alphabet practice history", exact: true });
  await expect(history.getByRole("link", { name: "View alphabet quiz", exact: true })).toHaveCount(12);
  await history.getByRole("button", { name: "Show more alphabet history", exact: true }).click();
  await expect(history.getByRole("link", { name: "View alphabet quiz", exact: true })).toHaveCount(13);
  await history.getByRole("link", { name: "View alphabet quiz", exact: true }).last().click();
  await expect(page.getByText("Alphabet practice ended", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("session")).toBe(sessions[0].id);
});

test("Alphabet MCQ freezes four options through keyboard selection, retry, refresh and history", async ({ page }) => {
  await page.goto("/ja/alphabet");
  await page.getByLabel("Alphabet question type", { exact: true }).selectOption("mcq");
  await page.getByLabel("Alphabet direction", { exact: true }).selectOption("mixed");
  await page.getByRole("button", { name: "Start alphabet quiz", exact: true }).click();
  await expect(page.getByRole("radio")).toHaveCount(4);
  // Narrow the fixture to one tested character without altering its frozen template.
  const created = await latest(page);
  const selected = created.currentQuestion!;
  await page.evaluate(({ key, id, itemId }) => {
    const data = JSON.parse(window.localStorage.getItem(key)!);
    const session = data.alphabetSessions.find((item: { id: string }) => item.id === id);
    session.items = session.items.filter((item: { itemId: string }) => item.itemId === itemId);
    session.questionTemplates = session.questionTemplates.filter((item: { itemId: string }) => item.itemId === itemId);
    session.configuration.retryRange = [0, 0];
    window.localStorage.setItem(key, JSON.stringify(data));
  }, { key: storageKey, id: created.id, itemId: selected.itemId });
  await page.reload();
  const initial = await latest(page);
  const frozen = initial.currentQuestion!;
  const wrong = frozen.options!.find(option => option.id !== frozen.correctOptionId)!;
  await page.locator(`input[type="radio"][value="${wrong.id}"]`).focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.locator(".quiz-feedback")).toContainText("scheduled for another try");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect((await latest(page)).currentQuestion?.options).toEqual(frozen.options);
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Resume alphabet quiz", exact: true }).click();
  await expect(page.getByRole("radio")).toHaveCount(4);
  expect((await latest(page)).currentQuestion).toMatchObject({ options: frozen.options, direction: frozen.direction, correctOptionId: frozen.correctOptionId });
  await page.locator(`input[type="radio"][value="${frozen.correctOptionId}"]`).check();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await page.getByRole("button", { name: "See results", exact: true }).click();
  await expect(page.getByLabel("Alphabet answer history").locator("article")).toHaveCount(2);
  await page.reload();
  await expect(page.getByLabel("Alphabet answer history").locator("article")).toHaveCount(2);
  const history = await latest(page);
  expect(history.questions.every(question => JSON.stringify(question.options) === JSON.stringify(frozen.options))).toBe(true);
});

test("Korean automatic Alphabet playback uses Hangul and waits until feedback is dismissed", async ({ page }) => {
  await page.goto("/ko/alphabet");
  await page.getByLabel("Automatic alphabet audio", { exact: true }).check();
  await page.getByRole("button", { name: "Start alphabet quiz", exact: true }).click();
  await expect(page.locator(".alphabet-quiz-card")).toBeVisible();
  const session = await latest(page);
  const first = session.items.find(item => item.itemId === session.currentQuestion!.itemId)!;
  await expect(page.locator("html")).toHaveAttribute("data-alphabet-spoken", first.audioText);
  expect(first.audioText).toMatch(/[\uAC00-\uD7A3]/);
  await answer(page, session.currentQuestion!.acceptedAnswers[0]);
  const next = await latest(page);
  await expect(page.locator("html")).toHaveAttribute("data-alphabet-spoken", first.audioText);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const second = next.items.find(item => item.itemId === next.currentQuestion!.itemId)!;
  await expect(page.locator("html")).toHaveAttribute("data-alphabet-spoken", second.audioText);
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Automatic alphabet audio", { exact: true })).toBeChecked();
});
