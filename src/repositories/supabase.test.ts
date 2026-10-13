import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { QuizSession, VocabularyEntry } from "@/domain/models";
import { createQuizSession } from "@/domain/quiz";
import { createAlphabetQuizSession } from "@/domain/alphabet-quiz";
import { initialWordProgress } from "@/domain/review";
import { AlphabetQuizVersionConflictError, VersionConflictError } from "./contracts";
import koreanGrammar from "../../content/grammar/generated/ko.json";

const mocks = vi.hoisted(() => ({ privileged: { rpc: vi.fn(), from: vi.fn() }, translate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ privilegedSupabase: () => mocks.privileged }));
vi.mock("@/services/deepl", () => ({ DeepLTranslationProvider: class { translate = mocks.translate; usage = vi.fn(); } }));
import { createSupabaseRepositories } from "./supabase";

type DatabaseResult = { data: unknown; error: { code?: string; message: string } | null };
function query(result: DatabaseResult) {
  let bounds: [number, number] | null = null;
  const rangedResult = () => bounds && Array.isArray(result.data) ? { ...result, data: result.data.slice(bounds[0], bounds[1] + 1) } : result;
  const builder = {
    select: vi.fn(() => builder), eq: vi.fn(() => builder), or: vi.fn(() => builder), order: vi.fn(() => builder),
    range: vi.fn((start: number, end: number) => { bounds = [start, end]; return builder; }),
    insert: vi.fn(() => builder), update: vi.fn(() => builder), delete: vi.fn(() => builder), in: vi.fn(() => builder), upsert: vi.fn(() => builder),
    single: vi.fn(async () => result),
    then: <TResult1 = DatabaseResult, TResult2 = never>(fulfilled?: ((value: DatabaseResult) => TResult1 | PromiseLike<TResult1>) | null, rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) => Promise.resolve(rangedResult()).then(fulfilled, rejected),
  };
  return builder;
}
const uid = "11111111-1111-4111-8111-111111111111";
const wordId = "22222222-2222-4222-8222-222222222222";
const readingId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const profile = { id: uid, email: "old@example.invalid", displayName: "Ning", timezone: "America/Tijuana", createdAt: "2026-10-01T00:00:00Z" };
const user = { id: uid, email: "owner@example.invalid" } as User;
function entry(overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  return { id: wordId, userId: uid, language: "es", listId: "55555555-5555-4555-8555-555555555555", word: "café", reading: "", translation: "coffee", type: "noun", category: "food", example: "", notes: "", acceptedAnswers: [{ id: "answer", text: "a coffee" }], createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...overrides };
}
function session(overrides: Partial<QuizSession> = {}) {
  return { ...createQuizSession({ id: sessionId, userId: uid, language: "es", entries: [entry()], type: "typing", randomSeed: 123, learningDate: "2026-10-11", dueWordIds: [wordId], now: "2026-10-11T01:00:00Z" }), ...overrides };
}
function harness(options: { state?: QuizSession; vocabulary?: VocabularyEntry[]; tables?: Record<string, DatabaseResult> } = {}) {
  const tables = new Map<string, ReturnType<typeof query>>();
  const state = options.state ?? session();
  const from = vi.fn((table: string) => {
    const result = options.tables?.[table] ?? (table === "quiz_sessions" ? { data: { state }, error: null } : { data: [], error: null });
    const builder = query(result); tables.set(table, builder); return builder;
  });
  const rpc = vi.fn(async (name: string) => ({ data: name === "nl_profile" ? profile : name === "nl_vocabulary_entries" ? options.vocabulary ?? [entry()] : name === "nl_progress_words" ? [initialWordProgress(entry(), "2026-10-10")] : null, error: null }));
  const client = { rpc, from } as unknown as SupabaseClient;
  return { repos: createSupabaseRepositories(client, user), client, rpc, from, tables };
}
const readingRow = { id: readingId, user_id: uid, language: "es", title: "Coffee", body: "Tomo café.", version: 1, status: "reading", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };
const lookup = { readingId, bodyVersion: 1, start: 5, end: 9 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-12T01:30:00Z"));
  mocks.privileged.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({ data: name === "nl_create_quiz" ? args.p_state : { conflict: false, session: args.p_state }, error: null }));
  mocks.privileged.from.mockReturnValue(query({ data: null, error: null }));
  mocks.translate.mockResolvedValue({ translation: "coffee", source: "deepl" });
});
afterEach(() => { vi.useRealTimers(); });

