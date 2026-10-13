"use client";

import { Suspense, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, CircleCheck, Clock3, Play, Save, Sparkles, Square, X } from "lucide-react";
import { useAppData } from "./app-provider";
import { AudioButton, stopAudio } from "./audio-button";
import { WordText } from "./word-text";
import { WordDetails } from "./word-details";
import { WordPairs } from "./word-pairs";
import { QuizSummary } from "./quiz-summary";
import { useAutomaticQuizAudio, useQuizVoices } from "./quiz-audio";
import { chooseVoice } from "@/services/audio";
import { learningDate } from "@/domain/dates";
import { LANGUAGES } from "@/domain/languages";
import { retryIntervalRange } from "@/domain/quiz";
import { mixedQuizSetup } from "@/domain/mixed-quiz";
import { DEFAULT_QUIZ_PREFERENCES, quizPresentation, shouldShowQuizDetails } from "@/domain/quiz-preferences";
import { frozenCorrectAnswer } from "@/domain/quiz-summary";
import type { LanguageCode, QuizPreferences, QuizPresentation, QuizQuestion, QuizSession, QuizType, TranslationDirection, VocabularyEntry, VocabularyList, WordCareState, WordPair, WordProgress } from "@/domain/models";
import { VersionConflictError } from "@/repositories/contracts";
import "./quiz.css";

const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[];
const TYPES: { value: QuizType; title: string; description: string }[] = [
  { value: "word-meaning", title: "Word → Meaning", description: "Choose the English meaning." },
  { value: "meaning-word", title: "Meaning → Word", description: "Find the matching word." },
  { value: "typing", title: "Typing", description: "Type an accepted English meaning." },
  { value: "japanese-reading", title: "Japanese Reading", description: "Choose the saved kana reading." },
  { value: "spelling", title: "Meaning → Spelling", description: "Read the English meaning and spell the original word." },
  { value: "listening", title: "Listening → Spelling", description: "Listen and spell the hidden original word." },
  { value: "translation-mcq", title: "Cross-language choice", description: "Choose a word in an enabled target language." },
  { value: "translation-typing", title: "Cross-language typing", description: "Translate into an enabled target language." },
];
const PRESENTATIONS: { value: QuizPresentation; label: string }[] = [{ value: "always", label: "Always show" }, { value: "incorrect", label: "Only when incorrect" }, { value: "never", label: "Never show" }];
interface Feedback { question: QuizQuestion; correct: boolean; submitted: string }
interface PracticeData { entries: VocabularyEntry[]; lists: VocabularyList[]; progress: WordProgress[]; care: WordCareState[]; pairs: WordPair[] }
const EMPTY_PRACTICE: PracticeData = { entries: [], lists: [], progress: [], care: [], pairs: [] };

export function QuizPage({ language }: { language: LanguageCode }) {
  return <Suspense fallback={<div className="card" role="status">Opening your practice…</div>}><QuizContent key={language} language={language} /></Suspense>;
}

