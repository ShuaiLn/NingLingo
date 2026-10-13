"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CircleCheck, Play, Save, Square } from "lucide-react";
import type { AlphabetQuizDirection, AlphabetQuizMode, AlphabetQuizQuestion, AlphabetQuizSession, LanguageCode } from "@/domain/models";
import { alphabetEntries } from "@/data/alphabet";
import { alphabetMcqEligibilityBatch } from "@/domain/alphabet-quiz";
import { AlphabetQuizVersionConflictError } from "@/repositories/contracts";
import { useAppData } from "./app-provider";
import { AudioButton, stopAudio } from "./audio-button";
import { useAutomaticQuizAudio } from "./quiz-audio";
import "./quiz.css";
import "./alphabet-quiz.css";

interface Feedback { question: AlphabetQuizQuestion; correct: boolean }

export function AlphabetQuiz({ language, itemIds, selectionLabel, groupPicker, children }: {
  language: LanguageCode;
  itemIds: string[];
  selectionLabel: string;
  groupPicker: ReactNode;
  children: ReactNode;
}) {
  const requestedSession = useSearchParams().get("session");
  const { repos, alphabetSessions, ready, error: loadError } = useAppData(language);
  const [session, setSession] = useState<AlphabetQuizSession | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [answer, setAnswer] = useState("");
  const [showName, setShowName] = useState(false);
  const [showAssociation, setShowAssociation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<AlphabetQuizMode>("typing");
  const [direction, setDirection] = useState<AlphabetQuizDirection | "mixed">("character-to-pronunciation");
  const [automaticAudio, setAutomaticAudio] = useState(false);
  const currentSessionId = useRef<string | null>(null);
  const pendingSubmission = useRef<{ questionId: string; answer: string; id: string } | null>(null);
  const resumeRequests = useRef(new Map<string, Promise<AlphabetQuizSession>>());
  const inputId = useId();
  const nameId = useId();
  const associationId = useId();
  const question = feedback?.question ?? session?.currentQuestion;
  // Once a session exists, every displayed character, hint and answer comes from its snapshot.
  const item = session?.items.find(candidate => candidate.itemId === question?.itemId);
  const resumable = alphabetSessions.filter(candidate => candidate.status === "saved" || candidate.status === "active");
  const eligibility = useMemo(() => mode === "mcq" ? alphabetMcqEligibilityBatch(alphabetEntries.filter(entry => entry.language === language && itemIds.includes(entry.id)), direction) : [], [mode, language, itemIds, direction]);
  const unavailable = eligibility.flatMap(result => result.skipped);
  const canStart = itemIds.length > 0 && (mode === "typing" || eligibility.some(result => result.feasible.length));

  useEffect(() => {
    let active = true;
    void repos.settings.getQuizPreferences().then(preferences => { if (active) setAutomaticAudio(preferences.alphabetAutoAudio); }).catch(() => undefined);
    return () => { active = false; };
  }, [repos]);
  useAutomaticQuizAudio({ questionKey: session?.status === "active" ? question?.id ?? null : null,
    text: item?.audioText || item?.symbol || "", language, enabled: automaticAudio, feedback: Boolean(feedback) });

  async function toggleAutomaticAudio(value: boolean) {
    const previous = automaticAudio;
    setAutomaticAudio(value);
    if (!value) stopAudio();
    try { await repos.settings.updateQuizPreferences({ alphabetAutoAudio: value }); }
    catch (failure) { setAutomaticAudio(previous); handleFailure(failure); }
  }

  useEffect(() => () => stopAudio(), [question?.id, language]);

  function resetQuestion() {
    stopAudio(); setFeedback(null); setAnswer(""); setShowName(false); setShowAssociation(false);
  }

  function showSession(next: AlphabetQuizSession) {
    currentSessionId.current = next.id;
    setSession(next); resetQuestion(); setError("");
  }

  function sessionUrl(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("session", id); else url.searchParams.delete("session");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function handleFailure(failure: unknown) {
    if (failure instanceof AlphabetQuizVersionConflictError) {
      pendingSubmission.current = null;
      currentSessionId.current = failure.latest.id;
      setSession(failure.latest); resetQuestion();
    }
    setError(failure instanceof Error ? failure.message : "Could not update this alphabet quiz. Please try again.");
  }

  useEffect(() => {
    if (!requestedSession || !ready || currentSessionId.current === requestedSession) return;
    let active = true;
    let request = resumeRequests.current.get(requestedSession);
    if (!request) {
      request = repos.alphabetQuiz.getSession(requestedSession).then(snapshot => {
        if (snapshot.language !== language) throw new Error("This saved alphabet quiz belongs to a different language. Open it from that language’s Alphabet page.");
        return snapshot.status === "completed" || snapshot.status === "ended" ? snapshot : repos.alphabetQuiz.resume(snapshot.id, snapshot.version);
      });
      resumeRequests.current.set(requestedSession, request);
      const requests = resumeRequests.current;
      void request.then(() => requests.delete(requestedSession), () => requests.delete(requestedSession));
    }
    void Promise.resolve().then(() => { if (active) setBusy(true); return request; }).then(next => {
      if (!active || !next) return;
      currentSessionId.current = next.id;
      stopAudio(); setSession(next); setFeedback(null); setAnswer(""); setShowName(false); setShowAssociation(false); setError("");
    }).catch((failure: unknown) => {
      if (!active) return;
      if (failure instanceof AlphabetQuizVersionConflictError) {
        currentSessionId.current = failure.latest.id;
        stopAudio(); setSession(failure.latest); setFeedback(null); setAnswer(""); setShowName(false); setShowAssociation(false);
      }
      setError(failure instanceof Error ? failure.message : "Could not resume this alphabet quiz.");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [requestedSession, ready, repos, language]);

  async function start() {
    if (busy || !canStart) return;
    setBusy(true); setError("");
    try {
      const next = await repos.alphabetQuiz.create({ language, itemIds, mode, direction: mode === "typing" ? "character-to-pronunciation" : direction });
      showSession(next); sessionUrl(next.id);
    } catch (failure: unknown) { handleFailure(failure); }
    finally { setBusy(false); }
  }

  async function resume(saved: AlphabetQuizSession) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const next = await repos.alphabetQuiz.resume(saved.id, saved.version);
      showSession(next); sessionUrl(next.id);
    } catch (failure: unknown) { handleFailure(failure); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!session?.currentQuestion || session.status !== "active" || feedback || busy || !answer.trim()) return;
    const current = session.currentQuestion;
    if (pendingSubmission.current?.questionId !== current.id || pendingSubmission.current.answer !== answer) {
      pendingSubmission.current = { questionId: current.id, answer, id: crypto.randomUUID() };
    }
    setBusy(true); setError(""); stopAudio();
    try {
      const next = await repos.alphabetQuiz.answer(session.id, { answer, version: session.version, submissionId: pendingSubmission.current.id });
      const attempt = next.attempts.find(candidate => candidate.questionId === current.id);
      setSession(next);
      if (attempt) setFeedback({ question: current, correct: attempt.correct });
      pendingSubmission.current = null;
    } catch (failure: unknown) { handleFailure(failure); }
    finally { setBusy(false); }
  }

  async function leave(end: boolean) {
    if (!session || busy) return;
    if (!end && (session.status === "completed" || session.status === "ended")) { newQuiz(); return; }
    setBusy(true); setError(""); stopAudio();
    try {
      const next = end ? await repos.alphabetQuiz.end(session.id, session.version) : await repos.alphabetQuiz.saveAndExit(session.id, session.version);
      resetQuestion(); pendingSubmission.current = null;
      if (end) setSession(next);
      else { currentSessionId.current = null; setSession(null); sessionUrl(null); }
    } catch (failure: unknown) { handleFailure(failure); }
    finally { setBusy(false); }
  }

  function newQuiz() {
    resetQuestion(); setSession(null); setError(""); pendingSubmission.current = null; currentSessionId.current = null; sessionUrl(null);
  }

  const first = session?.attempts.filter(attempt => attempt.kind === "initial") ?? [];
  const accuracy = first.length ? Math.round(first.filter(attempt => attempt.correct).length / first.length * 100) : null;
  const finished = session && (session.status === "completed" || session.status === "ended") && !feedback;

  return <>
    {(error || loadError) && <div className="notice" role="alert">{error || loadError}</div>}
    <label className="alphabet-auto-audio"><input type="checkbox" checked={automaticAudio} onChange={event => void toggleAutomaticAudio(event.target.checked)} />Automatic alphabet audio</label>
    {!session ? <>
      <div className="toolbar">{groupPicker}<label>Alphabet question type<select aria-label="Alphabet question type" className="field" value={mode} onChange={event => setMode(event.target.value as AlphabetQuizMode)}><option value="typing">Type pronunciation</option><option value="mcq">Multiple choice</option></select></label>{mode === "mcq" && <label>Alphabet direction<select aria-label="Alphabet direction" className="field" value={direction} onChange={event => setDirection(event.target.value as AlphabetQuizDirection | "mixed")}><option value="character-to-pronunciation">Character → pronunciation</option><option value="pronunciation-to-character">Pronunciation → character</option><option value="mixed">Mix both directions</option></select></label>}<button className="button" disabled={!ready || busy || !canStart} onClick={() => void start()}><Play size={16} />{busy ? "Opening alphabet quiz…" : "Start alphabet quiz"}</button><span className="muted">{itemIds.length} symbols selected</span></div>
      {unavailable.length > 0 && <details className="notice"><summary>{unavailable.length} unavailable character directions</summary><ul>{unavailable.map(value => <li key={`${value.itemId}:${value.direction}`}>{value.reason}</li>)}</ul><p>Available directions remain eligible. Only characters with no enabled, available direction are skipped.</p></details>}
      {!ready && !loadError && <p role="status">Loading your alphabet practice…</p>}
      <p className="mini-note alphabet-quiz-intro">Practise {selectionLabel}. {mode === "typing" ? "Type each character’s pronunciation." : "Choose one of four frozen answers."} Letter names and associations are optional hints; they do not affect your score.</p>
      {resumable.length > 0 && <section className="card alphabet-resume-panel"><div className="section-heading"><h2>Saved alphabet quizzes</h2><Save size={18} /></div>{resumable.map(saved => <div className="quiz-resume-row" key={saved.id}><div><strong>{[...new Set(saved.items.map(snapshot => snapshot.group))].join(" · ")}</strong><p className="muted">{saved.testedItemIds.length} / {saved.items.length} symbols seen · {saved.attempts.length} answers saved · {saved.reservations.length} retries waiting</p></div><button className="button secondary" disabled={busy} onClick={() => void resume(saved)}>Resume alphabet quiz <ArrowRight size={15} /></button></div>)}</section>}
      {children}
    </> : finished ? <section className="card quiz-finished alphabet-quiz-finished"><span className="quiz-finished-icon"><CircleCheck size={36} /></span><p className="eyebrow">{session.status === "completed" ? "Alphabet practice complete" : "Alphabet practice ended"}</p><h2>{session.status === "completed" ? "The sounds are becoming familiar." : "Your alphabet progress is saved."}</h2><p className="muted">{session.testedItemIds.length} symbols practised · {session.attempts.length} questions completed</p><div className="quiz-result"><strong>{accuracy === null ? "—" : `${accuracy}%`}</strong><span>alphabet first-attempt accuracy</span></div><div className="alphabet-attempt-history" aria-label="Alphabet answer history">{session.attempts.map(attempt => {
      const frozen = session.questions.find(value => value.id === attempt.questionId);
      const snapshot = session.items.find(value => value.itemId === attempt.itemId);
      if (!frozen || !snapshot) return null;
      const submitted = frozen.options?.find(value => value.id === attempt.answer)?.text ?? attempt.answer;
      const expected = frozen.options?.find(value => value.id === frozen.correctOptionId)?.text ?? snapshot.pronunciationAnswers[0];
      return <article className="alphabet-attempt" key={attempt.id}><strong>{snapshot.symbol} · {attempt.kind} · {attempt.correct ? "Correct" : "Incorrect"}</strong><p>{frozen.direction === "pronunciation-to-character" ? "Pronunciation → character" : "Character → pronunciation"}: {frozen.prompt}</p><p>Your answer: {submitted} · Correct answer: {expected}</p>{frozen.options && <ol>{frozen.options.map(option => <li key={option.id}>{option.text}{option.id === frozen.correctOptionId ? " (correct)" : ""}</li>)}</ol>}</article>;
    })}</div><div className="toolbar" style={{ justifyContent: "center", marginTop: 24 }}><button className="button" onClick={newQuiz}>New alphabet quiz <ArrowRight size={16} /></button><Link className="button secondary" href={`/${language}/progress`}>View progress</Link></div></section>
      : session.status === "saved" ? <section className="card alphabet-resume-panel"><h2>This alphabet quiz is saved</h2><p className="muted">Resume its saved questions and retries to continue.</p><button className="button" disabled={busy} onClick={() => void resume(session)}>Resume alphabet quiz <ArrowRight size={15} /></button></section>
        : question && item ? <>
          <div className="quiz-session-bar"><span className="badge">Alphabet quiz</span><span className="muted">{session.testedItemIds.length} / {session.items.length} symbols seen · Question {question.position + 1}</span><div className="toolbar"><button className="button secondary" disabled={busy || session.status !== "active"} onClick={() => void leave(false)}><Save size={14} />Save & exit</button><button className="text-button" disabled={busy || session.status !== "active"} onClick={() => void leave(true)}><Square size={13} />End alphabet quiz</button></div></div>
          <section className="card quiz-question-card alphabet-quiz-card">
            <p className="eyebrow">{question.kind === "retry" ? "Try this one again" : question.kind === "filler" ? "Keep your recall warm" : question.mode === "mcq" ? "Choose the answer" : "Type the pronunciation"}</p>
            {question.mode === "mcq" && <p className="muted">{question.direction === "pronunciation-to-character" ? "Pronunciation → character" : "Character → pronunciation"}</p>}
            <h2 className="quiz-prompt alphabet-quiz-symbol" lang={question.direction === "pronunciation-to-character" ? "en" : session.language}>{question.prompt}</h2>
            <div className="alphabet-replay"><AudioButton text={item.audioText || item.symbol} language={session.language} label="Replay alphabet audio" />{item.audioKind && <span className="mini-note">{item.audioKind === "letter-name" ? "Letter name" : "Example syllable"}</span>}</div>
            <form className={question.mode === "mcq" ? "alphabet-mcq-form" : "quiz-typing"} onSubmit={event => { event.preventDefault(); void submit(); }}>{question.mode === "mcq" ? <fieldset className="alphabet-mcq-options" disabled={Boolean(feedback) || busy}><legend className="sr-only">Answer options</legend>{question.options?.map((option, index) => <label className={`alphabet-mcq-option ${answer === option.id ? "selected" : ""}`} key={option.id}><input type="radio" name={inputId} value={option.id} checked={answer === option.id} onChange={() => setAnswer(option.id)} /><span aria-hidden="true">{index + 1}.</span><span lang={question.direction === "pronunciation-to-character" ? session.language : "en"}>{option.text}</span></label>)}</fieldset> : <><label className="sr-only" htmlFor={inputId}>Pronunciation</label><input key={question.id} autoFocus id={inputId} className="field" value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Your pronunciation…" autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={Boolean(feedback) || busy} /></>}<button className="button" disabled={Boolean(feedback) || busy || !answer.trim()} type="submit">Check answer <ArrowRight size={16} /></button></form>
            <div className="alphabet-hint-toggles"><button type="button" className="button secondary" aria-expanded={showName} aria-controls={nameId} onClick={() => setShowName(value => !value)}>{showName ? "Hide" : "Show"} Letter Name</button><button type="button" className="button secondary" aria-expanded={showAssociation} aria-controls={associationId} onClick={() => { stopAudio(); setShowAssociation(value => !value); }}>{showAssociation ? "Hide" : "Show"} Association</button></div>
            {showName && <div id={nameId} className="alphabet-name-hint" lang={session.language}>{item.name}</div>}
            {showAssociation && <div id={associationId} className="alphabet-association-hint"><div className="word-with-audio"><p className="muted">{item.pronunciation}</p><AudioButton text={item.audioText || item.symbol} language={session.language} label={`Play ${item.audioKind === "example-syllable" ? "example syllable" : "letter name"} ${item.name}`} /></div><div className="word-with-audio"><span lang={session.language}>{item.example}</span><AudioButton text={item.example} reading={item.exampleReading} language={session.language} /></div><p className="muted">{item.exampleTranslation}</p>{item.notes && <p>{item.notes}</p>}</div>}
            {feedback && <div className={`quiz-feedback ${feedback.correct ? "correct" : "incorrect"}`} role="status"><div><strong>{feedback.correct ? "Correct!" : question.mode === "mcq" ? `The correct answer is ${question.options?.find(option => option.id === question.correctOptionId)?.text}.` : `The standard pronunciation is ${item.pronunciationAnswers[0]}.`}</strong>{!feedback.correct && <p>This character is scheduled for another try.</p>}</div><button className="button" onClick={resetQuestion}>{session.status === "completed" ? "See results" : "Continue"}<ArrowRight size={15} /></button></div>}
          </section>
        </> : <p role="status">Opening your saved question…</p>}
  </>;
}
