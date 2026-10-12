import type { AlphabetQuizSession } from "./models";

/** Alphabet recall is measured from its saved attempts independently of vocabulary reviews. */
export function alphabetFirstAttemptAccuracy(sessions: AlphabetQuizSession[]): number | null {
  const firstAttempts = sessions.flatMap(session => session.attempts.filter(attempt => attempt.kind === "initial"));
  return firstAttempts.length ? firstAttempts.filter(attempt => attempt.correct).length / firstAttempts.length : null;
}
