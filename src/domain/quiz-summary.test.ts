import { describe, expect, it } from "vitest";
import { aggregateQuizSummary, frozenCorrectAnswer } from "./quiz-summary";
import { answerQuiz } from "./quiz";
import { testSession } from "./test-fixtures";

describe("full quiz summary by tested word", () => {
  it.each([["meaning-word", "en → ja"], ["japanese-reading", "ja → ja"]] as const)("restores the original direction for legacy %s questions", (type, direction) => {
    const session = testSession(2, 6, type);
    const completed = answerQuiz(session, session.currentQuestion!.correctChoiceId!, "legacy");
    expect(aggregateQuizSummary(completed, completed.entries).words[0].attempts[0].direction).toBe(direction);
  });
  it("keeps initial and final results and all retries separately", () => {
    let session = testSession(1);
    session = answerQuiz(session, "wrong 1", "first");
    session = answerQuiz(session, "wrong 2", "second");
    session = answerQuiz(session, "meaning 0", "third");
    const summary = aggregateQuizSummary(session, session.entries);
    expect(summary).toMatchObject({ totalAnswered: 3, correct: 1, incorrect: 2, questionAccuracy: 1 / 3, initialAttempts: 1, initialAccuracy: 0, retries: 2, fillers: 0, uniqueWords: 1 });
    expect(summary.words[0]).toMatchObject({ initialAttemptCorrect: false, finalAttemptCorrect: true, total: 3, correct: 1, incorrect: 2, deleted: false });
    expect(summary.words[0].attempts.map(item => item.attempt.id)).toEqual(["first", "second", "third"]);
    expect(summary.words[0].attempts.map(item => item.submittedAnswer)).toEqual(["wrong 1", "wrong 2", "meaning 0"]);
  });
  it("counts initial, retry and filler attempts and does not count unanswered selected words", () => {
    let session = testSession(4);
    for (let index = 0; index < 3; index++) session = answerQuiz(session, session.currentQuestion!.acceptedAnswers[0], `initial-${index}`);
    session = answerQuiz(session, "wrong", "last-initial");
    for (let index = 0; index < 4; index++) session = answerQuiz(session, session.currentQuestion!.acceptedAnswers[0], `tail-${index}`);
    const summary = aggregateQuizSummary(session, session.entries);
    expect(summary.totalAnswered).toBe(session.attempts.length);
    expect(summary.retries).toBe(session.attempts.filter(item => item.kind === "retry").length);
    expect(summary.fillers).toBe(session.attempts.filter(item => item.kind === "filler").length);
    expect(summary.initialAttempts).toBe(session.attempts.filter(item => item.kind === "initial").length);
    expect(summary.uniqueWords).toBe(new Set(session.attempts.map(item => item.wordId)).size);
    expect(summary.fillers).toBe(3);
    expect(summary.retries).toBe(1);
    expect(summary.initialAttempts).toBe(4);
  });
  it("uses latest complete details while retaining frozen correct answers", () => {
    let session = testSession(1);
    session = answerQuiz(session, "meaning 0", "first");
    const latest = { ...session.entries[0], translation: "new translation", notes: "new notes", relatedWords: [{ id: "related", word: "new related", reading: "", translation: "related meaning", relationType: "related" as const }] };
    const summary = aggregateQuizSummary(session, [latest]);
    expect(summary.words[0].entry).toEqual(latest);
    expect(summary.words[0].attempts[0].correctAnswer).toBe("meaning 0");
    expect(summary.words[0].attempts[0].question?.prompt).toBe(session.entries[0].word);
  });
  it("retains a deleted word snapshot without resurrecting it", () => {
    const session = answerQuiz(testSession(1), "meaning 0", "first");
    expect(aggregateQuizSummary(session, []).words[0]).toMatchObject({ entry: session.entries[0], deleted: true });
  });
  it("shows null accuracy and no unique words for an ended zero-answer session", () => {
    const session = { ...testSession(3), status: "ended" as const, currentQuestion: null };
    expect(aggregateQuizSummary(session, session.entries)).toMatchObject({ totalAnswered: 0, questionAccuracy: null, initialAccuracy: null, uniqueWords: 0, words: [], retries: 0, fillers: 0 });
  });
  it("summarizes an early end using answered words only", () => {
    const session = { ...answerQuiz(testSession(4), "wrong", "first"), status: "ended" as const, currentQuestion: null };
    expect(aggregateQuizSummary(session, session.entries)).toMatchObject({ totalAnswered: 1, uniqueWords: 1, retries: 0, initialAccuracy: 0 });
  });
  it("uses saved choice text, direction and chronological positions in history", () => {
    let session = testSession(2, 6, "word-meaning");
    session = answerQuiz(session, session.currentQuestion!.correctChoiceId!, "first");
    session = answerQuiz(session, session.currentQuestion!.correctChoiceId!, "second");
    const before = aggregateQuizSummary(session, session.entries);
    const shuffled = { ...session, attempts: [...session.attempts].reverse() };
    expect(aggregateQuizSummary(shuffled, session.entries)).toEqual(before);
    for (const word of before.words) expect(word.attempts[0].submittedAnswer).toBe(word.attempts[0].correctAnswer);
  });
  it("handles legacy questions and missing historical question records", () => {
    const session = answerQuiz(testSession(1), "wrong", "first");
    const noQuestion = aggregateQuizSummary({ ...session, questions: [] }, session.entries).words[0];
    expect(noQuestion.attempts[0]).toMatchObject({ question: null, submittedAnswer: "wrong", correctAnswer: session.entries[0].translation });
    expect(frozenCorrectAnswer(null)).toBe("—");
  });
});
