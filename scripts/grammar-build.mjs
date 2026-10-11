import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import spanish from '../content/grammar/authoring/es.mjs';
import greek from '../content/grammar/authoring/el.mjs';

const root = new URL('../', import.meta.url);
const pin = '0d1d3410bec90bd4098a7c72de820543cb4f707c';
const n4Ids = ['ageru-kureru-morau','te-ageru','te-kureru','te-morau','te-iku','te-kuru','te-shimau-chau','te-oku','te-miru','te-aru','toki','aida-aida-ni','sou-da-appearance','sou-da-hearsay','sugiru','kata','tsumori','koto-ga-dekiru','hou-ga-ii'];
const n5 = JSON.parse(await readFile(new URL('content/grammar/sources/openjlpt/n5.json', root), 'utf8'));
const n4 = JSON.parse(await readFile(new URL('content/grammar/sources/openjlpt/n4.json', root), 'utf8'));
const candidates = [...n5, ...n4Ids.map(id => {
  const point = n4.find(point => point.id === id);
  if (!point) throw new Error(`Missing pinned N4 candidate ${id}`);
  return point;
})];
const attribution = 'OpenJLPT contributors; derived dataset attribution also credits EDRDG JMdict/KANJIDIC2, Jonathan Waller’s JLPT lists, and Tatoeba; see bundled NOTICE.md. Grammar explanations and examples are OpenJLPT contributor content. Adapted for NingLingo; no upstream review is represented as a NingLingo human review.';
const originalSource = {
  title: 'NingLingo original AI-authored exercises and learner explanations',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  version: 'ninglingo-v1-draft-1', license: 'CC-BY-SA-4.0',
  attribution: 'Original AI-authored NingLingo draft; no human reviewer. Original examples are not Tatoeba extracts.',
};
const references = {
  es: { title: 'Wikibooks Spanish: Contents and linked grammar reference', url: 'https://en.wikibooks.org/w/index.php?title=Spanish/Contents&oldid=4487563', version: 'Wikibooks revision 4487563 (2025-04-21)', license: 'CC-BY-SA-4.0 (reference source)', attribution: 'Wikibooks Spanish contributors; topic/syllabus reference. NingLingo explanations, examples, and exercises are original AI drafts, not copied Wikibooks passages.' },
  el: { title: 'Modern Greek: Grammar Notes for Absolute Beginners (A1–A2)', url: 'https://repository-web.kallipos.gr/handle/11419/4393', version: 'Poulopoulou 2015; ISBN 978-960-603-129-8; DOI 10.57713/kallipos-583', license: 'CC-BY-NC-SA-3.0-GR (reference source only)', attribution: 'Maria Poulopoulou, Kallipos Open Academic Editions (2015). Topic reference only: no textbook prose, examples, exercises, audio, or illustrations are redistributed. The textbook’s reviewer is not a reviewer of NingLingo content.' },
};
const spanishReferences = [
  { title: 'Wikibooks Spanish: Tenses', url: 'https://en.wikibooks.org/w/index.php?title=Spanish/Tenses&oldid=4343296', version: 'Wikibooks revision 4343296 (2023-11-23)', license: 'CC-BY-SA-4.0 (reference source)', attribution: 'Wikibooks Spanish contributors. Conjugation reference only; NingLingo pedagogical text and exercises are original AI drafts.' },
  { title: 'Wikibooks Spanish: Pronouns', url: 'https://en.wikibooks.org/w/index.php?title=Spanish/Pronouns&oldid=3979135', version: 'Wikibooks revision 3979135 (2021-09-01)', license: 'CC-BY-SA-4.0 (reference source)', attribution: 'Wikibooks Spanish contributors. Pronoun reference only; no learner-facing paragraphs copied.' },
  { title: 'Wikibooks Spanish: El tiempo pasado', url: 'https://en.wikibooks.org/w/index.php?title=Spanish/Lessons/El_tiempo_pasado&oldid=4661004', version: 'Wikibooks revision 4661004 (2026-08-18)', license: 'CC-BY-SA-4.0 (reference source)', attribution: 'Wikibooks Spanish contributors. Past-tense reference only; NingLingo examples and exercises are original AI drafts.' },
];
const normalize = value => value.normalize('NFC').trim().toLocaleLowerCase('en');
function exercise(pointId, index, prompt, correct, alternatives, explanation) {
  const choices = [correct, ...alternatives].filter((value, i, all) => all.findIndex(item => normalize(item) === normalize(value)) === i).slice(0, 4);
  if (choices.length !== 4) throw new Error(`Four distinct authored options required: ${pointId}:${index}`);
  const offset = createHash('sha256').update(`${pointId}:${index}`).digest()[0] % 4;
  const rotated = [...choices.slice(offset), ...choices.slice(0, offset)];
  return { id: `${pointId}-v1-q${index + 1}`, prompt, choices: rotated, correctIndex: rotated.indexOf(correct), explanation };
}
function authorPoint(language, item) {
  const id = `${language}-${item.slug}`;
  if (item.examples.length !== 3 || item.checks.length !== 2) throw new Error(`Three authored examples and two checks required: ${id}`);
  for (const entry of item.examples) {
    if (entry.gap.split('___').length !== 2 || entry.gap.replace('___', entry.answer) !== entry.text) throw new Error(`Cloze answer does not reconstruct its exact example: ${id}`);
    if (entry.alternatives.length !== 3) throw new Error(`Three explicit cloze distractors required: ${id}`);
  }
  for (const check of item.checks) {
    if (check.choices.length !== 4 || !Number.isInteger(check.correctIndex) || check.correctIndex < 0 || check.correctIndex >= check.choices.length) throw new Error(`Invalid authored application check: ${id}`);
  }
  return {
    id, language, title: item.title, level: item.level, category: item.category,
    explanation: item.explanation, formation: item.formation,
    examples: item.examples.map((entry, i) => ({ id: `${id}-v1-e${i + 1}`, text: entry.text, translation: entry.translation })),
    exercises: [
      ...item.examples.map((entry, i) => exercise(id, i, `Complete the sentence to match the English meaning: ${entry.gap}\n${entry.translation}`, entry.answer, entry.alternatives, `${entry.text} — ${entry.translation} ${item.explanation}`)),
      ...item.checks.map((check, i) => exercise(id, i + 3, check.prompt, check.choices[check.correctIndex], check.choices.filter((_, j) => j !== check.correctIndex), check.explanation)),
    ],
    status: 'draft', sources: [originalSource, references[language], ...(language === 'es' ? [spanishReferences[item.category === 'Past tense' ? 2 : ['Pronouns', 'Objects'].includes(item.category) ? 1 : 0]] : [])], reviewer: null,
    contentVersion: 1, modificationNotes: 'Initial original AI-authored learner draft. Three examples, three contextual cloze exercises, and two topic-specific application/contrast exercises. Structural validation is automated; native-speaker pedagogical review is pending.', developmentSeed: false,
  };
}
function different(values, correct, count = 3) {
  const distinct = values.filter(value => normalize(value) !== normalize(correct)).filter((value, i, all) => all.findIndex(item => normalize(item) === normalize(value)) === i);
  return distinct.slice(0, count);
}
function japanesePoint(item, itemIndex) {
  const id = `ja-${item.id}`;
  const sourceExamples = item.examples.map(entry => ({ ...entry }));
  if (item.id === 'ya') sourceExamples.push({ ja: 'かばんにペンやノートなどを入れました。', en: 'I put pens, notebooks, and other things in my bag.', furigana: 'かばんにペンやノートなどを{入|い}れました。' });
  if (sourceExamples.length < 3) throw new Error(`Missing third example: ${id}`);
  const examples = sourceExamples.slice(0, 3).map((entry, i) => ({ id: `${id}-v1-e${i + 1}`, text: entry.ja, ...(entry.furigana ? { reading: entry.furigana.replace(/\{[^|{}]+\|([^{}]+)\}/gu, '$1') } : {}), translation: entry.en }));
  const otherCandidates = [...candidates.slice(itemIndex + 1), ...candidates.slice(0, itemIndex)].filter(other => other.id !== item.id);
  const exercises = examples.map((entry, i) => {
    const alternativeTexts = different(otherCandidates.flatMap(other => other.examples.map(example => example.en)), entry.translation);
    return exercise(id, i, `Choose the English translation: ${entry.text}`, entry.translation, alternativeTexts, `${entry.text} means “${entry.translation}”. This illustrates ${item.pattern}: ${item.meaning}. ${item.notes}`);
  });
  exercises.push(exercise(id, 3, `Which formation defines ${item.pattern} (${item.meaning})?`, item.formation, different(otherCandidates.map(other => other.formation), item.formation), `${item.formation}. ${item.notes}`));
  // Meaning choices are selected across unrelated source tags to reduce semantic overlap.
  const unrelated = otherCandidates.filter(other => !(other.tags ?? []).some(tag => (item.tags ?? []).includes(tag)));
  exercises.push(exercise(id, 4, `What is the core grammatical meaning of ${item.pattern}?`, item.meaning, different(unrelated.map(other => other.meaning), item.meaning), `${item.pattern}: ${item.meaning}. ${item.notes}`));
  return {
    id, language: 'ja', title: `${item.pattern} — ${item.meaning}`, level: item.level,
    category: item.tags[0] ?? 'Grammar', explanation: `${item.pattern} expresses ${item.meaning}. ${item.notes}`,
    formation: item.formation, examples, exercises, status: 'draft',
    sources: [{ title: `OpenJLPT ${item.level} grammar: ${item.id}`, url: `https://github.com/evanclan/OpenJLPT/blob/${pin}/data/json/grammar/${item.level.toLowerCase()}.json`, version: pin, license: 'CC-BY-SA-4.0', attribution }, originalSource],
    reviewer: null, contentVersion: 1, modificationNotes: `Imported and normalized from pinned OpenJLPT candidate ${item.id}; added original translation-comprehension, formation, and meaning exercises${item.id === 'ya' ? ', plus an original third example' : ''}. Source furigana converted to explicit reading text only; no readings inferred. Upstream descriptions are not a NingLingo human review; native-speaker pedagogical review is pending.`, developmentSeed: false,
  };
}

