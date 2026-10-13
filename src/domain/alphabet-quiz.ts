import { alphabetEntries } from "@/data/alphabet";
import type { AlphabetEntry, AlphabetQuizDirection, AlphabetQuizItemSnapshot, AlphabetQuizMode, AlphabetQuizOption, AlphabetQuizQuestion, AlphabetQuizSession, ISODate, LanguageCode } from "./models";
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
  mode?: AlphabetQuizMode;
  direction?: AlphabetQuizDirection | "mixed";
  /** Injectable only at the trusted domain boundary, never accepted by the API. */
  sourceEntries?: AlphabetEntry[];
}

const directions: AlphabetQuizDirection[] = ["character-to-pronunciation", "pronunciation-to-character"];
const normalizedAnswers = (item: Pick<AlphabetEntry, "pronunciationAnswers">) => [...new Set(item.pronunciationAnswers.map(normalizeAnswer).filter(Boolean))];
const overlaps = (left: string[], right: string[]) => left.some(value => right.includes(value));

/** Scoped to one creation/preview: later sessions always see current content. */
function createMcqContext(source: AlphabetEntry[]) {
  const answers = new Map<AlphabetEntry, string[]>();
  const symbols = new Map<AlphabetEntry, string>();
  const languages = new Map<LanguageCode, AlphabetEntry[]>();
  for (const entry of source) {
    answers.set(entry, normalizedAnswers(entry));
    symbols.set(entry, normalizeAnswer(entry.symbol));
    const entries = languages.get(entry.language) ?? [];
    entries.push(entry);
    languages.set(entry.language, entries);
  }
  return { answers, symbols, languages, pools: new Map<string, AlphabetEntry[]>() };
}
type McqContext = ReturnType<typeof createMcqContext>;

/** Equivalence is explicit and direction-specific, never inferred from visual/phonetic similarity. */
function distractors(item: AlphabetEntry, direction: AlphabetQuizDirection, context: McqContext): AlphabetEntry[] {
  const key = `${item.language}:${item.id}:${direction}`;
  const existing = context.pools.get(key);
  if (existing) return existing;
  const answersOf = (entry: AlphabetEntry) => {
    let result = context.answers.get(entry);
    if (!result) { result = normalizedAnswers(entry); context.answers.set(entry, result); }
    return result;
  };
  const symbolOf = (entry: AlphabetEntry) => {
    let result = context.symbols.get(entry);
    if (result === undefined) { result = normalizeAnswer(entry.symbol); context.symbols.set(entry, result); }
    return result;
  };
  const answers = answersOf(item);
  const prompt = answers[0];
  const chosen: AlphabetEntry[] = [];
  const chosenAnswers = new Set<string>();
  const chosenSymbols = new Set<string>();
  const eligible: AlphabetEntry[] = [];
  for (const candidate of context.languages.get(item.language) ?? []) {
    if (candidate.language !== item.language || candidate.id === item.id || !answersOf(candidate).length) continue;
    if (direction === "character-to-pronunciation") {
      const otherAnswers = answersOf(candidate);
      if (overlaps(answers, otherAnswers)) continue;
      eligible.push(candidate);
      if (otherAnswers.some(answer => chosenAnswers.has(answer))) continue;
    } else {
      if (answersOf(candidate).includes(prompt) || symbolOf(candidate) === symbolOf(item)
        || chosenSymbols.has(symbolOf(candidate))) continue;
    }
    chosen.push(candidate);
    for (const answer of answersOf(candidate)) chosenAnswers.add(answer);
    chosenSymbols.add(symbolOf(candidate));
  }
  // Overlapping variant sets are not necessarily transitive. If a greedy merge
  // blocks a viable quartet, try alternate distractors before skipping this direction.
  if (direction === "character-to-pronunciation" && chosen.length < 3) {
    for (let a = 0; a < eligible.length; a++) for (let b = a + 1; b < eligible.length; b++) {
      if (overlaps(answersOf(eligible[a]), answersOf(eligible[b]))) continue;
      for (let c = b + 1; c < eligible.length; c++) {
        if (!overlaps(answersOf(eligible[a]), answersOf(eligible[c])) && !overlaps(answersOf(eligible[b]), answersOf(eligible[c]))) {
          const alternative = [eligible[a], eligible[b], eligible[c]];
          context.pools.set(key, alternative);
          return alternative;
        }
      }
    }
  }
  context.pools.set(key, chosen);
  return chosen;
}

export function alphabetMcqEligibility(item: AlphabetEntry, direction: AlphabetQuizDirection | "mixed", source: AlphabetEntry[] = alphabetEntries) {
  return mcqEligibility(item, direction, createMcqContext(source));
}

export function alphabetMcqEligibilityBatch(items: AlphabetEntry[], direction: AlphabetQuizDirection | "mixed", source: AlphabetEntry[] = alphabetEntries) {
  const context = createMcqContext(source);
  return items.map(item => mcqEligibility(item, direction, context));
}

function mcqEligibility(item: AlphabetEntry, direction: AlphabetQuizDirection | "mixed", context: McqContext) {
  const enabled = direction === "mixed" ? directions : [direction];
  const answers = context.answers.get(item) ?? normalizedAnswers(item);
  context.answers.set(item, answers);
  const feasible = enabled.filter(value => answers.length && distractors(item, value, context).length >= 3);
  return { feasible, skipped: enabled.filter(value => !feasible.includes(value)).map(value => ({ itemId: item.id, direction: value,
    reason: `${item.symbol}: ${value === "character-to-pronunciation" ? "character → pronunciation" : "pronunciation → character"} cannot form four distinct, unambiguous options.` })) };
}

