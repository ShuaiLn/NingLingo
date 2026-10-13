import type { LanguageCode, TranslationProvider } from "@/domain/models";
interface DeepLConfig { key?: string; baseUrl?: string }
const sourceLanguages: Record<LanguageCode, string> = { ja: "JA", es: "ES", el: "EL", ko: "KO" };
export const DEEPL_MAX_REQUEST_BYTES = 128 * 1024;
/** DeepL's byte limit applies to the entire UTF-8 JSON body, not JavaScript string length. */
export function deepLTranslationBatches(language: LanguageCode, texts: string[], context = ""): string[][] {
  const body = (items: string[]) => ({ text: items, source_lang: sourceLanguages[language], target_lang: "EN", context: context.slice(0, 12000), preserve_formatting: true });
  const bytes = (items: string[]) => new TextEncoder().encode(JSON.stringify(body(items))).length;
  const batches: string[][] = [];
  let batch: string[] = [];
  for (const text of texts) {
    if (bytes([text]) > DEEPL_MAX_REQUEST_BYTES) throw new Error("This word is too large for translation. Enter an English meaning manually.");
    if (batch.length === 25 || bytes([...batch, text]) > DEEPL_MAX_REQUEST_BYTES) { batches.push(batch); batch = []; }
    batch.push(text);
  }
  if (batch.length) batches.push(batch);
  return batches;
}
/** Instantiate on the server only. Injected configuration keeps secrets out of browser code. */
export class DeepLTranslationProvider implements TranslationProvider {
  private usageCache: { value: { used: number; limit: number; available: boolean }; at: number } | null = null;
  constructor(private readonly config: DeepLConfig, private readonly request: typeof fetch = fetch) {}
  private endpoint(path: string) {
    const base = this.config.baseUrl ?? "https://api.deepl.com";
    const url = new URL(base);
    if (url.protocol !== "https:" || !["api.deepl.com", "api-free.deepl.com"].includes(url.hostname) || url.username || url.password) throw new Error("DeepL endpoint configuration is invalid. Manual translation is available.");
    return `${url.origin}/v2/${path}`;
  }
  private async send(path: string, body?: unknown): Promise<unknown> {
    if (!this.config.key) throw new Error("DeepL is not configured. You can enter a translation manually.");
    let response: Response;
    try { response = await this.request(this.endpoint(path), { method: body ? "POST" : "GET", headers: { Authorization: `DeepL-Auth-Key ${this.config.key}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000), cache: "no-store" }); }
    catch { throw new Error("DeepL could not be reached. You can enter a translation manually."); }
    if (response.status === 456) { this.usageCache = null; throw new Error("DeepL character allowance is exhausted. You can enter a translation manually."); }
    if (response.status === 429) throw new Error("DeepL is busy. Try again shortly or enter a translation manually.");
    if (!response.ok) throw new Error("DeepL translation is unavailable. You can enter a translation manually.");
    try { return await response.json() as unknown; } catch { throw new Error("DeepL returned an invalid response. You can enter a translation manually."); }
  }
  async usage() {
    if (!this.config.key) return { used: 0, limit: 0, available: false };
    if (this.usageCache && Date.now() - this.usageCache.at < 30000) return this.usageCache.value;
    const data = await this.send("usage") as { character_count?: unknown; character_limit?: unknown };
    if (typeof data.character_count !== "number" || typeof data.character_limit !== "number") throw new Error("DeepL allowance could not be read. Manual translation is available.");
    const value = { used: data.character_count, limit: data.character_limit, available: data.character_count < data.character_limit };
    this.usageCache = { value, at: Date.now() };
    return value;
  }
  async translate(input: { userId: string; language: LanguageCode; text: string; context: string }) {
    if (!input.text.trim() || input.text.length > 5000) throw new Error("Select between 1 and 5,000 characters for lookup.");
    const usage = await this.usage();
    if (!usage.available || usage.used + [...input.text].length > usage.limit) throw new Error("DeepL character allowance is exhausted or unavailable. You can enter a translation manually.");
    const data = await this.send("translate", { text: [input.text], source_lang: sourceLanguages[input.language], target_lang: "EN", context: input.context.slice(0, 12000), preserve_formatting: true }) as { translations?: { text?: unknown }[] };
    const translation = data.translations?.[0]?.text;
    if (typeof translation !== "string" || !translation.trim()) throw new Error("DeepL returned no translation. You can enter a translation manually.");
    this.usageCache = null;
    return { translation, source: "deepl" as const };
  }
  async translateMany(input: { userId: string; language: LanguageCode; texts: string[]; context: string }) {
    if (input.texts.length > 25) throw new Error("Translate at most 25 unique words at a time.");
    if (input.texts.some(text => !text.trim() || text.length > 5000)) throw new Error("Select between 1 and 5,000 characters for lookup.");
    if (!input.texts.length) return [];
    const usage = await this.usage();
    const characters = input.texts.reduce((count, text) => count + [...text].length, 0);
    if (!usage.available || usage.used + characters > usage.limit) throw new Error("DeepL character allowance is exhausted or unavailable. You can enter a translation manually.");
    const results: { translation: string; source: "deepl"; error?: string }[] = [];
    for (const texts of deepLTranslationBatches(input.language, input.texts, input.context)) {
      try {
        const data = await this.send("translate", { text: texts, source_lang: sourceLanguages[input.language], target_lang: "EN", context: input.context.slice(0, 12000), preserve_formatting: true }) as { translations?: { text?: unknown }[] };
        if (!Array.isArray(data.translations)) throw new Error("DeepL returned an invalid response. You can enter a translation manually.");
        // Individual failures stay unresolved without discarding earlier successful UTF-8 batches.
        results.push(...texts.map((_, index) => ({ translation: typeof data.translations?.[index]?.text === "string" ? data.translations[index].text as string : "", source: "deepl" as const })));
      } catch (failure) {
        const error = failure instanceof Error ? failure.message : "DeepL translation is unavailable. You can enter a translation manually.";
        results.push(...texts.map(() => ({ translation: "", source: "deepl" as const, error })));
      }
      this.usageCache = null;
    }
    return results;
  }
}
