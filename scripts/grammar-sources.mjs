import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const pin = '0d1d3410bec90bd4098a7c72de820543cb4f707c';
const directory = new URL('../content/grammar/sources/openjlpt/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [target, upstream] of Object.entries({ 'n5.json': 'data/json/grammar/n5.json', 'n4.json': 'data/json/grammar/n4.json', LICENSE: 'LICENSE', 'NOTICE.md': 'NOTICE.md', 'CITATION.cff': 'CITATION.cff' })) {
  const url = `https://raw.githubusercontent.com/evanclan/OpenJLPT/${pin}/${upstream}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pinned source download failed for ${target}: ${response.status}`);
  const text = await response.text();
  if (target.endsWith('.json')) {
    const data = JSON.parse(text);
    if (!Array.isArray(data) || data.some(entry => !entry.id || !entry.pattern || !entry.formation || !entry.meaning || !entry.examples?.length)) throw new Error(`Malformed OpenJLPT source: ${target}`);
  }
  await writeFile(new URL(target, directory), text);
  console.log(`${target}: ${createHash('sha256').update(text).digest('hex')}`);
}
console.log(`Sources pinned to ${pin}; never advances automatically to upstream main.`);