const datasets = { ja: candidates.map(japanesePoint), es: spanish.map(item => authorPoint('es', item)), el: greek.map(item => authorPoint('el', item)) };
const expected = { ja: 100, es: 80, el: 60 };
for (const [language, points] of Object.entries(datasets)) {
  if (points.length !== expected[language]) throw new Error(`${language}: expected ${expected[language]} lessons, got ${points.length}`);
  await mkdir(new URL('content/grammar/generated/', root), { recursive: true });
  await writeFile(new URL(`content/grammar/generated/${language}.json`, root), `${JSON.stringify(points, null, 2)}\n`);
}
const manifest = {
  schemaVersion: 1, contentVersion: 1, status: 'draft', humanReview: 'pending',
  sources: { openjlpt: { commit: pin, files: ['n5.json', 'n4.json'], selected: { N5: n5.length, N4: n4Ids.length }, n4Ids }, wikibooks: [references.es, ...spanishReferences], kallipos: references.el },
  datasets: Object.entries(datasets).map(([language, points]) => ({ language, lessons: points.length, examples: points.reduce((n, p) => n + p.examples.length, 0), exercises: points.reduce((n, p) => n + p.exercises.length, 0), sha256: createHash('sha256').update(`${JSON.stringify(points, null, 2)}\n`).digest('hex') })),
};
await writeFile(new URL('content/grammar/manifest.json', root), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${Object.values(datasets).flat().length} draft lessons at ${fileURLToPath(new URL('content/grammar/generated/', root))}. Human review remains pending.`);
