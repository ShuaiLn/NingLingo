import type { LanguageCode, QuizChoice, QuizQuestion, QuizType, TranslationDirection, VocabularyEntry, WordPair } from "./models";
import { normalizeAnswer, quizShuffle } from "./quiz";
import { suggestWordPairs, wordMeanings, wordPairKey } from "./word-pairs";

export interface MixedQuizConfiguration {
  language: LanguageCode; entries: VocabularyEntry[]; type: QuizType; languages?: LanguageCode[]; types?: QuizType[];
  directions?: TranslationDirection[]; pairs?: WordPair[]; listeningLanguages?: LanguageCode[];
}
interface Combination { type: QuizType; context?: VocabularyEntry; choices: QuizChoice[] }
export interface MixedQuizSetup { eligible: VocabularyEntry[]; ineligible: { wordId: string; reason: string }[]; combinations: Map<string, Combination[]> }
const cross = (type: QuizType) => type === "translation-mcq" || type === "translation-typing";
const typed = (type: QuizType) => ["typing", "spelling", "listening", "translation-typing"].includes(type);
const overlaps = (a: VocabularyEntry, b: VocabularyEntry) => wordMeanings(a).some(value => wordMeanings(b).includes(value));
function choicesFor(entry: VocabularyEntry, target: VocabularyEntry, pool: VocabularyEntry[], type: QuizType): QuizChoice[] {
  const meaning = type === "word-meaning";
  const reading = type === "japanese-reading";
  const text = (word: VocabularyEntry) => meaning ? word.translation : reading ? word.reading : word.word;
  const correct: QuizChoice = { id: target.id, text: text(target), audioText: meaning ? target.translation : target.word };
  const optionKey = (text: string) => reading ? normalizeAnswer(text).replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)) : normalizeAnswer(text);
  const keys = new Set([optionKey(correct.text)]);
  const choices = [correct];
  for (const candidate of pool) {
    if (candidate.id === target.id || (reading ? candidate.language !== "ja" : !meaning && candidate.language !== target.language)) continue;
    if (normalizeAnswer(candidate.word) === normalizeAnswer(target.word) || (!reading && (overlaps(target, candidate) || overlaps(entry, candidate)))) continue;
    const key = optionKey(text(candidate));
    if (!key || keys.has(key)) continue;
    keys.add(key); choices.push({ id: candidate.id, text: text(candidate), audioText: meaning ? candidate.translation : candidate.word });
  }
  return choices;
}

/** Feasibility is intersected with explicit choices; no alternate mode/language fallback. */
export function mixedQuizSetup(input: MixedQuizConfiguration): MixedQuizSetup {
  const languages = input.languages ?? [input.language], types = input.types ?? [input.type];
  const selected = input.entries.filter((entry, index, all) => all.findIndex(other => other.id === entry.id) === index);
  const pairs = types.some(cross) ? [...(input.pairs ?? []), ...suggestWordPairs(selected, input.pairs)] : [];
  const combinations = new Map<string, Combination[]>(), ineligible: MixedQuizSetup["ineligible"] = [];
  for (const entry of selected) {
    const available: Combination[] = [];
    if (languages.includes(entry.language)) for (const type of [...new Set(types)]) {
      if (type === "japanese-reading" && (entry.language !== "ja" || !entry.reading.trim())) continue;
      if (type === "listening" && !(input.listeningLanguages ?? []).includes(entry.language)) continue;
      const targets = cross(type) ? pairs.filter(pair => pair.userId === entry.userId && pair.status !== "deleted" && (pair.sourceWordId === entry.id || pair.targetWordId === entry.id))
        .sort((a, b) => Number(b.status === "confirmed") - Number(a.status === "confirmed") || b.confidence - a.confidence || wordPairKey(a.sourceWordId, a.targetWordId).localeCompare(wordPairKey(b.sourceWordId, b.targetWordId)))
        .map(pair => selected.find(word => word.id === (pair.sourceWordId === entry.id ? pair.targetWordId : pair.sourceWordId)))
        .filter((word): word is VocabularyEntry => Boolean(word && languages.includes(word.language) && input.directions?.some(direction => direction.source === entry.language && direction.target === word.language))) : [entry];
      // Confirmed relationships take priority; one fixed contextual target per direction.
      const targetLanguages = new Set<LanguageCode>();
      for (const target of targets) {
        if (targetLanguages.has(target.language)) continue;
        const equivalent = new Set(cross(type) ? pairs.filter(pair => pair.status !== "deleted" && (pair.sourceWordId === entry.id || pair.targetWordId === entry.id)).map(pair => pair.sourceWordId === entry.id ? pair.targetWordId : pair.sourceWordId) : []);
        const choices = typed(type) ? [] : choicesFor(entry, target, selected.filter(word => languages.includes(word.language) && (word.id === target.id || !equivalent.has(word.id))), type);
        if (!typed(type) && choices.length < 2) continue;
        targetLanguages.add(target.language);
        available.push({ type, ...(cross(type) ? { context: target } : {}), choices });
      }
    }
    if (available.length) combinations.set(entry.id, available);
    else ineligible.push({ wordId: entry.id, reason: !languages.includes(entry.language) ? "This word's language is not enabled." : types.every(cross) ? "No selected word pair matches an enabled translation direction with enough distinct choices." : types.every(type => type === "listening") ? "No matching device voice is available for listening spelling." : "No enabled question type can use this word with the selected words and directions." });
  }
  return { eligible: selected.filter(entry => combinations.has(entry.id)), ineligible, combinations };
}

export function freezeMixedTemplates(entries: VocabularyEntry[], setup: MixedQuizSetup, state: { randomState: number }): QuizQuestion[] {
  return entries.map(entry => {
    const combo = quizShuffle(setup.combinations.get(entry.id)!, state)[0];
    const target = combo.context ?? entry, type = combo.type;
    const sourceLanguage = type === "meaning-word" || type === "spelling" ? "en" as const : entry.language;
    const targetLanguage = type === "typing" || type === "word-meaning" ? "en" as const : target.language;
    const choices = typed(type) ? [] : quizShuffle([combo.choices[0], ...quizShuffle(combo.choices.slice(1), state).slice(0, 3)], state);
    return {
      id: `template:${entry.id}`, position: -1, wordId: entry.id, kind: "initial", type,
      inputMode: typed(type) ? "text" : "choice", sourceLanguage, targetLanguage,
      prompt: type === "listening" ? "Listen and spell the word." : sourceLanguage === "en" ? entry.translation : entry.word,
      audioText: sourceLanguage === "en" ? entry.translation : entry.word, audioLanguage: sourceLanguage,
      direction: `${sourceLanguage} → ${targetLanguage}`, ...(combo.context ? { contextWordId: target.id } : {}),
      choices, correctChoiceId: typed(type) ? null : target.id,
      acceptedAnswers: type === "typing" || type === "word-meaning" ? wordMeanings(entry) : type === "japanese-reading" ? [normalizeAnswer(entry.reading)] : [normalizeAnswer(target.word)],
    };
  });
}
