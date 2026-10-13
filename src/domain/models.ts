export type LanguageCode = "ja" | "es" | "el" | "ko";
export type SpeechLanguage = LanguageCode | "en";
export type QuizPresentation = "always" | "incorrect" | "never";
export interface QuizPreferences { presentation: QuizPresentation; vocabularyAutoAudio: boolean; alphabetAutoAudio: boolean }
export interface WordCareState { wordId: string; userId: string; manualCare: boolean; automaticSuppressed: boolean; updatedAt: string }
export interface TranslationDirection { source: LanguageCode; target: LanguageCode }
export interface WordPair { id: string; userId: string; sourceWordId: string; targetWordId: string; status: "suggested" | "confirmed" | "deleted"; confidence: number; warning: string | null }
export type ISODate = string;
export interface UserProfile { id: string; email: string; displayName: string; timezone: string; createdAt: string }
export interface VocabularyList { id: string; userId: string; language: LanguageCode; name: string; createdAt: string }
export interface AcceptedAnswer { id: string; text: string }
export interface VocabularyExample { id: string; text: string; reading: string; translation: string }
export const RELATION_TYPES = ["derived", "compound", "synonym", "antonym", "word_form", "related"] as const;
export type RelationType = typeof RELATION_TYPES[number];
export interface RelatedWord { id: string; word: string; reading: string; translation: string; relationType: RelationType }
export interface VocabularyEntry { id: string; userId: string; language: LanguageCode; listId: string; word: string; reading: string; translation: string; type: string; category: string; example: string; examples?: VocabularyExample[]; relatedWords?: RelatedWord[]; notes: string; acceptedAnswers: AcceptedAnswer[]; createdAt: string; updatedAt: string }
export type VocabularyInput = Omit<VocabularyEntry, "id" | "userId" | "createdAt" | "updatedAt">;
export const REVIEW_DAYS = [1, 3, 7, 14, 30, 60, 120] as const;
export type ReviewStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface WordProgress { wordId: string; userId: string; language: LanguageCode; stage: ReviewStage; dueDate: ISODate; lastAdvancedDate: ISODate | null; lastStudiedDate: ISODate | null; firstAttempts: number; firstCorrect: number; errors: number; settledSessionIds: string[] }
export type QuizType = "word-meaning" | "meaning-word" | "typing" | "japanese-reading" | "spelling" | "listening" | "translation-mcq" | "translation-typing";
export interface QuizChoice { id: string; text: string; audioText: string }
export interface QuizQuestion { id: string; position: number; wordId: string; kind: "initial" | "retry" | "filler"; prompt: string; choices: QuizChoice[]; correctChoiceId: string | null; acceptedAnswers: string[]; type?: QuizType; inputMode?: "choice" | "text"; sourceLanguage?: SpeechLanguage; targetLanguage?: SpeechLanguage; audioText?: string; audioLanguage?: SpeechLanguage; contextWordId?: string; direction?: string }
export interface QuizAttempt { id: string; questionId: string; wordId: string; position: number; kind: QuizQuestion["kind"]; answer: string; correct: boolean; answeredAt: string }
export interface RetryReservation { wordId: string; position: number; interval: number }
export interface QuizSession { id: string; userId: string; language: LanguageCode; type: QuizType; entries: VocabularyEntry[]; questionTemplates: QuizQuestion[]; questions: QuizQuestion[]; attempts: QuizAttempt[]; reservations: RetryReservation[]; testedWordIds: string[]; retryCompletedWordIds: string[]; currentQuestion: QuizQuestion | null; status: "active" | "saved" | "completed" | "ended"; randomSeed: number; randomState: number; schedulerVersion: number; version: number; createdAt: string; updatedAt: string; learningDate: ISODate; dueWordIds: string[]; settled: boolean; configuration: { minChoices: number; maxChoices: number; retryRange: [number, number] }; languages?: LanguageCode[]; enabledTypes?: QuizType[]; directions?: TranslationDirection[]; presentation?: QuizPresentation }
export interface Reading { id: string; userId: string; language: LanguageCode; title: string; body: string; version: number; status: "unread" | "reading" | "finished"; createdAt: string; updatedAt: string }
export interface ReadingVersion { id: string; readingId: string; version: number; body: string; createdAt: string }
export interface ReadingAnnotation { id: string; userId: string; readingId: string; bodyVersion: number; start: number; end: number; text: string; translation: string; reading: string; vocabularyEntryId: string | null; createdAt: string }
export interface TranslationCacheEntry { id: string; userId: string; language: LanguageCode; text: string; context: string; translation: string; source: "mock" | "deepl"; createdAt: string; lookupKind?: "reading" | "vocabulary" }
export interface VocabularyTranslationRequest { language: LanguageCode; rows: { line: number; word: string }[] }
export interface VocabularyTranslationResult { line: number; word: string; translation: string; source: "cache" | "deepl" | "mock" | null; error: string | null }
export type LookupSource = "annotation" | "vocabulary" | "cache" | "mock" | "deepl";
export interface LookupResult { text: string; translation: string; reading: string; source: LookupSource; vocabularyEntryId: string | null }
export interface LookupRequest { readingId: string; bodyVersion: number; start: number; end: number }
export interface TranslationUsage { used: number; limit: number; available: boolean }
export interface TranslationProvider { translate(input: { userId: string; language: LanguageCode; text: string; context: string }): Promise<{ translation: string; source: "mock" | "deepl" }>; translateMany?(input: { userId: string; language: LanguageCode; texts: string[]; context: string }): Promise<{ translation: string; source: "mock" | "deepl" }[]>; usage(): Promise<{ used: number; limit: number; available: boolean }> }
export interface GrammarSource { title: string; url: string; version: string; license: string; attribution: string }
export interface GrammarExample { id: string; text: string; reading?: string; translation: string }
export interface GrammarExercise { id: string; prompt: string; choices: string[]; correctIndex: number; explanation: string }
export interface GrammarPoint { id: string; language: LanguageCode; title: string; level: string; category: string; explanation: string; formation: string; examples: GrammarExample[]; exercises: GrammarExercise[]; status: "draft" | "reviewed" | "published" | "published-ai"; sources: GrammarSource[]; reviewer: { name: string; date: string } | null; contentVersion: number; modificationNotes: string; developmentSeed: boolean }
export interface GrammarProgress { userId: string; pointId: string; language: LanguageCode; contentVersion: number; correct: number; total: number; completed: boolean; attemptedAt: string }
export interface AlphabetEntry { id: string; language: LanguageCode; group: string; symbol: string; name: string; pronunciation: string; pronunciationAnswers: string[]; example: string; exampleTranslation: string; audioText?: string; exampleReading?: string; notes?: string; audioKind?: "letter-name" | "example-syllable" }
export interface AlphabetQuizItemSnapshot { itemId: string; language: LanguageCode; group: string; symbol: string; name: string; pronunciation: string; pronunciationAnswers: string[]; example: string; exampleTranslation: string; audioText: string; exampleReading: string; notes?: string; audioKind?: "letter-name" | "example-syllable" }
export type AlphabetQuizDirection = "character-to-pronunciation" | "pronunciation-to-character";
export type AlphabetQuizMode = "typing" | "mcq";
export interface AlphabetQuizOption { id: string; text: string; symbol: string; pronunciationAnswers: string[] }
export interface AlphabetQuizQuestion { id: string; position: number; itemId: string; kind: "initial" | "retry" | "filler"; prompt: string; acceptedAnswers: string[]; mode?: AlphabetQuizMode; direction?: AlphabetQuizDirection; options?: AlphabetQuizOption[]; correctOptionId?: string }
export interface AlphabetQuizAttempt { id: string; questionId: string; itemId: string; position: number; kind: AlphabetQuizQuestion["kind"]; answer: string; correct: boolean; answeredAt: string }
export interface AlphabetRetryReservation { itemId: string; position: number; interval: number }
export interface AlphabetQuizSession { id: string; userId: string; language: LanguageCode; contentVersion: number; items: AlphabetQuizItemSnapshot[]; questionTemplates: AlphabetQuizQuestion[]; questions: AlphabetQuizQuestion[]; attempts: AlphabetQuizAttempt[]; reservations: AlphabetRetryReservation[]; testedItemIds: string[]; retryCompletedItemIds: string[]; currentQuestion: AlphabetQuizQuestion | null; status: "active" | "saved" | "completed" | "ended"; randomSeed: number; randomState: number; schedulerVersion: number; version: number; createdAt: string; updatedAt: string; learningDate: ISODate; configuration: { retryRange: [number, number]; mode?: AlphabetQuizMode; direction?: AlphabetQuizDirection | "mixed"; skippedItems?: { itemId: string; direction: AlphabetQuizDirection; reason: string }[] } }
export interface DashboardStats { totalVocabulary: number; firstAttemptAccuracy: number | null; weakWords: VocabularyEntry[]; dueReviews: VocabularyEntry[]; streak: number; grammarCompleted: number; grammarTotal: number; activity: { date: ISODate; count: number }[] }
export interface ActivityRecord { id: string; userId: string; language: LanguageCode; date: ISODate; kind: "quiz" | "alphabet-quiz" | "grammar" | "reading"; count: number }
