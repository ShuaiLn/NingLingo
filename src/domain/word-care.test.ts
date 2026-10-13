import { describe, expect, it } from "vitest";
import { applyNewIncorrectCareEvent, applyWordCareAction, wordCareStatus } from "./word-care";
import { initialWordProgress } from "./review";
import { testEntry } from "./test-fixtures";
import type { WordCareState } from "./models";

const state: WordCareState = { wordId: "word-0", userId: "user", manualCare: false, automaticSuppressed: false, updatedAt: "before" };
const progress = { ...initialWordProgress(testEntry(0), "2026-10-12"), firstAttempts: 5, firstCorrect: 3 };

describe("independent manual care and automatic suppression", () => {
  it("uses the original first-attempt threshold and treats untested words as no automatic care", () => {
    expect(wordCareStatus()).toMatchObject({ active: false, source: "none" });
    expect(wordCareStatus({ ...progress, firstAttempts: 0, firstCorrect: 0 }).automatic).toBe(false);
    expect(wordCareStatus({ ...progress, firstCorrect: 4 }).automatic).toBe(false);
    expect(wordCareStatus(progress)).toMatchObject({ active: true, automatic: true, source: "automatic" });
  });
  it("Add marks untested and perfect words manually and retains suppression separately", () => {
    const manual = applyWordCareAction({ ...state, automaticSuppressed: true }, "add", "later");
    expect(manual).toMatchObject({ manualCare: true, automaticSuppressed: true, updatedAt: "later" });
    expect(wordCareStatus(undefined, manual)).toMatchObject({ active: true, source: "manual" });
    expect(wordCareStatus(progress, { ...manual, automaticSuppressed: false }).source).toBe("manual and automatic");
  });
  it("Remove hides current automatic care without deleting evidence", () => {
    const before = structuredClone(progress);
    const removed = applyWordCareAction({ ...state, manualCare: true }, "remove", "later");
    expect(removed).toMatchObject({ manualCare: false, automaticSuppressed: true });
    expect(wordCareStatus(progress, removed)).toMatchObject({ active: false, source: "suppressed" });
    expect(progress).toEqual(before);
  });
  it("ordinary correct answers preserve manual markers and suppression", () => {
    const manual = { ...state, manualCare: true, automaticSuppressed: true };
    expect(applyNewIncorrectCareEvent(manual, { wordId: state.wordId, correct: true, answeredAt: "later" })).toBe(manual);
    expect(wordCareStatus({ ...progress, firstCorrect: 5 }, manual).active).toBe(true);
  });
  it("only an incorrect event on the tested word clears suppression, retaining manual state", () => {
    const suppressed = { ...state, manualCare: true, automaticSuppressed: true };
    expect(applyNewIncorrectCareEvent(suppressed, { wordId: "other", correct: false, answeredAt: "later" })).toBe(suppressed);
    expect(applyNewIncorrectCareEvent(state, { wordId: state.wordId, correct: false, answeredAt: "later" })).toBe(state);
    const next = applyNewIncorrectCareEvent(suppressed, { wordId: state.wordId, correct: false, answeredAt: "later" });
    expect(next).toMatchObject({ manualCare: true, automaticSuppressed: false, updatedAt: "later" });
    expect(wordCareStatus(progress, next).automatic).toBe(true);
  });
});
