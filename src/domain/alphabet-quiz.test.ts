import { describe, expect, it } from "vitest";
import { alphabetEntries } from "@/data/alphabet";
import type { AlphabetEntry, AlphabetQuizSession, VocabularyEntry } from "./models";
import { answerAlphabetQuiz, createAlphabetQuizSession } from "./alphabet-quiz";
import { answerQuiz, createQuizSession } from "./quiz";

const now = "2026-10-11T11:00:00.000Z";
function session(symbols: string[], sourceEntries = alphabetEntries): AlphabetQuizSession {
  const selected = symbols.map(symbol => sourceEntries.find(item => item.symbol === symbol)!);
  return createAlphabetQuizSession({ id: "alphabet-session", userId: "user", language: selected[0].language,
    itemIds: selected.map(item => item.id), randomSeed: 28, learningDate: "2026-10-11", now, sourceEntries });
}
function answer(current: AlphabetQuizSession, correct = true, id = `attempt-${current.attempts.length}`) {
  return answerAlphabetQuiz(current, correct ? current.currentQuestion!.acceptedAnswers[0] : "wrong", id, now);
}

describe("Alphabet pronunciation grading", () => {
  it.each([
    ["あ", "a", true], ["あ", " AH \n", true], ["あ", "i", false], ["し", "shee", true], ["きゃ", "kyah", true],
    ["B b", "b", true], ["B b", "be", false], ["H h", "silent", true], ["H h", "no sound", true], ["H h", "hache", false],
    ["β", "v", true], ["β", "b", false], ["δ", "dh", true], ["δ", "th", false], ["θ", "th", true], ["θ", "dh", false],
    ["Γ", "y", true], ["ξ", "x", true], ["φ", "ph", true], ["χ", "h", true], ["ς", "s", true],
  ] as const)("grades %s → %s as %s", (symbol, submitted, correct) => {
    expect(answerAlphabetQuiz(session([symbol]), submitted, "submission", now).attempts[0].correct).toBe(correct);
  });
  it("normalizes NFC, edge whitespace and English case without inferring answers", () => {
    const source = [structuredClone(alphabetEntries[0])];
    source[0].pronunciationAnswers = ["café"];
    expect(answerAlphabetQuiz(session([source[0].symbol], source), " CAFE\u0301\uFEFF", "id").attempts[0].correct).toBe(true);
    expect(answerAlphabetQuiz(session([source[0].symbol], source), "cafe", "id").attempts[0].correct).toBe(false);
  });
  it("rejects empty answers and missing submission IDs without recording attempts", () => {
    const original = session(["あ"]);
    expect(() => answerAlphabetQuiz(original, " \n\uFEFF", "id")).toThrow("Enter a pronunciation");
    expect(() => answerAlphabetQuiz(original, "a", " ")).toThrow("submission ID");
    expect(original.attempts).toEqual([]);
  });
  it("replays a submission even after completion, ignoring a changed answer", () => {
    const completed = answer(session(["あ"]), true, "same-id");
    expect(answerAlphabetQuiz(completed, "wrong", "same-id")).toBe(completed);
    expect(completed.attempts).toHaveLength(1);
  });
});