function createMcqTemplate(item: AlphabetQuizItemSnapshot, direction: AlphabetQuizDirection, context: McqContext, state: { randomState: number }): AlphabetQuizQuestion {
  const entry = { ...item, id: item.itemId };
  const candidates = quizShuffle(distractors(entry, direction, context), state).slice(0, 3);
  const option = (candidate: AlphabetEntry): AlphabetQuizOption => ({ id: `option:${candidate.id}`, symbol: candidate.symbol,
    text: direction === "character-to-pronunciation" ? candidate.pronunciationAnswers[0] : candidate.symbol,
    pronunciationAnswers: [...(context.answers.get(candidate) ?? normalizedAnswers(candidate))] });
  const correct = option(entry);
  return { id: `template:${item.itemId}`, position: -1, itemId: item.itemId, kind: "initial", mode: "mcq", direction,
    prompt: direction === "character-to-pronunciation" ? item.symbol : item.pronunciationAnswers[0],
    acceptedAnswers: [correct.id], correctOptionId: correct.id, options: quizShuffle([correct, ...candidates.map(option)], state) };
}

/** Only creation consults live content. Every later operation uses this snapshot. */
export function createAlphabetQuizSession(input: CreateAlphabetQuizSessionInput): AlphabetQuizSession {
  const selected = [...new Set(input.itemIds)];
  if (selected.length === 0) throw new QuizConfigurationError("Select at least one alphabet character.");
  const source = input.sourceEntries ?? alphabetEntries;
  const mode = input.mode ?? "typing";
  const direction = input.direction ?? "character-to-pronunciation";
  if (!["typing", "mcq"].includes(mode) || ![...directions, "mixed"].includes(direction)) throw new QuizConfigurationError("Choose an available alphabet mode and direction.");
  if (mode === "typing" && direction !== "character-to-pronunciation") throw new QuizConfigurationError("Typing practice tests character → pronunciation.");
  const context = mode === "mcq" ? createMcqContext(source) : null;
  const feasibleDirections = new Map<string, AlphabetQuizDirection[]>();
  const skippedItems: NonNullable<AlphabetQuizSession["configuration"]["skippedItems"]> = [];
  const items = selected.map((itemId): AlphabetQuizItemSnapshot => {
    const item = source.find(entry => entry.id === itemId && entry.language === input.language);
    if (!item) throw new QuizConfigurationError("A selected alphabet character is unavailable in this language.");
    if (!item.pronunciationAnswers.length || item.pronunciationAnswers.some(answer => !normalizeAnswer(answer))) {
      throw new QuizConfigurationError("This alphabet character has no valid pronunciation answers.");
    }
    return { itemId, language: item.language, group: item.group, symbol: item.symbol, name: item.name,
      pronunciation: item.pronunciation, pronunciationAnswers: [...item.pronunciationAnswers], example: item.example,
      exampleTranslation: item.exampleTranslation, audioText: item.audioText ?? "", exampleReading: item.exampleReading ?? "",
      ...(item.notes ? { notes: item.notes } : {}), ...(item.audioKind ? { audioKind: item.audioKind } : {}) };
  }).filter(item => {
    if (mode !== "mcq") return true;
    const result = mcqEligibility({ ...item, id: item.itemId }, direction, context!);
    feasibleDirections.set(item.itemId, result.feasible);
    skippedItems.push(...result.skipped);
    return result.feasible.length > 0;
  });
  if (!items.length) throw new QuizConfigurationError(skippedItems.map(item => item.reason).join(" ") || "No selected character has an available question.");
  const state = { randomState: input.randomSeed >>> 0 };
  const frozen = quizShuffle(structuredClone(items), state);
  const now = input.now ?? new Date().toISOString();
  const session: AlphabetQuizSession = {
    id: input.id, userId: input.userId, language: input.language, contentVersion: mode === "mcq" ? 2 : ALPHABET_CONTENT_VERSION,
    items: frozen, questionTemplates: frozen.map(item => mode === "mcq" ? createMcqTemplate(item, (() => {
      const feasible = feasibleDirections.get(item.itemId)!;
      return feasible.length === 1 ? feasible[0] : feasible[Math.floor(quizRandom(state) * feasible.length)];
    })(), context!, state) : ({ id: `template:${item.itemId}`, position: -1,
      itemId: item.itemId, kind: "initial", prompt: item.symbol,
      acceptedAnswers: [...new Set(item.pronunciationAnswers.map(normalizeAnswer))] })),
    questions: [], attempts: [], reservations: [], testedItemIds: [], retryCompletedItemIds: [], currentQuestion: null,
    status: "active", randomSeed: input.randomSeed >>> 0, randomState: state.randomState,
    schedulerVersion: QUIZ_SCHEDULER_VERSION, version: 1, createdAt: now, updatedAt: now,
    learningDate: input.learningDate, configuration: { retryRange: retryIntervalRange(frozen.length),
      ...(mode === "mcq" ? { mode, direction, skippedItems } : {}) },
  };
  session.randomState = state.randomState;
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
  if (question.mode === "mcq" && !question.options?.some(option => option.id === answer)) throw new Error("Select one of the frozen answer options.");
  const correct = question.mode === "mcq" ? answer === question.correctOptionId : question.acceptedAnswers.includes(normalizeAnswer(answer));
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
