import type { ISODate, LanguageCode, QuizChoice, QuizQuestion, QuizSession, QuizType, VocabularyEntry } from "./models";

export const QUIZ_SCHEDULER_VERSION = 1;

export class QuizConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizConfigurationError";
  }
}

export function normalizeAnswer(text: string): string {
  return text.normalize("NFC").trim().toLocaleLowerCase("en");
}

export function retryIntervalRange(n: number): [number, number] {
  if (!Number.isInteger(n) || n < 1) throw new QuizConfigurationError("Select at least one eligible word.");
  if (n === 1) return [0, 0];
  if (n <= 3) return [1, n - 1];
  if (n <= 10) return [3, n - 1];
  return [3, 10];
}

export function quizEligibleEntries(entries: VocabularyEntry[], type: QuizType): VocabularyEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return type !== "japanese-reading" || (entry.language === "ja" && entry.reading.trim().length > 0);
  });
}

function meaningAnswers(entry: VocabularyEntry): string[] {
  return [...new Set([entry.translation, ...entry.acceptedAnswers.map((answer) => answer.text)]
    .map(normalizeAnswer).filter(Boolean))];
}

function readingsEqual(a: string, b: string): boolean {
  const hiragana = (value: string) => normalizeAnswer(value).replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
  return hiragana(a) === hiragana(b);
}

function writtenWordKey(entry: VocabularyEntry): string {
  const normalized = normalizeAnswer(entry.word);
  return entry.language === "ja" ? normalized.replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60)) : normalized;
}

function ambiguousMeaning(a: VocabularyEntry, b: VocabularyEntry): boolean {
  const target = new Set(meaningAnswers(a));
  return meaningAnswers(b).some((answer) => target.has(answer));
}

function choiceFor(entry: VocabularyEntry, type: QuizType): QuizChoice {
  return {
    id: entry.id,
    text: type === "word-meaning" ? entry.translation : type === "japanese-reading" ? entry.reading : entry.word,
    audioText: entry.language === "ja" && entry.reading ? entry.reading : entry.word,
  };
}

function possibleDistractors(entry: VocabularyEntry, entries: VocabularyEntry[], type: QuizType): QuizChoice[] {
  const choices: QuizChoice[] = [];
  const used = new Set([type === "meaning-word" ? writtenWordKey(entry) : normalizeAnswer(choiceFor(entry, type).text)]);
  for (const candidate of entries) {
    if (candidate.id === entry.id || writtenWordKey(candidate) === writtenWordKey(entry)) continue;
    if (type === "japanese-reading") {
      // An identical written prompt cannot disambiguate alternate readings.
      if (readingsEqual(candidate.reading, entry.reading) || choices.some((choice) => readingsEqual(choice.text, candidate.reading))) continue;
    } else if (ambiguousMeaning(entry, candidate)) {
      continue;
    }
    const choice = choiceFor(candidate, type);
    const key = type === "meaning-word" ? writtenWordKey(candidate) : normalizeAnswer(choice.text);
    if (!choice.text.trim() || used.has(key)) continue;
    used.add(key);
    choices.push(choice);
  }
  return choices;
}

/** Validate before creating a session; MC never silently falls back to another type. */
export function quizSetup(input: { entries: VocabularyEntry[]; type: QuizType }): { entries: VocabularyEntry[]; retryRange: [number, number] } {
  const entries = quizEligibleEntries(input.entries, input.type);
  if (entries.length === 0) throw new QuizConfigurationError(input.type === "japanese-reading"
    ? "Select Japanese words with saved reading data."
    : "Select at least one word.");
  if (input.type !== "typing") {
    const unsupported = entries.find((entry) => possibleDistractors(entry, entries, input.type).length === 0);
    if (unsupported) throw new QuizConfigurationError(`“${unsupported.word}” has fewer than two unambiguous choices. Add different words or choose Typing.`);
  }
  return { entries, retryRange: retryIntervalRange(entries.length) };
}

