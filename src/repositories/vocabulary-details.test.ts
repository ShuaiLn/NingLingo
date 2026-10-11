import { describe, expect, it } from "vitest";
import { previewCsv, exportCsv } from "@/domain/csv";
import { RELATION_TYPES, type VocabularyInput } from "@/domain/models";
import { createLocalRepositories } from "./local";
import { createDevelopmentSeed } from "./seed";
import { isLocalDatabase, MemoryStorageAdapter } from "./storage";

function setup() {
  const adapter = new MemoryStorageAdapter();
  const seed = createDevelopmentSeed();
  return { adapter, seed, repos: createLocalRepositories(adapter, seed) };
}
describe("local explicit Vocabulary details", () => {
  it("reads existing legacy examples without rewriting the persisted checkpoint", async () => {
    const { adapter, seed, repos } = setup();
    const source = seed.entries.find(entry => entry.language === "ja" && entry.example)!;
    const before = adapter.read();
    const entry = (await repos.vocabulary.getEntries("ja")).find(entry => entry.id === source.id)!;
    expect(entry.examples).toMatchObject([{ text: source.example, reading: "", translation: "" }]);
    expect(entry.relatedWords).toEqual([]);
    expect(adapter.read()).toEqual(before);
  });
  it("persists multiple translated examples and all relation types across repository instances", async () => {
    const { adapter, seed, repos } = setup();
    const list = seed.lists.find(list => list.language === "el")!;
    const input: VocabularyInput = { language: "el", listId: list.id, word: "γράφω", reading: "ˈɣrafo", translation: "write", type: "verb", category: "actions", notes: "Explicit sourced forms only.", example: "", acceptedAnswers: [], examples: [{ id: "", text: "Γράφω ένα γράμμα.", reading: "", translation: "I write a letter." }, { id: "", text: "Γράφουμε μαζί.", reading: "", translation: "We write together." }], relatedWords: RELATION_TYPES.map(relationType => ({ id: "", word: "έγραψα", reading: "", translation: "I wrote", relationType })) };
    const entry = await repos.vocabulary.saveEntry(input);
    const reload = createLocalRepositories(adapter, seed);
    expect((await reload.vocabulary.getEntries("el")).find(word => word.id === entry.id)).toEqual(entry);
    expect(entry.example).toBe("Γράφω ένα γράμμα.");
    expect(entry.examples?.map(example => example.translation)).toEqual(["I write a letter.", "We write together."]);
    expect(entry.relatedWords?.map(related => related.relationType)).toEqual([...RELATION_TYPES]);
    expect(entry.relatedWords?.every(related => related.reading === "")).toBe(true);
    expect(isLocalDatabase(adapter.read())).toBe(true);
  });
  it("imports the original seven-column CSV as one untranslated example and exports compatibly", async () => {
    const { seed, repos } = setup(); const list = seed.lists.find(list => list.language === "es")!;
    const preview = previewCsv('word,reading,translation,type,category,example,notes\r\nnuevo,,new,adjective,study,"Un ejemplo, nuevo.",', [], "es", list.id);
    await repos.vocabulary.importEntries(preview.valid.map(row => row.input));
    const entry = (await repos.vocabulary.getEntries("es")).find(entry => entry.word === "nuevo")!;
    expect(entry.examples).toMatchObject([{ text: "Un ejemplo, nuevo.", reading: "", translation: "" }]);
    expect(entry.relatedWords).toEqual([]);
    expect(exportCsv([entry], false)).toBe('word,reading,translation,type,category,example,notes\r\nnuevo,,new,adjective,study,"Un ejemplo, nuevo.",');
  });
  it("removes all examples cleanly and rejects malformed nested persistence", async () => {
    const { adapter, seed, repos } = setup(); const source = seed.entries.find(entry => entry.language === "es")!;
    const { id: entryId, userId: _user, createdAt: _created, updatedAt: _updated, ...input } = source;
    void _user; void _created; void _updated;
    const saved = await repos.vocabulary.saveEntry({ ...input, examples: [], relatedWords: [] }, entryId);
    expect(saved.example).toBe("");
    expect(saved.examples).toEqual([]);
    const valid = adapter.read()!;
    expect(isLocalDatabase(valid)).toBe(true);
    expect(isLocalDatabase({ ...valid, entries: [{ ...saved, examples: [{ id: "bad", text: "missing fields" }] }] })).toBe(false);
    expect(isLocalDatabase({ ...valid, entries: [{ ...saved, relatedWords: [{ id: "bad", word: "bad", reading: "", translation: "", relationType: "inferred" }] }] })).toBe(false);
  });
});
