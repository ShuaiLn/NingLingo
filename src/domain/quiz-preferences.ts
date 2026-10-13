import type { QuizPreferences, QuizPresentation, QuizSession } from "./models";

export const DEFAULT_QUIZ_PREFERENCES: QuizPreferences = { presentation: "always", vocabularyAutoAudio: false, alphabetAutoAudio: false };

export function quizPresentation(session: Pick<QuizSession, "presentation">): QuizPresentation {
  return session.presentation ?? "always";
}

/** Presentation is evaluated after the answer has been persisted. It never grades. */
export function shouldShowQuizDetails(presentation: QuizPresentation, correct: boolean): boolean {
  return presentation === "always" || (presentation === "incorrect" && !correct);
}
