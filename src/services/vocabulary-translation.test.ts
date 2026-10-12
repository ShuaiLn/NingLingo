import { describe, expect, it, vi } from "vitest";
import type { LanguageCode, TranslationCacheEntry, TranslationProvider } from "@/domain/models";
import { resolveVocabularyTranslations } from "./vocabulary-translation";

function setup(words = ["犬", "犬", "犬", "猫"], overrides: Partial<Parameters<typeof resolveVocabularyTranslations>[0]> = {}) {
  const provider: TranslationProvider = { translate: vi.fn(async (input: Parameters<TranslationProvider["translate"]>[0]) => ({ translation: input.text === "犬" ? "dog" : "cat", source: "deepl" as const })), translateMany: vi.fn(async (input: Parameters<NonNullable<TranslationProvider["translateMany"]>>[0]) => input.texts.map(text => ({ translation: text === "犬" ? "dog" : "cat", source: "deepl" as const }))), usage: vi.fn(async () => ({ used: 0, limit: 10000, available: true })) };
  const stored: TranslationCacheEntry[] = [];
  const input = { userId: "user-a", language: "ja" as LanguageCode, rows: words.map((word, index) => ({ line: index + 2, word })), provider, cache: [] as TranslationCacheEntry[], storeCache: vi.fn(async (entry: TranslationCacheEntry) => { stored.push(entry); }), ...overrides };
  return { input, provider, stored };
}
const cacheEntry = (overrides: Partial<TranslationCacheEntry> = {}): TranslationCacheEntry => ({ id: "cache", userId: "user-a", language: "ja", lookupKind: "vocabulary", text: "犬", context: "", translation: "dog", source: "deepl", createdAt: "now", ...overrides });

describe("Vocabulary translation resolution", () => {
  it("sends only two unique misses for 犬,犬,犬,猫, preserving row order and empty context", async () => {
    const { input, provider, stored } = setup();
    const results = await resolveVocabularyTranslations(input);
    expect(provider.translateMany).toHaveBeenCalledExactlyOnceWith({ userId: "user-a", language: "ja", texts: ["犬", "猫"], context: "" });
    expect(provider.translate).not.toHaveBeenCalled();
    expect(results.map(row => row.translation)).toEqual(["dog", "dog", "dog", "cat"]);
    expect(results.map(row => row.line)).toEqual([2, 3, 4, 5]);
    expect(stored).toHaveLength(2);
    expect(stored.every(entry => entry.lookupKind === "vocabulary" && entry.context === "")).toBe(true);
  });
  it("requests only 猫 when 犬 is cached and maps cache source to each repeated row", async () => {
    const { input, provider, stored } = setup(undefined, { cache: [cacheEntry()] });
    const results = await resolveVocabularyTranslations(input);
    expect(provider.translateMany).toHaveBeenCalledWith(expect.objectContaining({ texts: ["猫"] }));
    expect(results.map(row => row.source)).toEqual(["cache", "cache", "cache", "deepl"]);
    expect(stored).toHaveLength(1);
  });
  it("normalizes NFC and surrounding whitespace without merging case", async () => {
    const { input, provider } = setup([" café ", "cafe\u0301", "Café"], { language: "es" });
    await resolveVocabularyTranslations(input);
    expect(provider.translateMany).toHaveBeenCalledWith(expect.objectContaining({ language: "es", texts: ["café", "Café"] }));
  });
  it.each([{ userId: "user-b" }, { language: "el" as const }, { lookupKind: "reading" as const }, { lookupKind: undefined }, { context: "sentence" }, { translation: "  " }])("isolates account, source language, Reading namespace, context, and invalid cache: %j", async different => {
    const { input, provider } = setup(["犬"], { cache: [cacheEntry(different)] });
    await resolveVocabularyTranslations(input);
    expect(provider.translateMany).toHaveBeenCalledWith(expect.objectContaining({ texts: ["犬"] }));
  });
  it("returns per-row provider errors and never caches a failed/empty result", async () => {
    const { input, provider, stored } = setup();
    vi.mocked(provider.translateMany!).mockResolvedValue([{ translation: "dog", source: "deepl" }, { translation: "  ", source: "deepl" }]);
    const results = await resolveVocabularyTranslations(input);
    expect(results.slice(0, 3).every(row => row.translation === "dog")).toBe(true);
    expect(results[3].error).toContain("no English meaning");
    expect(stored).toHaveLength(1);
    vi.mocked(provider.translateMany!).mockRejectedValue(new Error("Provider is busy."));
    const failure = await resolveVocabularyTranslations(input);
    expect(failure.every(row => row.error === "Provider is busy.")).toBe(true);
    expect(stored).toHaveLength(1);
  });
  it("supports injected single-lookup test providers with defensive deduplication", async () => {
    const { input, provider, stored } = setup();
    delete provider.translateMany;
    await resolveVocabularyTranslations(input);
    expect(provider.translate).toHaveBeenCalledTimes(2);
    expect(stored).toHaveLength(2);
  });
  it("accepts 25 unique queries, rejects 26, and rejects oversized/empty words without provider calls", async () => {
    const valid = setup(Array.from({ length: 25 }, (_, i) => `word${i}`));
    expect(await resolveVocabularyTranslations(valid.input)).toHaveLength(25);
    const excess = setup(Array.from({ length: 26 }, (_, i) => `word${i}`));
    await expect(resolveVocabularyTranslations(excess.input)).rejects.toThrow("25 unique");
    expect(excess.provider.translateMany).not.toHaveBeenCalled();
    const invalid = setup([" ", "a".repeat(2001)]);
    expect((await resolveVocabularyTranslations(invalid.input)).every(row => row.error?.includes("2,000"))).toBe(true);
    expect(invalid.provider.translateMany).not.toHaveBeenCalled();
  });
  it("does not invoke the provider when every row is cached", async () => {
    const { input, provider } = setup(["犬", "犬"], { cache: [cacheEntry()] });
    expect((await resolveVocabularyTranslations(input)).map(row => row.source)).toEqual(["cache", "cache"]);
    expect(provider.translateMany).not.toHaveBeenCalled();
  });
  it("preserves an ordered bulk provider failure reason alongside successful cacheable rows", async () => {
    const { input, provider, stored } = setup(["犬", "猫"]);
    const batchResults = [{ translation: "dog", source: "deepl" as const }, { translation: "", source: "deepl" as const, error: "DeepL is busy. Try again shortly or enter a translation manually." }];
    vi.mocked(provider.translateMany!).mockResolvedValue(batchResults);
    const results = await resolveVocabularyTranslations(input);
    expect(results[0].translation).toBe("dog");
    expect(results[1].error).toContain("busy");
    expect(stored.map(row => row.text)).toEqual(["犬"]);
  });
});
