import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import lessons from '../content/grammar/authoring/ko.mjs';

const root = new URL('../', import.meta.url);
const normalize = value => value.normalize('NFC').trim().toLocaleLowerCase('en');
const source = {
  title: 'NingLingo original Korean beginner grammar',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  version: 'ninglingo-ko-v1-2026-10-12', license: 'CC-BY-SA-4.0',
  attribution: 'Original AI-authored NingLingo explanations, examples, translations, and exercises. AI-authored; not human-reviewed. No source prose or dictionary examples are reproduced.',
};
const reference = {
  title: 'National Institute of Korean Language: Korean-English Learners’ Dictionary',
  url: 'https://krdict.korean.go.kr/eng/mainAction?nation=eng',
  version: 'Reference consulted 2026-10-12', license: 'Reference only; source copyright retained by National Institute of Korean Language',
  attribution: 'Official grammar and vocabulary reference only. Instructional material is original AI-authored text; no dictionary definitions, examples, audio, or images are redistributed. NIKL did not review this course.',
};
function question(id, index, prompt, correct, candidates, explanation) {
  const alternatives = [...new Set(candidates.map(normalize))];
  const selected = candidates.filter((value, i) => normalize(value) !== normalize(correct) && candidates.findIndex(item => normalize(item) === normalize(value)) === i).slice(0, 3);
  if (selected.length !== 3 || alternatives.length < 3) throw new Error(`Three distinct wrong options required: ${id}:${index}`);
  const choices = [correct, ...selected];
  const offset = createHash('sha256').update(`${id}:${index}`).digest()[0] % 4;
  const rotated = [...choices.slice(offset), ...choices.slice(0, offset)];
  return { id: `${id}-v1-q${index + 1}`, prompt, choices: rotated, correctIndex: rotated.indexOf(correct), explanation };
}
export async function buildKoreanDataset() {
  if (lessons.length !== 60) throw new Error('The Korean beginner course must contain exactly 60 lessons.');
  const points = lessons.map(([slug, title, category, explanation, formation, purpose, examples], lessonIndex) => {
    const id = `ko-${slug}`;
    if (examples.length < 3) throw new Error(`Three translated examples required: ${id}`);
    const others = [...lessons.slice(lessonIndex + 1), ...lessons.slice(0, lessonIndex)];
    return {
      id, language: 'ko', title, level: 'Beginner', category, explanation, formation,
      examples: examples.map(([text, translation], index) => ({ id: `${id}-v1-e${index + 1}`, text, translation })),
      exercises: [
        ...examples.slice(0, 3).map(([text, translation], index) => question(id, index, `Choose the English meaning: ${text}`, translation,
          [...examples.filter((_, i) => i !== index).map(item => item[1]), ...others.flatMap(item => item[6].map(example => example[1]))], `${text} means “${translation}” ${explanation}`)),
        question(id, 3, `Choose the formation for ${title}.`, formation, others.map(item => item[4]), `${formation}. ${explanation}`),
        question(id, 4, `What is the grammatical purpose of ${title}?`, purpose, others.map(item => item[5]), `${purpose} ${explanation}`),
      ],
      status: 'published-ai', sources: [source, reference], reviewer: null, contentVersion: 1,
      modificationNotes: 'AI-authored; not human-reviewed. Published independently as AI learning content, not as a human-reviewed release. Three original translated examples and five answer-keyed exercises. Human linguistic and pedagogical review remains pending.',
      developmentSeed: false,
    };
  });
  const text = `${JSON.stringify(points, null, 2)}\n`;
  await mkdir(new URL('content/grammar/generated/', root), { recursive: true });
  await writeFile(new URL('content/grammar/generated/ko.json', root), text);
  const path = new URL('content/grammar/manifest.json', root);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const entry = { language: 'ko', lessons: points.length, examples: points.reduce((n, p) => n + p.examples.length, 0), exercises: points.reduce((n, p) => n + p.exercises.length, 0), sha256: createHash('sha256').update(text).digest('hex'), status: 'published-ai', humanReview: 'pending' };
  manifest.datasets = [...manifest.datasets.filter(item => item.language !== 'ko'), entry];
  manifest.sources.korean = reference;
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return points;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildKoreanDataset();
  console.log('Prepared 60 Korean AI-authored lessons, 180 translated examples, and 300 exercises; no human review claimed.');
}
