"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, CircleCheck, Clock3, Play, Save, Sparkles, Square, X } from "lucide-react";
import { useAppData } from "./app-provider";
import { AudioButton, stopAudio } from "./audio-button";
import { WordText } from "./word-text";
import { learningDate } from "@/domain/dates";
import { quizEligibleEntries, quizSetup, retryIntervalRange } from "@/domain/quiz";
import type { LanguageCode, QuizQuestion, QuizSession, QuizType } from "@/domain/models";
import { VersionConflictError } from "@/repositories/contracts";
import "./quiz.css";

const TYPES: { value: QuizType; title: string; description: string }[] = [
  { value: "word-meaning", title: "Word → Meaning", description: "Choose the English meaning." },
  { value: "meaning-word", title: "Meaning → Word", description: "Find the matching word." },
  { value: "typing", title: "Typing", description: "Type an accepted English meaning." },
  { value: "japanese-reading", title: "Japanese Reading", description: "Choose the saved kana reading." },
];

interface Feedback { question: QuizQuestion; correct: boolean; submitted: string }

export function QuizPage({ language }: { language: LanguageCode }) {
  return <Suspense fallback={<div className="card" role="status">Opening your practice…</div>}><QuizContent language={language} /></Suspense>;
}

function QuizContent({ language }: { language: LanguageCode }) {
  const searchParams = useSearchParams();
  const dueRequested = searchParams.get("due") === "1";
  const requestedWords = searchParams.get("words");
  const requestedSession = searchParams.get("session");
  const { repos, entries, lists, sessions, profile, wordProgress, ready, error: loadError } = useAppData(language);
  const [type, setType] = useState<QuizType>("word-meaning");
  const [selection, setSelection] = useState<string[] | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [session, setSession] = useState<QuizSession | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showReading, setShowReading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingSubmission = useRef<{ questionId: string; answer: string; id: string } | null>(null);
  const resumeRequests = useRef(new Map<string, Promise<QuizSession>>());
  const answerId = useId();
  const today = learningDate(new Date(), profile.timezone);
  const dueIds = wordProgress.filter((word) => word.dueDate <= today).map((word) => word.wordId);
  const availableIds = new Set(entries.map((entry) => entry.id));
  const selectedIds = selection ?? (requestedWords !== null
    ? requestedWords.split(",").filter((id) => availableIds.has(id))
    : dueRequested ? dueIds : entries.map((entry) => entry.id));
  const selectedEntries = entries.filter((entry) => selectedIds.includes(entry.id));
  const eligible = quizEligibleEntries(selectedEntries, type);
  const retryRange = eligible.length > 0 ? retryIntervalRange(eligible.length) : null;
  const displayed = entries.filter((entry) => !listFilter || entry.listId === listFilter);
  const resumable = sessions.filter((item) => item.status === "active" || item.status === "saved");
  const displayQuestion = feedback?.question ?? session?.currentQuestion;
  const entry = session?.entries.find((word) => word.id === displayQuestion?.wordId);

  useEffect(() => () => stopAudio(), [displayQuestion?.id, language]);

  useEffect(() => {
    if (!requestedSession || !ready) return;
    let active = true;
    let request = resumeRequests.current.get(requestedSession);
    if (!request) {
      request = repos.quiz.getSession(requestedSession).then((snapshot) => {
        if (snapshot.language !== language) throw new Error("This saved quiz belongs to a different language. Open it from that language’s dashboard.");
        return repos.quiz.resume(requestedSession);
      });
      resumeRequests.current.set(requestedSession, request);
      const requests = resumeRequests.current;
      // Both Strict Mode effects share one repository mutation; each has its own cleanup guard.
      void request.then(() => requests.delete(requestedSession), () => requests.delete(requestedSession));
    }
    void Promise.resolve().then(() => { if (active) setBusy(true); return request; }).then((next) => {
      if (!active || !next) return;
      stopAudio(); setSession(next); setFeedback(null); setTypedAnswer(""); setShowReading(false); setError("");
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : "Could not resume this quiz.");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [requestedSession, ready, repos, language]);

  async function handleFailure(failure: unknown) {
    if (failure instanceof VersionConflictError) {
      pendingSubmission.current = null;
      setSession(failure.latest);
      setFeedback(null);
      setTypedAnswer("");
      setShowReading(false);
    }
    setError(failure instanceof Error ? failure.message : "Could not update this quiz. Please try again.");
  }

  async function start() {
    setError("");
    setBusy(true);
    try {
      quizSetup({ entries: selectedEntries, type });
      const next = await repos.quiz.create({ language, wordIds: selectedEntries.map((word) => word.id), type });
      stopAudio(); setSession(next); setFeedback(null); setTypedAnswer(""); setShowReading(false);
    } catch (failure: unknown) { await handleFailure(failure); }
    finally { setBusy(false); }
  }

  async function resume(id: string) {
    setError(""); setBusy(true);
    try {
      const next = await repos.quiz.resume(id);
      stopAudio(); setSession(next); setFeedback(null); setTypedAnswer(""); setShowReading(false);
    } catch (failure: unknown) { await handleFailure(failure); }
    finally { setBusy(false); }
  }

  async function submit(answer: string) {
    if (!session?.currentQuestion || feedback || busy) return;
    const question = session.currentQuestion;
    if (pendingSubmission.current?.questionId !== question.id || pendingSubmission.current.answer !== answer) {
      pendingSubmission.current = { questionId: question.id, answer, id: crypto.randomUUID() };
    }
    setError(""); setBusy(true); stopAudio();
    try {
      const next = await repos.quiz.answer(session.id, { answer, version: session.version, submissionId: pendingSubmission.current.id });
      const attempt = next.attempts.find((item) => item.questionId === question.id);
      if (attempt) setFeedback({ question, correct: attempt.correct, submitted: answer });
      setSession(next);
      pendingSubmission.current = null;
    } catch (failure: unknown) { await handleFailure(failure); }
    finally { setBusy(false); }
  }

  async function leave(end: boolean) {
    if (!session || busy) return;
    if (!end && (session.status === "completed" || session.status === "ended")) {
      stopAudio(); setSession(null); setFeedback(null); setTypedAnswer(""); setShowReading(false);
      return;
    }
    setError(""); setBusy(true); stopAudio();
    try {
      const next = end ? await repos.quiz.end(session.id, session.version) : await repos.quiz.saveAndExit(session.id, session.version);
      setSession(end ? next : null); setFeedback(null); setTypedAnswer(""); setShowReading(false);
    } catch (failure: unknown) { await handleFailure(failure); }
    finally { setBusy(false); }
  }

  function nextQuestion() {
    stopAudio(); setFeedback(null); setTypedAnswer(""); setShowReading(false);
  }

  const finished = session && (session.status === "completed" || session.status === "ended") && !feedback;
  const initials = session?.attempts.filter((attempt) => attempt.kind === "initial") ?? [];
  const firstCorrect = initials.filter((attempt) => attempt.correct).length;
  const choicesAreWords = session?.type === "meaning-word";

  return <>
    <div className="page-heading"><div><p className="eyebrow">A little practice, every day</p><h1>Quiz</h1><p className="muted">Build recall with your words and a little room to try again.</p></div><span className="badge"><Sparkles size={14} /> Your vocabulary</span></div>
    {(error || loadError) && <div className="notice" role="alert">{error || loadError}</div>}
    {!ready ? <div className="card" role="status">Loading your practice words…</div> : !session ? <>
      {resumable.length > 0 && <section className="card" style={{ marginBottom: 24 }}><div className="section-heading"><h2>Pick up where you left off</h2><Save size={18} /></div><div className="stack">{resumable.map((item) => <div className="quiz-resume-row" key={item.id}><div><strong>{TYPES.find((option) => option.value === item.type)?.title}</strong><p className="muted">{item.testedWordIds.length} / {item.entries.length} words seen · {item.attempts.length} answers saved · {item.reservations.length} retries waiting</p></div><button className="button secondary" disabled={busy} onClick={() => void resume(item.id)}>Resume <ArrowRight size={15} /></button></div>)}</div></section>}
      <div className="grid-2 quiz-setup-grid">
        <section className="card"><div className="section-heading"><h2>Choose your practice</h2><span className="badge">Step 1</span></div><div className="quiz-types">{TYPES.filter((option) => option.value !== "japanese-reading" || language === "ja").map((option) => <button type="button" key={option.value} className={`quiz-type ${type === option.value ? "selected" : ""}`} aria-pressed={type === option.value} onClick={() => { setType(option.value); setError(""); }}><span className="quiz-type-marker">{type === option.value ? <Check size={16} /> : null}</span><span><strong>{option.title}</strong><small>{option.description}</small></span></button>)}</div><div className="quiz-retry-note"><Clock3 size={19} /><div><strong>{eligible.length} eligible {eligible.length === 1 ? "word" : "words"}</strong><p className="muted">{retryRange ? retryRange[0] === 0 ? "Wrong answers repeat immediately after the correction." : `Wrong answers return after ${retryRange[0] === retryRange[1] ? retryRange[0] : `${retryRange[0]}–${retryRange[1]}`} completed questions.` : "Select words to see the retry interval."}</p>{type === "japanese-reading" && <p className="muted">Only words with saved readings are included.</p>}</div></div><button className="button" disabled={busy || eligible.length === 0} onClick={() => void start()}><Play size={16} /> {busy ? "Preparing…" : "Start practice"}</button><p className="muted" style={{ marginTop: 12, fontSize: 12 }}>Your words, answers and choices are frozen for this session. Two to four unambiguous choices are required for multiple choice.</p></section>
        <section className="card"><div className="section-heading"><h2>Your practice words</h2><span className="badge">{selectedEntries.length} selected</span></div><div className="toolbar"><select className="field" aria-label="Filter practice words by list" value={listFilter} onChange={(event) => setListFilter(event.target.value)}><option value="">All vocabulary lists</option>{lists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></div><div className="quiz-selection-tools"><button className="text-button" onClick={() => setSelection(entries.map((word) => word.id))}>Select all</button><button className="text-button" onClick={() => setSelection([])}>Clear</button><button className="text-button" onClick={() => setSelection(dueIds)}>Due reviews ({dueIds.length})</button></div><div className="quiz-word-list">{displayed.map((word) => <label className="quiz-word-row" key={word.id}><input type="checkbox" checked={selectedIds.includes(word.id)} onChange={(event) => setSelection(event.target.checked ? [...selectedIds, word.id] : selectedIds.filter((id) => id !== word.id))} /><span><WordText entry={word} /><small>{word.translation}</small></span>{dueIds.includes(word.id) && <span className="badge">Due</span>}</label>)}</div>{entries.length === 0 && <div className="empty-state"><p>Add a few words to begin.</p><Link className="button secondary" href={`/${language}/vocabulary`}>Open vocabulary</Link></div>}</section>
      </div>
    </> : finished ? <section className="card quiz-finished"><span className="quiz-finished-icon"><CircleCheck size={36} /></span><p className="eyebrow">{session.status === "completed" ? "Practice complete" : "Practice ended"}</p><h2>{session.status === "completed" ? "A little more familiar." : "Your progress is saved."}</h2><p className="muted">{session.testedWordIds.length} words practised · {session.attempts.length} questions completed</p><div className="quiz-result"><strong>{initials.length ? Math.round(firstCorrect / initials.length * 100) : 0}%</strong><span>first-attempt accuracy</span></div><p className="muted">Review progress is settled once per word. Corrections and filler questions never duplicate advancement.</p><div className="toolbar" style={{ justifyContent: "center", marginTop: 24 }}><button className="button" onClick={() => { setSession(null); setError(""); }}>New practice <ArrowRight size={16} /></button><Link className="button secondary" href={`/${language}/progress`}>View progress</Link></div></section> : displayQuestion && entry ? <>
      <div className="quiz-session-bar"><span className="badge">{TYPES.find((option) => option.value === session.type)?.title}</span><span className="muted">{session.testedWordIds.length} / {session.entries.length} words seen · Question {displayQuestion.position + 1}</span><div className="toolbar"><button className="button secondary" disabled={busy} onClick={() => void leave(false)}><Save size={14} /> Save & exit</button><button className="text-button" disabled={busy} onClick={() => void leave(true)}><Square size={13} /> End practice</button></div></div>
      <section className="card quiz-question-card"><p className="eyebrow">{displayQuestion.kind === "retry" ? "Try this one again" : displayQuestion.kind === "filler" ? "Keep your recall warm" : "A fresh question"}</p><h2 className="quiz-prompt">{session.type === "meaning-word" ? displayQuestion.prompt : session.type === "japanese-reading" ? <span>{entry.word}{showReading && <small className="quiz-reading">{entry.reading}</small>}</span> : <WordText entry={entry} />}</h2><div className="quiz-prompt-tools"><AudioButton text={entry.word} reading={entry.reading} language={language} />{session.type === "japanese-reading" && <button className="button secondary" onClick={() => setShowReading((value) => !value)}>{showReading ? "Hide Reading" : "Show Reading"}</button>}</div><p className="muted">{session.type === "typing" ? "Type the English meaning." : session.type === "word-meaning" ? "Choose the English meaning." : session.type === "meaning-word" ? "Choose the matching word." : "Choose the correct Japanese reading."}</p>
        {session.type === "typing" ? <form onSubmit={(event) => { event.preventDefault(); void submit(typedAnswer); }} className="quiz-typing"><label className="sr-only" htmlFor={answerId}>English meaning</label><input autoFocus id={answerId} className="field" value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} placeholder="Your answer…" autoComplete="off" disabled={Boolean(feedback) || busy} /><button className="button" disabled={Boolean(feedback) || busy || !typedAnswer.trim()} type="submit">Check answer <ArrowRight size={16} /></button></form> : <div className="quiz-choices">{displayQuestion.choices.map((choice, index) => {
          const choiceEntry = session.entries.find((word) => word.id === choice.id);
          const correct = Boolean(feedback) && choice.id === displayQuestion.correctChoiceId;
          const incorrect = Boolean(feedback) && choice.id === feedback?.submitted && !feedback.correct;
          return <div className={`quiz-choice ${correct ? "correct" : ""} ${incorrect ? "incorrect" : ""}`} key={choice.id}><button className="quiz-choice-select" disabled={Boolean(feedback) || busy} onClick={() => void submit(choice.id)}><span className="quiz-choice-number">{index + 1}</span><span>{choicesAreWords && choiceEntry ? <WordText entry={choiceEntry} /> : choice.text}</span>{correct && <Check size={18} />}{incorrect && <X size={18} />}</button>{choicesAreWords && <AudioButton text={choice.audioText} language={language} />}</div>;
        })}</div>}
        {feedback && <div className={`quiz-feedback ${feedback.correct ? "correct" : "incorrect"}`} role="status"><div><strong>{feedback.correct ? "Correct. Nicely remembered." : "Let's remember this one."}</strong>{!feedback.correct && <p>The answer is <strong>{session.type === "typing" ? entry.translation : displayQuestion.choices.find((choice) => choice.id === displayQuestion.correctChoiceId)?.text}</strong>.{session.type === "typing" && entry.acceptedAnswers.length > 0 && ` Also accepted: ${entry.acceptedAnswers.map((answer) => answer.text).join(", ")}.`}</p>}{!feedback.correct && <p>{session.entries.length === 1 ? "You'll try it again now." : `It will return after ${session.reservations.find((reservation) => reservation.wordId === entry.id)?.interval ?? session.configuration.retryRange[0]} completed questions.`}</p>}</div><button className="button" onClick={nextQuestion}>{session.status === "completed" ? "See results" : "Continue"}<ArrowRight size={16} /></button></div>}
      </section><p className="muted quiz-audio-note">Reading hints and audio are always available. They don’t change scoring.</p>
    </> : <div className="empty-state">This session has no active question.</div>}
  </>;
}
