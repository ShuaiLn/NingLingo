import { describe, expect, it } from "vitest";
import { addDays, isValidTimezone, learningDate, learningStreak } from "./dates";
import { answerQuiz } from "./quiz";
import { captureDueReview, initialWordProgress, settleQuizReview } from "./review";
import type { QuizSession } from "./models";
import { testEntry, testSession } from "./test-fixtures";

function completed(id = "session", correct = true): QuizSession {
  const session = { ...testSession(1), id };
  const result = answerQuiz(session, correct ? "meaning 0" : "wrong", "a");
  return correct ? result : { ...result, status: "ended" };
}

describe("civil learning dates", () => {
  it("uses account timezone at midnight, including DST", () => {
    expect(learningDate("2026-10-11T06:59:59.000Z", "America/Tijuana")).toBe("2026-10-10");
    expect(learningDate("2026-10-11T07:00:00.000Z", "America/Tijuana")).toBe("2026-10-11");
    expect(learningDate("2026-10-11T07:00:00.000Z", "Asia/Tokyo")).toBe("2026-10-11");
    expect(learningDate("2026-01-11T07:59:59.000Z", "America/Tijuana")).toBe("2026-01-10");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("validates dates/timezones and counts an ongoing streak from today or yesterday", () => {
    expect(isValidTimezone("America/Tijuana")).toBe(true);
    expect(isValidTimezone("Not/A_Timezone")).toBe(false);
    expect(() => addDays("2026-02-30", 1)).toThrow("Invalid learning date");
    expect(learningStreak(["2026-10-09", "2026-10-10", "2026-10-10"], "2026-10-11")).toBe(2);
    expect(learningStreak(["2026-10-08", "2026-10-09"], "2026-10-11")).toBe(0);
  });
});

describe("review settlement", () => {
  it("captures newly due words on first answer when a session crosses midnight", () => {
    const session = { ...testSession(1), dueWordIds: [] };
    const word = initialWordProgress(testEntry(0), "2026-10-10");
    expect(captureDueReview(session, [word], "2026-10-10").dueWordIds).toEqual([]);
    expect(captureDueReview(session, [word], "2026-10-11").dueWordIds).toEqual(["word-0"]);
    const earlyIncorrect = answerQuiz(session, "wrong");
    expect(captureDueReview(earlyIncorrect, [word], "2026-10-11").dueWordIds).toEqual([]);
  });

  it("advances due perfect review to the next stage exactly once", () => {
    const word = { ...initialWordProgress(testEntry(0), "2026-10-10"), dueDate: "2026-10-11" };
    const session = completed();
    const progress = settleQuizReview(session, [word], { learningDate: "2026-10-11" });
    expect(progress[0]).toMatchObject({ stage: 1, dueDate: "2026-10-14", firstAttempts: 1, firstCorrect: 1 });
    expect(settleQuizReview(session, progress, { learningDate: "2026-10-11" })).toEqual(progress);
  });

  it("does not advance twice on a learning day across different sessions", () => {
    const word = initialWordProgress(testEntry(0), "2026-10-10");
    const first = settleQuizReview(completed("one"), [word], { learningDate: "2026-10-11" });
    const second = settleQuizReview(completed("two"), first, { learningDate: "2026-10-11" });
    expect(second[0].stage).toBe(1);
    expect(second[0].dueDate).toBe("2026-10-14");
    expect(second[0].firstAttempts).toBe(2);
  });

  it("a stale due session resumed tomorrow cannot postpone a newly advanced review", () => {
    const word = initialWordProgress(testEntry(0), "2026-10-10");
    const first = settleQuizReview(completed("one"), [word], { learningDate: "2026-10-11" });
    const stale = settleQuizReview(completed("saved-old-session"), first, { learningDate: "2026-10-12" });
    expect(stale[0].stage).toBe(1);
    expect(stale[0].dueDate).toBe("2026-10-14");
    expect(stale[0].lastAdvancedDate).toBe("2026-10-11");
  });

  it("early practice preserves review stage and scheduled date", () => {
    const word = { ...initialWordProgress(testEntry(0), "2026-10-11"), stage: 3 as const, dueDate: "2026-10-25" };
    const earlySession = { ...completed(), dueWordIds: [] };
    const result = settleQuizReview(earlySession, [word], { learningDate: "2026-10-11" });
    expect(result[0]).toMatchObject({ stage: 3, dueDate: "2026-10-25", lastAdvancedDate: null });
  });

  it("any due-review error resets to next day even after same-day promotion", () => {
    const word = { ...initialWordProgress(testEntry(0), "2026-10-10"), stage: 4 as const, lastAdvancedDate: "2026-10-11" };
    const result = settleQuizReview(completed("failed", false), [word], { learningDate: "2026-10-11" });
    expect(result[0]).toMatchObject({ stage: 0, dueDate: "2026-10-12", firstCorrect: 0, errors: 1 });
  });

  it("retry corrections and filler do not duplicate advancement or first attempts", () => {
    let session = testSession(1);
    session = answerQuiz(session, "wrong");
    session = answerQuiz(session, "meaning 0");
    const result = settleQuizReview(session, [initialWordProgress(testEntry(0), "2026-10-10")], { learningDate: "2026-10-11" });
    expect(result[0]).toMatchObject({ stage: 0, dueDate: "2026-10-12", firstAttempts: 1, firstCorrect: 0, errors: 1 });
  });

  it("does not settle saved sessions or untested words, caps the final stage", () => {
    const word = { ...initialWordProgress(testEntry(0), "2026-10-10"), stage: 6 as const };
    expect(settleQuizReview({ ...testSession(1), status: "saved" }, [word], { learningDate: "2026-10-11" })).toEqual([word]);
    expect(settleQuizReview({ ...testSession(1), status: "ended" }, [word], { learningDate: "2026-10-11" })).toEqual([word]);
    const result = settleQuizReview(completed(), [word], { learningDate: "2026-10-11" });
    expect(result[0]).toMatchObject({ stage: 6, dueDate: "2027-02-08" });
  });
});
