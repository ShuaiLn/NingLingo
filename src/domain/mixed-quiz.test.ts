import { describe, expect, it } from "vitest";
import { answerQuiz, createQuizSession } from "./quiz";
import { mixedQuizSetup } from "./mixed-quiz";
import { suggestWordPairs } from "./word-pairs";
import { testEntry } from "./test-fixtures";
import type { LanguageCode, QuizType, WordPair } from "./models";

const languages: LanguageCode[] = ["ja", "ko", "es", "el"];
const scripts = { ja: ["犬", "猫", "水"], ko: ["개", "고양이", "물"], es: ["perro", "gato", "agua"], el: ["σκύλος", "γάτα", "νερό"] };
const entries = languages.flatMap((language, i) => scripts[language].map((word, j) => testEntry(i * 3 + j, { language, word, reading: language === "ja" ? ["いぬ", "ねこ", "みず"][j] : language === "ko" ? "romanization must not be spoken" : "", translation: ["dog", "cat", "water"][j] })));
const base = { id: "mixed", userId: "user", language: "ja" as const, entries, type: "typing" as const, randomSeed: 42, learningDate: "2026-10-12", languages, now: "2026-10-12T12:00:00Z" };
function complete(session: ReturnType<typeof createQuizSession>) {
  let count = 0;
  while (session.status === "active") { const q = session.currentQuestion!; session = answerQuiz(session, q.inputMode === "text" ? q.acceptedAnswers[0] : q.correctChoiceId!, `attempt-${count++}`); }
  return session;
}

describe("independent and composable mixed quiz capabilities", () => {
  it("mixes all four ordinary languages without any pairs or directions", () => {
    const session = createQuizSession({ ...base, types: ["typing", "word-meaning"] });
    expect(session.entries).toHaveLength(12);
    expect(new Set(session.questionTemplates.map(q => q.sourceLanguage))).toEqual(new Set(languages));
    expect(session.questionTemplates.every(q => q.targetLanguage === "en" && !q.contextWordId)).toBe(true);
    expect(complete(session).attempts.every(a => a.correct)).toBe(true);
  });
  it("mixes ordinary, listening and translation questions in one frozen session", () => {
    let found = false;
    for (let randomSeed = 1; randomSeed <= 50; randomSeed++) {
      const session = createQuizSession({ ...base, randomSeed, types: ["typing", "listening", "translation-mcq"], listeningLanguages: ["ko"], directions: [{ source: "ja", target: "ko" }] });
      const types = new Set(session.questionTemplates.map(q => q.type));
      if (["typing", "listening", "translation-mcq"].every(type => types.has(type as QuizType))) { found = true; expect(complete(session).attempts).toHaveLength(12); break; }
    }
    expect(found).toBe(true);
  });
  it("uses multiple ordinary question types within just one language", () => {
    const session = createQuizSession({ ...base, entries: entries.filter(entry => entry.language === "ja"), languages: ["ja"], types: ["typing", "spelling", "word-meaning"] });
    expect(new Set(session.questionTemplates.map(q => q.type)).size).toBeGreaterThan(1);
    expect(session.questionTemplates.every(q => !q.contextWordId)).toBe(true);
  });
  it("can use cross-language input exclusively without ordinary question types", () => {
    const session = createQuizSession({ ...base, types: ["translation-typing"], directions: [{ source: "ja", target: "ko" }] });
    expect(session.entries).toHaveLength(3);
    expect(session.questionTemplates.every(q => q.type === "translation-typing" && q.sourceLanguage === "ja" && q.targetLanguage === "ko")).toBe(true);
    expect(complete(session).testedWordIds).toHaveLength(3);
  });
  it("never falls back when all explicitly enabled configurations are infeasible", () => {
    expect(() => createQuizSession({ ...base, types: ["translation-mcq"], directions: [] })).toThrow("No selected word pair");
    expect(() => createQuizSession({ ...base, types: ["listening"], listeningLanguages: [] })).toThrow("voice");
    expect(() => createQuizSession({ ...base, languages: ["el"], entries: entries.filter(e => e.language === "ko"), types: ["typing"] })).toThrow("not enabled");
  });
  it("explains ineligible words independently before start", () => {
    const setup = mixedQuizSetup({ ...base, types: ["japanese-reading"] });
    expect(setup.eligible).toHaveLength(3);
    expect(setup.ineligible).toHaveLength(9);
    expect(setup.ineligible.every(item => item.reason.length > 10)).toBe(true);
  });
  it("keeps every generated configuration inside user choices for 100 seeds", () => {
    for (let randomSeed = 0; randomSeed < 100; randomSeed++) {
      const enabled = ["typing", "listening", "translation-typing"] as QuizType[];
      const session = createQuizSession({ ...base, randomSeed, types: enabled, languages: ["ko", "es"], listeningLanguages: ["ko"], directions: [{ source: "es", target: "ko" }] });
      for (const q of session.questionTemplates) {
        expect(enabled).toContain(q.type);
        expect(["ko", "es"]).toContain(q.sourceLanguage);
        if (q.type === "listening") expect(q.sourceLanguage).toBe("ko");
        if (q.type === "translation-typing") expect([q.sourceLanguage, q.targetLanguage]).toEqual(["es", "ko"]);
      }
    }
  });
  it("never uses unselected vocabulary as context or distractors", () => {
    const selected = entries.filter(e => e.language === "ja" || e.language === "ko");
    const session = createQuizSession({ ...base, entries: selected, languages: ["ja", "ko"], types: ["translation-mcq"], directions: [{ source: "ja", target: "ko" }] });
    for (const q of session.questionTemplates) { expect(selected.some(e => e.id === q.contextWordId)).toBe(true); expect(q.choices.every(choice => selected.some(e => e.id === choice.id && e.language === "ko"))).toBe(true); }
  });
  it("freezes per-question modes, directions, options and order through retries and serialization", () => {
    const session = createQuizSession({ ...base, types: ["word-meaning", "translation-mcq", "listening"], listeningLanguages: ["ko"], directions: [{ source: "ja", target: "ko" }] });
    const initial = structuredClone(session.currentQuestion!);
    let retry = answerQuiz(session, "wrong", "wrong-initial");
    let count = 0;
    while (retry.currentQuestion!.wordId !== initial.wordId) { const q = retry.currentQuestion!; retry = answerQuiz(JSON.parse(JSON.stringify(retry)), q.inputMode === "text" ? q.acceptedAnswers[0] : q.correctChoiceId!, `intervening-${count++}`); }
    expect({ ...retry.currentQuestion!, id: initial.id, kind: initial.kind, position: initial.position }).toEqual(initial);
    expect(answerQuiz(retry, "different replay", "wrong-initial")).toEqual(retry);
  });
  it("is deterministic from the same seed even with several equal-confidence pair candidates", () => {
    const ambiguous = [...entries, testEntry(55, { language: "ko", word: "강아지", translation: "dog" })];
    expect(createQuizSession({ ...base, entries: ambiguous, types: ["translation-typing"], directions: [{ source: "ja", target: "ko" }] })).toEqual(createQuizSession({ ...base, entries: ambiguous, types: ["translation-typing"], directions: [{ source: "ja", target: "ko" }] }));
  });
  it("keeps accents and exact script spelling, rejecting romanization and kana readings", () => {
    for (const [language, word, reading, wrong] of [["ja", "犬", "いぬ", "いぬ"], ["ko", "물", "mul", "mul"], ["es", "café", "", "cafe"], ["el", "νερό", "", "νερο"]] as const) {
      const session = createQuizSession({ ...base, entries: [testEntry(1, { language, word, reading })], language, languages: [language], types: ["spelling"] });
      expect(answerQuiz(session, wrong).attempts[0].correct).toBe(false);
      expect(answerQuiz(session, ` ${word.normalize("NFD").toUpperCase()} `).attempts[0].correct).toBe(true);
    }
  });
  it("freezes Korean Hangul and Japanese native text for speech, including hidden listening targets", () => {
    const session = createQuizSession({ ...base, types: ["listening"], listeningLanguages: ["ja", "ko"] });
    for (const q of session.questionTemplates) { const entry = entries.find(e => e.id === q.wordId)!; expect(q.audioText).toBe(entry.word); expect(q.audioLanguage).toBe(entry.language); expect(q.prompt).not.toContain(entry.word); }
  });
  it("uses English prompt audio for meaning-to-word questions", () => {
    const session = createQuizSession({ ...base, types: ["spelling"] });
    expect(session.questionTemplates.every(q => q.audioLanguage === "en" && q.audioText === q.prompt)).toBe(true);
  });
  it("keeps ordinary choice counts between two and four and excludes equivalent meanings", () => {
    const session = createQuizSession({ ...base, types: ["word-meaning"] });
    expect(session.questionTemplates.every(q => q.choices.length >= 2 && q.choices.length <= 4 && new Set(q.choices.map(c => c.text)).size === q.choices.length)).toBe(true);
  });
});

