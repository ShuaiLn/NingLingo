import type { LanguageCode, LookupRequest, LookupResult, Reading, ReadingAnnotation, TranslationCacheEntry, TranslationProvider, VocabularyEntry } from "./models";

export interface ReadingToken { text: string; start: number; end: number; word: boolean; vocabularyEntryId?: string }

function normalized(text: string, language: LanguageCode): string {
  return language === "ja" ? text.normalize("NFC") : text.normalize("NFC").toLocaleLowerCase(language);
}

/** Positions always refer to the original body's UTF-16 offsets, including accents. */
export function tokenizeReading(body: string, language: LanguageCode, entries: VocabularyEntry[]): ReadingToken[] {
  const dictionary = entries.filter(entry => entry.language === language && entry.word).sort((a, b) => b.word.length - a.word.length);
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  if (language !== "ja") {
    return [...segmenter.segment(body)].map(segment => {
      const entry = segment.isWordLike ? dictionary.find(item => normalized(item.word, language) === normalized(segment.segment, language)) : undefined;
      return { text: segment.segment, start: segment.index, end: segment.index + segment.segment.length, word: Boolean(segment.isWordLike), vocabularyEntryId: entry?.id };
    });
  }
  const tokens: ReadingToken[] = [];
  const segments = [...segmenter.segment(body)];
  let segmentIndex = 0;
  let position = 0;
  while (position < body.length) {
    const known = dictionary.find(entry => body.startsWith(entry.word, position));
    if (known) {
      tokens.push({ text: known.word, start: position, end: position + known.word.length, word: true, vocabularyEntryId: known.id });
      position += known.word.length;
      continue;
    }
    while (segmentIndex < segments.length && segments[segmentIndex].index + segments[segmentIndex].segment.length <= position) segmentIndex++;
    const first = segments[segmentIndex];
    if (!first) break;
    let end = first.index + first.segment.length;
    // A known phrase can start inside an otherwise unknown inflected segment.
    for (let candidate = position + 1; candidate < end; candidate++) {
      if (dictionary.some(entry => body.startsWith(entry.word, candidate))) { end = candidate; break; }
    }
    tokens.push({ text: body.slice(position, end), start: position, end, word: Boolean(first.isWordLike) });
    position = end;
  }
  return tokens;
}

export function assertLookupRange(reading: Reading, request: LookupRequest): void {
  if (request.readingId !== reading.id) throw new Error("This lookup belongs to a different reading.");
  if (request.bodyVersion !== reading.version) throw new Error("The reading has changed. Select the text again in the latest version.");
  if (!Number.isInteger(request.start) || !Number.isInteger(request.end) || request.start < 0 || request.end > reading.body.length || request.start >= request.end) throw new Error("Select a non-empty text range inside this reading.");
}

export function contextForRange(body: string, start: number, end: number): string {
  const stops = /[.!?。！？;\u037e\u0387\u00b7\n]/u;
  let left = start;
  while (left > 0 && !stops.test(body[left - 1])) left--;
  let right = end;
  while (right < body.length && !stops.test(body[right])) right++;
  if (right < body.length && body[right] !== "\n") right++;
  return body.slice(left, right).trim();
}

export function translationCacheKey(input: { userId: string; language: LanguageCode; text: string; context: string }): string {
  return JSON.stringify([input.userId, input.language, input.text.normalize("NFC"), input.context.normalize("NFC")]);
}

export interface ReadingLookupInput {
  userId: string;
  reading: Reading;
  request: LookupRequest;
  entries: VocabularyEntry[];
  annotations: ReadingAnnotation[];
  cache: TranslationCacheEntry[];
  storeCache: (entry: TranslationCacheEntry) => Promise<void>;
}

/** Manual annotation → personal vocabulary → sentence-specific cache → provider. */
export function knownReadingLookup(input: ReadingLookupInput): LookupResult | null {
  const { reading, request, userId } = input;
  assertLookupRange(reading, request);
  if (reading.userId !== userId) throw new Error("This reading does not belong to the current user.");
  const text = reading.body.slice(request.start, request.end);
  const annotation = input.annotations
    .filter(row => row.userId === userId && row.readingId === reading.id && row.bodyVersion === reading.version && row.start <= request.start && row.end >= request.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
  if (annotation) return { text, translation: annotation.translation, reading: annotation.reading, source: "annotation", vocabularyEntryId: annotation.vocabularyEntryId };
  const entry = input.entries.find(row => row.userId === userId && row.language === reading.language && normalized(row.word, reading.language) === normalized(text, reading.language));
  if (entry) return { text, translation: entry.translation, reading: entry.reading, source: "vocabulary", vocabularyEntryId: entry.id };
  const context = contextForRange(reading.body, request.start, request.end);
  const key = translationCacheKey({ userId, language: reading.language, text, context });
  const cached = input.cache.find(row => (row.lookupKind ?? "reading") === "reading" && translationCacheKey(row) === key);
  if (cached) return { text, translation: cached.translation, reading: "", source: "cache", vocabularyEntryId: null };
  return null;
}

export class ReadingLookupService {
  private readonly inflight = new Map<string, Promise<LookupResult>>();
  constructor(private readonly provider: TranslationProvider) {}

  async lookup(input: ReadingLookupInput): Promise<LookupResult> {
    const known = knownReadingLookup(input);
    if (known) return known;
    const { reading, request, userId } = input;
    const text = reading.body.slice(request.start, request.end);
    const context = contextForRange(reading.body, request.start, request.end);
    const key = translationCacheKey({ userId, language: reading.language, text, context });
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const lookup = (async () => {
      const result = await this.provider.translate({ userId, language: reading.language, text, context });
      await input.storeCache({ id: crypto.randomUUID(), userId, language: reading.language, text, context, translation: result.translation, source: result.source, lookupKind: "reading", createdAt: new Date().toISOString() });
      return { text, translation: result.translation, reading: "", source: result.source, vocabularyEntryId: null } satisfies LookupResult;
    })();
    this.inflight.set(key, lookup);
    try { return await lookup; } finally { this.inflight.delete(key); }
  }
}

export function planReadingEdit(reading: Reading, body: string, annotations: ReadingAnnotation[], clearAnnotations = false): { changed: boolean; version: number; annotations: ReadingAnnotation[] } {
  const changed = body !== reading.body;
  const current = annotations.filter(row => row.readingId === reading.id && row.bodyVersion === reading.version);
  if (changed && current.length > 0 && !clearAnnotations) throw new Error("Changing the body invalidates positional annotations. Confirm that existing annotations should be cleared.");
  return { changed, version: changed ? reading.version + 1 : reading.version, annotations: changed ? annotations.filter(row => row.readingId !== reading.id) : annotations };
}
