import type { VocabularyEntry } from "@/domain/models";
import { kanaDisplay } from "@/domain/languages";
export function WordText({ entry, mode = "katakana", hideReading = false }: { entry: Pick<VocabularyEntry, "word" | "reading" | "language">; mode?: "hiragana" | "katakana"; hideReading?: boolean }) {
  if (entry.language !== "ja") return <span lang={entry.language}>{entry.word}</span>;
  const word = kanaDisplay(entry.word, mode);
  return entry.reading && !hideReading ? <ruby lang="ja">{word}<rp>(</rp><rt>{kanaDisplay(entry.reading, mode)}</rt><rp>)</rp></ruby> : <span lang="ja">{word}</span>;
}