describe("word pair suggestions", () => {
  it("warns for multiple candidates in either translation direction", () => {
    const words = [testEntry(1, { word: "犬", translation: "dog" }), testEntry(2, { word: "いぬ", translation: "dog" }), testEntry(3, { language: "ko", word: "개", translation: "dog" })];
    const suggestions = suggestWordPairs(words);
    expect(suggestions).toHaveLength(2);
    expect(suggestions.every(pair => pair.confidence <= 0.5 && pair.warning?.includes("Multiple words"))).toBe(true);
  });
  it("matches saved explicit English accepted answers across languages", () => {
    const words = [testEntry(1, { translation: "canine", acceptedAnswers: [{ id: "a", text: "dog" }] }), testEntry(2, { language: "ko", word: "개", translation: "dog" })];
    expect(suggestWordPairs(words)[0]).toMatchObject({ status: "suggested", confidence: 0.5, warning: expect.any(String) });
  });
  it("never recreates a deleted pair in either orientation", () => {
    const words = [entries[0], entries[3]];
    const pair = { ...suggestWordPairs(words)[0], sourceWordId: words[1].id, targetWordId: words[0].id, status: "deleted" as const };
    expect(suggestWordPairs(words, [pair])).toEqual([]);
    expect(mixedQuizSetup({ ...base, entries: words, pairs: [pair], types: ["translation-typing"], directions: [{ source: "ja", target: "ko" }] }).eligible).toEqual([]);
  });
  it("prioritizes a confirmed relationship and excludes other known equivalents as distractors", () => {
    const source = entries[0], target = entries[3], other = testEntry(80, { language: "ko", word: "강아지", translation: "puppy" });
    const pair = (targetWordId: string, status: WordPair["status"]): WordPair => ({ id: targetWordId, userId: "user", sourceWordId: source.id, targetWordId, status, confidence: 1, warning: null });
    const session = createQuizSession({ ...base, entries: [source, target, other, entries[4]], types: ["translation-mcq"], pairs: [pair(target.id, "suggested"), pair(other.id, "confirmed")], directions: [{ source: "ja", target: "ko" }] });
    expect(session.currentQuestion!.correctChoiceId).toBe(other.id);
    expect(session.currentQuestion!.choices.map(c => c.id)).not.toContain(target.id);
  });
});
