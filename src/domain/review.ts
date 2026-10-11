import { addDays } from "./dates";
import { REVIEW_DAYS, type ISODate, type QuizSession, type ReviewStage, type VocabularyEntry, type WordProgress } from "./models";

export function initialWordProgress(entry: VocabularyEntry, date: ISODate): WordProgress {
  return {
    wordId: entry.id, userId: entry.userId, language: entry.language, stage: 0,
    dueDate: addDays(date, 1), lastAdvancedDate: null, lastStudiedDate: null,
    firstAttempts: 0, firstCorrect: 0, errors: 0, settledSessionIds: [],
  };
}

/** A saved session may cross midnight before a word's first question is answered. */
export function captureDueReview(session: QuizSession, current: WordProgress[], date: ISODate): QuizSession {
  const question = session.currentQuestion;
  if (!question || question.kind !== "initial" || session.dueWordIds.includes(question.wordId)) return session;
  const progress = current.find((word) => word.wordId === question.wordId);
  if (!progress || progress.dueDate > date) return session;
  return { ...session, dueWordIds: [...session.dueWordIds, question.wordId] };
}

/** Settle only on completion or active ending, once for each tested word/session. */
export function settleQuizReview(session: QuizSession, current: WordProgress[], options: { learningDate: ISODate }): WordProgress[] {
  if (session.status !== "completed" && session.status !== "ended") return current;
  const progress = new Map(current.map((word) => [word.wordId, structuredClone(word)]));
  for (const entry of session.entries) {
    const attempts = session.attempts.filter((attempt) => attempt.wordId === entry.id);
    if (attempts.length === 0) continue;
    const word = progress.get(entry.id) ?? initialWordProgress(entry, options.learningDate);
    if (word.settledSessionIds.includes(session.id)) continue;
    const initial = attempts.find((attempt) => attempt.kind === "initial");
    if (initial) {
      word.firstAttempts += 1;
      word.firstCorrect += Number(initial.correct);
    }
    const incorrect = attempts.filter((attempt) => !attempt.correct).length;
    word.errors += incorrect;
    word.lastStudiedDate = options.learningDate;
    if (session.dueWordIds.includes(entry.id)) {
      if (incorrect > 0) {
        word.stage = 0;
        word.dueDate = addDays(options.learningDate, 1);
      } else if (word.dueDate <= options.learningDate && word.lastAdvancedDate !== options.learningDate) {
        word.stage = Math.min(word.stage + 1, REVIEW_DAYS.length - 1) as ReviewStage;
        word.dueDate = addDays(options.learningDate, REVIEW_DAYS[word.stage]);
        word.lastAdvancedDate = options.learningDate;
      }
    }
    word.settledSessionIds.push(session.id);
    progress.set(entry.id, word);
  }
  return [...progress.values()];
}