describe("Supabase production repository boundary", () => {
  it("restores the authored Korean syllabus order without replacing live published content", async () => {
    const h = harness();
    const cloud = [...koreanGrammar].reverse().map(point => ({ ...point, explanation: `Live ${point.id}` }));
    h.rpc.mockResolvedValueOnce({ data: cloud as never, error: null });
    const points = await h.repos.grammar.getPoints("ko");
    expect(points.map(point => point.id)).toEqual(koreanGrammar.map(point => point.id));
    expect(points[0].explanation).toBe(`Live ${koreanGrammar[0].id}`);
    expect(cloud[0].id).toBe(koreanGrammar.at(-1)!.id);
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("nl_grammar_points", { p_language: "ko" });
  });
  it("keeps hidden Korean lessons absent and future IDs stable after known syllabus lessons", async () => {
    const h = harness();
    h.rpc.mockResolvedValueOnce({ data: [] as never, error: null });
    expect(await h.repos.grammar.getPoints("ko")).toEqual([]);
    const future = [{ ...koreanGrammar[0], id: "ko-future-b" }, { ...koreanGrammar[0], id: "ko-future-a" }];
    h.rpc.mockResolvedValueOnce({ data: [future[0], koreanGrammar[1], future[1]] as never, error: null });
    expect((await h.repos.grammar.getPoints("ko")).map(point => point.id)).toEqual([koreanGrammar[1].id, "ko-future-b", "ko-future-a"]);
  });
  it("preserves existing Japanese, Spanish and Greek repository ordering", async () => {
    const h = harness();
    for (const language of ["ja", "es", "el"] as const) {
      const points = [{ ...koreanGrammar[0], id: `${language}-z`, language }, { ...koreanGrammar[0], id: `${language}-a`, language }];
      h.rpc.mockResolvedValueOnce({ data: points as never, error: null });
      expect(await h.repos.grammar.getPoints(language)).toBe(points);
    }
  });
  it("creates Alphabet snapshots exclusively from current static content via a service-only RPC", async () => {
    const h = harness();
    mocks.privileged.rpc.mockImplementationOnce(async (_name: string, args: Record<string, unknown>) => ({ data: args.p_state, error: null }));
    const created = await h.repos.alphabetQuiz.create({ language: "es", itemIds: ["es-letter-1"] });
    expect(created.items[0]).toMatchObject({ itemId: "es-letter-1", symbol: "B b", pronunciationAnswers: ["b"] });
    expect(created.contentVersion).toBe(1);
    expect(mocks.privileged.rpc).toHaveBeenCalledWith("nl_create_alphabet_quiz", { p_user_id: uid, p_state: created });
    expect(h.rpc).not.toHaveBeenCalledWith("nl_create_alphabet_quiz", expect.anything());
  });
  it("grades Alphabet from the saved snapshot, preserves replay, and refuses stale resume", async () => {
    const snapshot = createAlphabetQuizSession({ id: sessionId, userId: uid, language: "es", itemIds: ["es-letter-1"], randomSeed: 5, learningDate: "2026-10-11" });
    snapshot.items[0].pronunciationAnswers = ["frozen", "original"];
    snapshot.questionTemplates[0].acceptedAnswers = ["frozen", "original"];
    snapshot.currentQuestion!.acceptedAnswers = ["frozen", "original"];
    const h = harness({ tables: { alphabet_quiz_sessions: { data: { state: snapshot }, error: null } } });
    const next = await h.repos.alphabetQuiz.answer(sessionId, { answer: "ORIGINAL", version: 1, submissionId: "a" });
    expect(next.attempts[0].correct).toBe(true);
    expect(next.items).toEqual(snapshot.items);
    expect(mocks.privileged.rpc).toHaveBeenCalledWith("nl_commit_alphabet_quiz", expect.objectContaining({ p_expected_version: 1, p_submission_id: "a", p_user_id: uid }));
    await expect(h.repos.alphabetQuiz.resume(sessionId, 99)).rejects.toBeInstanceOf(AlphabetQuizVersionConflictError);
    const replay = harness({ tables: { alphabet_quiz_sessions: { data: { state: next }, error: null } } });
    mocks.privileged.rpc.mockClear();
    expect(await replay.repos.alphabetQuiz.answer(sessionId, { answer: "ignored", version: 1, submissionId: "a" })).toEqual(next);
    expect(mocks.privileged.rpc).not.toHaveBeenCalled();
  });
  it("loads complete Alphabet history past the 1,000-row pagination boundary", async () => {
    const snapshot = createAlphabetQuizSession({ id: sessionId, userId: uid, language: "es", itemIds: ["es-letter-1"], randomSeed: 5, learningDate: "2026-10-11" });
    const data = Array.from({ length: 1002 }, (_, index) => ({ state: { ...snapshot, id: `alphabet-${index}` } }));
    const h = harness({ tables: { alphabet_quiz_sessions: { data, error: null } } });
    expect(await h.repos.alphabetQuiz.getSessions("es")).toHaveLength(1002);
    expect(h.from).toHaveBeenCalledTimes(2);
  });
  it("deduplicates missing vocabulary words and only translates cache misses in the vocabulary namespace", async () => {
    const cache = [{ id: "cache", user_id: uid, language: "ja", lookup_kind: "vocabulary", text: "犬", context: "", translation: "dog", source: "deepl" }];
    const h = harness({ tables: { translation_cache: { data: cache, error: null } } });
    mocks.translate.mockResolvedValueOnce({ translation: "cat", source: "deepl" });
    const rows = ["犬", "犬", "犬", "猫"].map((word, index) => ({ line: index + 2, word }));
    const resolved = await h.repos.vocabulary.resolveTranslations({ language: "ja", rows });
    expect(resolved.map(row => row.translation)).toEqual(["dog", "dog", "dog", "cat"]);
    expect(mocks.translate).toHaveBeenCalledExactlyOnceWith({ userId: uid, language: "ja", text: "猫", context: "" });
    expect(h.tables.get("translation_cache")?.eq).toHaveBeenCalledWith("lookup_kind", "vocabulary");
    expect(mocks.privileged.from).toHaveBeenCalledWith("translation_cache");
  });
  it("uses verified Auth identity rather than a stale profile email", async () => {
    expect(await harness().repos.auth.getSession()).toEqual({ ...profile, email: user.email });
  });
  it("maps SQL list fields and preserves language filtering", async () => {
    const h = harness({ tables: { vocabulary_lists: { data: [{ id: "list", user_id: uid, language: "el", name: "Core", created_at: "now" }], error: null } } });
    expect(await h.repos.vocabulary.getLists("el")).toEqual([{ id: "list", userId: uid, language: "el", name: "Core", createdAt: "now" }]);
    expect(h.tables.get("vocabulary_lists")?.eq).toHaveBeenCalledWith("language", "el");
  });
  it("submits the entire confirmed CSV import through one authenticated transaction", async () => {
    const h = harness(); const inputs = [entry(), entry({ word: "té", translation: "tea" })];
    h.rpc.mockResolvedValueOnce({ data: { imported: 2, duplicates: 0 } as never, error: null });
    await expect(h.repos.vocabulary.importEntries(inputs)).resolves.toEqual({ imported: 2, duplicates: 0 });
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("nl_import_vocabulary", { p_entries: inputs });
    expect(h.from).not.toHaveBeenCalled(); expect(mocks.privileged.rpc).not.toHaveBeenCalled();
  });
  it("keeps vocabulary examples, relationships, and explicit accepted answers intact", async () => {
    const h = harness();
    const input = { ...entry(), examples: [{ id: "example", text: "Tomo café.", reading: "", translation: "I drink coffee." }], relatedWords: [{ id: "derived", word: "cafetería", reading: "", translation: "café", relationType: "derived" as const }] };
    await h.repos.vocabulary.saveEntry(input, wordId);
    expect(h.rpc).toHaveBeenCalledWith("nl_save_vocabulary", { p_entry: input, p_entry_id: wordId });
  });
  it("explains missing cloud schema without falling back to mock writes", async () => {
    const h = harness(); h.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "secret database details" } } as never);
    await expect(h.repos.vocabulary.importEntries([entry()])).rejects.toThrow("awaiting the NingLingo migrations");
    expect(mocks.privileged.rpc).not.toHaveBeenCalled();
  });
  it("hides unexpected database internals in errors", async () => {
    const h = harness(); h.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "private connection information" } } as never);
    await expect(h.repos.vocabulary.getEntries("es")).rejects.toThrow("The cloud operation failed. Please try again.");
  });
  it("rejects invalid timezones before making an update", async () => {
    const h = harness();
    await expect(h.repos.settings.update({ displayName: "Ning", timezone: "Mars/Olympus" })).rejects.toThrow("valid IANA timezone");
    expect(h.from).not.toHaveBeenCalled();
  });
  it("sends only normalized editable profile fields and binds the verified owner", async () => {
    const h = harness(); await h.repos.settings.update({ displayName: "  Ning  ", timezone: "Europe/Athens" });
    expect(h.tables.get("profiles")?.update).toHaveBeenCalledWith({ display_name: "Ning", timezone: "Europe/Athens" });
    expect(h.tables.get("profiles")?.eq).toHaveBeenCalledWith("user_id", uid);
  });
  it("freezes entries and answers, deduplicates selection, and uses the profile learning day", async () => {
    const original = entry(); const h = harness({ vocabulary: [original] });
    const created = await h.repos.quiz.create({ language: "es", wordIds: [wordId, wordId], type: "typing", randomSeed: 42 });
    expect(created.entries).toHaveLength(1); expect(created.learningDate).toBe("2026-10-11"); expect(created.randomSeed).toBe(42);
    original.translation = "edited later"; original.acceptedAnswers[0].text = "later answer";
    expect(created.entries[0].translation).toBe("coffee"); expect(created.entries[0].acceptedAnswers[0].text).toBe("a coffee");
    expect(mocks.privileged.rpc).toHaveBeenCalledWith("nl_create_quiz", { p_user_id: uid, p_state: created });
  });
  it("rejects unavailable/cross-language word IDs before a privileged write", async () => {
    const h = harness({ vocabulary: [] });
    await expect(h.repos.quiz.create({ language: "ja", wordIds: [wordId], type: "typing" })).rejects.toThrow("unavailable in this language");
    expect(mocks.privileged.rpc).not.toHaveBeenCalled();
  });
  it("returns the newest frozen state on stale answer versions without committing", async () => {
    const state = session({ version: 3 }); const h = harness({ state });
    await expect(h.repos.quiz.answer(state.id, { answer: "coffee", version: 2, submissionId: "stale" })).rejects.toMatchObject({ latest: state });
    expect(mocks.privileged.rpc).not.toHaveBeenCalled();
  });
  it("treats a committed duplicate answer as idempotent before rejecting its stale version", async () => {
    const state = session({ version: 4 });
    state.attempts.push({ id: "already-committed", questionId: "question", wordId, position: 0, kind: "initial", answer: "coffee", correct: true, answeredAt: "now" });
    const h = harness({ state });
    await expect(h.repos.quiz.answer(state.id, { answer: "changed replay payload", version: 1, submissionId: "already-committed" })).resolves.toEqual(state);
    expect(mocks.privileged.rpc).not.toHaveBeenCalled();
  });
  it("grades a typed explicit answer on the server and atomically commits its version", async () => {
    const state = session(); const h = harness({ state });
    const result = await h.repos.quiz.answer(state.id, { answer: " A COFFEE ", version: state.version, submissionId: "answer-1" });
    expect(result.attempts[0]).toMatchObject({ id: "answer-1", correct: true }); expect(result.status).toBe("completed");
    expect(mocks.privileged.rpc).toHaveBeenCalledWith("nl_commit_quiz", expect.objectContaining({ p_user_id: uid, p_session_id: state.id, p_expected_version: state.version, p_submission_id: "answer-1" }));
  });
  it("surfaces a multi-device commit race with the database’s latest state", async () => {
    const state = session(); const latest = { ...state, version: 2 };
    const h = harness({ state }); mocks.privileged.rpc.mockResolvedValueOnce({ data: { conflict: true, session: latest }, error: null });
    await expect(h.repos.quiz.answer(state.id, { answer: "coffee", version: state.version, submissionId: "racing-answer" })).rejects.toEqual(new VersionConflictError(latest));
  });
  it("save/exit changes state and version without adding answers or settling SRS", async () => {
    const state = session(); const h = harness({ state });
    const saved = await h.repos.quiz.saveAndExit(state.id, state.version);
    expect(saved.status).toBe("saved"); expect(saved.version).toBe(2); expect(saved.attempts).toEqual([]); expect(saved.settled).toBe(false);
    expect(mocks.privileged.rpc).toHaveBeenCalledWith("nl_commit_quiz", expect.objectContaining({ p_submission_id: null }));
  });
  it("does not resume an ended session", async () => {
    const state = session({ status: "ended", currentQuestion: null }); const h = harness({ state });
    await expect(h.repos.quiz.resume(state.id)).rejects.toThrow("already ended"); expect(mocks.privileged.rpc).not.toHaveBeenCalled();
  });
  it("maps annotation UTF-16 ranges and learning-activity civil dates", async () => {
    const h = harness({ tables: {
      reading_annotations: { data: [{ id: "ann", user_id: uid, reading_id: readingId, body_version: 2, start_offset: 5, end_offset: 9, text: "café", translation: "coffee", reading: "", vocabulary_entry_id: null, created_at: "now" }], error: null },
      learning_activity: { data: [{ id: "activity", user_id: uid, language: "es", learning_date: "2026-10-11", kind: "quiz", count: 1 }], error: null },
    } });
    expect((await h.repos.reading.getAnnotations(readingId))[0]).toMatchObject({ readingId, bodyVersion: 2, start: 5, end: 9 });
    expect((await h.repos.progress.getActivity("es"))[0]).toMatchObject({ date: "2026-10-11", kind: "quiz", count: 1 });
  });
  it("loads activity after the Supabase 1,000-row boundary without truncating streak history", async () => {
    const data = Array.from({ length: 1250 }, (_, index) => ({ id: `activity-${index}`, user_id: uid, language: "es", learning_date: "2026-10-11", kind: "quiz", count: 1 }));
    const h = harness({ tables: { learning_activity: { data, error: null } } });
    const activity = await h.repos.progress.getActivity("es");
    expect(activity).toHaveLength(1250); expect(activity[1249].id).toBe("activity-1249");
    expect(h.from).toHaveBeenCalledTimes(2);
  });
  it("loads older quiz sessions after the Supabase 1,000-row boundary", async () => {
    const data = Array.from({ length: 1250 }, (_, index) => ({ state: { ...session(), id: `session-${index}` } }));
    const h = harness({ tables: { quiz_sessions: { data, error: null } } });
    const sessions = await h.repos.quiz.getSessions("es");
    expect(sessions).toHaveLength(1250); expect(sessions[1249].id).toBe("session-1249");
    expect(h.from).toHaveBeenCalledTimes(2);
  });
  it("sends Reading compare-and-swap/body-invalidation arguments intact", async () => {
    const h = harness(); const input = { language: "es" as const, title: "New", body: "Nuevo texto.", status: "reading" as const };
    await h.repos.reading.save(input, readingId, true, 2);
    expect(h.rpc).toHaveBeenCalledWith("nl_save_reading", { p_input: input, p_id: readingId, p_clear_annotations: true, p_expected_version: 2 });
  });
  it("uses manual annotation before vocabulary and DeepL", async () => {
    const h = harness({ tables: {
      readings: { data: readingRow, error: null },
      reading_annotations: { data: [{ id: "ann", user_id: uid, reading_id: readingId, body_version: 1, start_offset: 5, end_offset: 9, text: "café", translation: "my manual meaning", reading: "", vocabulary_entry_id: wordId }], error: null },
    } });
    await expect(h.repos.reading.lookup(lookup)).resolves.toMatchObject({ source: "annotation", translation: "my manual meaning" }); expect(mocks.translate).not.toHaveBeenCalled();
  });
  it("uses personal vocabulary before contextual cache or DeepL", async () => {
    const h = harness({ tables: { readings: { data: readingRow, error: null }, translation_cache: { data: [{ id: "cache", user_id: uid, language: "es", text: "café", context: "Tomo café.", translation: "cached beverage", source: "deepl" }], error: null } } });
    await expect(h.repos.reading.lookup(lookup)).resolves.toMatchObject({ source: "vocabulary", translation: "coffee" }); expect(mocks.translate).not.toHaveBeenCalled();
  });
  it("reuses accent-preserving contextual cache before external translation", async () => {
    const h = harness({ vocabulary: [], tables: { readings: { data: readingRow, error: null }, translation_cache: { data: [{ id: "cache", user_id: uid, language: "es", text: "café", context: "Tomo café.", translation: "cached coffee", source: "deepl" }], error: null } } });
    await expect(h.repos.reading.lookup(lookup)).resolves.toMatchObject({ source: "cache", translation: "cached coffee" }); expect(mocks.translate).not.toHaveBeenCalled();
  });
  it("translates only selected text plus its sentence, without inventing readings", async () => {
    const h = harness({ vocabulary: [], tables: { readings: { data: readingRow, error: null } } });
    await expect(h.repos.reading.lookup(lookup)).resolves.toMatchObject({ source: "deepl", translation: "coffee", reading: "", vocabularyEntryId: null });
    expect(mocks.translate).toHaveBeenCalledExactlyOnceWith({ userId: uid, language: "es", text: "café", context: "Tomo café." });
    expect(mocks.privileged.from).toHaveBeenCalledWith("translation_cache");
  });
  it("rejects stale reading lookups before any provider request", async () => {
    const h = harness({ vocabulary: [], tables: { readings: { data: { ...readingRow, version: 2 }, error: null } } });
    await expect(h.repos.reading.lookup(lookup)).rejects.toThrow("reading has changed"); expect(mocks.translate).not.toHaveBeenCalled();
  });
  it("does not manufacture sample lessons when the production published query is empty", async () => {
    const h = harness(); h.rpc.mockResolvedValueOnce({ data: [] as never, error: null });
    await expect(h.repos.grammar.getPoints("ja")).resolves.toEqual([]);
    expect(h.rpc).toHaveBeenCalledWith("nl_grammar_points", { p_language: "ja" });
  });
  it("submits only the learner’s grammar choices for database grading", async () => {
    const h = harness(); await h.repos.grammar.submit("ja-wa", [0, 1, 2, 3, 0]);
    expect(h.rpc).toHaveBeenCalledWith("nl_submit_grammar", { p_point_id: "ja-wa", p_answers: [0, 1, 2, 3, 0] });
    expect(mocks.privileged.rpc).not.toHaveBeenCalled();
  });
});
