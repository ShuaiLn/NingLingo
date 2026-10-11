import type { ActivityRecord, GrammarProgress, QuizSession, Reading, ReadingAnnotation, ReadingVersion, TranslationCacheEntry, UserProfile, VocabularyEntry, VocabularyList, WordProgress } from "@/domain/models";
import { RELATION_TYPES } from "@/domain/models";

export interface LocalDatabase {
  schemaVersion: 1;
  profile: UserProfile;
  lists: VocabularyList[];
  entries: VocabularyEntry[];
  wordProgress: WordProgress[];
  sessions: QuizSession[];
  readings: Reading[];
  readingVersions: ReadingVersion[];
  annotations: ReadingAnnotation[];
  cache: TranslationCacheEntry[];
  grammarProgress: GrammarProgress[];
  activity: ActivityRecord[];
}
export interface StorageAdapter { read(): LocalDatabase | null; write(data: LocalDatabase): void; status(): string }

function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function strings(row: Record<string, unknown>, keys: string[]): boolean { return keys.every(key => typeof row[key] === "string"); }
function integer(value: unknown, min = 0): boolean { return typeof value === "number" && Number.isSafeInteger(value) && value >= min; }
function oneOf(value: unknown, values: readonly string[]): boolean { return typeof value === "string" && values.includes(value); }
function stringArray(value: unknown): boolean { return Array.isArray(value) && value.every(item => typeof item === "string"); }
function rows(value: unknown, validate: (row: Record<string, unknown>) => boolean): boolean { return Array.isArray(value) && value.every(item => { const row = object(item); return row !== null && validate(row); }); }
function language(row: Record<string, unknown>): boolean { return oneOf(row.language, ["ja", "es", "el"]); }
function ownedLanguage(row: Record<string, unknown>): boolean { return language(row) && strings(row, ["userId"]); }
function nullableString(value: unknown): boolean { return value === null || typeof value === "string"; }
function question(row: Record<string, unknown>): boolean {
  return strings(row, ["id", "wordId", "prompt"]) && integer(row.position, -1) && oneOf(row.kind, ["initial", "retry", "filler"]) && nullableString(row.correctChoiceId) && stringArray(row.acceptedAnswers) && rows(row.choices, choice => strings(choice, ["id", "text", "audioText"]));
}
function vocabulary(row: Record<string, unknown>): boolean {
  return ownedLanguage(row) && strings(row, ["id", "listId", "word", "reading", "translation", "type", "category", "example", "notes", "createdAt", "updatedAt"]) && rows(row.acceptedAnswers, answer => strings(answer, ["id", "text"]))
    && (row.examples === undefined || rows(row.examples, example => strings(example, ["id", "text", "reading", "translation"])))
    && (row.relatedWords === undefined || rows(row.relatedWords, related => strings(related, ["id", "word", "reading", "translation"]) && oneOf(related.relationType, RELATION_TYPES)));
}
function session(row: Record<string, unknown>): boolean {
  const configuration = object(row.configuration);
  return ownedLanguage(row) && strings(row, ["id", "createdAt", "updatedAt", "learningDate"])
    && oneOf(row.type, ["word-meaning", "meaning-word", "typing", "japanese-reading"]) && oneOf(row.status, ["active", "saved", "completed", "ended"])
    && rows(row.entries, vocabulary) && rows(row.questionTemplates, question) && rows(row.questions, question)
    && rows(row.attempts, attempt => strings(attempt, ["id", "questionId", "wordId", "answer", "answeredAt"]) && integer(attempt.position) && oneOf(attempt.kind, ["initial", "retry", "filler"]) && typeof attempt.correct === "boolean")
    && rows(row.reservations, reservation => strings(reservation, ["wordId"]) && integer(reservation.position) && integer(reservation.interval))
    && stringArray(row.testedWordIds) && stringArray(row.retryCompletedWordIds) && stringArray(row.dueWordIds)
    && (row.currentQuestion === null || (object(row.currentQuestion) !== null && question(object(row.currentQuestion)!)))
    && integer(row.randomSeed) && integer(row.randomState) && row.schedulerVersion === 1 && integer(row.version, 1) && typeof row.settled === "boolean"
    && configuration !== null && integer(configuration.minChoices, 2) && integer(configuration.maxChoices, 2) && Array.isArray(configuration.retryRange) && configuration.retryRange.length === 2 && configuration.retryRange.every(value => integer(value));
}

