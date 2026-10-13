"use client";

import type { QuizSession, VocabularyEntry, WordCareState, WordProgress } from "@/domain/models";
import { aggregateQuizSummary } from "@/domain/quiz-summary";
import { WordDetails } from "./word-details";

const accuracy = (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%`;
const result = (value: boolean | null) => value === null ? "—" : value ? "Correct" : "Incorrect";

export function QuizSummary({ session, entries, progress, care }: { session: QuizSession; entries: VocabularyEntry[]; progress: WordProgress[]; care: WordCareState[] }) {
  const summary = aggregateQuizSummary(session, entries);
  return <section className="quiz-summary" aria-label="Quiz Summary">
    <h2>Quiz Summary</h2>
    <div className="quiz-summary-metrics">
      <div><strong>{accuracy(summary.questionAccuracy)}</strong><span>Question accuracy</span><small>{summary.correct}/{summary.totalAnswered}</small></div>
      <div className="quiz-result"><strong>{accuracy(summary.initialAccuracy)}</strong><span>Initial accuracy</span><small>{summary.initialCorrect}/{summary.initialAttempts}</small></div>
      <div><strong>{summary.uniqueWords}</strong><span>Unique words</span></div>
      <div><strong>{summary.retries}</strong><span>Retry questions</span></div>
    </div>
    <p>{summary.correct} correct · {summary.incorrect} incorrect · {summary.totalAnswered} answered questions · {summary.initialAttempts} initial attempts{summary.fillers > 0 && ` · ${summary.fillers} filler questions`}</p>
    {summary.words.length === 0 && <p className="muted">No questions answered. 0/0 · Accuracy —</p>}
    <div className="stack">{summary.words.map(word => <article className="card quiz-summary-word" key={word.wordId} aria-label={`Summary for ${word.entry.word}`}>
      <div className="quiz-summary-word-results"><strong>Initial: {result(word.initialAttemptCorrect)}</strong><strong>Final: {result(word.finalAttemptCorrect)}</strong><span>Attempts: {word.total}</span><span>Correct: {word.correct}</span><span>Incorrect: {word.incorrect}</span></div>
      <ol className="quiz-summary-attempts">{word.attempts.map(({ attempt, question, submittedAnswer, correctAnswer, direction }) => <li key={attempt.id}>
        <div><span className="badge">{attempt.kind === "initial" ? "Initial" : attempt.kind === "retry" ? "Retry" : "Filler"}</span> <strong>{result(attempt.correct)}</strong> <span>{direction}</span></div>
        <p>Prompt: {question?.prompt || "Historical prompt unavailable"}</p><p>Your answer: {submittedAnswer || "(empty)"}</p><p>Frozen correct answer: {correctAnswer}</p>
      </li>)}</ol>
      <WordDetails entry={word.entry} deleted={word.deleted} progress={progress.find(item => item.wordId === word.wordId)} care={care.find(item => item.wordId === word.wordId)} />
    </article>)}</div>
  </section>;
}
