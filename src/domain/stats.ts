import { learningStreak } from "./dates";
import type { ActivityRecord, DashboardStats, GrammarPoint, GrammarProgress, ISODate, QuizSession, VocabularyEntry, WordCareState, WordProgress } from "./models";
import { wordCareStatus } from "./word-care";

export interface StatsInput {
  entries: VocabularyEntry[];
  wordProgress: WordProgress[];
  careStates?: WordCareState[];
  sessions: QuizSession[];
  grammarPoints: GrammarPoint[];
  grammarProgress: GrammarProgress[];
  activity: ActivityRecord[];
  today: ISODate;
}

export function calculateDashboardStats(input: StatsInput): DashboardStats {
  const words = new Map(input.wordProgress.map((word) => [word.wordId, word]));
  const care = new Map((input.careStates ?? []).map(state => [state.wordId, state]));
  const firstAttempts = input.sessions.flatMap((session) => session.attempts.filter((attempt) => attempt.kind === "initial"));
  const vocabularyIds = new Set(input.entries.map((entry) => entry.id));
  const relevantAttempts = firstAttempts.filter((attempt) => vocabularyIds.has(attempt.wordId));
  const counts = new Map<ISODate, number>();
  for (const activity of input.activity) counts.set(activity.date, (counts.get(activity.date) ?? 0) + activity.count);
  const completed = new Set(input.grammarProgress.filter((progress) => progress.completed && input.grammarPoints.some((point) => point.id === progress.pointId && point.contentVersion === progress.contentVersion)).map((progress) => progress.pointId));
  return {
    totalVocabulary: input.entries.length,
    firstAttemptAccuracy: relevantAttempts.length > 0 ? relevantAttempts.filter((attempt) => attempt.correct).length / relevantAttempts.length : null,
    weakWords: input.entries.filter((entry) => {
      const word = words.get(entry.id);
      return wordCareStatus(word, care.get(entry.id)).active;
    }).sort((a, b) => {
      const left = words.get(a.id);
      const right = words.get(b.id);
      return (left?.firstAttempts ? left.firstCorrect / left.firstAttempts : 1) - (right?.firstAttempts ? right.firstCorrect / right.firstAttempts : 1);
    }),
    dueReviews: input.entries.filter((entry) => (words.get(entry.id)?.dueDate ?? "9999-12-31") <= input.today),
    streak: learningStreak(input.activity.filter((activity) => activity.count > 0).map((activity) => activity.date), input.today),
    grammarCompleted: completed.size,
    grammarTotal: input.grammarPoints.length,
    activity: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
  };
}
