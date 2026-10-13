"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { SpeechLanguage } from "@/domain/models";
import { chooseVoice, getAudioController } from "@/services/audio";
const serverState = { supported: false, loading: true, voices: [], playingId: null, error: null };
export function useQuizVoices() {
  const controller = getAudioController();
  return useSyncExternalStore(controller.subscribe, controller.snapshot, () => serverState);
}
/** The key is the visible question, never the scheduler's already-prepared next question. */
export function useAutomaticQuizAudio({ questionKey, text, language, enabled, feedback }: { questionKey: string | null; text: string; language: SpeechLanguage; enabled: boolean; feedback: boolean }) {
  const controller = getAudioController(), state = useQuizVoices();
  const played = useRef<string | null>(null);
  useEffect(() => {
    if (!questionKey || feedback || !enabled || !text || !chooseVoice(state.voices, language) || played.current === questionKey) return;
    // Defer until after effect setup so Strict Mode's setup/cleanup replay cancels
    // the first task and only one actual utterance reaches the speech platform.
    const timer = setTimeout(() => { played.current = questionKey; controller.play(text, language, `automatic:${questionKey}`); }, 0);
    return () => clearTimeout(timer);
  }, [controller, enabled, feedback, language, questionKey, state.voices, text]);
  useEffect(() => { played.current = null; controller.stop(); return controller.stop; }, [controller, questionKey]);
}
