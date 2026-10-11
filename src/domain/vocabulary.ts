import { RELATION_TYPES, type RelatedWord, type VocabularyEntry, type VocabularyExample, type VocabularyInput } from "./models";

type Details = Pick<VocabularyInput, "example" | "examples" | "relatedWords">;

/** Read old seven-column CSV entries without inventing a translation or reading. */
export function vocabularyExamples(entry: Pick<VocabularyEntry, "id" | "example" | "examples">): VocabularyExample[] {
  if (entry.examples !== undefined) return structuredClone(entry.examples);
  return entry.example.trim() ? [{ id: `legacy:${entry.id}:example`, text: entry.example, reading: "", translation: "" }] : [];
}

/** One normalization boundary for local persistence; production has equivalent SQL checks. */
export function normalizeVocabularyDetails(input: Details, makeId: () => string = () => crypto.randomUUID()): Required<Details> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const id = (value: string) => uuid.test(value) ? value : makeId();
  const legacy = input.examples === undefined;
  const examples = (legacy ? (input.example.trim() ? [{ id: "", text: input.example, reading: "", translation: "" }] : []) : input.examples ?? []).map(example => {
    if (!example.text.trim()) throw new Error("Each example needs a sentence.");
    return { id: id(example.id), text: example.text, reading: example.reading.trim(), translation: example.translation.trim() };
  });
  const relatedWords: RelatedWord[] = (input.relatedWords ?? []).map(related => {
    if (!related.word.trim()) throw new Error("Each related word needs a word.");
    if (!(RELATION_TYPES as readonly string[]).includes(related.relationType)) throw new Error("Choose a supported related-word relation.");
    return { id: id(related.id), word: related.word.trim(), reading: related.reading.trim(), translation: related.translation.trim(), relationType: related.relationType };
  });
  return { example: legacy ? input.example : examples[0]?.text ?? "", examples, relatedWords };
}
