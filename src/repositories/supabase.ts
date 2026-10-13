import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AppRepositories } from "./contracts";
import { AlphabetQuizVersionConflictError, VersionConflictError } from "./contracts";
import type { ActivityRecord, AlphabetQuizSession, GrammarPoint, GrammarProgress, LanguageCode, QuizSession, Reading, ReadingAnnotation, ReadingVersion, TranslationCacheEntry, UserProfile, VocabularyEntry, VocabularyList, WordProgress } from "@/domain/models";
import { createQuizSession, answerQuiz } from "@/domain/quiz";
import { createAlphabetQuizSession, answerAlphabetQuiz } from "@/domain/alphabet-quiz";
import { resolveVocabularyTranslations } from "@/services/vocabulary-translation";
import { captureDueReview } from "@/domain/review";
import { learningDate } from "@/domain/dates";
import { ReadingLookupService } from "@/domain/reading";
import { DeepLTranslationProvider } from "@/services/deepl";
import { privilegedSupabase } from "@/lib/supabase/server";
import { DEFAULT_QUIZ_PREFERENCES } from "@/domain/quiz-preferences";
import { suggestWordPairs } from "@/domain/word-pairs";
import type { QuizPreferences, WordPair } from "@/domain/models";
import koreanGrammar from "../../content/grammar/generated/ko.json";

