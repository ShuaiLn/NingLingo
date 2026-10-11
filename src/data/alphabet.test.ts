import { describe, expect, it } from "vitest";
import { alphabetEntries } from "./alphabet";

describe("alphabet development data", () => {
  it("covers both basic kana scripts, all marked kana and yōon", () => {
    expect(alphabetEntries.filter((entry) => entry.group === "Hiragana")).toHaveLength(46);
    expect(alphabetEntries.filter((entry) => entry.group === "Katakana")).toHaveLength(46);
    for (const script of ["Hiragana", "Katakana"]) {
      expect(alphabetEntries.filter((entry) => entry.group === `Dakuten · ${script}`)).toHaveLength(21);
      expect(alphabetEntries.filter((entry) => entry.group === `Handakuten · ${script}`)).toHaveLength(5);
      expect(alphabetEntries.filter((entry) => entry.group === `Yōon · ${script}`)).toHaveLength(33);
    }
  });
  it("covers Spanish ñ and all Greek cases including final sigma", () => {
    expect(alphabetEntries.filter((entry) => entry.language === "es")).toHaveLength(27);
    expect(alphabetEntries.find((entry) => entry.symbol === "Ñ ñ")).toBeDefined();
    expect(alphabetEntries.filter((entry) => entry.group === "Uppercase")).toHaveLength(24);
    expect(alphabetEntries.filter((entry) => entry.group === "Lowercase")).toHaveLength(24);
    expect(alphabetEntries.find((entry) => entry.symbol === "ς")).toBeDefined();
  });
  it("has unique IDs and complete letter/audio/example metadata", () => {
    expect(new Set(alphabetEntries.map((entry) => entry.id)).size).toBe(alphabetEntries.length);
    for (const entry of alphabetEntries) {
      expect(entry.symbol && entry.name && entry.pronunciation && entry.example && entry.exampleTranslation && entry.audioText).toBeTruthy();
    }
  });
});
