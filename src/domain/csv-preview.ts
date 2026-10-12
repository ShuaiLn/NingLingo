import { classifyCsvRows, type CsvPreview } from "./csv";
import type { VocabularyEntry, VocabularyTranslationResult } from "./models";

export const normalizedCsvWord = (word: string): string => word.trim().normalize("NFC");

/** Deduplicate the entire preview before API batching; preserve case and first-seen order. */
export function unresolvedCsvQueries(preview: CsvPreview): { line: number; word: string }[] {
  const seen = new Set<string>();
  return preview.unresolved.filter(row => !row.resolving).flatMap(row => {
    const word = normalizedCsvWord(row.input.word);
    if (seen.has(word)) return [];
    seen.add(word);
    return [{ line: row.line, word }];
  });
}

/** Both guards are required, including edits that clear a previously manual translation. */
export function applyCsvTranslations(preview: CsvPreview, results: VocabularyTranslationResult[], generation: number, editRevisions: Map<number, number>, existing: VocabularyEntry[]): CsvPreview {
  if (preview.generation !== generation) return preview;
  const byWord = new Map(results.map(result => [normalizedCsvWord(result.word), result]));
  const rows = preview.rows.map(row => {
    if (row.editRevision !== editRevisions.get(row.line) || row.input.translation.trim() || row.errors.length) return row;
    const result = byWord.get(normalizedCsvWord(row.input.word));
    if (!result) return row;
    const translation = result.error ? "" : result.translation.trim();
    return { ...row, input: { ...row.input, translation }, resolving: false, translationSource: translation ? result.source : null, translationError: result.error || (translation ? "" : "No English meaning was returned. Enter one manually or retry.") };
  });
  return classifyCsvRows(rows, existing, preview.language, preview.headerErrors, preview.generation);
}

export function editCsvTranslation(preview: CsvPreview, line: number, translation: string, existing: VocabularyEntry[]): CsvPreview {
  const rows = preview.rows.map(row => row.line === line ? { ...row, input: { ...row.input, translation }, editRevision: row.editRevision + 1, resolving: false, translationSource: "manual" as const, translationError: "" } : row);
  return classifyCsvRows(rows, existing, preview.language, preview.headerErrors, preview.generation);
}
