import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/repositories/local";
import { executeRepositoryOperation } from "./repository-operations";
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
});
