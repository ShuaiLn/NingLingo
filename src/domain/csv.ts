import type { LanguageCode, VocabularyEntry, VocabularyInput } from "./models";

export const CSV_COLUMNS = ["word", "reading", "translation", "type", "category", "example", "notes"] as const;
export interface CsvRecord { line: number; fields: string[]; errors: string[] }
export interface CsvPreviewRow { line: number; input: VocabularyInput; errors: string[] }
export interface CsvPreview { valid: CsvPreviewRow[]; duplicates: CsvPreviewRow[]; invalid: CsvPreviewRow[]; headerErrors: string[] }

/** RFC 4180-style parser, with physical line numbers and recoverable row errors. */
export function parseCsv(source: string): CsvRecord[] {
  const text = source.replace(/^\uFEFF/, "");
  const rows: CsvRecord[] = [];
  let fields: string[] = [], field = "", errors: string[] = [], quoted = false, closedQuote = false;
  let line = 1, rowLine = 1, touched = false;
  function pushField() { fields.push(field); field = ""; closedQuote = false; }
  function pushRow() {
    pushField();
    if (touched || fields.some((value) => value.length > 0)) rows.push({ line: rowLine, fields, errors });
    fields = []; errors = []; touched = false;
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        field += "\n"; line++;
      } else field += ch;
      continue;
    }
    if (ch === ",") { touched = true; pushField(); }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushRow(); line++; rowLine = line;
    } else if (ch === '"') {
      touched = true;
      if (field.length === 0 && !closedQuote) quoted = true;
      else { errors.push("Unexpected quote in an unquoted field."); field += ch; }
    } else {
      touched = true;
      if (closedQuote) errors.push("Unexpected character after a closing quote.");
      field += ch;
    }
  }
  if (quoted) errors.push("Unclosed quoted field.");
  if (touched || field.length || fields.length) pushRow();
  return rows;
}

export function vocabularyDuplicateKey(entry: Pick<VocabularyEntry, "word" | "reading" | "translation">): string {
  return JSON.stringify([entry.word.normalize("NFC"), entry.reading.normalize("NFC"), entry.translation.normalize("NFC")]);
}

export function previewCsv(source: string, existing: VocabularyEntry[], language: LanguageCode, listId: string): CsvPreview {
  const records = parseCsv(source);
  const result: CsvPreview = { valid: [], duplicates: [], invalid: [], headerErrors: [] };
  const header = records.shift();
  if (!header) { result.headerErrors.push("The CSV is empty. Include a header with word and translation."); return result; }
  const names = header.fields.map((field) => field.trim());
  result.headerErrors.push(...header.errors);
  for (const required of ["word", "translation"]) if (!names.includes(required)) result.headerErrors.push(`Missing required header: ${required}.`);
  for (const name of names) {
    if (!(CSV_COLUMNS as readonly string[]).includes(name)) result.headerErrors.push(`Unknown header: ${name || "(empty)"}.`);
    if (names.filter((value) => value === name).length > 1) result.headerErrors.push(`Repeated header: ${name}.`);
  }
  result.headerErrors = [...new Set(result.headerErrors)];
  const seen = new Set(existing.filter((entry) => entry.language === language).map(vocabularyDuplicateKey));
  for (const record of records) {
    const get = (key: string) => { const index = names.indexOf(key); return index < 0 ? "" : (record.fields[index] ?? ""); };
    const input: VocabularyInput = { language, listId, word: get("word").trim(), reading: get("reading").trim(), translation: get("translation").trim(), type: get("type"), category: get("category"), example: get("example"), notes: get("notes"), acceptedAnswers: [] };
    const errors = [...new Set(record.errors)];
    if (record.fields.length !== names.length) errors.push(`Expected ${names.length} fields; received ${record.fields.length}.`);
    if (!input.word.trim()) errors.push("Word is required.");
    if (!input.translation.trim()) errors.push("Translation is required.");
    if (result.headerErrors.length) errors.push("Fix the CSV header before importing.");
    const row = { line: record.line, input, errors };
    if (errors.length) result.invalid.push(row);
    else {
      const key = vocabularyDuplicateKey(input);
      if (seen.has(key)) result.duplicates.push(row);
      else { seen.add(key); result.valid.push(row); }
    }
  }
  return result;
}

export function exportCsv(entries: Pick<VocabularyEntry, typeof CSV_COLUMNS[number]>[], includeBom = true): string {
  const quote = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return (includeBom ? "\uFEFF" : "") + [CSV_COLUMNS.join(","), ...entries.map((entry) => CSV_COLUMNS.map((column) => quote(entry[column])).join(","))].join("\r\n");
}
