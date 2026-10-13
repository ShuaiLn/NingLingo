import { LANGUAGES } from "@/domain/languages";
import type { SpeechLanguage } from "@/domain/models";
export const SPEECH_LANGUAGES = { ...LANGUAGES, en: { name: "English", locale: "en-US" } };
export interface Voice { name: string; lang: string; nativeVoice?: SpeechSynthesisVoice }
export interface AudioState { supported: boolean; loading: boolean; voices: Voice[]; playingId: string | null; error: string | null }
export interface SpeechPlatform {
  voices(): Voice[];
  cancel(): void;
  speak(input: { text: string; locale: string; voice: Voice; end: () => void; error: (message: string) => void }): void;
  onVoicesChanged(callback: () => void): () => void;
}
export function chooseVoice(voices: Voice[], language: SpeechLanguage): Voice | undefined {
  const locale = SPEECH_LANGUAGES[language].locale.toLowerCase();
  const normalized = (voice: Voice) => voice.lang.replaceAll("_", "-").toLowerCase();
  return voices.find(voice => normalized(voice) === locale) ?? voices.find(voice => normalized(voice).split("-")[0] === language);
}
export class AudioController {
  private listeners = new Set<() => void>();
  private state: AudioState;
  private cleanup: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  constructor(private platform: SpeechPlatform | null) {
    this.state = { supported: !!platform, loading: !!platform, voices: [], playingId: null, error: null };
    if (platform) {
      this.cleanup = platform.onVoicesChanged(() => this.loadVoices());
      this.loadVoices();
      if (this.state.loading) this.timer = setTimeout(() => { this.loadVoices(); if (this.state.loading) this.update({ loading: false }); }, 1800);
    }
  }
  snapshot = () => this.state;
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  private update(patch: Partial<AudioState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(callback => callback()); }
  private loadVoices() { const voices = this.platform?.voices() ?? []; this.update({ voices, loading: voices.length === 0 && this.state.loading }); }
  stop = () => { this.generation++; this.update({ playingId: null }); this.platform?.cancel(); };
  play(text: string, language: SpeechLanguage, id: string) {
    this.stop();
    const voice = chooseVoice(this.state.voices, language);
    if (!this.platform || !voice) { this.update({ error: `${SPEECH_LANGUAGES[language].name} voice is unavailable on this device.` }); return; }
    if (!text.trim()) return;
    this.update({ playingId: id, error: null });
    const generation = this.generation;
    try {
      this.platform.speak({ text, locale: SPEECH_LANGUAGES[language].locale, voice, end: () => { if (this.generation === generation && this.state.playingId === id) this.update({ playingId: null }); }, error: message => { if (this.generation === generation && this.state.playingId === id) this.update({ playingId: null, error: message }); } });
    } catch { this.update({ playingId: null, error: "Playback failed. Please try again." }); }
  }
  dispose() { this.stop(); this.cleanup?.(); if (this.timer) clearTimeout(this.timer); }
}
let browserController: AudioController | null = null;
export function getAudioController(): AudioController {
  if (browserController) return browserController;
  if (typeof window === "undefined") return new AudioController(null);
  const synthesis = window.speechSynthesis;
  const platform: SpeechPlatform | null = synthesis && typeof SpeechSynthesisUtterance !== "undefined" ? {
    voices: () => synthesis.getVoices().map(voice => ({ name: voice.name, lang: voice.lang, nativeVoice: voice })),
    cancel: () => synthesis.cancel(),
    speak: input => { const utterance = new SpeechSynthesisUtterance(input.text); utterance.lang = input.locale; if (input.voice.nativeVoice) utterance.voice = input.voice.nativeVoice; utterance.rate = 0.85; utterance.onend = input.end; utterance.onerror = () => input.error("Playback failed. Please try again."); synthesis.speak(utterance); },
    onVoicesChanged: callback => { synthesis.addEventListener("voiceschanged", callback); return () => synthesis.removeEventListener("voiceschanged", callback); },
  } : null;
  browserController = new AudioController(platform);
  return browserController;
}
export function stopAudio() { browserController?.stop(); }
export function playWithoutAnswer(event: { stopPropagation(): void; preventDefault(): void }, play: () => void) { event.stopPropagation(); event.preventDefault(); play(); }
