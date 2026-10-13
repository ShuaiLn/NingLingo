import { describe, expect, it } from "vitest";
import { alphabetEntries } from "@/data/alphabet";
import type { AlphabetEntry, AlphabetQuizSession, VocabularyEntry } from "./models";
import { alphabetMcqEligibility, answerAlphabetQuiz, createAlphabetQuizSession } from "./alphabet-quiz";
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

describe("Alphabet frozen four-option questions", () => {
  const create = (language: AlphabetEntry["language"], direction: "character-to-pronunciation" | "pronunciation-to-character" | "mixed", randomSeed = 24) => createAlphabetQuizSession({ id: "mcq", userId: "user", language,
    itemIds: alphabetEntries.filter(item => item.language === language).map(item => item.id), mode: "mcq", direction, randomSeed, learningDate: "2026-10-12", now });
  it.each(["ja", "es", "el", "ko"] as const)("creates uniquely defensible frozen options in both directions for %s", language => {
    for (const direction of ["character-to-pronunciation", "pronunciation-to-character", "mixed"] as const) {
      const quiz = create(language, direction);
      expect(quiz.items.length).toBeGreaterThan(0);
      expect(quiz.questionTemplates).toHaveLength(quiz.items.length);
      for (const question of quiz.questionTemplates) {
        expect(question.mode).toBe("mcq");
        if (direction !== "mixed") expect(question.direction).toBe(direction);
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options!.map(option => option.id)).size).toBe(4);
        expect(new Set(question.options!.map(option => option.text.normalize("NFC").trim().toLowerCase())).size).toBe(4);
        expect(question.options!.filter(option => option.id === question.correctOptionId)).toHaveLength(1);
        const target = quiz.items.find(item => item.itemId === question.itemId)!;
        const defensible = question.direction === "character-to-pronunciation"
          ? question.options!.filter(option => option.pronunciationAnswers.some(value => target.pronunciationAnswers.includes(value)))
          : question.options!.filter(option => option.pronunciationAnswers.includes(question.prompt));
        expect(defensible.map(option => option.id)).toEqual([question.correctOptionId]);
      }
    }
  });
  it("keeps homophone targets in both directions and removes their competing choices", () => {
    for (const direction of ["character-to-pronunciation", "pronunciation-to-character"] as const) {
      const quiz = create("ja", direction);
      for (const symbol of ["じ", "ぢ", "ジ", "ヂ"]) {
        const target = quiz.items.find(item => item.symbol === symbol)!;
        expect(target).toBeDefined();
        const question = quiz.questionTemplates.find(question => question.itemId === target.itemId)!;
        expect(question.options!.filter(option => option.pronunciationAnswers.includes("ji"))).toHaveLength(1);
      }
    }
  });
  it("checks each direction independently and uses only an enabled feasible direction", () => {
    const source = [
      { ...alphabetEntries[0], id: "target", symbol: "X", pronunciationAnswers: ["x", "y"] },
      { ...alphabetEntries[0], id: "y", symbol: "Y", pronunciationAnswers: ["y"] },
      { ...alphabetEntries[0], id: "z", symbol: "Z", pronunciationAnswers: ["z"] },
      { ...alphabetEntries[0], id: "v", symbol: "V", pronunciationAnswers: ["v"] },
    ];
    expect(alphabetMcqEligibility(source[0], "mixed", source)).toMatchObject({ feasible: ["pronunciation-to-character"], skipped: [{ direction: "character-to-pronunciation" }] });
    const input = { id: "s", userId: "user", language: "ja" as const, itemIds: ["target"], mode: "mcq" as const, randomSeed: 7, learningDate: "2026-10-12", sourceEntries: source };
    expect(() => createAlphabetQuizSession({ ...input, direction: "character-to-pronunciation" })).toThrow("cannot form four");
    const quiz = createAlphabetQuizSession({ ...input, direction: "mixed" });
    expect(quiz.currentQuestion?.direction).toBe("pronunciation-to-character");
    expect(quiz.configuration.skippedItems).toHaveLength(1);
  });
  it("tries alternative distractors when overlapping variants block a greedy choice", () => {
    const source = [
      { ...alphabetEntries[0], id: "t", pronunciationAnswers: ["t"] },
      { ...alphabetEntries[0], id: "xy", pronunciationAnswers: ["x", "y"] },
      { ...alphabetEntries[0], id: "x", pronunciationAnswers: ["x"] },
      { ...alphabetEntries[0], id: "y", pronunciationAnswers: ["y"] },
      { ...alphabetEntries[0], id: "z", pronunciationAnswers: ["z"] },
    ];
    expect(alphabetMcqEligibility(source[0], "character-to-pronunciation", source).feasible).toEqual(["character-to-pronunciation"]);
  });
  it("freezes options, option order, direction and correct ID through retries, serialization and changed live content", () => {
    const source = structuredClone(alphabetEntries.filter(item => item.language === "ja"));
    const original = createAlphabetQuizSession({ id: "s", userId: "user", language: "ja", itemIds: [source[0].id], mode: "mcq", direction: "mixed", sourceEntries: source, randomSeed: 9, learningDate: "2026-10-12" });
    const frozen = structuredClone(original.currentQuestion!);
    expect(() => answerAlphabetQuiz(original, frozen.options![0].text, "invalid")).toThrow("frozen answer options");
    let quiz = answerAlphabetQuiz(original, frozen.options!.find(option => option.id !== frozen.correctOptionId)!.id, "wrong");
    for (const item of source) { item.symbol = "changed"; item.pronunciationAnswers = ["changed"]; }
    quiz = JSON.parse(JSON.stringify({ ...quiz, status: "saved" })) as AlphabetQuizSession;
    quiz.status = "active";
    expect(quiz.currentQuestion).toMatchObject({ options: frozen.options, direction: frozen.direction, correctOptionId: frozen.correctOptionId });
    quiz = answerAlphabetQuiz(quiz, frozen.correctOptionId!, "correct");
    expect(quiz.status).toBe("completed");
    expect(quiz.questions.every(question => JSON.stringify(question.options) === JSON.stringify(frozen.options))).toBe(true);
    expect(quiz.attempts.map(attempt => [attempt.kind, attempt.correct])).toEqual([["initial", false], ["retry", true]]);
    expect(answerAlphabetQuiz(quiz, "changed replay", "correct")).toBe(quiz);
    expect(quiz.questionTemplates).toEqual(original.questionTemplates);
  });
  it("has stable templates and scheduler RNG for a fixed selection and seed", () => {
    expect(create("el", "mixed", 123)).toEqual(create("el", "mixed", 123));
    expect(create("el", "mixed", 124).questionTemplates).not.toEqual(create("el", "mixed", 123).questionTemplates);
  });
  it("recomputes feasibility for later creations after source content changes", () => {
    const source = ["a", "i", "u", "e"].map((sound, index) => ({ ...alphabetEntries[0], id: `source-${index}`, symbol: `symbol-${index}`, pronunciationAnswers: [sound] }));
    const input = { id: "s", userId: "user", language: source[0].language, itemIds: [source[0].id], mode: "mcq" as const,
      direction: "character-to-pronunciation" as const, sourceEntries: source, randomSeed: 18, learningDate: "2026-10-12" };
    const frozen = createAlphabetQuizSession(input);
    source[1].pronunciationAnswers = ["a"];
    expect(() => createAlphabetQuizSession({ ...input, id: "later" })).toThrow("cannot form four");
    expect(answerAlphabetQuiz(frozen, frozen.currentQuestion!.correctOptionId!, "frozen-answer").attempts[0].correct).toBe(true);
  });
});
