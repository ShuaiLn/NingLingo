import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import japanese from "../../content/grammar/generated/ja.json";
import spanish from "../../content/grammar/generated/es.json";
import greek from "../../content/grammar/generated/el.json";
import manifest from "../../content/grammar/manifest.json";
import { grammarProductionPointSchema, validateGrammarDataset } from "./grammar-content";

const dataset = [...japanese, ...spanish, ...greek];
const changed = () => structuredClone(dataset);

describe("the versioned 240-lesson production candidate dataset", () => {
  it.each(dataset.map(point => [point.id, point] as const))("validates all required content for %s", (_, point) => {
    const result = grammarProductionPointSchema.safeParse(point);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(point.status).toBe("draft");
    expect(point.reviewer).toBeNull();
    expect(point.developmentSeed).toBe(false);
    expect(point.examples).toHaveLength(3);
    expect(point.exercises).toHaveLength(5);
  });

  it("has exactly 100 Japanese, 80 Spanish, and 60 Modern Greek unique lessons", () => {
    const result = validateGrammarDataset(dataset);
    expect(result.errors).toEqual([]);
    expect(result.counts).toEqual({ ja: 100, es: 80, el: 60 });
    expect(new Set(dataset.map(point => point.id)).size).toBe(240);
  });

  it("retains pinned OpenJLPT attribution and separates review provenance", () => {
    expect(japanese.filter(point => point.level === "N5")).toHaveLength(81);
    expect(japanese.filter(point => point.level === "N4")).toHaveLength(19);
    for (const point of japanese) {
      expect(point.sources[0].version).toBe("0d1d3410bec90bd4098a7c72de820543cb4f707c");
      expect(point.sources[0].license).toBe("CC-BY-SA-4.0");
      expect(point.sources[0].attribution).toContain("OpenJLPT contributors");
    }
  });

  it("records the reference-only Kallipos noncommercial license honestly", () => {
    for (const point of greek) {
      expect(point.sources[1].license).toContain("CC-BY-NC-SA-3.0-GR");
      expect(point.sources[1].attribution).toContain("not a reviewer of NingLingo");
    }
  });

  it("matches generated file hashes and totals in the deterministic manifest", () => {
    for (const language of ["ja", "es", "el"] as const) {
      const data = readFileSync(new URL(`../../content/grammar/generated/${language}.json`, import.meta.url));
      const entry = manifest.datasets.find(entry => entry.language === language);
      expect(entry?.sha256).toBe(createHash("sha256").update(data).digest("hex"));
      expect(entry?.examples).toBe(({ ja: 100, es: 80, el: 60 })[language] * 3);
      expect(entry?.exercises).toBe(({ ja: 100, es: 80, el: 60 })[language] * 5);
    }
  });

  it("does not silently accept a missing lesson", () => {
    const result = validateGrammarDataset(dataset.slice(1));
    expect(result.errors).toContain("ja: expected 100 lessons; found 99.");
  });
  it("rejects duplicate lesson identities", () => {
    const input = changed(); input[1].id = input[0].id;
    expect(validateGrammarDataset(input).errors.some(error => error.includes("Duplicate lesson ID"))).toBe(true);
  });
  it("rejects missing translations", () => {
    const input = changed(); input[0].examples[0].translation = " ";
    expect(validateGrammarDataset(input).errors.some(error => error.includes("translation"))).toBe(true);
  });
  it("rejects insufficient example counts", () => {
    const input = changed(); input[0].examples.pop();
    expect(validateGrammarDataset(input).errors.some(error => error.includes("examples"))).toBe(true);
  });
  it("rejects insufficient exercise counts", () => {
    const input = changed(); input[0].exercises.pop();
    expect(validateGrammarDataset(input).errors.some(error => error.includes("exercises"))).toBe(true);
  });
  it("rejects equivalent Unicode distractors", () => {
    const input = changed(); input[0].exercises[0].choices = ["café", "cafe\u0301", "tea", "water"];
    expect(validateGrammarDataset(input).errors.some(error => error.includes("distinct after Unicode"))).toBe(true);
  });
  it("rejects an out-of-range answer index", () => {
    const input = changed(); input[0].exercises[0].correctIndex = 4;
    expect(validateGrammarDataset(input).errors.some(error => error.includes("Exactly one answer"))).toBe(true);
  });
  it("rejects a fractional answer index", () => {
    const input = changed(); input[0].exercises[0].correctIndex = 0.5;
    expect(validateGrammarDataset(input).errors.length).toBeGreaterThan(0);
  });
  it("rejects reviewed/published status without a real reviewer record", () => {
    for (const status of ["reviewed", "published"]) {
      const input = changed(); input[0].status = status;
      expect(validateGrammarDataset(input).errors.some(error => error.includes("real human review"))).toBe(true);
    }
  });
  it("rejects missing source version and license", () => {
    const input = changed(); input[0].sources[0].version = ""; input[0].sources[0].license = "";
    expect(validateGrammarDataset(input).errors.some(error => error.includes("sources"))).toBe(true);
  });
  it("rejects development seeds in the production candidate dataset", () => {
    const input = changed(); input[0].developmentSeed = true;
    expect(validateGrammarDataset(input).errors.some(error => error.includes("developmentSeed"))).toBe(true);
  });
});
