import { describe, expect, it, vi } from "vitest";
import { DEEPL_MAX_REQUEST_BYTES, DeepLTranslationProvider, deepLTranslationBatches } from "./deepl";
const input = { userId: "user-a", language: "el" as const, text: "κόσμος", context: "Ο κόσμος είναι όμορφος." };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
describe("server DeepL provider", () => {
  it("sends Korean Hangul with the KO source code and retains pronunciation outside translation input", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ character_count: 0, character_limit: 1000000 })).mockResolvedValueOnce(json({ translations: [{ text: "water" }] }));
    const provider = new DeepLTranslationProvider({ key: "test-server-key" }, fetcher);
    expect(await provider.translate({ userId: "user", language: "ko", text: "물", context: "물을 마셔요." })).toEqual({ translation: "water", source: "deepl" });
    const payload = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(payload).toMatchObject({ text: ["물"], source_lang: "KO", target_lang: "EN", context: "물을 마셔요." });
    expect(JSON.stringify(payload)).not.toContain("mul");
  });
  it("translates only selected text with sentence context, explicit source, and English target", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ character_count: 7, character_limit: 1000000 })).mockResolvedValueOnce(json({ translations: [{ text: "world" }] }));
    const provider = new DeepLTranslationProvider({ key: "test-server-key", baseUrl: "https://api.deepl.com" }, fetcher);
    expect(await provider.translate(input)).toEqual({ translation: "world", source: "deepl" });
    const [url, options] = fetcher.mock.calls[1];
    expect(url).toBe("https://api.deepl.com/v2/translate");
    expect(JSON.parse(String(options?.body))).toEqual({ text: ["κόσμος"], source_lang: "EL", target_lang: "EN", context: input.context, preserve_formatting: true });
    expect(options?.headers).toMatchObject({ Authorization: "DeepL-Auth-Key test-server-key" });
  });
  it("reads actual usage and does not assume a monthly reset", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ character_count: 999999, character_limit: 1000000 }));
    const provider = new DeepLTranslationProvider({ key: "test" }, fetcher);
    expect(await provider.usage()).toEqual({ used: 999999, limit: 1000000, available: true });
    await expect(provider.translate(input)).rejects.toThrow("allowance");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retains manual translation when configuration is absent", async () => {
    const provider = new DeepLTranslationProvider({});
    expect((await provider.usage()).available).toBe(false);
    await expect(provider.translate(input)).rejects.toThrow("manually");
  });
  it.each([403, 429, 456, 503])("handles service failure %s without exposing provider payload or credentials", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ character_count: 0, character_limit: 1000000 })).mockResolvedValueOnce(json({ message: "sensitive-provider-detail" }, status));
    const provider = new DeepLTranslationProvider({ key: "test-key" }, fetcher);
    await expect(provider.translate(input)).rejects.toThrow(/manually/);
  });
  it("handles network failure and invalid machine responses", async () => {
    const failed = new DeepLTranslationProvider({ key: "test" }, vi.fn<typeof fetch>().mockRejectedValue(new Error("network")));
    await expect(failed.translate(input)).rejects.toThrow("manually");
    const empty = new DeepLTranslationProvider({ key: "test" }, vi.fn<typeof fetch>().mockResolvedValueOnce(json({ character_count: 0, character_limit: 1000000 })).mockResolvedValueOnce(json({ translations: [] })));
    await expect(empty.translate(input)).rejects.toThrow("no translation");
  });
  it("rejects endpoint redirection that could leak the key", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new DeepLTranslationProvider({ key: "private", baseUrl: "https://attacker.invalid" }, fetcher).usage()).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("translates an ordered word batch with English target and empty context", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ character_count: 0, character_limit: 1000000 })).mockResolvedValueOnce(json({ translations: [{ text: "dog" }, { text: "cat" }] }));
    const provider = new DeepLTranslationProvider({ key: "test-server-key" }, fetcher);
    expect(await provider.translateMany({ userId: "user-a", language: "ja", texts: ["犬", "猫"], context: "" })).toEqual([{ translation: "dog", source: "deepl" }, { translation: "cat", source: "deepl" }]);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ text: ["犬", "猫"], source_lang: "JA", target_lang: "EN", context: "", preserve_formatting: true });
  });
  it("splits by the UTF-8 size of the complete JSON request while preserving input order", async () => {
    const words = Array.from({ length: 25 }, (_, index) => "犬".repeat(1990) + index);
    const batches = deepLTranslationBatches("ja", words);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toEqual(words);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
      if (String(url).endsWith("usage")) return json({ character_count: 0, character_limit: 1000000 });
      const body = String(options?.body);
      expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(DEEPL_MAX_REQUEST_BYTES);
      const texts = JSON.parse(body).text as string[];
      expect(texts.length).toBeLessThanOrEqual(25);
      return json({ translations: texts.map(text => ({ text: "translated " + text })) });
    });
    const translated = await new DeepLTranslationProvider({ key: "test" }, fetcher).translateMany({ userId: "user-a", language: "ja", texts: words, context: "" });
    expect(translated.map(row => row.translation)).toEqual(words.map(word => "translated " + word));
    expect(fetcher).toHaveBeenCalledTimes(1 + batches.length);
    expect(deepLTranslationBatches("es", Array.from({ length: 26 }, (_, index) => String(index))).map(batch => batch.length)).toEqual([25, 1]);
  });
  it("validates the unique-batch cap and allowance before sending any text", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ character_count: 999999, character_limit: 1000000 }));
    const provider = new DeepLTranslationProvider({ key: "test" }, fetcher);
    await expect(provider.translateMany({ userId: "user", language: "ja", texts: Array.from({ length: 26 }, () => "犬"), context: "" })).rejects.toThrow("25");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(provider.translateMany({ userId: "user", language: "ja", texts: ["犬", "猫"], context: "" })).rejects.toThrow("allowance");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps successful UTF-8 subbatches when a later provider request fails", async () => {
    const words = Array.from({ length: 25 }, (_, index) => "猫".repeat(1990) + index);
    const batches = deepLTranslationBatches("ja", words);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ character_count: 0, character_limit: 1000000 })).mockResolvedValueOnce(json({ translations: batches[0].map(() => ({ text: "cat" })) })).mockResolvedValueOnce(json({ message: "private provider error" }, 429));
    const translated = await new DeepLTranslationProvider({ key: "test" }, fetcher).translateMany({ userId: "user", language: "ja", texts: words, context: "" });
    expect(translated).toHaveLength(25);
    expect(translated.slice(0, batches[0].length).every(row => row.translation === "cat" && !row.error)).toBe(true);
    expect(translated.slice(batches[0].length).every(row => row.translation === "" && row.error?.includes("busy"))).toBe(true);
    expect(JSON.stringify(translated)).not.toContain("private provider error");
  });
});
