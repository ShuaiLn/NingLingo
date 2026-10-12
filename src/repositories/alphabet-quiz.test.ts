import { afterEach, describe, expect, it, vi } from "vitest";
import { alphabetEntries } from "@/data/alphabet";
import type { LanguageCode } from "@/domain/models";
import { createLocalRepositories } from "./local";
import { AlphabetQuizVersionConflictError } from "./contracts";
import { createDevelopmentSeed } from "./seed";
import { BrowserStorageAdapter, LOCAL_STORAGE_KEY, MemoryStorageAdapter } from "./storage";

afterEach(() => vi.unstubAllGlobals());
const letter = (language: LanguageCode, symbol: string) => alphabetEntries.find(item => item.language === language && item.symbol.split(" ").includes(symbol))!;

describe("independent, persisted Alphabet quiz repositories", () => {
  it.each([
    ["ja", "あ", "AH", true], ["ja", "あ", "i", false],
    ["es", "B", "b", true], ["es", "B", "be", false], ["es", "H", "silent", true],
    ["el", "β", "v", true], ["el", "δ", "dh", true], ["el", "δ", "th", false],
  ] as const)("grades %s %s → %s from explicit answers", async (language, symbol, answer, correct) => {
    const repos = createLocalRepositories(new MemoryStorageAdapter());
    const before = await repos.progress.getWords(language);
    const session = await repos.alphabetQuiz.create({ language, itemIds: [letter(language, symbol).id], randomSeed: 1 });
    const result = await repos.alphabetQuiz.answer(session.id, { answer, version: session.version, submissionId: "first" });
    expect(result.attempts[0].correct).toBe(correct);
    expect(result.status).toBe(correct ? "completed" : "active");
    expect(await repos.progress.getWords(language)).toEqual(before);
    expect(await repos.quiz.getSessions(language)).toEqual([]);
    expect(await repos.progress.getActivity(language)).toMatchObject([{ kind: "alphabet-quiz", count: 1 }]);
  });

  it("preserves every frozen field and equivalent answer across content edits, refresh, resume and retry", async () => {
    const adapter = new MemoryStorageAdapter();
    const repos = createLocalRepositories(adapter);
    const entry = letter("ja", "あ");
    const original = structuredClone(entry);
    try {
      const session = await repos.alphabetQuiz.create({ language: "ja", itemIds: [entry.id], randomSeed: 7 });
      const frozen = structuredClone(session.items);
      Object.assign(entry, { symbol: "changed", name: "changed name", pronunciation: "changed hint", pronunciationAnswers: ["new", "newer"], example: "changed example", exampleTranslation: "changed meaning", audioText: "changed audio", exampleReading: "changed reading" });
      const missed = await repos.alphabetQuiz.answer(session.id, { answer: "wrong", version: 1, submissionId: "wrong" });
      const saved = await repos.alphabetQuiz.saveAndExit(session.id, missed.version);
      const refreshed = createLocalRepositories(adapter);
      const reloaded = await refreshed.alphabetQuiz.getSession(session.id);
      expect(reloaded.items).toEqual(frozen);
      expect(reloaded.contentVersion).toBe(session.contentVersion);
      expect(reloaded.questionTemplates).toEqual(session.questionTemplates);
      expect(reloaded.configuration).toEqual(session.configuration);
      const resumed = await refreshed.alphabetQuiz.resume(session.id, saved.version);
      expect(resumed.currentQuestion?.kind).toBe("retry");
      const completed = await refreshed.alphabetQuiz.answer(session.id, { answer: "ah", version: resumed.version, submissionId: "retry" });
      expect(completed.status).toBe("completed");
      expect(completed.items).toEqual(frozen);
      const next = await refreshed.alphabetQuiz.create({ language: "ja", itemIds: [entry.id] });
      expect(next.items[0]).toMatchObject({ symbol: "changed", pronunciationAnswers: ["new", "newer"], audioText: "changed audio" });
    } finally { Object.assign(entry, original); }
  });

  it("deduplicates replay before version checking and returns latest state on stale answers and resume", async () => {
    const adapter = new MemoryStorageAdapter();
    const a = createLocalRepositories(adapter), b = createLocalRepositories(adapter);
    const session = await a.alphabetQuiz.create({ language: "es", itemIds: [letter("es", "B").id] });
    const input = { answer: "be", version: session.version, submissionId: "same" };
    const answered = await a.alphabetQuiz.answer(session.id, input);
    expect(await b.alphabetQuiz.answer(session.id, input)).toEqual(answered);
    await expect(b.alphabetQuiz.answer(session.id, { ...input, submissionId: "new" })).rejects.toBeInstanceOf(AlphabetQuizVersionConflictError);
    await expect(b.alphabetQuiz.resume(session.id, 1)).rejects.toMatchObject({ latest: answered });
    expect((await a.progress.getActivity("es"))).toHaveLength(1);
    expect((await a.alphabetQuiz.getSession(session.id)).attempts).toHaveLength(1);
  });

  it("keeps selected groups exact, rejects foreign-language IDs and rejects empty input without activity", async () => {
    const repos = createLocalRepositories(new MemoryStorageAdapter());
    const selected = alphabetEntries.filter(item => item.language === "ja" && item.group === "Hiragana");
    const session = await repos.alphabetQuiz.create({ language: "ja", itemIds: selected.map(item => item.id) });
    expect(session.items.map(item => item.itemId).sort()).toEqual(selected.map(item => item.id).sort());
    await expect(repos.alphabetQuiz.create({ language: "es", itemIds: [selected[0].id] })).rejects.toThrow("language");
    await expect(repos.alphabetQuiz.answer(session.id, { answer: "  ", version: 1, submissionId: "empty" })).rejects.toThrow("pronunciation");
    expect((await repos.alphabetQuiz.getSession(session.id)).version).toBe(1);
    expect(await repos.progress.getActivity()).toEqual([]);
  });

  it("isolates saved sessions and history from a different local account", async () => {
    const adapter = new MemoryStorageAdapter();
    const a = createLocalRepositories(adapter);
    const session = await a.alphabetQuiz.create({ language: "es", itemIds: [letter("es", "A").id] });
    const data = adapter.read()!;
    data.profile.id = "another-account";
    adapter.write(data);
    const b = createLocalRepositories(adapter);
    expect(await b.alphabetQuiz.getSessions("es")).toEqual([]);
    await expect(b.alphabetQuiz.getSession(session.id)).rejects.toThrow("unavailable");
    await expect(b.alphabetQuiz.answer(session.id, { answer: "a", version: 1, submissionId: "foreign" })).rejects.toThrow("unavailable");
  });

  it("records answers in the account timezone and does not record save/resume/end as learning activity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T06:59:59Z"));
    try {
      const repos = createLocalRepositories(new MemoryStorageAdapter());
      const session = await repos.alphabetQuiz.create({ language: "es", itemIds: [letter("es", "A").id] });
      const saved = await repos.alphabetQuiz.saveAndExit(session.id, 1);
      const resumed = await repos.alphabetQuiz.resume(session.id, saved.version);
      const result = await repos.alphabetQuiz.answer(session.id, { answer: "wrong", version: resumed.version, submissionId: "one" });
      await repos.alphabetQuiz.end(session.id, result.version);
      expect(await repos.progress.getActivity()).toMatchObject([{ date: "2026-10-11", kind: "alphabet-quiz" }]);
    } finally { vi.useRealTimers(); }
  });

  it("upgrades old browser data with no alphabetSessions while preserving its key and vocabulary sessions", async () => {
    const seed = createDevelopmentSeed();
    const legacy = { ...seed } as Partial<typeof seed>;
    delete legacy.alphabetSessions;
    const values = new Map([[LOCAL_STORAGE_KEY, JSON.stringify(legacy)]]);
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) }, addEventListener: vi.fn() });
    const repos = createLocalRepositories(new BrowserStorageAdapter());
    expect(await repos.alphabetQuiz.getSessions("es")).toEqual([]);
    expect(await repos.vocabulary.getEntries("es")).toHaveLength(seed.entries.filter(item => item.language === "es").length);
    await repos.alphabetQuiz.create({ language: "es", itemIds: [letter("es", "A").id] });
    const persisted = JSON.parse(values.get(LOCAL_STORAGE_KEY)!);
    expect(persisted.entries).toEqual(seed.entries);
    expect(persisted.sessions).toEqual(seed.sessions);
    expect(persisted.alphabetSessions).toHaveLength(1);
  });
});