describe("Alphabet immutable content and independent history", () => {
  it("freezes full metadata, audio, answers, templates and configuration across save/refresh/resume/retry", () => {
    const source = [structuredClone(alphabetEntries[0])];
    const original = session(["あ"], source);
    const oldItem = structuredClone(original.items[0]);
    source[0] = { ...source[0], symbol: "new", name: "new name", pronunciation: "new hint", pronunciationAnswers: ["new", "other"],
      example: "new example", exampleTranslation: "new translation", audioText: "new audio", exampleReading: "new reading", group: "new group" };
    const saved = { ...answer(original, false), status: "saved" as const };
    const restored = JSON.parse(JSON.stringify(saved)) as AlphabetQuizSession;
    const resumed = { ...restored, status: "active" as const };
    const completed = answerAlphabetQuiz(resumed, "ah", "retry", now);
    expect(completed.items).toEqual([oldItem]);
    expect(completed.questionTemplates).toEqual(original.questionTemplates);
    expect(completed.configuration).toEqual(original.configuration);
    expect(completed.contentVersion).toBe(1);
    expect(completed.attempts.at(-1)?.correct).toBe(true);
    expect(completed.currentQuestion).toBeNull();
    const newSession = createAlphabetQuizSession({ id: "new", userId: "user", language: "ja", itemIds: [source[0].id],
      randomSeed: 28, learningDate: "2026-10-11", sourceEntries: source });
    expect(newSession.items[0]).toMatchObject({ symbol: "new", pronunciationAnswers: ["new", "other"], audioText: "new audio" });
    expect(newSession.currentQuestion?.acceptedAnswers).toEqual(["new", "other"]);
  });
  it("validates IDs, language and explicit pronunciation arrays only at creation", () => {
    const base = { id: "s", userId: "user", language: "ja" as const, randomSeed: 1, learningDate: "2026-10-11" };
    expect(() => createAlphabetQuizSession({ ...base, itemIds: [] })).toThrow("Select at least one");
    expect(() => createAlphabetQuizSession({ ...base, itemIds: ["missing"] })).toThrow("unavailable");
    expect(() => createAlphabetQuizSession({ ...base, itemIds: ["es-letter-0"] })).toThrow("this language");
    expect(() => createAlphabetQuizSession({ ...base, itemIds: [alphabetEntries[0].id], sourceEntries: [{ ...alphabetEntries[0], pronunciationAnswers: [] }] })).toThrow("valid pronunciation");
    const duplicateIds = createAlphabetQuizSession({ ...base, itemIds: [alphabetEntries[0].id, alphabetEntries[0].id] });
    expect(duplicateIds.items).toHaveLength(1);
  });
  it("preserves group selections and has no Vocabulary/SRS fields", () => {
    const source = alphabetEntries.filter(item => item.group === "Handakuten · Hiragana");
    const selected = session(source.map(item => item.symbol));
    expect(selected.items).toHaveLength(5);
    expect(selected.items.every(item => item.group === "Handakuten · Hiragana")).toBe(true);
    expect(selected).not.toHaveProperty("entries");
    expect(selected).not.toHaveProperty("dueWordIds");
    expect(selected).not.toHaveProperty("settled");
    expect(selected).not.toHaveProperty("hints");
  });
});

describe("Alphabet reuses Vocabulary randomization and retry rules", () => {
  it("one character retries immediately until correct", () => {
    let current = session(["あ"]);
    current = answer(current, false);
    expect(current.currentQuestion).toMatchObject({ kind: "retry", itemId: current.items[0].itemId, position: 1 });
    expect(current.reservations).toEqual([{ itemId: current.items[0].itemId, position: 1, interval: 0 }]);
    current = answer(current, false);
    expect(current.currentQuestion?.position).toBe(2);
    current = answer(current);
    expect(current.status).toBe("completed");
    expect(current.attempts.filter(attempt => attempt.kind === "initial")).toHaveLength(1);
  });
  it.each([1, 2, 3, 4, 10, 11, 27])("matches existing typing scheduler sequence and state for %i items", count => {
    const source: AlphabetEntry[] = alphabetEntries.filter(item => item.language === "es").slice(0, count);
    const entries: VocabularyEntry[] = source.map(item => ({ id: item.id, userId: "user", language: "es", listId: "list",
      word: item.symbol, translation: item.pronunciationAnswers[0], reading: "", type: "", category: "", example: "", notes: "",
      acceptedAnswers: item.pronunciationAnswers.slice(1).map((text, i) => ({ id: String(i), text })), createdAt: now, updatedAt: now }));
    let alphabet = createAlphabetQuizSession({ id: "session", userId: "user", language: "es", itemIds: source.map(item => item.id),
      randomSeed: 19, learningDate: "2026-10-11", now });
    let vocabulary = createQuizSession({ id: "session", userId: "user", language: "es", entries, type: "typing", randomSeed: 19, learningDate: "2026-10-11", now });
    for (let step = 0; alphabet.status === "active" && step < 200; step++) {
      expect(alphabet.currentQuestion).toMatchObject({ itemId: vocabulary.currentQuestion!.wordId,
        kind: vocabulary.currentQuestion!.kind, position: vocabulary.currentQuestion!.position });
      expect(alphabet.randomState).toBe(vocabulary.randomState);
      const correct = step % 3 !== 0 || step > count * 2;
      const submitted = correct ? alphabet.currentQuestion!.acceptedAnswers[0] : "wrong";
      alphabet = answerAlphabetQuiz(alphabet, submitted, `attempt-${step}`, now);
      vocabulary = answerQuiz(vocabulary, submitted, `attempt-${step}`, now);
      expect(alphabet.status).toBe(vocabulary.status);
      expect(alphabet.reservations.map(item => ({ ...item, wordId: item.itemId, itemId: undefined })))
        .toEqual(vocabulary.reservations.map(item => ({ ...item, itemId: undefined })));
    }
    expect(alphabet.status).toBe("completed");
  });
});
