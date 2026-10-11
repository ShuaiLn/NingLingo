import { describe, expect, it } from "vitest";
import { answerQuiz, createQuizSession, normalizeAnswer, quizSetup, retryIntervalRange } from "./quiz";
import type { QuizSession } from "./models";
import { testEntry, testSession } from "./test-fixtures";

function correctAnswer(session: QuizSession): string {
  return session.currentQuestion!.correctChoiceId ?? session.currentQuestion!.acceptedAnswers[0];
}

function answer(session: QuizSession, correct: boolean, step: number): QuizSession {
  return answerQuiz(session, correct ? correctAnswer(session) : "wrong", `submission-${step}`, "2026-10-11T11:00:00.000Z");
}

describe("quiz setup and frozen configuration", () => {
  it.each([[1, [0, 0]], [2, [1, 1]], [3, [1, 2]], [4, [3, 3]], [10, [3, 9]], [11, [3, 10]]] as const)("n=%i uses exact retry range", (n, range) => {
    expect(retryIntervalRange(n)).toEqual(range);
    expect(testSession(n).configuration.retryRange).toEqual(range);
  });

  it("allows one-word Typing, rejects a one-word multiple choice quiz", () => {
    expect(testSession(1).currentQuestion).not.toBeNull();
    expect(() => testSession(1, 1, "word-meaning")).toThrow("fewer than two");
    expect(() => testSession(1, 1, "meaning-word")).toThrow("choose Typing");
  });

  it("rejects empty selection and cross-user/cross-language input", () => {
    expect(() => testSession(0)).toThrow("Select at least one");
    expect(() => createQuizSession({ id: "s", userId: "other", language: "ja", entries: [testEntry(0)], type: "typing", randomSeed: 1, learningDate: "2026-10-11" })).toThrow("current user");
  });

  it.each(["word-meaning", "meaning-word", "japanese-reading"] as const)("creates 2–4 unique %s choices only from selected words", (type) => {
    const session = testSession(11, 17, type);
    for (const template of session.questionTemplates) {
      expect(template.choices.length).toBeGreaterThanOrEqual(2);
      expect(template.choices.length).toBeLessThanOrEqual(4);
      expect(new Set(template.choices.map((choice) => normalizeAnswer(choice.text))).size).toBe(template.choices.length);
      expect(template.choices.every((choice) => session.entries.some((entry) => entry.id === choice.id))).toBe(true);
    }
  });

  it("excludes accepted-answer synonyms and homograph distractors", () => {
    const entries = [
      testEntry(0, { word: "犬", translation: "dog", acceptedAnswers: [{ id: "a", text: "canine" }] }),
      testEntry(1, { word: "わんこ", translation: "canine" }),
      testEntry(2, { word: "犬", translation: "hound" }),
      testEntry(3, { word: "猫", translation: "cat" }),
    ];
    const session = createQuizSession({ id: "s", userId: "user", language: "ja", entries, type: "word-meaning", randomSeed: 1, learningDate: "2026-10-11" });
    const template = session.questionTemplates.find((question) => question.wordId === "word-0")!;
    expect(template.choices.map((choice) => choice.text)).toEqual(expect.arrayContaining(["dog", "cat"]));
    expect(template.choices.map((choice) => choice.text)).not.toEqual(expect.arrayContaining(["canine"]));
    expect(template.choices.some((choice) => choice.text === "hound")).toBe(false);
    expect(() => quizSetup({ entries: entries.slice(0, 2), type: "meaning-word" })).toThrow("unambiguous");
  });

  it("filters missing Japanese readings before computing actual n", () => {
    const result = quizSetup({ entries: [testEntry(0), testEntry(1), testEntry(2, { reading: "" })], type: "japanese-reading" });
    expect(result.entries).toHaveLength(2);
    expect(result.retryRange).toEqual([1, 1]);
  });

  it("treats Hiragana and Katakana equivalents as ambiguous reading choices", () => {
    expect(() => quizSetup({ entries: [testEntry(0, { reading: "いぬ" }), testEntry(1, { reading: "イヌ" })], type: "japanese-reading" })).toThrow("unambiguous");
  });

  it.each(["word-meaning", "meaning-word", "japanese-reading"] as const)("%s excludes homographs without deleting distinct meanings", (type) => {
    const entries = [
      testEntry(0, { word: "banco", reading: "ばんこ", translation: "bank" }),
      testEntry(1, { word: "banco", reading: "ばんこう", translation: "bench" }),
      testEntry(2, { word: "casa", reading: "かさ", translation: "house" }),
    ];
    expect(() => quizSetup({ entries: entries.slice(0, 2), type })).toThrow("choose Typing");
    const session = createQuizSession({ id: "s", userId: "user", language: "ja", entries, type, randomSeed: 1, learningDate: "2026-10-11" });
    expect(session.entries).toHaveLength(3);
    expect(session.questionTemplates.find((question) => question.wordId === "word-0")!.choices.some((choice) => choice.id === "word-1")).toBe(false);
    expect(session.questionTemplates.find((question) => question.wordId === "word-1")!.choices.some((choice) => choice.id === "word-0")).toBe(false);
  });

  it("treats existing kana spelling variants as the same written prompt", () => {
    const entries = [testEntry(0, { word: "いぬ", reading: "いぬ", translation: "dog" }), testEntry(1, { word: "イヌ", reading: "いぬう", translation: "hound" })];
    expect(() => quizSetup({ entries, type: "word-meaning" })).toThrow("choose Typing");
    expect(() => quizSetup({ entries, type: "japanese-reading" })).toThrow("choose Typing");
  });

  it("only Japanese option audio uses reading instead of the written word", () => {
    const entries = [
      testEntry(0, { language: "es", word: "casa", reading: "kah-sah", translation: "house" }),
      testEntry(1, { language: "es", word: "perro", reading: "peh-rroh", translation: "dog" }),
    ];
    const spanish = createQuizSession({ id: "s", userId: "user", language: "es", entries, type: "meaning-word", randomSeed: 1, learningDate: "2026-10-11" });
    expect(spanish.questionTemplates.every((question) => question.choices.every((choice) => choice.audioText === choice.text))).toBe(true);
    const japanese = testSession(2, 1, "meaning-word");
    expect(japanese.questionTemplates.every((question) => question.choices.every((choice) => choice.audioText === japanese.entries.find((entry) => entry.id === choice.id)?.reading))).toBe(true);
  });

  it("freezes entries, accepted answers, question choices and type", () => {
    const entries = [testEntry(0, { acceptedAnswers: [{ id: "a", text: "alternative" }] })];
    const session = createQuizSession({ id: "s", userId: "user", language: "ja", entries, type: "typing", randomSeed: 2, learningDate: "2026-10-11" });
    entries[0].translation = "changed";
    entries[0].acceptedAnswers[0].text = "changed";
    expect(session.entries[0].translation).toBe("meaning 0");
    expect(session.currentQuestion?.acceptedAnswers).toContain("alternative");
    expect(answerQuiz(session, "alternative").attempts[0].correct).toBe(true);
  });

  it("normalizes only trimmed case-insensitive canonical Unicode and explicit answers", () => {
    const session = createQuizSession({ id: "s", userId: "user", language: "ja", entries: [testEntry(0, { translation: "café", acceptedAnswers: [{ id: "a", text: "coffee shop" }] })], type: "typing", randomSeed: 1, learningDate: "2026-10-11" });
    expect(answerQuiz(session, "  CAFE\u0301 \n").attempts[0].correct).toBe(true);
    expect(answerQuiz(session, "COFFEE SHOP").attempts[0].correct).toBe(true);
    expect(answerQuiz(session, "cafe").attempts[0].correct).toBe(false);
    expect(answerQuiz(session, "espresso bar").attempts[0].correct).toBe(false);
  });
});

