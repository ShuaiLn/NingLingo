import { describe, expect, it, vi } from "vitest";
import type { Reading, ReadingAnnotation, TranslationCacheEntry, TranslationProvider, VocabularyEntry } from "./models";
import { contextForRange, knownReadingLookup, planReadingEdit, ReadingLookupService, tokenizeReading, translationCacheKey, type ReadingLookupInput } from "./reading";

const reading: Reading = { id: "reading-1", userId: "user-1", language: "es", title: "Morning", body: "El café está aquí. Otro café es pequeño.", version: 1, status: "unread", createdAt: "2026-10-11T08:00:00Z", updatedAt: "2026-10-11T08:00:00Z" };
const entry: VocabularyEntry = { id: "word-1", userId: "user-1", language: "es", listId: "list-1", word: "café", reading: "", translation: "coffee", type: "noun", category: "food", example: "", notes: "", acceptedAnswers: [], createdAt: "", updatedAt: "" };
const annotation: ReadingAnnotation = { id: "annotation-1", userId: "user-1", readingId: reading.id, bodyVersion: 1, start: 3, end: 7, text: "café", translation: "the café in this passage", reading: "manual reading", vocabularyEntryId: entry.id, createdAt: "" };
const cache: TranslationCacheEntry = { id: "cache-1", userId: "user-1", language: "es", text: "café", context: "El café está aquí.", translation: "cached café", source: "mock", createdAt: "" };
function input(overrides: Partial<ReadingLookupInput> = {}): ReadingLookupInput {
  return { userId: "user-1", reading, request: { readingId: reading.id, bodyVersion: 1, start: 3, end: 7 }, entries: [entry], annotations: [annotation], cache: [cache], storeCache: async () => undefined, ...overrides };
}
function provider(translate = vi.fn(async () => ({ translation: "machine result", source: "mock" as const }))): TranslationProvider {
  return { translate, usage: async () => ({ used: 0, limit: 0, available: true }) };
}

describe("reading lookup priority", () => {
  it("prefers matching manual annotations over vocabulary and cache", () => {
    expect(knownReadingLookup(input())).toMatchObject({ translation: annotation.translation, reading: "manual reading", source: "annotation" });
  });
  it("prefers vocabulary over contextual cache", () => {
    expect(knownReadingLookup(input({ annotations: [] }))).toMatchObject({ translation: "coffee", source: "vocabulary" });
  });
  it("prefers an exact manual word annotation over a containing phrase", () => {
    const phrase = { ...annotation, id: "phrase", start: 0, end: 17, text: "El café está aquí.", translation: "The coffee is here." };
    expect(knownReadingLookup(input({ annotations: [phrase, annotation] }))).toMatchObject({ translation: annotation.translation });
  });
  it("uses cache before contacting the provider", async () => {
    const translate = vi.fn(async () => ({ translation: "external", source: "mock" as const }));
    const service = new ReadingLookupService(provider(translate));
    expect(await service.lookup(input({ entries: [], annotations: [] }))).toMatchObject({ translation: "cached café", source: "cache" });
    expect(translate).not.toHaveBeenCalled();
  });
  it("keeps vocabulary and Reading cache namespaces separate even when text/context match", async () => {
    const translate = vi.fn(async () => ({ translation: "contextual meaning", source: "mock" as const }));
    const storeCache = vi.fn(async () => undefined);
    const result = await new ReadingLookupService(provider(translate)).lookup(input({ entries: [], annotations: [], cache: [{ ...cache, lookupKind: "vocabulary" }], storeCache }));
    expect(result).toMatchObject({ translation: "contextual meaning", source: "mock" });
    expect(translate).toHaveBeenCalledOnce();
    expect(storeCache).toHaveBeenCalledWith(expect.objectContaining({ lookupKind: "reading", context: "El café está aquí." }));
  });
  it("calls the provider only for an unknown range, supplying the sentence", async () => {
    const translate = vi.fn(async () => ({ translation: "machine result", source: "mock" as const }));
    const storeCache = vi.fn(async () => undefined);
    const result = await new ReadingLookupService(provider(translate)).lookup(input({ entries: [], annotations: [], cache: [], storeCache }));
    expect(result).toMatchObject({ source: "mock", translation: "machine result", reading: "" });
    expect(translate).toHaveBeenCalledWith({ userId: "user-1", language: "es", text: "café", context: "El café está aquí." });
    expect(storeCache).toHaveBeenCalledOnce();
  });
  it("does not reuse a translation from a different sentence or user", () => {
    const second = reading.body.lastIndexOf("café");
    expect(knownReadingLookup(input({ entries: [], annotations: [], request: { readingId: reading.id, bodyVersion: 1, start: second, end: second + 4 } }))).toBeNull();
    expect(knownReadingLookup(input({ entries: [], annotations: [], cache: [{ ...cache, userId: "other-user" }] }))).toBeNull();
    expect(() => knownReadingLookup(input({ userId: "other-user" }))).toThrow("does not belong");
  });
  it("merges simultaneous requests for the same contextual key", async () => {
    let complete: ((value: { translation: string; source: "mock" }) => void) | undefined;
    const translate = vi.fn(() => new Promise<{ translation: string; source: "mock" }>(resolve => { complete = resolve; }));
    const storeCache = vi.fn(async () => undefined);
    const service = new ReadingLookupService(provider(translate));
    const request = input({ entries: [], annotations: [], cache: [], storeCache });
    const first = service.lookup(request);
    const second = service.lookup(request);
    expect(translate).toHaveBeenCalledOnce();
    complete?.({ translation: "coffee", source: "mock" });
    expect(await first).toEqual(await second);
    expect(storeCache).toHaveBeenCalledOnce();
  });
  it("allows a later retry after the translation service fails", async () => {
    const translate = vi.fn(async () => ({ translation: "coffee", source: "mock" as const }));
    translate.mockRejectedValueOnce(new Error("offline"));
    const service = new ReadingLookupService(provider(translate));
    const request = input({ entries: [], annotations: [], cache: [] });
    await expect(service.lookup(request)).rejects.toThrow("offline");
    await expect(service.lookup(request)).resolves.toMatchObject({ translation: "coffee" });
  });
  it("rejects stale or invalid text ranges", () => {
    expect(() => knownReadingLookup(input({ request: { readingId: reading.id, bodyVersion: 0, start: 3, end: 7 } }))).toThrow("changed");
    expect(() => knownReadingLookup(input({ request: { readingId: reading.id, bodyVersion: 1, start: -1, end: 7 } }))).toThrow("non-empty");
    expect(() => knownReadingLookup(input({ request: { readingId: reading.id, bodyVersion: 1, start: 3, end: 3 } }))).toThrow("non-empty");
  });
  it("ignores annotations from older versions", () => {
    expect(knownReadingLookup(input({ annotations: [{ ...annotation, bodyVersion: 0 }] }))).toMatchObject({ source: "vocabulary" });
  });
});

