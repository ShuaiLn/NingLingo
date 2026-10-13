import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import korean from "../../content/grammar/generated/ko.json";
import manifest from "../../content/grammar/manifest.json";
import { koreanGrammar } from "../data/grammar";
import { alphabetEntries } from "../data/alphabet";
import { seedVocabulary, seedVocabularyLists } from "../data/vocabulary";
import { authDestination } from "../lib/auth";
import { grammarProductionPointSchema, validateGrammarDataset } from "./grammar-content";
import { grammarContentIssues, scoreGrammarExercises } from "./grammar";
import { isLanguage, LANGUAGES } from "./languages";
import { tokenizeReading } from "./reading";

describe("Korean workspace and original AI learning material", () => {
  it("supports the native language, locale, auth destination, vocabulary and lists", () => {
    expect(isLanguage("ko")).toBe(true);
    expect(LANGUAGES.ko).toMatchObject({ name: "Korean", nativeName: "한국어", locale: "ko-KR" });
    expect(authDestination("/ko/reading?from=dashboard")).toBe("/ko/reading?from=dashboard");
    expect(seedVocabularyLists("user").filter(list => list.language === "ko")).toHaveLength(1);
    const entries = seedVocabulary("user").filter(entry => entry.language === "ko");
    expect(entries).toHaveLength(14);
    expect(entries.every(entry => /[가-힣]/u.test(entry.word))).toBe(true);
    expect(entries.find(entry => entry.word === "물")).toMatchObject({ reading: "mul", translation: "water" });
  });

  it("has exactly 40 Hangul cards with the required four groups", () => {
    const entries = alphabetEntries.filter(entry => entry.language === "ko");
    expect(entries).toHaveLength(40);
    expect(new Set(entries.map(entry => entry.symbol)).size).toBe(40);
    for (const [group, count] of [["Basic consonants", 14], ["Basic vowels", 10], ["Tense consonants", 5], ["Compound vowels", 11]] as const) expect(entries.filter(entry => entry.group === group)).toHaveLength(count);
    for (const entry of entries) {
      expect(entry.audioText).toMatch(/^[가-힣]+$/u);
      expect(entry.example).toMatch(/[가-힣]/u);
      expect(entry.notes?.length).toBeGreaterThan(30);
      expect(entry.pronunciationAnswers.length).toBeGreaterThan(0);
      expect(entry.pronunciationAnswers.every(answer => /^[a-z ]+$/u.test(answer))).toBe(true);
      expect(entry.audioKind).toBe(entry.group.includes("vowels") ? "example-syllable" : "letter-name");
    }
    expect(entries.find(entry => entry.symbol === "ㅇ")?.notes).toContain("Final ㅇ is ng");
    expect(entries.find(entry => entry.symbol === "ㄱ")?.audioText).toBe("기역");
    expect(entries.find(entry => entry.symbol === "ㅏ")?.audioText).toBe("아");
    expect(alphabetEntries[0].id).toBe("ja-hiragana-あ");
  });

  it("recognizes saved Korean words before attached particles without changing reading offsets", () => {
    const body = "오늘 물을 마셔요. 고양이가 있어요.";
    const tokens = tokenizeReading(body, "ko", seedVocabulary("user"));
    expect(tokens.map(token => token.text).join("")).toBe(body);
    for (const token of tokens) expect(body.slice(token.start, token.end)).toBe(token.text);
    expect(tokens.find(token => token.text === "물")).toMatchObject({ word: true, vocabularyEntryId: "word-ko-3" });
    expect(tokens.find(token => token.text === "고양이")).toMatchObject({ word: true, vocabularyEntryId: "word-ko-2" });
  });

  it.each(korean.map(point => [point.id, point] as const))("fully validates the independently published lesson %s", (_, point) => {
    expect(grammarProductionPointSchema.safeParse(point).success).toBe(true);
    expect(point).toMatchObject({ language: "ko", status: "published-ai", reviewer: null, developmentSeed: false });
    expect(point.modificationNotes).toContain("AI-authored; not human-reviewed");
    expect(point.examples).toHaveLength(3);
    expect(point.exercises).toHaveLength(5);
    expect(point.examples.every(example => /[가-힣]/u.test(example.text) && example.translation.length > 5)).toBe(true);
    expect(point.exercises.every(exercise => exercise.choices.length === 4)).toBe(true);
    const runtime = koreanGrammar.find(lesson => lesson.id === point.id)!;
    expect(grammarContentIssues(runtime)).toEqual([]);
    expect(scoreGrammarExercises(runtime.exercises, runtime.exercises.map(exercise => exercise.correctIndex))).toEqual({ correct: 5, total: 5, percentage: 100, completed: true });
  });

  it("validates exactly 60 unique lessons and the manifest integrity", () => {
    expect(validateGrammarDataset(korean, { ko: 60 })).toMatchObject({ errors: [], counts: { ko: 60 } });
    const bytes = readFileSync(new URL("../../content/grammar/generated/ko.json", import.meta.url));
    expect(manifest.datasets.find(entry => entry.language === "ko")).toMatchObject({ lessons: 60, examples: 180, exercises: 300, status: "published-ai", humanReview: "pending", sha256: createHash("sha256").update(bytes).digest("hex") });
    expect(validateGrammarDataset(korean.slice(1), { ko: 60 }).errors).toContain("ko: expected 60 lessons; found 59.");
  });

  it("rejects missing AI disclosure and falsely claimed human review", () => {
    for (const changes of [{ modificationNotes: "Ready for learning." }, { reviewer: { name: "Pretend reviewer", date: "2026-10-12" } }, { status: "published" }]) {
      expect(grammarProductionPointSchema.safeParse({ ...korean[0], ...changes }).success).toBe(false);
    }
  });
});
