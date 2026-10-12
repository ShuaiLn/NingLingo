import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "./local";
import { createDevelopmentSeed } from "./seed";
import { MemoryStorageAdapter } from "./storage";

describe("repository vocabulary preview cache boundary", () => {
  it("maps repeated cached words without creating entries/SRS or exposing word lookups through Reading cache", async () => {
    const seed = createDevelopmentSeed();
    const base = { userId: seed.profile.id, language: "ja" as const, context: "", source: "deepl" as const, createdAt: "2026-10-11T00:00:00Z" };
    seed.cache.push({ ...base, id: "reading-cache", text: "犬", translation: "contextual dog" });
    seed.cache.push({ ...base, id: "word-cache", text: "犬", translation: "dog", lookupKind: "vocabulary" });
    seed.cache.push({ ...base, id: "cat-cache", text: "猫", translation: "cat", lookupKind: "vocabulary" });
    const repos = createLocalRepositories(new MemoryStorageAdapter(), seed);
    const beforeEntries = await repos.vocabulary.getEntries("ja"), beforeProgress = await repos.progress.getWords("ja");
    const result = await repos.vocabulary.resolveTranslations({ language: "ja", rows: ["犬", " 犬 ", "犬", "猫"].map((word, index) => ({ line: index + 2, word })) });
    expect(result.map(row => row.translation)).toEqual(["dog", "dog", "dog", "cat"]);
    expect(result.every(row => row.source === "cache")).toBe(true);
    expect(await repos.vocabulary.getEntries("ja")).toEqual(beforeEntries);
    expect(await repos.progress.getWords("ja")).toEqual(beforeProgress);
    expect(await repos.reading.getCache()).toEqual([seed.cache[0]]);
  });
});