describe("reading tokenization and context", () => {
  it("greedily matches the longest Japanese vocabulary phrase", () => {
    const japanese = [
      { ...entry, id: "short", language: "ja" as const, word: "日本" },
      { ...entry, id: "long", language: "ja" as const, word: "日本語" },
    ];
    const text = "私は日本語を勉強しています。";
    const tokens = tokenizeReading(text, "ja", japanese);
    expect(tokens.find(token => token.vocabularyEntryId)).toMatchObject({ text: "日本語", start: 2, end: 5, vocabularyEntryId: "long" });
    expect(tokens.map(token => token.text).join("")).toBe(text);
  });
  it("keeps unknown Japanese inflections as original language segments", () => {
    const text = "犬が走りました。";
    const tokens = tokenizeReading(text, "ja", [{ ...entry, language: "ja", word: "犬" }]);
    expect(tokens[0]).toMatchObject({ text: "犬", vocabularyEntryId: "word-1" });
    expect(tokens.map(token => token.text).join("")).toBe(text);
    expect(tokens.filter(token => token.word && !token.vocabularyEntryId).length).toBeGreaterThan(0);
  });
  it("preserves Spanish and Greek accents and original text offsets", () => {
    const spanish = tokenizeReading("CAFÉ, café cafe.", "es", [entry]);
    expect(spanish.filter(token => token.vocabularyEntryId).map(token => token.text)).toEqual(["CAFÉ", "café"]);
    const greek = tokenizeReading("Καλημέρα κόσμε!", "el", [{ ...entry, language: "el", word: "κόσμε" }]);
    expect(greek.find(token => token.vocabularyEntryId)).toMatchObject({ text: "κόσμε", start: 9, end: 14 });
    expect(greek.map(token => token.text).join("")).toBe("Καλημέρα κόσμε!");
  });
  it("keeps accent-distinct words separate but normalizes equivalent Unicode cache forms", () => {
    expect(translationCacheKey({ ...cache, text: "cafe" })).not.toBe(translationCacheKey(cache));
    expect(translationCacheKey({ ...cache, text: "cafe\u0301" })).toBe(translationCacheKey(cache));
    expect(contextForRange("犬です。猫です。", 4, 5)).toBe("猫です。");
  });
  it("recognizes Greek question marks and ano teleia as context boundaries", () => {
    for (const punctuation of [";", "\u037e", "\u0387", "\u00b7"]) {
      const text = `Πού είναι${punctuation} Εδώ είναι.`;
      const start = text.indexOf("Εδώ");
      expect(contextForRange(text, start, start + 3)).toBe("Εδώ είναι.");
    }
  });
});

describe("reading body/version changes", () => {
  it("keeps annotations and version on metadata-only saves", () => {
    expect(planReadingEdit(reading, reading.body, [annotation])).toEqual({ changed: false, version: 1, annotations: [annotation] });
  });
  it("requires explicit confirmation before clearing positional annotations", () => {
    expect(() => planReadingEdit(reading, "New body.", [annotation])).toThrow("Confirm");
    const unrelated = { ...annotation, id: "other", readingId: "other-reading" };
    expect(planReadingEdit(reading, "New body.", [annotation, unrelated], true)).toEqual({ changed: true, version: 2, annotations: [unrelated] });
  });
  it("increments the body version even when no annotations exist", () => {
    expect(planReadingEdit(reading, "New body.", [])).toMatchObject({ changed: true, version: 2, annotations: [] });
  });
});
