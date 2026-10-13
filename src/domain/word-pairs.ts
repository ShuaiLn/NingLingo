import type { VocabularyEntry, WordPair } from "./models";
import { normalizeAnswer } from "./quiz";

export function wordPairKey(source: string, target: string): string { return [source, target].sort().join(":"); }
export function wordMeanings(entry: VocabularyEntry): string[] {
  return [...new Set([entry.translation, ...entry.acceptedAnswers.map(answer => answer.text)].map(normalizeAnswer).filter(Boolean))];
}
/** Deleted relationships remain as tombstones; suggestions never resurrect them. */
export function suggestWordPairs(entries: VocabularyEntry[], existing: WordPair[] = []): WordPair[] {
  const known = new Set(existing.map(pair => wordPairKey(pair.sourceWordId, pair.targetWordId)));
  const meaningsByWord = new Map(entries.map(entry => [entry.id, wordMeanings(entry)]));
  const meaningCounts = new Map<string, Set<string>>();
  const meaningKey = (entry: VocabularyEntry, meaning: string) => `${entry.userId}\u0000${entry.language}\u0000${meaning}`;
  for (const entry of entries) for (const meaning of meaningsByWord.get(entry.id)!) {
    const key = meaningKey(entry, meaning), ids = meaningCounts.get(key) ?? new Set<string>();
    ids.add(entry.id); meaningCounts.set(key, ids);
  }
  const suggestions: WordPair[] = [];
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i], b = entries[j];
    if (a.userId !== b.userId || a.language === b.language || known.has(wordPairKey(a.id, b.id))) continue;
    const meanings = meaningsByWord.get(a.id)!, other = meaningsByWord.get(b.id)!;
    const common = meanings.filter(meaning => other.includes(meaning));
    if (!common.length) continue;
    const confidence = meanings.length === 1 && other.length === 1 ? 1 : common.length / Math.max(meanings.length, other.length);
    const competing = common.some(meaning => (meaningCounts.get(meaningKey(a, meaning))?.size ?? 0) > 1 || (meaningCounts.get(meaningKey(b, meaning))?.size ?? 0) > 1);
    suggestions.push({ id: crypto.randomUUID(), userId: a.userId, sourceWordId: a.id, targetWordId: b.id, status: "suggested", confidence: competing ? Math.min(confidence, 0.5) : confidence, warning: competing ? "Multiple words share this meaning. Check the intended sense." : confidence < 1 ? "Suggested from overlapping English answers; check the intended sense." : null });
  }
  return suggestions;
}
