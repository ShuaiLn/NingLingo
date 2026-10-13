import { describe, expect, it } from "vitest";
import { answerQuiz } from "./quiz";
import { initialWordProgress } from "./review";
import { calculateDashboardStats } from "./stats";
import { testEntry, testSession } from "./test-fixtures";
import type { GrammarPoint, GrammarProgress } from "./models";

describe("dashboard calculations", () => {
  it("counts only initial quiz attempts and returns due, weak, streak and grammar progress", () => {
    let session = answerQuiz(testSession(1), "wrong");
    session = answerQuiz(session, "meaning 0");
    const entry = testEntry(0);
    const grammar = { id: "grammar", contentVersion: 2 } as GrammarPoint;
    const grammarProgress = { pointId: "grammar", contentVersion: 2, completed: true } as GrammarProgress;
    const stats = calculateDashboardStats({
      entries: [entry],
      wordProgress: [{ ...initialWordProgress(entry, "2026-10-10"), firstAttempts: 1, firstCorrect: 0 }],
      sessions: [session], grammarPoints: [grammar], grammarProgress: [grammarProgress],
      activity: [
        { id: "a", userId: "user", language: "ja", date: "2026-10-10", kind: "quiz", count: 1 },
        { id: "b", userId: "user", language: "ja", date: "2026-10-11", kind: "grammar", count: 1 },
      ], today: "2026-10-11",
    });
    expect(stats).toMatchObject({ totalVocabulary: 1, firstAttemptAccuracy: 0, streak: 2, grammarCompleted: 1, grammarTotal: 1 });
    expect(stats.weakWords).toEqual([entry]);
    expect(stats.dueReviews).toEqual([entry]);
    expect(stats.activity).toHaveLength(2);
  });

  it("does not credit outdated grammar versions and has null accuracy before practice", () => {
    const stats = calculateDashboardStats({ entries: [], wordProgress: [], sessions: [], grammarPoints: [{ id: "g", contentVersion: 2 } as GrammarPoint], grammarProgress: [{ pointId: "g", contentVersion: 1, completed: true } as GrammarProgress], activity: [], today: "2026-10-11" });
    expect(stats.firstAttemptAccuracy).toBeNull();
    expect(stats.grammarCompleted).toBe(0);
    expect(stats.streak).toBe(0);
  });

  it("includes manual care for untested words and hides suppressed automatic care", () => {
    const manual = testEntry(0), automatic = testEntry(1);
    const stats = calculateDashboardStats({ entries: [manual, automatic], wordProgress: [{ ...initialWordProgress(automatic, "2026-10-12"), firstAttempts: 1, firstCorrect: 0 }], careStates: [
      { wordId: manual.id, userId: "user", manualCare: true, automaticSuppressed: false, updatedAt: "now" },
      { wordId: automatic.id, userId: "user", manualCare: false, automaticSuppressed: true, updatedAt: "now" },
    ], sessions: [], grammarPoints: [], grammarProgress: [], activity: [], today: "2026-10-12" });
    expect(stats.weakWords).toEqual([manual]);
  });
});
