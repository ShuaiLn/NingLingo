import { createClient } from '@supabase/supabase-js';
import { readGrammarDataset } from './grammar-validate.mjs';
import { readFile } from 'node:fs/promises';
import { grammarProductionPointSchema } from '../src/domain/grammar-content.ts';
import { z } from 'zod';

// Node loads .env.local only for this administrative CLI. Never import this file into Next/client code.
try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const reviewedFile = process.argv.find(value => value.startsWith('--reviewed-file='))?.slice('--reviewed-file='.length);
const reviewed = reviewedFile ? z.array(grammarProductionPointSchema).min(1).parse(JSON.parse(await readFile(reviewedFile, 'utf8'))) : null;
if (reviewed && (reviewed.some(point => !point.reviewer || point.status === 'draft' || point.contentVersion < 2) || new Set(reviewed.map(point => point.id)).size !== reviewed.length)) throw new Error('Reviewed imports require unique lessons, version 2 or later, an actual human reviewer/date, and reviewed or published status.');
const result = reviewed ? { points: reviewed } : await readGrammarDataset();
if (process.argv.includes('--validate-only')) {
  console.log(`Validated ${result.points.length} ${reviewed ? 'human-review records' : 'draft lessons'}; no database request made.`);
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Grammar import needs NEXT_PUBLIC_SUPABASE_URL and a server-only SUPABASE_SECRET_KEY (or existing SUPABASE_SERVICE_ROLE_KEY). No credentials are logged.');
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.rpc('nl_import_grammar', { p_points: result.points });
  if (error) throw new Error(`Grammar transaction rejected (${error.code || 'unknown'}): ${error.message}`);
  console.log(JSON.stringify({ result: data, lessons: result.points.length, status: reviewed ? 'review metadata retained; published content requires a human review record' : 'draft; not publicly published' }));
}
