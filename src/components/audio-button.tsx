"use client";
import { useEffect, useId, useSyncExternalStore } from "react";
import { Volume2, VolumeX, Square } from "lucide-react";
import { chooseVoice, getAudioController, playWithoutAnswer, stopAudio, SPEECH_LANGUAGES } from "@/services/audio";
import type { SpeechLanguage } from "@/domain/models";
const serverState = { supported: false, loading: true, voices: [], playingId: null, error: null };
export { stopAudio } from "@/services/audio";
export function useAudioStopOnChange(key: string | number | null | undefined) { useEffect(() => { stopAudio(); return stopAudio; }, [key]); }
export function AudioButton({ text, language, label }: { text: string; language: SpeechLanguage; reading?: string; label?: string }) {
  const controller = getAudioController();
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, () => serverState);
  const id = useId();
  const available = Boolean(chooseVoice(state.voices, language));
  const playing = state.playingId === id;
  const title = state.loading && !available ? "Loading device voices…" : !available ? `${SPEECH_LANGUAGES[language].name} voice unavailable on this device` : state.error ? state.error : label ?? `Play pronunciation of ${text}`;
  return <span className="audio-control"><button type="button" className={`audio-button ${playing ? "playing" : ""}`} aria-label={playing ? label ? "Stop audio" : `Stop pronunciation of ${text}` : title} title={title} aria-disabled={!available} onClick={event => playWithoutAnswer(event, () => { if (playing) controller.stop(); else controller.play(text, language, id); })}>{playing ? <Square size={14}/> : available || state.loading ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button>{!available && !state.loading && <span className="sr-only">{title}</span>}{state.error && playing === false && available && <span className="sr-only" role="status">{state.error}</span>}</span>;
}
