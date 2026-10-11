import type { LanguageCode } from "./models";
export const LANGUAGES: Record<LanguageCode, { name: string; nativeName: string; locale: string; glyph: string; greeting: string }> = {
  ja: { name: "Japanese", nativeName: "日本語", locale: "ja-JP", glyph: "あ", greeting: "A little practice, every day." },
  es: { name: "Spanish", nativeName: "Español", locale: "es-ES", glyph: "ñ", greeting: "A little practice, every day." },
  el: { name: "Greek", nativeName: "Ελληνικά", locale: "el-GR", glyph: "Ω", greeting: "A little practice, every day." },
};
export function isLanguage(value: string): value is LanguageCode { return value === "ja" || value === "es" || value === "el"; }
export function kanaDisplay(text: string, mode: "hiragana" | "katakana"): string { return [...text].map(c => { const n = c.charCodeAt(0); return mode === "katakana" && n >= 0x3041 && n <= 0x3096 ? String.fromCharCode(n + 0x60) : mode === "hiragana" && n >= 0x30a1 && n <= 0x30f6 ? String.fromCharCode(n - 0x60) : c; }).join(""); }
