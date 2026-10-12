import type { LanguageCode, TranslationCacheEntry, TranslationProvider, VocabularyTranslationResult } from "@/domain/models";

export const MAX_VOCABULARY_TRANSLATION_WORDS = 25;
export const MAX_VOCABULARY_WORD_LENGTH = 2000;
export const normalizedVocabularyWord = (word: string): string => word.trim().normalize("NFC");

interface ResolveInput {
  userId: string;
  language: LanguageCode;
  rows: { line: number; word: string }[];
  provider: TranslationProvider;
  cache: TranslationCacheEntry[];
  storeCache: (entry: TranslationCacheEntry) => Promise<void>;
}

/** Dedicated, context-free English word lookup. Never creates vocabulary or Reading records. */
export async function resolveVocabularyTranslations(input: ResolveInput): Promise<VocabularyTranslationResult[]> {
  const unique = [...new Set(input.rows.map(row => normalizedVocabularyWord(row.word)))];
  if (unique.length > MAX_VOCABULARY_TRANSLATION_WORDS) throw new Error("Resolve at most 25 unique words at a time.");
  const results = new Map<string, Omit<VocabularyTranslationResult, "line" | "word">>();
  const misses: string[] = [];
  for (const word of unique) {
    if (!word || word.length > MAX_VOCABULARY_WORD_LENGTH) {
      results.set(word, { translation: "", source: null, error: "Word must contain between 1 and 2,000 characters." });
      continue;
    }
    const cached = input.cache.find(entry => entry.lookupKind === "vocabulary" && entry.userId === input.userId && entry.language === input.language && entry.context === "" && normalizedVocabularyWord(entry.text) === word && entry.translation.trim());
    if (cached) results.set(word, { translation: cached.translation, source: "cache", error: null });
    else misses.push(word);
  }
  const resolveResult = async (word: string, result: { translation: string; source: "mock" | "deepl" }) => {
    if ("error" in result && typeof result.error === "string" && result.error) throw new Error(result.error);
    const translation = result.translation.trim();
    if (!translation) throw new Error("The translation provider returned no English meaning. Enter one manually or retry.");
    // Empty and failed results are never cached. This key's namespace is independent from Reading.
    await input.storeCache({ id: crypto.randomUUID(), userId: input.userId, language: input.language, lookupKind: "vocabulary", text: word, context: "", translation, source: result.source, createdAt: new Date().toISOString() });
    results.set(word, { translation, source: result.source, error: null });
  };
  const failure = (word: string, error: unknown) => results.set(word, { translation: "", source: null, error: error instanceof Error ? error.message : "Translation failed. Enter an English meaning manually or retry." });
  if (misses.length && input.provider.translateMany) {
    try {
      const translated = await input.provider.translateMany({ userId: input.userId, language: input.language, texts: misses, context: "" });
      await Promise.all(misses.map(async (word, index) => {
        try {
          if (!translated[index]) throw new Error("The translation provider returned no English meaning. Enter one manually or retry.");
          await resolveResult(word, translated[index]);
        } catch (error) { failure(word, error); }
      }));
    } catch (error) { for (const word of misses) failure(word, error); }
  } else {
    await Promise.all(misses.map(async word => {
      try { await resolveResult(word, await input.provider.translate({ userId: input.userId, language: input.language, text: word, context: "" })); }
      catch (error) { failure(word, error); }
    }));
  }
  return input.rows.map(row => ({ line: row.line, word: row.word, ...results.get(normalizedVocabularyWord(row.word))! }));
}
