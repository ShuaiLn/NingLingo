import { createQuizSession } from "./quiz";
import type { QuizSession, QuizType, VocabularyEntry } from "./models";

export function testEntry(index: number, overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  return {
    id: `word-${index}`, userId: "user", language: "ja", listId: "list",
    word: `単語${index}`, reading: `たんご${index}`, translation: `meaning ${index}`,
    type: "noun", category: "test", example: "", notes: "", acceptedAnswers: [],
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...overrides,
  };
}

export function testSession(n: number, seed = 123, type: QuizType = "typing"): QuizSession {
  return createQuizSession({
    id: "session", userId: "user", language: "ja", entries: Array.from({ length: n }, (_, index) => testEntry(index)),
    type, randomSeed: seed, learningDate: "2026-10-11", dueWordIds: ["word-0"], now: "2026-10-11T10:00:00.000Z",
  });
}
