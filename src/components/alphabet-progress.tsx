"use client";

import Link from "next/link";
import { useState } from "react";
import type { AlphabetQuizSession, LanguageCode } from "@/domain/models";
import { alphabetFirstAttemptAccuracy } from "@/domain/alphabet-stats";
import "./alphabet-quiz.css";

export function AlphabetProgress({ language, sessions }: { language: LanguageCode; sessions: AlphabetQuizSession[] }) {
  const [visibleCount, setVisibleCount] = useState(12);
  const accuracy = alphabetFirstAttemptAccuracy(sessions);
  const history = [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return <section className="card alphabet-progress-panel" aria-label="Alphabet practice history"><div className="section-heading"><h2>Alphabet practice</h2><span className="badge">{sessions.length} sessions</span></div><div className="alphabet-history-summary"><strong className="alphabet-accuracy">{accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`}</strong><div><strong>Alphabet first-attempt accuracy</strong><p className="muted">Retries and filler answers are excluded. Hints do not affect your score.</p></div></div>{history.length ? <><div className="history-list alphabet-history-list">{history.slice(0, visibleCount).map(session => {
    const first = session.attempts.filter(attempt => attempt.kind === "initial");
    const resumable = session.status === "active" || session.status === "saved";
    return <div key={session.id}><div><strong>{[...new Set(session.items.map(item => item.group))].join(" · ")}</strong><small>{session.learningDate} · {session.status} · {session.testedItemIds.length} / {session.items.length} symbols</small><Link className="alphabet-history-link" href={`/${language}/alphabet?session=${session.id}`}>{resumable ? "Resume alphabet quiz" : "View alphabet quiz"}</Link></div><span>{first.length ? `${Math.round(first.filter(attempt => attempt.correct).length / first.length * 100)}%` : "—"}<small>first try</small></span></div>;
  })}</div>{history.length > visibleCount && <button className="button secondary" onClick={() => setVisibleCount(count => count + 12)}>Show more alphabet history</button>}</> : <div className="empty-state compact"><p>Your alphabet history starts with your first alphabet quiz.</p><Link className="button secondary" href={`/${language}/alphabet`}>Practise the alphabet</Link></div>}</section>;
}
