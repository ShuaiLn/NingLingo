import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import japanese from "../../content/grammar/generated/ja.json";
import spanish from "../../content/grammar/generated/es.json";
import greek from "../../content/grammar/generated/el.json";
import manifest from "../../content/grammar/manifest.json";
import release from "../../content/grammar/releases/2026-10-11-v2.json";
import { validateGrammarDataset } from "./grammar-content";

const drafts = [...japanese, ...spanish, ...greek];

describe("the human-approved 2026-10-11 grammar release", () => {
  it("publishes all 240 valid lessons with the exact language totals and approval record", () => {
    const result = validateGrammarDataset(release);
    expect(result.errors).toEqual([]);
    expect(result.counts).toEqual({ ja: 100, es: 80, el: 60 });
    expect(result.points).toHaveLength(240);
    for (const point of result.points) {
      expect(point).toMatchObject({ status: "published", contentVersion: 2, reviewer: { name: "ning lu", date: "2026-10-11" }, developmentSeed: false });
    }
  });

  it("includes every original lesson exactly once without renaming or dropping identities", () => {
    expect(new Set(release.map(point => point.id)).size).toBe(240);
    expect(release.map(point => point.id).sort()).toEqual(drafts.map(point => point.id).sort());
  });

  it("preserves every reviewed lesson's content, source attribution, child IDs, and original notes", () => {
    const originals = new Map(drafts.map(point => [point.id, point]));
    for (const point of release) {
      const original = originals.get(point.id);
      expect(original, point.id).toBeDefined();
      expect({ ...point, status: original!.status, reviewer: original!.reviewer, contentVersion: original!.contentVersion, modificationNotes: original!.modificationNotes }, point.id).toEqual(original);
      expect(point.modificationNotes.startsWith(`${original!.modificationNotes}\n`), point.id).toBe(true);
      expect(point.modificationNotes, point.id).toContain("Human review completed by ning lu on 2026-10-11.");
      expect(original).toMatchObject({ status: "draft", contentVersion: 1, reviewer: null });
    }
  });

  it("keeps the original generated draft files byte-identical to their pinned manifest hashes", () => {
    for (const language of ["ja", "es", "el"] as const) {
      const bytes = readFileSync(new URL(`../../content/grammar/generated/${language}.json`, import.meta.url));
      const pinned = manifest.datasets.find(dataset => dataset.language === language);
      expect(pinned).toBeDefined();
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(pinned!.sha256);
    }
  });
});
