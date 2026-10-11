import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AppRepositories } from "./contracts";
import { VersionConflictError } from "./contracts";
import type { ActivityRecord, GrammarProgress, LanguageCode, QuizSession, Reading, ReadingAnnotation, ReadingVersion, TranslationCacheEntry, UserProfile, VocabularyEntry, VocabularyList, WordProgress } from "@/domain/models";
import { createQuizSession, answerQuiz } from "@/domain/quiz";
import { captureDueReview } from "@/domain/review";
import { learningDate } from "@/domain/dates";
import { ReadingLookupService } from "@/domain/reading";
import { DeepLTranslationProvider } from "@/services/deepl";
import { privilegedSupabase } from "@/lib/supabase/server";

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
  const entries = (language: LanguageCode) => rpc<VocabularyEntry[]>("nl_vocabulary_entries", { p_language: language });
  const words = (language: LanguageCode) => rpc<WordProgress[]>("nl_progress_words", { p_language: language });
  async function commit(previous: QuizSession, next: QuizSession, submissionId?: string) {
    const result = await rpc<{ conflict: boolean; session: QuizSession }>("nl_commit_quiz", { p_user_id: user.id, p_session_id: previous.id, p_expected_version: previous.version, p_state: next, p_submission_id: submissionId ?? null }, true);
    if (result.conflict) throw new VersionConflictError(result.session);
    return result.session;
  }
  const repos: AppRepositories = {
    auth: { getSession: profile },
    settings: { getProfile: profile, update: async input => {
      try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }); } catch { throw new Error("Enter a valid IANA timezone, such as America/Tijuana."); }
      if (!input.displayName.trim()) throw new Error("Your display name is required.");
      const { error } = await client.from("profiles").update({ display_name: input.displayName.trim(), timezone: input.timezone }).eq("user_id", user.id); failure(error); return profile();
    } },
    vocabulary: {
      getLists: language => rows<VocabularyList>("vocabulary_lists", language),
      createList: async (language, name) => { const { data, error } = await client.from("vocabulary_lists").insert({ user_id: user.id, language, name: name.trim() }).select().single(); failure(error); return camelRow<VocabularyList>(data as Row); },
      renameList: async (id, name) => { const { data, error } = await client.from("vocabulary_lists").update({ name: name.trim() }).eq("id", id).select().single(); failure(error); return camelRow<VocabularyList>(data as Row); },
      deleteList: async id => { const { error } = await client.from("vocabulary_lists").delete().eq("id", id); failure(error); },
      getEntries: entries,
      saveEntry: (input, id) => rpc("nl_save_vocabulary", { p_entry: input, p_entry_id: id ?? null }),
      deleteEntries: async ids => { const { error } = await client.from("vocabulary_entries").delete().in("id", ids); failure(error); },
      importEntries: inputs => rpc("nl_import_vocabulary", { p_entries: inputs }),
    },
    quiz: {
      getSessions: async language => { const result: QuizSession[] = []; for (let offset = 0; ; offset += 1000) { const { data, error } = await client.from("quiz_sessions").select("state").eq("language", language).order("updated_at", { ascending: false }).order("id").range(offset, offset + 999); failure(error); result.push(...(data ?? []).map(row => row.state as QuizSession)); if ((data ?? []).length < 1000) return result; } },
      getSession: session,
      create: async input => {
        const selected = [...new Set(input.wordIds)];
        const vocabulary = await entries(input.language);
        const frozen = selected.map(id => { const entry = vocabulary.find(row => row.id === id); if (!entry) throw new Error("A selected word is unavailable in this language."); return entry; });
        const day = learningDate(new Date(), (await profile()).timezone);
        const state = createQuizSession({ id: crypto.randomUUID(), userId: user.id, language: input.language, entries: frozen, type: input.type, randomSeed: input.randomSeed ?? crypto.getRandomValues(new Uint32Array(1))[0], learningDate: day, dueWordIds: (await words(input.language)).filter(word => selected.includes(word.wordId) && word.dueDate <= day).map(word => word.wordId) });
        return rpc("nl_create_quiz", { p_user_id: user.id, p_state: state }, true);
      },
      answer: async (id, input) => {
        const previous = await session(id);
        if (previous.attempts.some(attempt => attempt.id === input.submissionId)) return previous;
        if (previous.version !== input.version) throw new VersionConflictError(previous);
        const day = learningDate(new Date(), (await profile()).timezone);
        const next = answerQuiz(captureDueReview(previous, await words(previous.language), day), input.answer, input.submissionId);
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
      getCache: () => rows<TranslationCacheEntry>("translation_cache"),
      lookup: async request => {
        const { data, error } = await client.from("readings").select("*").eq("id", request.readingId).single(); failure(error); if (!data) throw new Error("This reading is unavailable.");
        const reading = camelRow<Reading>(data as Row);
        const [vocabulary, annotations, cache] = await Promise.all([entries(reading.language), repos.reading.getAnnotations(reading.id), repos.reading.getCache()]);
        return lookupService.lookup({ userId: user.id, reading, request, entries: vocabulary, annotations, cache, storeCache: async entry => {
          const latest = await client.from("readings").select("version").eq("id", reading.id).single(); failure(latest.error); if (latest.data?.version !== request.bodyVersion) throw new Error("The reading changed during lookup. Select the text again.");
          const { error: cacheError } = await privilegedSupabase().from("translation_cache").upsert({ id: entry.id, user_id: user.id, language: entry.language, text: entry.text, context: entry.context, translation: entry.translation, source: "deepl" }, { onConflict: "user_id,language,cache_key", ignoreDuplicates: true }); failure(cacheError);
        } });
      },
    },
    grammar: { getPoints: language => rpc("nl_grammar_points", { p_language: language }), getProgress: language => rows<GrammarProgress>("grammar_progress", language), submit: (pointId, answers) => rpc("nl_submit_grammar", { p_point_id: pointId, p_answers: answers }) },
    progress: { getWords: words, getActivity: async language => (await rows<ActivityRecord & { learningDate: string }>("learning_activity", language)).map(row => ({ ...row, date: row.learningDate })) },
    subscribe: () => () => undefined, getRevision: () => 0, getStorageStatus: () => "Cloud sync · Supabase",
  };
  return repos;
}
