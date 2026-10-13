import type { ActivityRecord, AlphabetQuizSession, GrammarPoint, GrammarProgress, LanguageCode, LookupRequest, LookupResult, QuizSession, QuizType, Reading, ReadingAnnotation, ReadingVersion, TranslationCacheEntry, UserProfile, VocabularyEntry, VocabularyInput, VocabularyList, VocabularyTranslationRequest, VocabularyTranslationResult, WordProgress } from "@/domain/models";
import type { QuizPreferences, QuizPresentation, WordCareState, TranslationDirection, WordPair } from "@/domain/models";

export interface AuthRepository { getSession(): Promise<UserProfile | null> }
export interface VocabularyRepository {
  getLists(language: LanguageCode): Promise<VocabularyList[]>;
  createList(language: LanguageCode, name: string): Promise<VocabularyList>;
  renameList(id: string, name: string): Promise<VocabularyList>;
  deleteList(id: string): Promise<void>;
  getEntries(language: LanguageCode): Promise<VocabularyEntry[]>;
  saveEntry(input: VocabularyInput, id?: string): Promise<VocabularyEntry>;
  deleteEntries(ids: string[]): Promise<void>;
  importEntries(inputs: VocabularyInput[]): Promise<{ imported: number; duplicates: number }>;
  resolveTranslations(input: VocabularyTranslationRequest): Promise<VocabularyTranslationResult[]>;
}
export interface AlphabetQuizRepository {
  getSessions(language: LanguageCode): Promise<AlphabetQuizSession[]>;
  getSession(id: string): Promise<AlphabetQuizSession>;
  create(input: { language: LanguageCode; itemIds: string[]; randomSeed?: number; mode?: "typing" | "mcq"; direction?: "character-to-pronunciation" | "pronunciation-to-character" | "mixed" }): Promise<AlphabetQuizSession>;
  answer(id: string, input: { answer: string; version: number; submissionId: string }): Promise<AlphabetQuizSession>;
  saveAndExit(id: string, version: number): Promise<AlphabetQuizSession>;
  resume(id: string, version: number): Promise<AlphabetQuizSession>;
  end(id: string, version: number): Promise<AlphabetQuizSession>;
}
export interface QuizRepository {
  getSessions(language: LanguageCode): Promise<QuizSession[]>;
  getSession(id: string): Promise<QuizSession>;
  create(input: { language: LanguageCode; wordIds: string[]; type: QuizType; randomSeed?: number; languages?: LanguageCode[]; types?: QuizType[]; directions?: TranslationDirection[]; listeningLanguages?: LanguageCode[]; presentation?: QuizPresentation }): Promise<QuizSession>;
  answer(id: string, input: { answer: string; version: number; submissionId: string }): Promise<QuizSession>;
  saveAndExit(id: string, version: number): Promise<QuizSession>;
  resume(id: string): Promise<QuizSession>;
  end(id: string, version: number): Promise<QuizSession>;
}
export interface ReadingRepository {
  getTranslationUsage?(): Promise<import("@/domain/models").TranslationUsage>;
  getReadings(language: LanguageCode): Promise<Reading[]>;
  save(input: { language: LanguageCode; title: string; body: string; status: Reading["status"] }, id?: string, clearAnnotations?: boolean, expectedBodyVersion?: number): Promise<Reading>;
  delete(id: string): Promise<void>;
  getVersions(id: string): Promise<ReadingVersion[]>;
  getAnnotations(id: string): Promise<ReadingAnnotation[]>;
  annotate(input: Omit<ReadingAnnotation, "id" | "userId" | "createdAt">): Promise<ReadingAnnotation>;
  lookup(input: LookupRequest): Promise<LookupResult>;
  getCache(): Promise<TranslationCacheEntry[]>;
}
export interface GrammarRepository { getPoints(language: LanguageCode): Promise<GrammarPoint[]>; getProgress(language: LanguageCode): Promise<GrammarProgress[]>; submit(pointId: string, answers: number[]): Promise<GrammarProgress> }
export interface ProgressRepository { getWords(language: LanguageCode): Promise<WordProgress[]>; getActivity(language?: LanguageCode): Promise<ActivityRecord[]> }
export interface SettingsRepository { getProfile(): Promise<UserProfile>; update(input: { timezone: string; displayName: string }): Promise<UserProfile>; getQuizPreferences(): Promise<QuizPreferences>; updateQuizPreferences(input: Partial<QuizPreferences>): Promise<QuizPreferences> }
export interface WordCareRepository { getStates(language?: LanguageCode): Promise<WordCareState[]>; setManual(wordId: string, action: "add" | "remove"): Promise<WordCareState> }
export interface WordPairRepository { getPairs(): Promise<WordPair[]>; suggest(input?: { wordIds?: string[] }): Promise<WordPair[]>; save(input: { sourceWordId: string; targetWordId: string; id?: string }): Promise<WordPair>; remove(id: string): Promise<void> }
export interface AppRepositories { auth: AuthRepository; vocabulary: VocabularyRepository; quiz: QuizRepository; alphabetQuiz: AlphabetQuizRepository; reading: ReadingRepository; grammar: GrammarRepository; progress: ProgressRepository; settings: SettingsRepository; care: WordCareRepository; wordPairs: WordPairRepository; subscribe(listener: () => void): () => void; getRevision(): number; getStorageStatus(): string }
export class VersionConflictError extends Error { constructor(public readonly latest: QuizSession) { super("This session changed in another tab. The latest version has been loaded."); this.name = "VersionConflictError"; } }
export class AlphabetQuizVersionConflictError extends Error { constructor(public readonly latest: AlphabetQuizSession) { super("This alphabet session changed in another tab. The latest version has been loaded."); this.name = "AlphabetQuizVersionConflictError"; } }
