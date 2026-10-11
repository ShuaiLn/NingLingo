import { describe, expect, it, vi } from "vitest";
import { DeepLTranslationProvider } from "./deepl";
const input = { userId: "user-a", language: "el" as const, text: "κόσμος", context: "Ο κόσμος είναι όμορφος." };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
describe("server DeepL provider", () => {
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
});
