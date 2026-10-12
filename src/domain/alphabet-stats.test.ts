import { describe, expect, it } from "vitest";
import { answerAlphabetQuiz, createAlphabetQuizSession } from "./alphabet-quiz";
import { alphabetFirstAttemptAccuracy } from "./alphabet-stats";
import type { AlphabetQuizSession } from "./models";
import { alphabetEntries } from "@/data/alphabet";

function session(id: string) {
  return createAlphabetQuizSession({ id, userId: "learner", language: "es", itemIds: [alphabetEntries.find(item => item.language === "es")!.id], randomSeed: 7, learningDate: "2026-10-11" });
}

describe("independent Alphabet practice accuracy", () => {
  it("has no accuracy until an initial answer is saved", () => {
    expect(alphabetFirstAttemptAccuracy([])).toBeNull();
    expect(alphabetFirstAttemptAccuracy([session("unanswered")])).toBeNull();
  });

  it("counts every initial answer across saved and finished snapshots while excluding retries and fillers", () => {
    let wrong = answerAlphabetQuiz(session("wrong"), "wrong", "first");
    wrong = answerAlphabetQuiz(wrong, "a", "retry");
    const correct = answerAlphabetQuiz(session("correct"), "ah", "correct");
    const filler = { ...wrong.attempts[1], id: "filler", kind: "filler" as const };
    const saved: AlphabetQuizSession = { ...wrong, status: "saved", attempts: [...wrong.attempts, filler] };
    expect(alphabetFirstAttemptAccuracy([saved, correct])).toBe(0.5);
    // No current Alphabet/Vocabulary data is needed to preserve historic accuracy.
    expect(alphabetFirstAttemptAccuracy([{ ...saved, items: [] }])).toBe(0);
  });
});