function QuizContent({ language }: { language: LanguageCode }) {
  const searchParams = useSearchParams();
  const dueRequested = searchParams.get("due") === "1", requestedWords = searchParams.get("words"), requestedSession = searchParams.get("session");
  const { repos, sessions, profile, ready, error: loadError } = useAppData(language);
  const revision = useSyncExternalStore(repos.subscribe, repos.getRevision, () => 0);
  const [practice, setPractice] = useState<PracticeData>(EMPTY_PRACTICE);
  const [practiceReady, setPracticeReady] = useState(false);
  const [languages, setLanguages] = useState<LanguageCode[]>([language]);
  const [types, setTypes] = useState<QuizType[]>(["word-meaning"]);
  const [directions, setDirections] = useState<TranslationDirection[]>([]);
  const [preferences, setPreferences] = useState<QuizPreferences>(DEFAULT_QUIZ_PREFERENCES);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [audioPreferenceBusy, setAudioPreferenceBusy] = useState(false);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [enabledListIds, setEnabledListIds] = useState<string[] | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [session, setSession] = useState<QuizSession | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showReading, setShowReading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingSubmission = useRef<{ questionId: string; answer: string; id: string } | null>(null);
  const resumeRequests = useRef(new Map<string, Promise<QuizSession>>());
  const suggestedSelection = useRef("");
  const answerId = useId();
  const voices = useQuizVoices();
  const listeningLanguages = languages.filter(code => Boolean(chooseVoice(voices.voices, code)));
  const today = learningDate(new Date(), profile.timezone);
  const lists = practice.lists.filter(list => languages.includes(list.language));
  const enabledLists = enabledListIds ?? lists.map(list => list.id);
  const entries = practice.entries.filter(entry => languages.includes(entry.language) && enabledLists.includes(entry.listId));
  const dueIds = practice.progress.filter(word => word.dueDate <= today).map(word => word.wordId);
  const availableIds = new Set(entries.map(entry => entry.id));
  const selectedIds = (selection ?? (requestedWords !== null ? requestedWords.split(",") : dueRequested ? dueIds : entries.map(entry => entry.id))).filter(id => availableIds.has(id));
  const selectedEntries = entries.filter(entry => selectedIds.includes(entry.id));
  const setup = mixedQuizSetup({ entries: selectedEntries, language, languages, type: types[0] ?? "word-meaning", types, directions, pairs: practice.pairs, listeningLanguages });
  const retryRange = setup.eligible.length > 0 ? retryIntervalRange(setup.eligible.length) : null;
  const displayed = entries.filter(entry => !listFilter || entry.listId === listFilter);
  const resumable = sessions.filter(item => item.status === "active" || item.status === "saved");
  const historical = sessions.filter(item => item.status === "completed" || item.status === "ended");
  const crossEnabled = types.includes("translation-mcq") || types.includes("translation-typing");
  const displayQuestion = feedback?.question ?? session?.currentQuestion;
  const entry = session?.entries.find(word => word.id === displayQuestion?.wordId);
  const currentType = displayQuestion?.type ?? session?.type ?? types[0];
  const inputIsText = displayQuestion?.inputMode === "text" || (displayQuestion?.inputMode === undefined && ["typing", "spelling", "listening", "translation-typing"].includes(currentType));
  const targetLanguage = displayQuestion?.targetLanguage ?? (currentType === "typing" || currentType === "word-meaning" ? "en" : entry?.language ?? language);
  const sourceLanguage = displayQuestion?.sourceLanguage ?? (currentType === "meaning-word" || currentType === "spelling" ? "en" : entry?.language ?? language);
  const audioText = displayQuestion?.audioText ?? (sourceLanguage === "en" ? displayQuestion?.prompt ?? "" : entry?.word ?? "");
  const choicesAreWords = targetLanguage !== "en" && currentType !== "japanese-reading";
  const latestEntry = practice.entries.find(word => word.id === entry?.id);
  const listeningUnavailable = currentType === "listening" && !chooseVoice(voices.voices, displayQuestion?.audioLanguage ?? sourceLanguage);

  useAutomaticQuizAudio({ questionKey: session && displayQuestion && !feedback ? `${session.id}:${displayQuestion.id}` : null, text: audioText, language: displayQuestion?.audioLanguage ?? sourceLanguage, enabled: preferences.vocabularyAutoAudio, feedback: Boolean(feedback) });
  useEffect(() => () => stopAudio(), [displayQuestion?.id, language]);
  useEffect(() => {
    let active = true;
    void Promise.all([Promise.all(LANGUAGE_CODES.map(code => repos.vocabulary.getEntries(code))), Promise.all(LANGUAGE_CODES.map(code => repos.vocabulary.getLists(code))), Promise.all(LANGUAGE_CODES.map(code => repos.progress.getWords(code))), repos.care.getStates(), repos.wordPairs.getPairs()]).then(([words, wordLists, progress, care, pairs]) => {
      if (active) { setPractice({ entries: words.flat(), lists: wordLists.flat(), progress: progress.flat(), care, pairs }); setPracticeReady(true); }
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Could not load practice words."); });
    return () => { active = false; };
  }, [repos, revision]);
  useEffect(() => {
    let active = true;
    void repos.settings.getQuizPreferences().then(value => { if (active) { setPreferences(value); setPreferencesReady(true); } }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Could not load quiz preferences."); });
    return () => { active = false; };
  }, [repos]);
  const suggestionKey = crossEnabled ? [...selectedIds].sort().join(",") : "";
  useEffect(() => {
    if (!crossEnabled || !practiceReady || !suggestionKey || suggestedSelection.current === suggestionKey) return;
    suggestedSelection.current = suggestionKey;
    void repos.wordPairs.suggest({ wordIds: suggestionKey.split(",") }).catch(failure => setError(failure instanceof Error ? failure.message : "Could not suggest word pairs."));
  }, [crossEnabled, practiceReady, repos, suggestionKey]);
  useEffect(() => {
    if (!requestedSession || !ready) return;
    let active = true, request = resumeRequests.current.get(requestedSession);
    if (!request) {
      request = repos.quiz.getSession(requestedSession).then(snapshot => {
        if (snapshot.language !== language && !snapshot.languages?.includes(language)) throw new Error("This saved quiz belongs to a different language. Open it from that language’s dashboard.");
        return snapshot.status === "completed" || snapshot.status === "ended" ? snapshot : repos.quiz.resume(requestedSession);
      });
      resumeRequests.current.set(requestedSession, request);
      const requests = resumeRequests.current;
      void request.then(() => requests.delete(requestedSession), () => requests.delete(requestedSession));
    }
    void Promise.resolve().then(() => { if (active) setBusy(true); return request; }).then(next => {
      if (active && next) { stopAudio(); setSession(next); setFeedback(null); setTypedAnswer(""); setShowReading(false); setError(""); }
    }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Could not open this quiz."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [requestedSession, ready, repos, language]);

  async function handleFailure(failure: unknown) {
    if (failure instanceof VersionConflictError) { pendingSubmission.current = null; setSession(failure.latest); setFeedback(null); setTypedAnswer(""); setShowReading(false); }
    setError(failure instanceof Error ? failure.message : "Could not update this quiz. Please try again.");
  }
  async function start() {
    setError(""); setBusy(true);
    try {
      if (!setup.eligible.length || !types.length || !languages.length) throw new Error("Select an eligible combination of words, languages and question types.");
      await repos.settings.updateQuizPreferences({ presentation: preferences.presentation, vocabularyAutoAudio: preferences.vocabularyAutoAudio });
      const next = await repos.quiz.create({ language, wordIds: selectedEntries.map(word => word.id), type: types[0], languages, types, directions: crossEnabled ? directions : [], listeningLanguages, presentation: preferences.presentation });
      stopAudio(); setSession(next); setFeedback(null); setTypedAnswer(""); setShowReading(false);
    } catch (failure: unknown) { await handleFailure(failure); } finally { setBusy(false); }
  }
  async function openSession(id: string) {
    setError(""); setBusy(true);
    try { const snapshot = await repos.quiz.getSession(id); const next = snapshot.status === "completed" || snapshot.status === "ended" ? snapshot : await repos.quiz.resume(id); stopAudio(); setSession(next); setFeedback(null); setTypedAnswer(""); setShowReading(false); }
    catch (failure: unknown) { await handleFailure(failure); } finally { setBusy(false); }
  }
  async function submit(answer: string) {
    if (!session?.currentQuestion || feedback || busy) return;
    const question = session.currentQuestion;
    if (pendingSubmission.current?.questionId !== question.id || pendingSubmission.current.answer !== answer) pendingSubmission.current = { questionId: question.id, answer, id: crypto.randomUUID() };
    setError(""); setBusy(true); stopAudio();
    try {
      const next = await repos.quiz.answer(session.id, { answer, version: session.version, submissionId: pendingSubmission.current.id });
      const attempt = next.attempts.find(item => item.questionId === question.id);
      if (attempt && shouldShowQuizDetails(quizPresentation(next), attempt.correct)) setFeedback({ question, correct: attempt.correct, submitted: answer });
      else { setFeedback(null); setTypedAnswer(""); setShowReading(false); }
      setSession(next); pendingSubmission.current = null;
    } catch (failure: unknown) { await handleFailure(failure); } finally { setBusy(false); }
  }
  async function leave(end: boolean) {
    if (!session || busy) return;
    setError(""); setBusy(true); stopAudio();
    try { const next = end ? await repos.quiz.end(session.id, session.version) : await repos.quiz.saveAndExit(session.id, session.version); setSession(end ? next : null); setFeedback(null); setTypedAnswer(""); setShowReading(false); }
    catch (failure: unknown) { await handleFailure(failure); } finally { setBusy(false); }
  }
  async function saveAudioPreference(value: boolean) {
    const before = preferences.vocabularyAutoAudio;
    setPreferences(current => ({ ...current, vocabularyAutoAudio: value })); setAudioPreferenceBusy(true);
    try { await repos.settings.updateQuizPreferences({ vocabularyAutoAudio: value }); }
    catch (failure) { setPreferences(current => ({ ...current, vocabularyAutoAudio: before })); setError(failure instanceof Error ? failure.message : "Could not save automatic audio preference."); }
    finally { setAudioPreferenceBusy(false); }
  }
  function nextQuestion() { stopAudio(); setFeedback(null); setTypedAnswer(""); setShowReading(false); }
  function toggleType(value: QuizType) { setTypes(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]); setError(""); }
  function toggleLanguage(code: LanguageCode) { setLanguages(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code]); setListFilter(""); setError(""); }
  const finished = session && (session.status === "completed" || session.status === "ended") && !feedback;
  const loaded = ready && practiceReady && preferencesReady;

  return <>
    <div className="page-heading"><div><p className="eyebrow">A little practice, every day</p><h1>Quiz</h1><p className="muted">Build recall with your words and a little room to try again.</p></div><span className="badge"><Sparkles size={14} /> Your vocabulary</span></div>
    {(error || loadError) && <div className="notice" role="alert">{error || loadError}</div>}
    {!loaded ? <div className="card" role="status">Loading your practice words…</div> : !session ? <>
      {resumable.length > 0 && <section className="card" style={{ marginBottom: 24 }}><div className="section-heading"><h2>Pick up where you left off</h2><Save size={18} /></div><div className="stack">{resumable.map(item => <div className="quiz-resume-row" key={item.id}><div><strong>{TYPES.find(option => option.value === item.type)?.title}</strong><p className="muted">{item.testedWordIds.length} / {item.entries.length} words seen · {item.attempts.length} answers saved · {item.reservations.length} retries waiting</p></div><button className="button secondary" disabled={busy} onClick={() => void openSession(item.id)}>Resume <ArrowRight size={15} /></button></div>)}</div></section>}
      <div className="grid-2 quiz-setup-grid">
        <section className="card"><div className="section-heading"><h2>Choose your practice</h2><span className="badge">Step 1</span></div>
          <fieldset className="quiz-config"><legend>Enabled languages</legend><p className="muted">Normal questions can mix languages independently of cross-language translation.</p><div className="quiz-checkboxes">{LANGUAGE_CODES.map(code => <label key={code}><input type="checkbox" checked={languages.includes(code)} onChange={() => toggleLanguage(code)} />{LANGUAGES[code].name}</label>)}</div></fieldset>
          <fieldset className="quiz-config"><legend>Enabled word sets</legend><div className="quiz-checkboxes">{lists.map(list => <label key={list.id}><input type="checkbox" checked={enabledLists.includes(list.id)} onChange={event => { setEnabledListIds(event.target.checked ? [...enabledLists, list.id] : enabledLists.filter(id => id !== list.id)); setListFilter(""); }} />{LANGUAGES[list.language].name}: {list.name}</label>)}</div>{lists.length === 0 && <p className="muted">Add a vocabulary list in an enabled language to practise.</p>}</fieldset>
          <div className="quiz-types">{TYPES.filter(option => option.value !== "japanese-reading" || languages.includes("ja")).map(option => <button type="button" key={option.value} className={`quiz-type ${types.length === 1 && types[0] === option.value ? "selected" : ""}`} aria-pressed={types.length === 1 && types[0] === option.value} onClick={() => { setTypes([option.value]); setError(""); }}><span className="quiz-type-marker">{types.length === 1 && types[0] === option.value ? <Check size={16} /> : null}</span><span><strong>{option.title}</strong><small>{option.description}</small></span></button>)}</div>
          <fieldset className="quiz-config"><legend>Mix question types</legend><div className="quiz-checkboxes">{TYPES.filter(option => option.value !== "japanese-reading" || languages.includes("ja")).map(option => <label key={option.value}><input type="checkbox" checked={types.includes(option.value)} onChange={() => toggleType(option.value)} />{option.title}</label>)}</div></fieldset>
          {types.includes("listening") && <p className="notice">{voices.loading ? "Loading device voices…" : languages.filter(code => !listeningLanguages.includes(code)).length ? `Listening unavailable: ${languages.filter(code => !listeningLanguages.includes(code)).map(code => LANGUAGES[code].name).join(", ")}. Enable another selected question type to practise these words.` : "Matching device voices are available for listening spelling."}</p>}
          {crossEnabled && <fieldset className="quiz-config"><legend>Enabled translation directions</legend><p className="muted">Each direction must be enabled explicitly.</p><div className="quiz-checkboxes">{languages.flatMap(source => languages.filter(target => source !== target).map(target => { const checked = directions.some(direction => direction.source === source && direction.target === target); return <label key={`${source}:${target}`}><input type="checkbox" checked={checked} onChange={() => setDirections(current => checked ? current.filter(direction => direction.source !== source || direction.target !== target) : [...current, { source, target }])} />{LANGUAGES[source].name} → {LANGUAGES[target].name}</label>; }))}</div>{languages.length < 2 && <p className="notice">Select at least two languages and a translation direction.</p>}</fieldset>}
          <fieldset className="quiz-config"><legend>Answer details</legend><div className="quiz-checkboxes">{PRESENTATIONS.map(option => <label key={option.value}><input type="radio" name="presentation" checked={preferences.presentation === option.value} onChange={() => setPreferences(current => ({ ...current, presentation: option.value }))} />{option.label}</label>)}</div><p className="muted">Saved with this session. Every completed or ended quiz includes a full Summary.</p></fieldset>
          <label className="quiz-auto-audio"><input type="checkbox" checked={preferences.vocabularyAutoAudio} disabled={audioPreferenceBusy} onChange={event => void saveAudioPreference(event.target.checked)} />Automatically play each new question</label>
          <div className="quiz-retry-note"><Clock3 size={19} /><div><strong>{setup.eligible.length} eligible {setup.eligible.length === 1 ? "word" : "words"}</strong><p className="muted">{retryRange ? retryRange[0] === 0 ? "Wrong answers repeat immediately after the correction." : `Wrong answers return after ${retryRange[0] === retryRange[1] ? retryRange[0] : `${retryRange[0]}–${retryRange[1]}`} completed questions.` : "Select words with an enabled feasible question type."}</p></div></div>
          {setup.ineligible.length > 0 && <div className="notice" aria-label="Ineligible words"><strong>{setup.ineligible.length} selected words cannot be tested</strong><ul>{setup.ineligible.map(item => <li key={item.wordId}>{selectedEntries.find(word => word.id === item.wordId)?.word}: {item.reason}</li>)}</ul></div>}
          <button className="button" disabled={busy || setup.eligible.length === 0 || types.length === 0 || languages.length === 0} onClick={() => void start()}><Play size={16} />{busy ? "Preparing…" : "Start practice"}</button>
          <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>Words, answers, directions and choices are frozen for this session. Multiple choice requires two to four unambiguous choices.</p>
        </section>
        <section className="card"><div className="section-heading"><h2>Your practice words</h2><span className="badge">{selectedEntries.length} selected</span></div><div className="toolbar"><select className="field" aria-label="Filter practice words by list" value={listFilter} onChange={event => setListFilter(event.target.value)}><option value="">All vocabulary lists</option>{lists.map(list => <option value={list.id} key={list.id}>{LANGUAGES[list.language].name} · {list.name}</option>)}</select></div><div className="quiz-selection-tools"><button className="text-button" onClick={() => setSelection(entries.map(word => word.id))}>Select all</button><button className="text-button" onClick={() => setSelection([])}>Clear</button><button className="text-button" onClick={() => setSelection(dueIds)}>Due reviews ({dueIds.filter(id => availableIds.has(id)).length})</button></div><div className="quiz-word-list">{displayed.map(word => <label className="quiz-word-row" key={word.id}><input type="checkbox" checked={selectedIds.includes(word.id)} onChange={event => setSelection(event.target.checked ? [...selectedIds, word.id] : selectedIds.filter(id => id !== word.id))} /><span><WordText entry={word} /><small>{LANGUAGES[word.language].name} · {word.translation}</small></span>{dueIds.includes(word.id) && <span className="badge">Due</span>}</label>)}</div>{entries.length === 0 && <div className="empty-state"><p>Add a few words to begin.</p><Link className="button secondary" href={`/${language}/vocabulary`}>Open vocabulary</Link></div>}{crossEnabled && <WordPairs entries={selectedEntries} pairs={practice.pairs} />}</section>
      </div>
      {historical.length > 0 && <section className="card" style={{ marginTop: 24 }}><h2>Practice history</h2>{historical.map(item => <div className="quiz-resume-row" key={item.id}><div><strong>{item.learningDate} · {item.status}</strong><p>{item.attempts.length} answered questions</p></div><button className="button secondary" disabled={busy} onClick={() => void openSession(item.id)}>Open Summary</button></div>)}</section>}
    </> : finished ? <>
      <section className="card quiz-finished"><span className="quiz-finished-icon"><CircleCheck size={36} /></span><p className="eyebrow">{session.status === "completed" ? "Practice complete" : "Practice ended"}</p><h2>{session.status === "completed" ? "A little more familiar." : "Your progress is saved."}</h2><p className="muted">Review progress is settled once per tested word.</p><div className="toolbar" style={{ justifyContent: "center", marginTop: 24 }}><button className="button" onClick={() => { setSession(null); setError(""); }}>New practice <ArrowRight size={16} /></button><Link className="button secondary" href={`/${language}/progress`}>View progress</Link></div></section>
      <QuizSummary session={session} entries={practice.entries} progress={practice.progress} care={practice.care} />
    </> : displayQuestion && entry ? <>
      <div className="quiz-session-bar"><span className="badge">{TYPES.find(option => option.value === currentType)?.title}</span><span className="badge">{displayQuestion.direction ?? `${sourceLanguage} → ${targetLanguage}`}</span><span className="muted">{session.testedWordIds.length} / {session.entries.length} words seen · Question {displayQuestion.position + 1}</span><div className="toolbar"><button className="button secondary" disabled={busy} onClick={() => void leave(false)}><Save size={14} /> Save & exit</button><button className="text-button" disabled={busy} onClick={() => void leave(true)}><Square size={13} /> End practice</button></div></div>
      <section className="card quiz-question-card"><p className="eyebrow">{displayQuestion.kind === "retry" ? "Try this one again" : displayQuestion.kind === "filler" ? "Keep your recall warm" : "A fresh question"}</p><h2 className="quiz-prompt">{currentType === "listening" ? "Listen and spell the word" : sourceLanguage === "en" ? displayQuestion.prompt : currentType === "japanese-reading" ? <span>{entry.word}{showReading && <small className="quiz-reading">{entry.reading}</small>}</span> : <WordText entry={entry} />}</h2><div className="quiz-prompt-tools"><AudioButton text={audioText} language={displayQuestion.audioLanguage ?? sourceLanguage} label={currentType === "listening" ? "Replay listening question" : undefined} />{currentType === "japanese-reading" && <button className="button secondary" onClick={() => setShowReading(value => !value)}>{showReading ? "Hide Reading" : "Show Reading"}</button>}</div><p className="muted">{currentType === "typing" ? "Type the English meaning." : currentType === "word-meaning" ? "Choose the English meaning." : currentType === "meaning-word" ? "Choose the matching word." : currentType === "japanese-reading" ? "Choose the correct Japanese reading." : currentType === "listening" ? `Spell the hidden ${LANGUAGES[entry.language].name} word.` : inputIsText ? `Type the ${targetLanguage === "en" ? "English" : LANGUAGES[targetLanguage].name} word.` : `Choose the ${targetLanguage === "en" ? "English" : LANGUAGES[targetLanguage].name} word.`}</p>
        {listeningUnavailable && <p className="notice" role="alert">{voices.loading ? "Loading device voices…" : "This listening question needs a matching voice. Save this quiz and resume on a device with that voice."}</p>}
        {inputIsText ? <form onSubmit={event => { event.preventDefault(); void submit(typedAnswer); }} className="quiz-typing"><label className="sr-only" htmlFor={answerId}>{currentType === "typing" ? "English meaning" : "Your spelling or translation"}</label><input autoFocus id={answerId} className="field" value={typedAnswer} onChange={event => setTypedAnswer(event.target.value)} placeholder="Your answer…" autoComplete="off" disabled={Boolean(feedback) || busy || listeningUnavailable} /><button className="button" disabled={Boolean(feedback) || busy || !typedAnswer.trim() || listeningUnavailable} type="submit">Check answer <ArrowRight size={16} /></button></form> : <div className="quiz-choices">{displayQuestion.choices.map((choice, index) => {
          const choiceEntry = session.entries.find(word => word.id === choice.id), correct = Boolean(feedback) && choice.id === displayQuestion.correctChoiceId, incorrect = Boolean(feedback) && choice.id === feedback?.submitted && !feedback.correct;
          return <div className={`quiz-choice ${correct ? "correct" : ""} ${incorrect ? "incorrect" : ""}`} key={choice.id}><button className="quiz-choice-select" disabled={Boolean(feedback) || busy} onClick={() => void submit(choice.id)}><span className="quiz-choice-number">{index + 1}</span><span>{choicesAreWords && choiceEntry ? <WordText entry={{ ...choiceEntry, word: choice.text }} /> : choice.text}</span>{correct && <Check size={18} />}{incorrect && <X size={18} />}</button>{choicesAreWords && <AudioButton text={choice.audioText} language={targetLanguage} />}</div>;
        })}</div>}
        {feedback && <><div className={`quiz-feedback ${feedback.correct ? "correct" : "incorrect"}`} role="status"><div><strong>{feedback.correct ? "Correct. Nicely remembered." : "Let's remember this one."}</strong>{!feedback.correct && <p>The answer is <strong>{frozenCorrectAnswer(displayQuestion, entry)}</strong>.</p>}{!feedback.correct && <p>{session.entries.length === 1 ? "You'll try it again now." : `It will return after ${session.reservations.find(reservation => reservation.wordId === entry.id)?.interval ?? session.configuration.retryRange[0]} completed questions.`}</p>}</div><button className="button" onClick={nextQuestion}>{session.status === "completed" ? "See results" : "Continue"}<ArrowRight size={16} /></button></div><div className="quiz-answer-details"><p className="muted">Latest word details · correct answers remain frozen for this session</p><WordDetails entry={latestEntry ?? entry} deleted={!latestEntry} progress={practice.progress.find(item => item.wordId === entry.id)} care={practice.care.find(item => item.wordId === entry.id)} /></div></>}
      </section><p className="muted quiz-audio-note">Manual replay and reading hints do not change scoring.</p>
    </> : <div className="empty-state">This session has no active question.</div>}
  </>;
}
