import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGrammarImportOptions } from "../../scripts/grammar-import-options";

describe("administrative grammar import options", () => {
  it("keeps the explicit draft import and validation commands", () => {
    expect(parseGrammarImportOptions([])).toEqual({ validateOnly: false });
    expect(parseGrammarImportOptions(["--validate-only"])).toEqual({ validateOnly: true });
  });

  it.each([
    ["--reviewed-file=content/approved.json", "--validate-only"],
    ["--validate-only", "--reviewed-file", "content/approved.json"],
  ])("accepts either reviewed-file syntax without losing validation", (...args) => {
    expect(parseGrammarImportOptions(args)).toEqual({ reviewedFile: "content/approved.json", validateOnly: true });
  });

  it("preserves spaces and equals signs in reviewed-file paths", () => {
    expect(parseGrammarImportOptions(["--reviewed-file=content/review ready=2.json"]).reviewedFile).toBe("content/review ready=2.json");
  });

  it.each([
    ["--reviewed-file"],
    ["--reviewed-file="],
    ["--reviewed-file=   "],
    ["--reviewed-file", "--validate-only"],
  ])("rejects a missing reviewed-file path", (...args) => {
    expect(() => parseGrammarImportOptions(args)).toThrow("requires a nonempty file path");
  });

  it.each([
    ["--reviewed-file=a.json", "--reviewed-file", "b.json"],
    ["--validate-only", "--validate-only"],
  ])("rejects duplicate options", (...args) => {
    expect(() => parseGrammarImportOptions(args)).toThrow("Duplicate");
  });

  it.each([
    ["--review-file=approved.json"],
    ["--validate-only=false"],
    ["approved.json"],
    ["--reviewed-file=approved.json", "unexpected"],
  ])("rejects unknown options and stray positional arguments", (...args) => {
    expect(() => parseGrammarImportOptions(args)).toThrow("Unknown or malformed");
  });

  it("fails a mistyped import option before reading credentials or making a database request", () => {
    const run = () => execFileSync(process.execPath, ["--experimental-strip-types", resolve("scripts/grammar-import.mjs"), "--review-file=approved.json"], {
      cwd: process.env.TEMP || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
    });
    try {
      run();
      throw new Error("Expected invalid import option to fail.");
    } catch (error) {
      expect(error).toMatchObject({ status: 1 });
      expect(String((error as { stderr?: string }).stderr)).toContain("Unknown or malformed grammar import option: --review-file=approved.json");
      expect(String((error as { stdout?: string }).stdout)).not.toContain("Validated 240");
    }
  });
});
