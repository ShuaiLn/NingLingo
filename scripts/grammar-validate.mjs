import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateGrammarDataset } from '../src/domain/grammar-content.ts';

export async function readGrammarDataset() {
  const points = [];
  const manifest = JSON.parse(await readFile(new URL('../content/grammar/manifest.json', import.meta.url), 'utf8'));
  for (const language of ['ja', 'es', 'el', 'ko']) {
    const text = await readFile(new URL(`../content/grammar/generated/${language}.json`, import.meta.url), 'utf8');
    const hash = createHash('sha256').update(text).digest('hex');
    if (manifest.datasets.find(entry => entry.language === language)?.sha256 !== hash) throw new Error(`Generated ${language} dataset differs from its manifest. Rebuild before importing.`);
    points.push(...JSON.parse(text));
  }
  const result = validateGrammarDataset(points, { ja: 100, es: 80, el: 60, ko: 60 });
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  if (result.points.some(point => (point.language === 'ko' ? point.status !== 'published-ai' : point.status !== 'draft') || point.reviewer !== null)) throw new Error('Original draft candidates remain draft; Korean AI lessons use independent AI publication with no claimed human review.');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await readGrammarDataset();
  console.log(JSON.stringify({ lessons: result.points.length, counts: result.counts, examples: result.points.reduce((n, point) => n + point.examples.length, 0), exercises: result.points.reduce((n, point) => n + point.exercises.length, 0), status: '240 original drafts preserved; 60 Korean published-ai; no new human review claimed' }));
}