/** Reject malformed persisted records before business logic dereferences their fields. */
export function isLocalDatabase(value: unknown): value is LocalDatabase {
  const database = object(value);
  if (!database || database.schemaVersion !== 1) return false;
  const profile = object(database.profile);
  if (!profile || !strings(profile, ["id", "email", "displayName", "timezone", "createdAt"])) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: profile.timezone as string }); } catch { return false; }
  return rows(database.lists, row => ownedLanguage(row) && strings(row, ["id", "name", "createdAt"]))
    && rows(database.entries, vocabulary)
    && rows(database.wordProgress, row => ownedLanguage(row) && strings(row, ["wordId", "dueDate"]) && integer(row.stage) && Number(row.stage) <= 6 && nullableString(row.lastAdvancedDate) && nullableString(row.lastStudiedDate) && integer(row.firstAttempts) && integer(row.firstCorrect) && integer(row.errors) && stringArray(row.settledSessionIds))
    && rows(database.sessions, session)
    && rows(database.readings, row => ownedLanguage(row) && strings(row, ["id", "title", "body", "createdAt", "updatedAt"]) && integer(row.version, 1) && oneOf(row.status, ["unread", "reading", "finished"]))
    && rows(database.readingVersions, row => strings(row, ["id", "readingId", "body", "createdAt"]) && integer(row.version, 1))
    && rows(database.annotations, row => strings(row, ["id", "userId", "readingId", "text", "translation", "reading", "createdAt"]) && integer(row.bodyVersion, 1) && integer(row.start) && integer(row.end, 1) && nullableString(row.vocabularyEntryId))
    && rows(database.cache, row => ownedLanguage(row) && strings(row, ["id", "text", "context", "translation", "createdAt"]) && oneOf(row.source, ["mock", "deepl"]))
    && rows(database.grammarProgress, row => ownedLanguage(row) && strings(row, ["pointId", "attemptedAt"]) && integer(row.contentVersion, 1) && integer(row.correct) && integer(row.total) && typeof row.completed === "boolean")
    && rows(database.activity, row => ownedLanguage(row) && strings(row, ["id", "date"]) && oneOf(row.kind, ["quiz", "grammar", "reading"]) && integer(row.count));
}
export class MemoryStorageAdapter implements StorageAdapter {
  private data: LocalDatabase | null = null;
  read() { return this.data ? structuredClone(this.data) : null; }
  write(data: LocalDatabase) { this.data = structuredClone(data); }
  status() { return "Memory only · data lasts until this page closes"; }
}
export const LOCAL_STORAGE_KEY = "ninglingo:development:v1";
export class BrowserStorageAdapter implements StorageAdapter {
  private message = "Saved on this browser · cloud sync is not connected";
  private fallback: LocalDatabase | null = null;
  private blocked = false;
  read(): LocalDatabase | null {
    if (this.blocked) return this.fallback ? structuredClone(this.fallback) : null;
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return null;
      const data: unknown = JSON.parse(raw);
      if (!isLocalDatabase(data)) throw new Error("Unsupported local data format");
      return data;
    } catch {
      this.blocked = true;
      this.message = "Memory only · browser storage is unavailable or has incompatible data; existing data was preserved";
      return null;
    }
  }
  write(data: LocalDatabase) {
    this.fallback = structuredClone(data);
    if (this.blocked) return;
    try { window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data)); }
    catch { this.blocked = true; this.message = "Memory only · browser storage is full or unavailable"; }
  }
  status() { return this.message; }
}

/** The only persistence boundary. Mutations are serialized and committed as one document. */
export class LocalStore {
  private data: LocalDatabase;
  private revision = 0;
  private readonly listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private adapter: StorageAdapter, seed: LocalDatabase) { const persisted = adapter.read(); this.data = persisted ?? structuredClone(seed); if (!persisted) adapter.write(this.data); }
  snapshot(): LocalDatabase { return structuredClone(this.data); }
  getRevision = () => this.revision;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  status = () => this.adapter.status();
  reload() { const data = this.adapter.read(); if (data) { this.data = data; this.notify(); } }
  private notify() { this.revision++; this.listeners.forEach(listener => listener()); }
  async transaction<T>(mutate: (data: LocalDatabase) => T): Promise<T> {
    const run = async () => {
      const operation = () => {
        const draft = this.adapter.read() ?? structuredClone(this.data);
        const result = mutate(draft);
        this.adapter.write(draft);
        this.data = draft;
        this.notify();
        return structuredClone(result);
      };
      // Web Locks also serialize read/check/write transactions between browser tabs.
      if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(LOCAL_STORAGE_KEY, operation);
      return operation();
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }
}
