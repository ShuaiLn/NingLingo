import { describe, expect, it } from "vitest";
import { testEntry } from "./test-fixtures";
import { normalizeVocabularyDetails, vocabularyExamples } from "./vocabulary";
import { RELATION_TYPES } from "./models";

describe("explicit vocabulary examples and relations", () => {
  it("exposes a legacy CSV example without fabricating an English translation or kana", () => {
    const entry = testEntry(0, { example: "犬が好きです。" });
    expect(vocabularyExamples(entry)).toEqual([{ id: "legacy:word-0:example", text: "犬が好きです。", translation: "", reading: "" }]);
    expect(entry.examples).toBeUndefined();
  });
  it("retains explicit empty arrays and never resurrects a removed legacy example", () => {
    const entry = testEntry(0, { example: "old", examples: [] });
    expect(vocabularyExamples(entry)).toEqual([]);
    expect(normalizeVocabularyDetails(entry)).toEqual({ example: "", examples: [], relatedWords: [] });
  });
  it("mirrors the first rich example to the backward-compatible export field", () => {
    const details = normalizeVocabularyDetails({ example: "old", examples: [{ id: "", text: "  El café está listo.  ", translation: " The coffee is ready. ", reading: " manual pronunciation " }, { id: "", text: "Tomo café.", translation: "I drink coffee.", reading: "" }] }, () => "generated");
    expect(details.example).toBe("  El café está listo.  ");
    expect(details.examples).toEqual([{ id: "generated", text: "  El café está listo.  ", translation: "The coffee is ready.", reading: "manual pronunciation" }, { id: "generated", text: "Tomo café.", translation: "I drink coffee.", reading: "" }]);
  });
  it("normalizes all six explicit relation types without generating inflected forms", () => {
    const relatedWords = RELATION_TYPES.map(relationType => ({ id: "", word: " γράφω ", reading: "", translation: " I write ", relationType }));
    const result = normalizeVocabularyDetails({ example: "", relatedWords }, () => "generated");
    expect(result.relatedWords.map(related => related.relationType)).toEqual([...RELATION_TYPES]);
    expect(result.relatedWords.every(related => related.word === "γράφω" && related.reading === "" && related.translation === "I write")).toBe(true);
    expect(result.relatedWords).toHaveLength(6);
    expect(relatedWords[0].word).toBe(" γράφω ");
  });
  it("preserves valid persistent IDs and replaces legacy display IDs at write time", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const result = normalizeVocabularyDetails({ example: "", examples: [{ id, text: "One.", reading: "", translation: "" }, { id: "legacy:old", text: "Two.", reading: "", translation: "" }] }, () => "new-id");
    expect(result.examples.map(example => example.id)).toEqual([id, "new-id"]);
  });
  it("rejects empty example/related text and unsupported relation types", () => {
    expect(() => normalizeVocabularyDetails({ example: "", examples: [{ id: "", text: " ", reading: "", translation: "" }] })).toThrow("sentence");
    expect(() => normalizeVocabularyDetails({ example: "", relatedWords: [{ id: "", word: "", reading: "", translation: "", relationType: "related" }] })).toThrow("needs a word");
  });
});
