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
      expect(entry.pronunciationAnswers.length).toBeGreaterThan(0);
      expect(entry.pronunciationAnswers.every(answer => answer.trim() === answer && answer.length > 0)).toBe(true);
    }
  });
  it("records exact Spanish learner-facing standard answers separately from letter names", () => {
    const entries = alphabetEntries.filter(entry => entry.language === "es");
    expect(entries.map(entry => entry.pronunciationAnswers[0])).toEqual([
      "a", "b", "k", "d", "e", "f", "g", "silent", "i", "h", "k", "l", "m", "n", "ny", "o", "p", "k", "r", "s", "t", "u", "b", "w", "ks", "y", "s",
    ]);
    expect(entries[1].name).toBe("be");
    expect(entries[1].pronunciationAnswers).toEqual(["b"]);
  });
  it("records exact modern Greek standard answers shared by uppercase and lowercase", () => {
    const expected = ["a", "v", "gh", "dh", "e", "z", "i", "th", "i", "k", "l", "m", "n", "ks", "o", "p", "r", "s", "t", "i", "f", "kh", "ps", "o"];
    for (const group of ["Uppercase", "Lowercase"]) expect(alphabetEntries.filter(entry => entry.group === group).map(entry => entry.pronunciationAnswers[0])).toEqual(expected);
    expect(alphabetEntries.find(entry => entry.symbol === "ς")!.pronunciationAnswers).toEqual(["s"]);
  });
  it.each([
    ["あ", ["a", "ah"]], ["し", ["shi", "shee"]], ["きゃ", ["kya", "kyah"]],
    ["C c", ["k", "s", "th"]], ["G g", ["g", "h", "kh"]], ["J j", ["h", "kh"]],
    ["H h", ["silent", "no sound"]], ["R r", ["r", "rr"]], ["W w", ["w", "u", "gu", "b"]],
    ["X x", ["ks", "s", "h", "kh", "sh"]], ["Y y", ["y", "sh", "zh", "i", "ee"]], ["Z z", ["s", "th"]],
    ["γ", ["gh", "y"]], ["ξ", ["ks", "x"]], ["φ", ["f", "ph"]], ["χ", ["kh", "h"]],
  ])("has explicit equivalent answers for %s", (symbol, answers) => {
    expect(alphabetEntries.find(entry => entry.symbol === symbol)!.pronunciationAnswers).toEqual(answers);
  });
});