/** Mulberry32: its single uint32 state is part of the persisted session. */
export function quizRandom(session: { randomState: number }): number {
  session.randomState = (session.randomState + 0x6D2B79F5) >>> 0;
  let value = session.randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function quizShuffle<T>(items: T[], state: { randomState: number }): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(quizRandom(state) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface CreateQuizSessionInput {
  id: string;
  userId: string;
  language: LanguageCode;
  entries: VocabularyEntry[];
  type: QuizType;
  randomSeed: number;
  learningDate: ISODate;
  dueWordIds?: string[];
  now?: string;
}

export function createQuizSession(input: CreateQuizSessionInput): QuizSession {
  if (input.entries.some((entry) => entry.language !== input.language || entry.userId !== input.userId)) {
    throw new QuizConfigurationError("Quiz words must belong to the current user and language.");
  }
  const setup = quizSetup(input);
  const now = input.now ?? new Date().toISOString();
  const state = { randomState: input.randomSeed >>> 0 };
  const entries = quizShuffle(structuredClone(setup.entries), state);
  const templates = entries.map((entry): QuizQuestion => {
    const choices = input.type === "typing" ? [] : quizShuffle([
      choiceFor(entry, input.type),
      ...quizShuffle(possibleDistractors(entry, entries, input.type), state).slice(0, 3),
    ], state);
    return {
      id: `template:${entry.id}`,
      position: -1,
      wordId: entry.id,
      kind: "initial",
      prompt: input.type === "meaning-word" ? entry.translation : entry.word,
      choices,
      correctChoiceId: input.type === "typing" ? null : entry.id,
      acceptedAnswers: meaningAnswers(entry),
    };
  });
  const session: QuizSession = {
    id: input.id, userId: input.userId, language: input.language, type: input.type,
    entries, questionTemplates: templates, questions: [], attempts: [], reservations: [],
    testedWordIds: [], retryCompletedWordIds: [], currentQuestion: null, status: "active",
    randomSeed: input.randomSeed >>> 0, randomState: state.randomState, schedulerVersion: QUIZ_SCHEDULER_VERSION,
    version: 1, createdAt: now, updatedAt: now, learningDate: input.learningDate,
    dueWordIds: (input.dueWordIds ?? []).filter((id) => entries.some((entry) => entry.id === id)),
    settled: false, configuration: { minChoices: 2, maxChoices: 4, retryRange: setup.retryRange },
  };
  scheduleNextQuestion(session);
  return session;
}

function scheduleNextQuestion(session: QuizSession): void {
  const position = session.attempts.length;
  const reservation = session.reservations.find((item) => item.position === position);
  let wordId: string | undefined;
  let kind: QuizQuestion["kind"] = "initial";
  if (reservation) {
    wordId = reservation.wordId;
    kind = "retry";
  } else {
    const pending = new Set(session.reservations.map((item) => item.wordId));
    wordId = session.entries.find((entry) => !session.testedWordIds.includes(entry.id) && !pending.has(entry.id))?.id;
    if (!wordId && session.reservations.length === 0) {
      session.status = "completed";
      session.currentQuestion = null;
      return;
    }
    if (!wordId) {
      kind = "filler";
      const retryCompleted = session.entries.filter((entry) => session.retryCompletedWordIds.includes(entry.id) && !pending.has(entry.id));
      const previouslyCorrect = session.entries.filter((entry) => session.testedWordIds.includes(entry.id) && !pending.has(entry.id));
      const pool = retryCompleted.length > 0 ? retryCompleted : previouslyCorrect;
      wordId = pool.length > 0 ? pool[Math.floor(quizRandom(session) * pool.length)].id : undefined;
    }
  }
  if (!wordId) throw new Error("Scheduler invariant failed: no eligible word can fill a reserved gap.");
  const template = session.questionTemplates.find((question) => question.wordId === wordId);
  if (!template) throw new Error("Frozen question template is missing.");
  const question: QuizQuestion = { ...structuredClone(template), id: `${session.id}:${position}`, position, kind };
  session.currentQuestion = question;
  session.questions.push(question);
}

/** Each call processes exactly one answer. Submission IDs make replay idempotent. */
export function answerQuiz(original: QuizSession, answer: string, submissionId?: string, now?: string): QuizSession {
  if (submissionId && original.attempts.some((attempt) => attempt.id === submissionId)) return original;
  if (original.schedulerVersion !== QUIZ_SCHEDULER_VERSION) throw new Error("Unsupported quiz scheduler version.");
  if (original.status !== "active" || !original.currentQuestion) throw new Error("This quiz is not active.");
  const session = structuredClone(original);
  const question = session.currentQuestion!;
  const correct = session.type === "typing"
    ? question.acceptedAnswers.includes(normalizeAnswer(answer))
    : question.correctChoiceId === answer;
  const answeredAt = now ?? new Date().toISOString();
  session.attempts.push({
    id: submissionId ?? `${question.id}:answer`, questionId: question.id, wordId: question.wordId,
    position: question.position, kind: question.kind, answer, correct, answeredAt,
  });
  if (!session.testedWordIds.includes(question.wordId)) session.testedWordIds.push(question.wordId);
  session.reservations = session.reservations.filter((item) => item.wordId !== question.wordId);
  if (!correct) {
    const [min, max] = session.configuration.retryRange;
    const candidates: number[] = [];
    for (let interval = min; interval <= max; interval += 1) {
      const position = question.position + interval + 1;
      if (!session.reservations.some((reservation) => reservation.position === position)) candidates.push(position);
    }
    // The upper endpoint is always free: older reservations cannot extend past it.
    if (candidates.length === 0) throw new Error("No free retry position in the required interval.");
    const position = candidates[Math.floor(quizRandom(session) * candidates.length)];
    session.reservations.push({ wordId: question.wordId, position, interval: position - question.position - 1 });
    session.retryCompletedWordIds = session.retryCompletedWordIds.filter((id) => id !== question.wordId);
  } else if (question.kind === "retry" && !session.retryCompletedWordIds.includes(question.wordId)) {
    session.retryCompletedWordIds.push(question.wordId);
  }
  session.version += 1;
  session.updatedAt = answeredAt;
  scheduleNextQuestion(session);
  return session;
}
