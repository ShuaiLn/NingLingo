import { createClient } from '@supabase/supabase-js';
import { readGrammarDataset } from './grammar-validate.mjs';
import { readFile } from 'node:fs/promises';
import { grammarProductionPointSchema } from '../src/domain/grammar-content.ts';
import { z } from 'zod';
import { grammarImportVersionNotice, parseGrammarImportOptions } from './grammar-import-options.ts';

const { reviewedFile, validateOnly } = parseGrammarImportOptions(process.argv.slice(2));
// Node loads .env.local only for this administrative CLI. Never import this file into Next/client code.
try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const reviewed = reviewedFile ? z.array(grammarProductionPointSchema).min(1).parse(JSON.parse(await readFile(reviewedFile, 'utf8'))) : null;
if (reviewed && (reviewed.some(point => !point.reviewer || point.status === 'draft' || point.contentVersion < 2) || new Set(reviewed.map(point => point.id)).size !== reviewed.length)) throw new Error('Reviewed imports require unique lessons, version 2 or later, an actual human reviewer/date, and reviewed or published status.');
const result = reviewed ? { points: reviewed } : await readGrammarDataset();
const statuses = { draft: 0, reviewed: 0, published: 0 };
for (const point of result.points) statuses[point.status]++;
if (validateOnly) {
  console.log(`Validated ${result.points.length} ${reviewed ? 'human-review records' : 'draft lessons'}; no database request made.`);
  if (reviewed) console.log(JSON.stringify({ statuses, versionNotice: grammarImportVersionNotice }));
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Grammar import needs NEXT_PUBLIC_SUPABASE_URL and a server-only SUPABASE_SECRET_KEY (or existing SUPABASE_SERVICE_ROLE_KEY). No credentials are logged.');
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.rpc('nl_import_grammar', { p_points: result.points });
  if (error) throw new Error(`Grammar transaction rejected (${error.code || 'unknown'}): ${error.message}`);
  console.log(JSON.stringify({ result: data, lessons: result.points.length, statuses, status: reviewed ? 'review metadata retained; only published lessons appear to learners' : 'draft; not publicly published', ...(reviewed ? { versionNotice: grammarImportVersionNotice } : {}) }));
}
