import type { QuizAttempt, WordCareState, WordProgress } from "./models";

export interface WordCareStatus {
  active: boolean;
  manual: boolean;
  automatic: boolean;
  suppressed: boolean;
  source: "manual and automatic" | "manual" | "automatic" | "suppressed" | "none";
}

/** Keep the existing first-attempt threshold; suppression never edits that evidence. */
export function wordCareStatus(progress?: WordProgress, state?: WordCareState): WordCareStatus {
  const manual = state?.manualCare ?? false;
  const suppressed = state?.automaticSuppressed ?? false;
  const automatic = !suppressed && Boolean(progress && progress.firstAttempts > 0 && progress.firstCorrect / progress.firstAttempts < 0.8);
  return { active: manual || automatic, manual, automatic, suppressed, source: manual && automatic ? "manual and automatic" : manual ? "manual" : automatic ? "automatic" : suppressed ? "suppressed" : "none" };
}

export function applyWordCareAction(state: WordCareState, action: "add" | "remove", updatedAt: string): WordCareState {
  return { ...state, manualCare: action === "add", automaticSuppressed: action === "remove" ? true : state.automaticSuppressed, updatedAt };
}

/** Call only after inserting a previously unseen answer, never from SRS settlement. */
export function applyNewIncorrectCareEvent(state: WordCareState, attempt: Pick<QuizAttempt, "wordId" | "correct" | "answeredAt">): WordCareState {
  if (attempt.correct || attempt.wordId !== state.wordId || !state.automaticSuppressed) return state;
  return { ...state, automaticSuppressed: false, updatedAt: attempt.answeredAt };
}