const koreanLessonOrder = new Map(koreanGrammar.map((point, index) => [point.id, index]));
const translationProvider = new DeepLTranslationProvider({ key: process.env.DEEPL_API_KEY, baseUrl: process.env.DEEPL_API_BASE_URL });
const lookupService = new ReadingLookupService(translationProvider);
export { translationProvider };
type Row = Record<string, unknown>;
function camelRow<T>(input: Row): T {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value])) as T;
}
function failure(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "")) throw new Error("The cloud database is awaiting the NingLingo migrations. Your data has not been changed.");
  if (["42501", "PGRST301"].includes(error.code ?? "")) throw new Error("This operation is not permitted for your account.");
  // Database functions use actionable, credential-free validation messages.
  if (["22023", "23505", "P0001", "40001"].includes(error.code ?? "")) throw new Error(error.message);
  throw new Error("The cloud operation failed. Please try again.");
}
export function createSupabaseRepositories(client: SupabaseClient, user: User): AppRepositories {
  async function rpc<T>(name: string, args: Record<string, unknown> = {}, privileged = false): Promise<T> {
    const { data, error } = await (privileged ? privilegedSupabase() : client).rpc(name, args);
    failure(error); return data as T;
  }
  async function rows<T>(table: string, language?: LanguageCode, extra?: { column: string; value: string }): Promise<T[]> {
    const result: T[] = [];
    for (let offset = 0; ; offset += 1000) {
      let query = client.from(table).select("*").range(offset, offset + 999);
      for (const column of table === "grammar_progress" ? ["point_id", "content_version"] : ["id"]) query = query.order(column);
      if (language) query = query.eq("language", language);
      if (extra) query = query.eq(extra.column, extra.value);
      const { data, error } = await query;
      failure(error); result.push(...(data ?? []).map(row => camelRow<T>(row as Row)));
      if ((data ?? []).length < 1000) return result;
    }
  }
  async function profile(): Promise<UserProfile> {
    const result = await rpc<UserProfile | null>("nl_profile");
    if (!result) throw new Error("Your account profile is unavailable. Apply the profile migration or contact the workspace owner.");
    return { ...result, email: user.email ?? result.email };
  }
  async function session(id: string): Promise<QuizSession> {
    const { data, error } = await client.from("quiz_sessions").select("state").eq("id", id).single();
    failure(error); if (!data) throw new Error("This quiz session is unavailable."); return data.state as QuizSession;
  }
  async function alphabetSession(id: string): Promise<AlphabetQuizSession> {
    const { data, error } = await client.from("alphabet_quiz_sessions").select("state").eq("id", id).single();
    failure(error); if (!data) throw new Error("This alphabet quiz session is unavailable."); return data.state as AlphabetQuizSession;
  }
  async function commitAlphabet(previous: AlphabetQuizSession, next: AlphabetQuizSession, submissionId?: string) {
    const result = await rpc<{ conflict: boolean; session: AlphabetQuizSession }>("nl_commit_alphabet_quiz", { p_user_id: user.id, p_session_id: previous.id, p_expected_version: previous.version, p_state: next, p_submission_id: submissionId ?? null }, true);
    if (result.conflict) throw new AlphabetQuizVersionConflictError(result.session);
    return result.session;
  }
  async function storeTranslation(entry: TranslationCacheEntry) {
    const { error } = await privilegedSupabase().from("translation_cache").upsert({ id: entry.id, user_id: user.id, language: entry.language, lookup_kind: entry.lookupKind ?? "reading", target_language: "EN", text: entry.text, context: entry.context, translation: entry.translation, source: "deepl" }, { onConflict: "user_id,language,lookup_kind,cache_key", ignoreDuplicates: true });
    failure(error);
  }
  const entries = (language: LanguageCode) => rpc<VocabularyEntry[]>("nl_vocabulary_entries", { p_language: language });
  const words = (language: LanguageCode) => rpc<WordProgress[]>("nl_progress_words", { p_language: language });
  const preferences = async () => await rpc<QuizPreferences | null>("nl_quiz_preferences") ?? { ...DEFAULT_QUIZ_PREFERENCES };
  const pairs = async () => await rpc<WordPair[] | null>("nl_word_pairs") ?? [];
  async function commit(previous: QuizSession, next: QuizSession, submissionId?: string) {
    const result = await rpc<{ conflict: boolean; session: QuizSession }>("nl_commit_quiz", { p_user_id: user.id, p_session_id: previous.id, p_expected_version: previous.version, p_state: next, p_submission_id: submissionId ?? null }, true);
    if (result.conflict) throw new VersionConflictError(result.session);
    return result.session;
  }
  const repos: AppRepositories = {
    auth: { getSession: profile },
    settings: { getProfile: profile, getQuizPreferences: preferences, updateQuizPreferences: input => rpc("nl_update_quiz_preferences", { p_preferences: input }), update: async input => {
      try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }); } catch { throw new Error("Enter a valid IANA timezone, such as America/Tijuana."); }
      if (!input.displayName.trim()) throw new Error("Your display name is required.");
      const { error } = await client.from("profiles").update({ display_name: input.displayName.trim(), timezone: input.timezone }).eq("user_id", user.id); failure(error); return profile();
    } },
    care: { getStates: language => rpc("nl_word_care", { p_language: language ?? null }), setManual: (wordId, action) => rpc("nl_set_word_care", { p_word_id: wordId, p_action: action }) },
    wordPairs: {
      getPairs: pairs,
      suggest: async input => { const vocabulary = (await Promise.all((["ja", "es", "el", "ko"] as const).map(entries))).flat(); const selected = input?.wordIds ? input.wordIds.map(id => { const entry = vocabulary.find(entry => entry.id === id); if (!entry) throw new Error("A selected word is unavailable in your workspace."); return entry; }) : vocabulary; const suggestions = suggestWordPairs(selected, await pairs()); return rpc("nl_suggest_word_pairs", { p_pairs: suggestions }); },
      save: input => rpc("nl_save_word_pair", { p_source_word_id: input.sourceWordId, p_target_word_id: input.targetWordId, p_pair_id: input.id ?? null }),
      remove: id => rpc("nl_delete_word_pair", { p_pair_id: id }),
    },
    vocabulary: {
      getLists: language => rows<VocabularyList>("vocabulary_lists", language),
      createList: async (language, name) => { const { data, error } = await client.from("vocabulary_lists").insert({ user_id: user.id, language, name: name.trim() }).select().single(); failure(error); return camelRow<VocabularyList>(data as Row); },
      renameList: async (id, name) => { const { data, error } = await client.from("vocabulary_lists").update({ name: name.trim() }).eq("id", id).select().single(); failure(error); return camelRow<VocabularyList>(data as Row); },
      deleteList: async id => { const { error } = await client.from("vocabulary_lists").delete().eq("id", id); failure(error); },
      getEntries: entries,
      saveEntry: (input, id) => rpc("nl_save_vocabulary", { p_entry: input, p_entry_id: id ?? null }),
      deleteEntries: async ids => { const { error } = await client.from("vocabulary_entries").delete().in("id", ids); failure(error); },
      importEntries: inputs => rpc("nl_import_vocabulary", { p_entries: inputs }),
      resolveTranslations: async input => resolveVocabularyTranslations({ ...input, userId: user.id, cache: await rows<TranslationCacheEntry>("translation_cache", input.language, { column: "lookup_kind", value: "vocabulary" }), provider: translationProvider, storeCache: storeTranslation }),
    },
    alphabetQuiz: {
      getSessions: async language => { const result: AlphabetQuizSession[] = []; for (let offset = 0; ; offset += 1000) { const { data, error } = await client.from("alphabet_quiz_sessions").select("state").eq("language", language).order("updated_at", { ascending: false }).order("id").range(offset, offset + 999); failure(error); result.push(...(data ?? []).map(row => row.state as AlphabetQuizSession)); if ((data ?? []).length < 1000) return result; } },
      getSession: alphabetSession,
      create: async input => {
        const state = createAlphabetQuizSession({ ...input, id: crypto.randomUUID(), userId: user.id, randomSeed: input.randomSeed ?? crypto.getRandomValues(new Uint32Array(1))[0], learningDate: learningDate(new Date(), (await profile()).timezone) });
        return rpc("nl_create_alphabet_quiz", { p_user_id: user.id, p_state: state }, true);
      },
      answer: async (id, input) => { const previous = await alphabetSession(id); if (previous.attempts.some(attempt => attempt.id === input.submissionId)) return previous; if (previous.version !== input.version) throw new AlphabetQuizVersionConflictError(previous); return commitAlphabet(previous, answerAlphabetQuiz(previous, input.answer, input.submissionId), input.submissionId); },
      saveAndExit: async (id, version) => { const previous = await alphabetSession(id); if (previous.version !== version) throw new AlphabetQuizVersionConflictError(previous); if (previous.status !== "active") throw new Error("Only an active alphabet quiz can be saved."); return commitAlphabet(previous, { ...previous, status: "saved", version: version + 1, updatedAt: new Date().toISOString() }); },
      resume: async (id, version) => { const previous = await alphabetSession(id); if (previous.version !== version) throw new AlphabetQuizVersionConflictError(previous); if (!["active", "saved"].includes(previous.status)) throw new Error("This alphabet quiz has already ended."); return commitAlphabet(previous, { ...previous, status: "active", version: version + 1, updatedAt: new Date().toISOString() }); },
      end: async (id, version) => { const previous = await alphabetSession(id); if (previous.version !== version) throw new AlphabetQuizVersionConflictError(previous); if (!["active", "saved"].includes(previous.status)) return previous; return commitAlphabet(previous, { ...previous, status: "ended", currentQuestion: null, version: version + 1, updatedAt: new Date().toISOString() }); },
    },
    quiz: {
      getSessions: async language => { const result: QuizSession[] = []; for (let offset = 0; ; offset += 1000) { const { data, error } = await client.from("quiz_sessions").select("state").or(`language.eq.${language},participating_languages.cs.{${language}}`).order("updated_at", { ascending: false }).order("id").range(offset, offset + 999); failure(error); result.push(...(data ?? []).map(row => row.state as QuizSession)); if ((data ?? []).length < 1000) return result; } },
      getSession: session,
      create: async input => {
        const selected = [...new Set(input.wordIds)];
        const enabledLanguages = [...new Set(input.languages ?? [input.language])];
        const vocabulary = (await Promise.all(enabledLanguages.map(entries))).flat();
        const frozen = selected.map(id => { const entry = vocabulary.find(row => row.id === id); if (!entry) throw new Error("A selected word is unavailable in this language."); return entry; });
        const day = learningDate(new Date(), (await profile()).timezone);
        const state = createQuizSession({ ...input, id: crypto.randomUUID(), userId: user.id, entries: frozen, presentation: input.presentation ?? (await preferences()).presentation, pairs: (input.types ?? [input.type]).some(type => type.startsWith("translation-")) ? await pairs() : [], randomSeed: input.randomSeed ?? crypto.getRandomValues(new Uint32Array(1))[0], learningDate: day, dueWordIds: (await Promise.all(enabledLanguages.map(words))).flat().filter(word => selected.includes(word.wordId) && word.dueDate <= day).map(word => word.wordId) });
        return rpc("nl_create_quiz", { p_user_id: user.id, p_state: state }, true);
      },
      answer: async (id, input) => {
        const previous = await session(id);
        if (previous.attempts.some(attempt => attempt.id === input.submissionId)) return previous;
        if (previous.version !== input.version) throw new VersionConflictError(previous);
        const day = learningDate(new Date(), (await profile()).timezone);
        const next = answerQuiz(captureDueReview(previous, (await Promise.all((previous.languages ?? [previous.language]).map(words))).flat(), day), input.answer, input.submissionId);
        return commit(previous, next, input.submissionId);
      },
      saveAndExit: async (id, version) => { const previous = await session(id); if (previous.version !== version) throw new VersionConflictError(previous); if (previous.status !== "active") throw new Error("Only an active quiz can be saved."); return commit(previous, { ...previous, status: "saved", version: version + 1, updatedAt: new Date().toISOString() }); },
      resume: async id => { const previous = await session(id); if (!["active", "saved"].includes(previous.status)) throw new Error("This quiz has already ended."); return commit(previous, { ...previous, status: "active", version: previous.version + 1, updatedAt: new Date().toISOString() }); },
      end: async (id, version) => { const previous = await session(id); if (previous.version !== version) throw new VersionConflictError(previous); if (!["active", "saved"].includes(previous.status)) return previous; return commit(previous, { ...previous, status: "ended", currentQuestion: null, version: version + 1, updatedAt: new Date().toISOString() }); },
    },
    reading: {
      getTranslationUsage: () => translationProvider.usage(),
      getReadings: language => rows<Reading>("readings", language),
      save: (input, id, clearAnnotations, expectedBodyVersion) => rpc("nl_save_reading", { p_input: input, p_id: id ?? null, p_clear_annotations: clearAnnotations ?? false, p_expected_version: expectedBodyVersion ?? null }),
      delete: async id => { const { error } = await client.from("readings").delete().eq("id", id); failure(error); },
      getVersions: id => rows<ReadingVersion>("reading_versions", undefined, { column: "reading_id", value: id }),
      getAnnotations: async id => { const result = await rows<ReadingAnnotation & { startOffset: number; endOffset: number }>("reading_annotations", undefined, { column: "reading_id", value: id }); return result.map(row => ({ ...row, start: row.startOffset, end: row.endOffset })); },
      annotate: input => rpc("nl_annotate_reading", { p_input: input }),
      getCache: () => rows<TranslationCacheEntry>("translation_cache", undefined, { column: "lookup_kind", value: "reading" }),
      lookup: async request => {
        const { data, error } = await client.from("readings").select("*").eq("id", request.readingId).single(); failure(error); if (!data) throw new Error("This reading is unavailable.");
        const reading = camelRow<Reading>(data as Row);
        const [vocabulary, annotations, cache] = await Promise.all([entries(reading.language), repos.reading.getAnnotations(reading.id), repos.reading.getCache()]);
        return lookupService.lookup({ userId: user.id, reading, request, entries: vocabulary, annotations, cache, storeCache: async entry => {
          const latest = await client.from("readings").select("version").eq("id", reading.id).single(); failure(latest.error); if (latest.data?.version !== request.bodyVersion) throw new Error("The reading changed during lookup. Select the text again.");
          await storeTranslation({ ...entry, lookupKind: "reading" });
        } });
      },
    },
    grammar: { getPoints: async language => {
      const points = await rpc<GrammarPoint[]>("nl_grammar_points", { p_language: language });
      // The existing RPC orders by ID. Keep the authored Korean syllabus order
      // while retaining live content, hidden-lesson filtering and future IDs.
      return language === "ko" ? [...points].sort((left, right) => (koreanLessonOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (koreanLessonOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)) : points;
    }, getProgress: language => rows<GrammarProgress>("grammar_progress", language), submit: (pointId, answers) => rpc("nl_submit_grammar", { p_point_id: pointId, p_answers: answers }) },
    progress: { getWords: words, getActivity: async language => (await rows<ActivityRecord & { learningDate: string }>("learning_activity", language)).map(row => ({ ...row, date: row.learningDate })) },
    subscribe: () => () => undefined, getRevision: () => 0, getStorageStatus: () => "Cloud sync · Supabase",
  };
  return repos;
}
