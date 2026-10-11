import type { TranslationProvider } from "@/domain/models";

/** Development provider deliberately does not invent dictionary meanings or readings. */
export class MockTranslationProvider implements TranslationProvider {
  async translate(): Promise<{ translation: string; source: "mock" }> {
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    return { translation: "", source: "mock" };
  }

  async usage(): Promise<{ used: number; limit: number; available: boolean }> {
    return { used: 0, limit: 0, available: true };
  }
}
