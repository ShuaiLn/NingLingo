import { describe, expect, it } from "vitest";
import { DEFAULT_QUIZ_PREFERENCES, quizPresentation, shouldShowQuizDetails } from "./quiz-preferences";

describe("presentation defaults and session preferences", () => {
  it("defaults old sessions to Always show and automatic audio off", () => {
    expect(DEFAULT_QUIZ_PREFERENCES).toEqual({ presentation: "always", vocabularyAutoAudio: false, alphabetAutoAudio: false });
    expect(quizPresentation({})).toBe("always");
  });
  it.each(["always", "incorrect", "never"] as const)("restores the session's saved %s value", presentation => {
    expect(quizPresentation({ presentation })).toBe(presentation);
  });
  it.each([
    ["always", true, true], ["always", false, true], ["incorrect", true, false], ["incorrect", false, true], ["never", true, false], ["never", false, false],
  ] as const)("%s and correct=%s shows details=%s", (presentation, correct, expected) => {
    expect(shouldShowQuizDetails(presentation, correct)).toBe(expected);
  });
});
