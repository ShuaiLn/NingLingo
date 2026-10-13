import type { QuizAttempt, QuizQuestion, QuizSession, VocabularyEntry } from "./models";

export interface QuizSummaryAttempt {
  attempt: QuizAttempt;
  question: QuizQuestion | null;
  submittedAnswer: string;
  correctAnswer: string;
  direction: string;
}
export interface QuizWordSummary {
  wordId: string;
  entry: VocabularyEntry;
  deleted: boolean;
  initialAttemptCorrect: boolean | null;
  finalAttemptCorrect: boolean;
  total: number;
  correct: number;
  incorrect: number;
  attempts: QuizSummaryAttempt[];
}
export interface QuizSummary {
  totalAnswered: number;
  correct: number;
  incorrect: number;
  questionAccuracy: number | null;
  initialAttempts: number;
  initialCorrect: number;
  initialAccuracy: number | null;
  retries: number;
  fillers: number;
  uniqueWords: number;
  words: QuizWordSummary[];
}

export function frozenCorrectAnswer(question: QuizQuestion | null, fallback?: VocabularyEntry): string {
  if (question?.correctChoiceId) return question.choices.find(choice => choice.id === question.correctChoiceId)?.text ?? question.acceptedAnswers.join(" / ");
  return question?.acceptedAnswers.join(" / ") || fallback?.translation || "—";
}

/** Group by the one tested word, keeping every saved attempt in position order. */
export function aggregateQuizSummary(session: QuizSession, latestEntries: VocabularyEntry[]): QuizSummary {
  const ordered = session.attempts.map((attempt, index) => ({ attempt, index })).sort((left, right) => left.attempt.position - right.attempt.position || left.index - right.index).map(item => item.attempt);
  const latest = new Map(latestEntries.map(entry => [entry.id, entry]));
  const snapshots = new Map(session.entries.map(entry => [entry.id, entry]));
  const groups = new Map<string, QuizWordSummary>();
  for (const attempt of ordered) {
    const snapshot = snapshots.get(attempt.wordId);
    if (!snapshot) continue;
    let group = groups.get(attempt.wordId);
    if (!group) {
      group = { wordId: attempt.wordId, entry: latest.get(attempt.wordId) ?? snapshot, deleted: !latest.has(attempt.wordId), initialAttemptCorrect: null, finalAttemptCorrect: attempt.correct, total: 0, correct: 0, incorrect: 0, attempts: [] };
      groups.set(attempt.wordId, group);
    }
    const question = session.questions.find(item => item.id === attempt.questionId) ?? null;
    const type = question?.type ?? session.type;
    const sourceLanguage = question?.sourceLanguage ?? (type === "meaning-word" || type === "spelling" ? "en" : snapshot.language);
    const targetLanguage = question?.targetLanguage ?? (type === "word-meaning" || type === "typing" ? "en" : snapshot.language);
    group.total++;
    if (attempt.correct) group.correct++; else group.incorrect++;
    if (attempt.kind === "initial" && group.initialAttemptCorrect === null) group.initialAttemptCorrect = attempt.correct;
    group.finalAttemptCorrect = attempt.correct;
    group.attempts.push({ attempt, question, submittedAnswer: question?.choices.find(choice => choice.id === attempt.answer)?.text ?? attempt.answer, correctAnswer: frozenCorrectAnswer(question, snapshot), direction: question?.direction ?? `${sourceLanguage} → ${targetLanguage}` });
  }
  const initial = ordered.filter(attempt => attempt.kind === "initial");
  const correct = ordered.filter(attempt => attempt.correct).length;
  const initialCorrect = initial.filter(attempt => attempt.correct).length;
  return { totalAnswered: ordered.length, correct, incorrect: ordered.length - correct, questionAccuracy: ordered.length ? correct / ordered.length : null, initialAttempts: initial.length, initialCorrect, initialAccuracy: initial.length ? initialCorrect / initial.length : null, retries: ordered.filter(attempt => attempt.kind === "retry").length, fillers: ordered.filter(attempt => attempt.kind === "filler").length, uniqueWords: new Set(ordered.map(attempt => attempt.wordId)).size, words: [...groups.values()] };
}
