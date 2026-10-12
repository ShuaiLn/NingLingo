import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/repositories/local";
import { executeRepositoryOperation } from "./repository-operations";
import { alphabetEntries } from "@/data/alphabet";
describe("authenticated repository operation boundary", () => {
  it("validates vocabulary and imports valid entries atomically through the repository", async () => {
    const repos = createLocalRepositories();
    const list = await repos.vocabulary.createList("es", "API test");
    const word = { language: "es", listId: list.id, word: "árbol", reading: "", translation: "tree", type: "noun", category: "nature", example: "", notes: "", acceptedAnswers: [] };
    expect(await executeRepositoryOperation(repos, "vocabulary.import", { inputs: [word, word] })).toEqual({ imported: 1, duplicates: 1 });
    await expect(executeRepositoryOperation(repos, "vocabulary.import", { inputs: [{ ...word, word: "" }] })).rejects.toThrow();
    expect((await repos.vocabulary.getEntries("es")).filter(entry => entry.listId === list.id)).toHaveLength(1);
  });
  it("accepts answers only and lets the engine grade despite a forged correct flag", async () => {
    const repos = createLocalRepositories();
    const list = await repos.vocabulary.createList("ja", "API quiz");
    const word = await repos.vocabulary.saveEntry({ language: "ja", listId: list.id, word: "オウム", reading: "おうむ", translation: "parrot", type: "noun", category: "", example: "", notes: "", acceptedAnswers: [] });
    const session = await repos.quiz.create({ language: "ja", wordIds: [word.id], type: "typing", randomSeed: 7 });
    await executeRepositoryOperation(repos, "quiz.answer", { id: session.id, version: 1, answer: "wrong", submissionId: "api-attempt", correct: true });
    const result = await repos.quiz.getSession(session.id);
    expect(result.attempts[0].correct).toBe(false);
    await executeRepositoryOperation(repos, "quiz.answer", { id: session.id, version: 1, answer: "wrong", submissionId: "api-attempt" });
    expect((await repos.quiz.getSession(session.id)).attempts).toHaveLength(1);
  });
  it("rejects forged snapshots, invalid language codes and unknown operations", async () => {
    const repos = createLocalRepositories();
    await expect(executeRepositoryOperation(repos, "quiz.create", { language: "fr", type: "typing", wordIds: [] })).rejects.toThrow();
    await expect(executeRepositoryOperation(repos, "quiz.answer", { id: "not-a-uuid", version: 0, state: {} })).rejects.toThrow();
    await expect(executeRepositoryOperation(repos, "sql.execute", { sql: "drop table" })).rejects.toThrow("Unknown");
  });
  it("accepts only Alphabet IDs/answer inputs and ignores client snapshots and forged scores", async () => {
    const repos = createLocalRepositories();
    const b = alphabetEntries.find(item => item.language === "es" && item.symbol === "B b")!;
    const created = await executeRepositoryOperation(repos, "alphabetQuiz.create", { language: "es", itemIds: [b.id], items: [{ itemId: b.id, pronunciationAnswers: ["be"] }], contentVersion: 999 }) as Awaited<ReturnType<typeof repos.alphabetQuiz.create>>;
    expect(created.items[0].pronunciationAnswers).toEqual(["b"]);
    expect(created.contentVersion).toBe(1);
    await executeRepositoryOperation(repos, "alphabetQuiz.answer", { id: created.id, version: created.version, answer: "be", submissionId: "forged", correct: true, state: { status: "completed" } });
    expect((await repos.alphabetQuiz.getSession(created.id)).attempts[0].correct).toBe(false);
    await expect(executeRepositoryOperation(repos, "alphabetQuiz.resume", { id: created.id })).rejects.toThrow();
    await expect(executeRepositoryOperation(repos, "alphabetQuiz.answer", { id: created.id, answer: " ", version: 2, submissionId: "blank" })).rejects.toThrow();
  });
  it("validates dedicated translation requests without requiring a Reading or creating vocabulary", async () => {
    const repos = createLocalRepositories();
    const entries = await repos.vocabulary.getEntries("ja");
    const results = await executeRepositoryOperation(repos, "vocabulary.resolveTranslations", { language: "ja", rows: [{ line: 2, word: "犬" }, { line: 3, word: "犬" }] });
    expect(results).toMatchObject([{ line: 2, word: "犬", error: expect.any(String) }, { line: 3, word: "犬", error: expect.any(String) }]);
    expect(await repos.vocabulary.getEntries("ja")).toEqual(entries);
    await expect(executeRepositoryOperation(repos, "vocabulary.resolveTranslations", { language: "ja", rows: [{ line: 0, word: "犬" }] })).rejects.toThrow();
    await expect(executeRepositoryOperation(repos, "vocabulary.resolveTranslations", { language: "ja", rows: Array.from({ length: 26 }, (_, line) => ({ line: line + 1, word: `word${line}` })) })).rejects.toThrow("25");
  });
});
