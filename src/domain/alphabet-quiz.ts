import { alphabetEntries } from "@/data/alphabet";
import type { AlphabetEntry, AlphabetQuizItemSnapshot, AlphabetQuizQuestion, AlphabetQuizSession, ISODate, LanguageCode } from "./models";
import { normalizeAnswer, QUIZ_SCHEDULER_VERSION, QuizConfigurationError, quizRandom, quizShuffle, retryIntervalRange } from "./quiz";

/** Version of the learner-facing content contract, independent of the scheduler. */
export const ALPHABET_CONTENT_VERSION = 1;

export interface CreateAlphabetQuizSessionInput {
  id: string;
  userId: string;
  language: LanguageCode;
  itemIds: string[];
  randomSeed: number;
  learningDate: ISODate;
  now?: string;
  /** Injectable only at the trusted domain boundary, never accepted by the API. */
  sourceEntries?: AlphabetEntry[];
}

/** Only creation consults live content. Every later operation uses this snapshot. */
export function createAlphabetQuizSession(input: CreateAlphabetQuizSessionInput): AlphabetQuizSession {
  const selected = [...new Set(input.itemIds)];
  if (selected.length === 0) throw new QuizConfigurationError("Select at least one alphabet character.");
  const source = input.sourceEntries ?? alphabetEntries;
  const items = selected.map((itemId): AlphabetQuizItemSnapshot => {
    const item = source.find(entry => entry.id === itemId && entry.language === input.language);
    if (!item) throw new QuizConfigurationError("A selected alphabet character is unavailable in this language.");
    if (!item.pronunciationAnswers.length || item.pronunciationAnswers.some(answer => !normalizeAnswer(answer))) {
      throw new QuizConfigurationError("This alphabet character has no valid pronunciation answers.");
    }
    return { itemId, language: item.language, group: item.group, symbol: item.symbol, name: item.name,
      pronunciation: item.pronunciation, pronunciationAnswers: [...item.pronunciationAnswers], example: item.example,
      exampleTranslation: item.exampleTranslation, audioText: item.audioText ?? "", exampleReading: item.exampleReading ?? "" };
  });
  const state = { randomState: input.randomSeed >>> 0 };
  const frozen = quizShuffle(structuredClone(items), state);
  const now = input.now ?? new Date().toISOString();
  const session: AlphabetQuizSession = {
    id: input.id, userId: input.userId, language: input.language, contentVersion: ALPHABET_CONTENT_VERSION,
    items: frozen, questionTemplates: frozen.map(item => ({ id: `template:${item.itemId}`, position: -1,
      itemId: item.itemId, kind: "initial", prompt: item.symbol,
      acceptedAnswers: [...new Set(item.pronunciationAnswers.map(normalizeAnswer))] })),
    questions: [], attempts: [], reservations: [], testedItemIds: [], retryCompletedItemIds: [], currentQuestion: null,
    status: "active", randomSeed: input.randomSeed >>> 0, randomState: state.randomState,
    schedulerVersion: QUIZ_SCHEDULER_VERSION, version: 1, createdAt: now, updatedAt: now,
    learningDate: input.learningDate, configuration: { retryRange: retryIntervalRange(frozen.length) },
  };
  scheduleNextQuestion(session);
  return session;
}

/** Same reservations, filler priority and RNG as the existing Vocabulary scheduler. */
function scheduleNextQuestion(session: AlphabetQuizSession): void {
  const position = session.attempts.length;
  const reservation = session.reservations.find(item => item.position === position);
  let itemId: string | undefined;
  let kind: AlphabetQuizQuestion["kind"] = "initial";
  if (reservation) {
    itemId = reservation.itemId;
    kind = "retry";
  } else {
    const pending = new Set(session.reservations.map(item => item.itemId));
    itemId = session.items.find(item => !session.testedItemIds.includes(item.itemId) && !pending.has(item.itemId))?.itemId;
    if (!itemId && session.reservations.length === 0) {
      session.status = "completed";
      session.currentQuestion = null;
      return;
    }
    if (!itemId) {
      kind = "filler";
      const retryCompleted = session.items.filter(item => session.retryCompletedItemIds.includes(item.itemId) && !pending.has(item.itemId));
      const previouslyCorrect = session.items.filter(item => session.testedItemIds.includes(item.itemId) && !pending.has(item.itemId));
      const pool = retryCompleted.length > 0 ? retryCompleted : previouslyCorrect;
      itemId = pool.length > 0 ? pool[Math.floor(quizRandom(session) * pool.length)].itemId : undefined;
    }
  }
  if (!itemId) throw new Error("Scheduler invariant failed: no eligible character can fill a reserved gap.");
  const template = session.questionTemplates.find(question => question.itemId === itemId);
  if (!template) throw new Error("Frozen alphabet question template is missing.");
  const question = { ...structuredClone(template), id: `${session.id}:${position}`, position, kind };
  session.currentQuestion = question;
  session.questions.push(question);
}

/** Grades only frozen explicit answers; hint state is deliberately absent. */
export function answerAlphabetQuiz(original: AlphabetQuizSession, answer: string, submissionId: string, now?: string): AlphabetQuizSession {
  if (!submissionId.trim()) throw new Error("An answer requires a submission ID.");
  if (original.attempts.some(attempt => attempt.id === submissionId)) return original;
  if (!normalizeAnswer(answer)) throw new Error("Enter a pronunciation before submitting.");
  if (original.schedulerVersion !== QUIZ_SCHEDULER_VERSION) throw new Error("Unsupported alphabet quiz scheduler version.");
  if (original.status !== "active" || !original.currentQuestion) throw new Error("This alphabet quiz is not active.");
  const session = structuredClone(original);
  const question = session.currentQuestion!;
  const correct = question.acceptedAnswers.includes(normalizeAnswer(answer));
  const answeredAt = now ?? new Date().toISOString();
  session.attempts.push({ id: submissionId, questionId: question.id, itemId: question.itemId,
    position: question.position, kind: question.kind, answer, correct, answeredAt });
  if (!session.testedItemIds.includes(question.itemId)) session.testedItemIds.push(question.itemId);
  session.reservations = session.reservations.filter(item => item.itemId !== question.itemId);
  if (!correct) {
    const [min, max] = session.configuration.retryRange;
    const candidates: number[] = [];
    for (let interval = min; interval <= max; interval += 1) {
      const position = question.position + interval + 1;
      if (!session.reservations.some(reservation => reservation.position === position)) candidates.push(position);
    }
    if (!candidates.length) throw new Error("No free retry position in the required interval.");
    const position = candidates[Math.floor(quizRandom(session) * candidates.length)];
    session.reservations.push({ itemId: question.itemId, position, interval: position - question.position - 1 });
    session.retryCompletedItemIds = session.retryCompletedItemIds.filter(id => id !== question.itemId);
  } else if (question.kind === "retry" && !session.retryCompletedItemIds.includes(question.itemId)) {
    session.retryCompletedItemIds.push(question.itemId);
  }
  session.version += 1;
  session.updatedAt = answeredAt;
  scheduleNextQuestion(session);
  return session;
}
