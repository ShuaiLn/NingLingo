import { describe, expect, it } from "vitest";
import { classifyCsvRows, previewCsv, vocabularyCsvTemplate } from "./csv";
import { applyCsvTranslations, editCsvTranslation, unresolvedCsvQueries } from "./csv-preview";
import type { VocabularyTranslationResult } from "./models";

const result = (word: string, translation: string): VocabularyTranslationResult => ({ line: 2, word, translation, source: "deepl", error: null });
const preview = (source = "word\n犬\n犬\n犬\n猫") => ({ ...previewCsv(source, [], "ja", "list"), generation: 7 });
const revisions = (value: ReturnType<typeof preview>) => new Map(value.rows.map(row => [row.line, row.editRevision]));

describe("editable word-only CSV preview", () => {
  it("requires only word, leaves missing translations unresolved, and preserves all optional defaults", () => {
    const value = preview();
    expect(value.headerErrors).toEqual([]);
    expect(value.invalid).toEqual([]);
    expect(value.valid).toEqual([]);
    expect(value.unresolved).toHaveLength(4);
    expect(value.rows[0].input).toMatchObject({ reading: "", translation: "", type: "", category: "", example: "", notes: "", acceptedAnswers: [] });
    expect(vocabularyCsvTemplate().replace(/^\uFEFF/, "").split("\r\n")[0]).toBe("word,translation,reading,type,category,example,notes");
  });
  it("globally deduplicates before batching, preserving case and normalizing trim and NFC", () => {
    const value = preview("word\n café \ncafe\u0301\nCafé\n" + Array.from({ length: 30 }, (_, index) => `word${index}`).join("\n") + "\ncafé\nword0");
    const queries = unresolvedCsvQueries(value);
    expect(queries).toHaveLength(32);
    expect(queries.slice(0, 2).map(row => row.word)).toEqual(["café", "Café"]);
    expect(queries.slice(25).map(row => row.word)).not.toContain("café");
    expect(queries.map(row => row.word).filter(word => word === "word0")).toHaveLength(1);
  });
  it("ignores structurally invalid rows before translation collection", () => {
    const value = preview("word\n犬\n猫,extra\n\"unclosed");
    expect(unresolvedCsvQueries(value).map(row => row.word)).toEqual(["犬"]);
    expect(value.invalid).toHaveLength(2);
  });
  it("maps translations to every original row then classifies full entry duplicates", () => {
    const value = preview();
    const resolved = applyCsvTranslations(value, [result("犬", "dog"), result("猫", "cat")], 7, revisions(value), []);
    expect(resolved.rows.map(row => row.input.translation)).toEqual(["dog", "dog", "dog", "cat"]);
    expect(resolved.valid.map(row => row.line)).toEqual([2, 5]);
    expect(resolved.duplicates.map(row => row.line)).toEqual([3, 4]);
    expect(resolved.unresolved).toHaveLength(0);
  });
  it("never overwrites CSV translations, manual edits, or even a subsequently cleared manual edit", () => {
    const value = preview("word,translation\n犬,hound\n猫,\n鳥,");
    const captured = revisions(value);
    const edited = editCsvTranslation(value, 3, "kitten", []);
    const cleared = editCsvTranslation(editCsvTranslation(edited, 4, "bird", []), 4, "", []);
    const resolved = applyCsvTranslations(cleared, [result("犬", "dog"), result("猫", "cat"), result("鳥", "bird")], 7, captured, []);
    expect(resolved.rows.map(row => row.input.translation)).toEqual(["hound", "kitten", ""]);
    expect(resolved.rows.map(row => row.translationSource)).toEqual(["csv", "manual", "manual"]);
    expect(resolved.rows[2].translationError).toBe("");
  });
  it("rejects stale preview/file/language generations", () => {
    const value = preview();
    expect(applyCsvTranslations(value, [result("犬", "dog")], 6, revisions(value), [])).toBe(value);
    const replaced = { ...value, generation: 8, language: "es" as const };
    expect(applyCsvTranslations(replaced, [result("犬", "dog")], 7, revisions(value), [])).toBe(replaced);
  });
  it("reclassifies duplicates when a machine translation is edited, including reading distinctions", () => {
    const value = preview("word,reading\n生,せい\n生,せい\n生,なま");
    const resolved = applyCsvTranslations(value, [result("生", "life")], 7, revisions(value), []);
    expect(resolved.valid).toHaveLength(2);
    expect(resolved.duplicates).toHaveLength(1);
    const edited = editCsvTranslation(resolved, 3, "existence", []);
    expect(edited.valid).toHaveLength(3);
    const cleared = editCsvTranslation(edited, 3, "  ", []);
    expect(cleared.valid).toHaveLength(2);
    expect(cleared.unresolved).toHaveLength(1);
  });
  it("retains failure reasons, supports retry, and excludes unresolved rows from atomic confirmation", () => {
    const value = preview("word\n犬\n猫");
    const resolved = applyCsvTranslations(value, [result("犬", "dog"), { ...result("猫", ""), source: null, error: "Provider is busy." }], 7, revisions(value), []);
    expect(resolved.valid).toHaveLength(1);
    expect(resolved.unresolved[0].translationError).toBe("Provider is busy.");
    expect(unresolvedCsvQueries(resolved)).toEqual([{ line: 3, word: "猫" }]);
    const remaining = classifyCsvRows(resolved.rows.filter(row => !resolved.valid.includes(row)), [], "ja", [], 7);
    expect(remaining.rows.map(row => row.input.word)).toEqual(["猫"]);
    const retry = applyCsvTranslations(remaining, [result("猫", "cat")], 7, revisions(remaining), []);
    expect(retry.valid[0].input.translation).toBe("cat");
  });
  it("keeps legacy arbitrary column order and export compatibility", () => {
    const value = previewCsv("notes,translation,word,reading,type,category,example\nnotes,dog,犬,いぬ,noun,animals,犬です", [], "ja", "list");
    expect(value.valid[0].input).toMatchObject({ word: "犬", translation: "dog", reading: "いぬ", notes: "notes", example: "犬です" });
  });
});
