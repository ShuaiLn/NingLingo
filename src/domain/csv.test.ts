import { describe, expect, it } from "vitest";
import { exportCsv, parseCsv, previewCsv } from "./csv";

describe("CSV parsing and preview", () => {
  it("accepts BOM, quotes, commas, escaped quotes and multiline fields", () => {
    const preview = previewCsv('\uFEFFword,reading,translation,type,category,example,notes\r\n犬,いぬ,"dog, pet",noun,animals,"A \"\"dog\"\".\r\nSecond line.",', [], "ja", "list");
    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0].input.translation).toBe("dog, pet");
    expect(preview.valid[0].input.example).toBe('A "dog".\nSecond line.');
  });
  it("reports required fields, field count, malformed quotes and physical line numbers", () => {
    const preview = previewCsv('word,translation\n,dog\n猫,\n鳥,bird,extra\n"魚,fish', [], "ja", "list");
    expect(preview.invalid).toHaveLength(4);
    expect(preview.invalid[0].line).toBe(2);
    expect(preview.invalid[3].errors).toContain("Unclosed quoted field.");
  });
  it("skips exact duplicates but retains homographs and accents", () => {
    const preview = previewCsv('word,reading,translation\n生,せい,life\n生,せい,life\n生,なま,raw\naño,,year\nano,,anus', [], "ja", "list");
    expect(preview.valid).toHaveLength(4);
    expect(preview.duplicates).toHaveLength(1);
  });
  it("recognizes existing duplicates and rejects bad headers", () => {
    const initial = previewCsv('word,translation\n犬,dog', [], "ja", "list").valid[0].input;
    const existing = { ...initial, id: "a", userId: "user", createdAt: "now", updatedAt: "now" };
    expect(previewCsv('word,translation\n犬,dog', [existing], "ja", "list").duplicates).toHaveLength(1);
    expect(previewCsv('word,word\n犬,犬', [], "ja", "list").headerErrors).toContain("Missing required header: translation.");
    expect(previewCsv('word,translation\n 犬 , dog ', [existing], "ja", "list").duplicates).toHaveLength(1);
  });
  it("round-trips all columns and never loses accents or empty optional fields", () => {
    const input = previewCsv('word,translation,notes\nκόσμος,world,"comma, quote \"\"\"\""', [], "el", "list").valid[0].input;
    const output = exportCsv([input]);
    expect(output.startsWith("\uFEFF")).toBe(true);
    expect(previewCsv(output, [], "el", "list").valid[0].input).toEqual(input);
    expect(parseCsv("\n\n")).toEqual([]);
  });
  it("rejects missing mandatory headers without importing later rows", () => {
    const missingWord = previewCsv("translation,notes\ndog,note", [], "ja", "list");
    expect(missingWord.headerErrors).toContain("Missing required header: word.");
    expect(missingWord.valid).toHaveLength(0);
    expect(missingWord.invalid[0].errors).toContain("Fix the CSV header before importing.");
    expect(previewCsv("", [], "es", "list").headerErrors).toHaveLength(1);
  });
  it("tracks physical row starts after a multiline quoted field", () => {
    const rows = parseCsv('word,translation,notes\r\n犬,dog,"first\r\nsecond"\r\n猫,cat,');
    expect(rows.map((row) => row.line)).toEqual([1, 2, 4]);
    expect(rows[2].fields).toEqual(["猫", "cat", ""]);
  });
  it.each(['word,translation\n"犬"x,dog', 'word,translation\n犬"x,dog', 'word,translation\n"犬,dog']) ("reports malformed quote boundaries: %s", (source) => {
    const preview = previewCsv(source, [], "ja", "list");
    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid).toHaveLength(1);
    expect(preview.invalid[0].errors.length).toBeGreaterThan(0);
  });
  it("supports quoted empty optional values and retains multiple escaped quotes", () => {
    const preview = previewCsv('word,reading,translation,notes\n"犬","","dog","Say \"\"yes\"\" or \"\"no\"\"."', [], "ja", "list");
    expect(preview.valid[0].input.notes).toBe('Say "yes" or "no".');
    expect(preview.valid[0].input.reading).toBe("");
    expect(preview.invalid).toHaveLength(0);
  });
});