describe("deterministic retry scheduling", () => {
  it("one-word errors retry immediately with zero intervening questions", () => {
    let session = testSession(1);
    session = answer(session, false, 0);
    expect(session.currentQuestion?.kind).toBe("retry");
    expect(session.reservations).toEqual([{ wordId: "word-0", position: 1, interval: 0 }]);
    session = answer(session, false, 1);
    expect(session.currentQuestion?.position).toBe(2);
    session = answer(session, true, 2);
    expect(session.status).toBe("completed");
  });

  it.each([1, 2, 3, 4, 10, 11])("n=%i respects spacing, collisions, pending exclusions and eventual completion", (n) => {
    // Broad deterministic trajectories include repeated errors and conflicting candidate slots.
    for (let seed = 0; seed < 40; seed += 1) {
      let session = testSession(n, seed);
      const previousWrong = new Map<string, number>();
      let step = 0;
      while (session.status === "active" && step < 500) {
        const current = session.currentQuestion!;
        const pending = session.reservations.find((reservation) => reservation.wordId === current.wordId);
        if (pending) expect(pending.position).toBe(current.position);
        expect(new Set(session.reservations.map((reservation) => reservation.position)).size).toBe(session.reservations.length);
        if (previousWrong.has(current.wordId)) {
          expect(current.kind).toBe("retry");
          const interval = current.position - previousWrong.get(current.wordId)! - 1;
          expect(interval).toBeGreaterThanOrEqual(session.configuration.retryRange[0]);
          expect(interval).toBeLessThanOrEqual(session.configuration.retryRange[1]);
          previousWrong.delete(current.wordId);
        }
        const correct = step >= n * 3 || ((step * 7 + seed) % 5 === 0);
        if (!correct) previousWrong.set(current.wordId, current.position);
        session = answer(session, correct, step++);
      }
      expect(session.status).toBe("completed");
      expect(new Set(session.testedWordIds).size).toBe(n);
      expect(session.reservations).toHaveLength(0);
      expect(previousWrong.size).toBe(0);
      expect(session.attempts.every((attempt) => session.entries.some((entry) => entry.id === attempt.wordId))).toBe(true);
    }
  });

  it("tail retries extend the quiz and use correct words for required filler", () => {
    let session = testSession(4);
    for (let i = 0; i < 3; i += 1) session = answer(session, true, i);
    const tailWord = session.currentQuestion!.wordId;
    session = answer(session, false, 3);
    expect(session.reservations).toContainEqual({ wordId: tailWord, position: 7, interval: 3 });
    for (let i = 4; i < 7; i += 1) {
      expect(session.currentQuestion?.kind).toBe("filler");
      expect(session.currentQuestion?.wordId).not.toBe(tailWord);
      session = answer(session, true, i);
    }
    expect(session.currentQuestion?.wordId).toBe(tailWord);
    expect(session.currentQuestion?.kind).toBe("retry");
    session = answer(session, true, 7);
    expect(session.attempts).toHaveLength(8);
    expect(session.status).toBe("completed");
  });

  it("prioritizes untested words, then completed retry cycles as filler", () => {
    let session = testSession(4);
    const firstWord = session.currentQuestion!.wordId;
    session = answer(session, false, 0);
    for (let i = 1; i < 3; i += 1) {
      expect(session.currentQuestion?.kind).toBe("initial");
      session = answer(session, true, i);
    }
    session = answer(session, false, 3);
    expect(session.currentQuestion?.wordId).toBe(firstWord);
    session = answer(session, true, 4);
    expect(session.currentQuestion?.kind).toBe("filler");
    expect(session.currentQuestion?.wordId).toBe(firstWord);
  });

  it("replays identically from seed, including after serialization/resume", () => {
    let left = testSession(11, 2026);
    let right = testSession(11, 2026);
    for (let step = 0; step < 40 && left.status === "active"; step += 1) {
      left = answer(left, step > 20 || step % 3 === 0, step);
      right = answer(JSON.parse(JSON.stringify(right)) as QuizSession, step > 20 || step % 3 === 0, step);
      expect(right).toEqual(left);
    }
    expect(testSession(11, 2027).entries.map((entry) => entry.id)).not.toEqual(testSession(11, 2026).entries.map((entry) => entry.id));
  });

  it("duplicates a submission idempotently without advancing or mutating original", () => {
    const before = testSession(2);
    const after = answerQuiz(before, correctAnswer(before), "submission", "2026-10-11T10:00:00.000Z");
    expect(before.attempts).toHaveLength(0);
    expect(answerQuiz(after, "wrong", "submission")).toBe(after);
    expect(after.attempts).toHaveLength(1);
  });

  it("forbids answering a saved, ended or completed session", () => {
    const session = testSession(1);
    for (const status of ["saved", "ended", "completed"] as const) expect(() => answerQuiz({ ...session, status }, "wrong")).toThrow("not active");
  });
});
