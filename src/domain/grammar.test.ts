import { describe, expect, it } from "vitest";
import { grammarContentIssues, scoreGrammarExercises } from "./grammar";
import { grammarSeeds } from "../data/grammar";

describe("grammar exercise scoring", () => {
  it("completes at exactly 80% and gives an accurate score", () => {
    const exercises = grammarSeeds[0].exercises;
    const answers = exercises.map((exercise) => exercise.correctIndex);
    answers[0] = (answers[0] + 1) % exercises[0].choices.length;
    expect(scoreGrammarExercises(exercises, answers)).toEqual({ correct: 4, total: 5, percentage: 80, completed: true });
    answers[1] = (answers[1] + 1) % exercises[1].choices.length;
    expect(scoreGrammarExercises(exercises, answers).completed).toBe(false);
  });
  it("rejects missing or invalid answers", () => {
    expect(() => scoreGrammarExercises(grammarSeeds[0].exercises, [])).toThrow();
    expect(() => scoreGrammarExercises(grammarSeeds[0].exercises, [10, 0, 0, 0, 0])).toThrow();
  });
  it("development samples meet structural requirements and make no review claim", () => {
    for (const point of grammarSeeds) {
      expect(grammarContentIssues(point)).toEqual([]);
      expect(point.status).toBe("draft");
      expect(point.reviewer).toBeNull();
      expect(point.developmentSeed).toBe(true);
    }
  });
});
