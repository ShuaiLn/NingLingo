import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { readGrammarDataset } from './grammar-validate.mjs';
import { createCloudDomainLoader } from './cloud-domain-loader.mjs';
import { verifyKoreanBrowser } from './verify-korean-browser.mjs';

// Explicit --import writes only the pinned sixty Korean lessons. Without it,
// content verification is read-only. --browser adds a disposable login account.
const args = process.argv.slice(2);
if (args.some(arg => !['--import', '--browser'].includes(arg)) || new Set(args).size !== args.length) throw new Error('Use only optional --import and --browser flags.');
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const privateKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const report = { startedAt: new Date().toISOString(), migrationsExecuted: 0, importRequested: args.includes('--import'), checks: 0 };
let admin, account, originalBefore, server, serverLog, browser;
function check(condition, message) { if (!condition) throw new Error(message); report.checks++; }
const client = key => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.any([AbortSignal.timeout(20000), ...(init.signal ? [init.signal] : [])]) }) } });
async function data(query, message) { const result = await query; check(!result.error, message); return result.data; }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function redact(value) {
  let result = String(value).replace(/cookie:[^\r\n]*/gi, 'cookie: [redacted]').replace(/([?&](?:token_hash|code|access_token|refresh_token)=)[^&\s]*/gi, '$1[redacted]');
  for (const name of ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DEEPL_API_KEY', 'DATABASE_URL', 'SUPABASE_ACCESS_TOKEN']) if (process.env[name]) result = result.split(process.env[name]).join('[redacted]');
  if (account) for (const value of [account.id, account.email, account.password]) result = result.split(value).join('[temporary-account]');
  return result;
}
async function allRows(table, order, filter) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    let query = admin.from(table).select('*').range(offset, offset + 999);
    for (const column of order) query = query.order(column);
    query = filter(query);
    const page = await data(query, `Grammar integrity read failed for ${table}.`);
    result.push(...page);
    if (page.length < 1000) return result;
  }
}
async function originalSnapshot() {
  const points = await allRows('grammar_points', ['id'], query => query.in('language', ['ja', 'es', 'el']));
  check(points.length === 240 && points.filter(point => point.language === 'ja').length === 100 && points.filter(point => point.language === 'es').length === 80 && points.filter(point => point.language === 'el').length === 60, 'Original 240-lesson inventory differs from the verified baseline; stopped without changing it.');
  const ids = points.map(point => point.id), result = { grammar_points: points };
  for (const [table, order] of [['grammar_versions', ['point_id', 'content_version']], ['grammar_examples', ['point_id', 'content_version', 'ordinal']], ['grammar_exercises', ['point_id', 'content_version', 'ordinal']], ['grammar_sources', ['point_id', 'content_version', 'ordinal']], ['grammar_reviews', ['point_id', 'content_version', 'id']]]) {
    result[table] = await allRows(table, order, query => query.in('point_id', ids));
  }
  return Object.fromEntries(Object.entries(result).map(([table, rows]) => [table, { rows: rows.length, sha256: hash(rows) }]));
}
const comparable = point => ({ ...point, examples: point.examples.map(example => ({ ...example, reading: example.reading ?? null })) });
async function startBrowser() {
  check(existsSync('.next/BUILD_ID'), 'A current production build is required for Korean browser verification.');
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('Port 3124 is occupied; refusing to reuse an unknown server.')));
    probe.listen(3124, '127.0.0.1', () => probe.close(resolve));
  });
  await mkdir('.local-preview', { recursive: true });
  serverLog = createWriteStream('.local-preview/korean-production-server.log', { flags: 'w' });
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3124'], { env: { ...process.env, NINGLINGO_REPOSITORY_MODE: '' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', value => serverLog.write(redact(value)));
  server.stderr.on('data', value => serverLog.write(redact(value)));
  let available = false;
  for (let count = 0; count < 60; count++) {
    if (server.exitCode !== null) throw new Error('Korean browser verification server exited during startup.');
    try { if ((await fetch('http://127.0.0.1:3124/login', { signal: AbortSignal.timeout(2000) })).ok) { available = true; break; } } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  check(available, 'Korean browser verification server startup timed out.');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
}
async function main() {
  check(Boolean(url && publicKey && privateKey), 'Configured public and server-only Supabase credentials are required; values withheld.');
  const validated = await readGrammarDataset();
  const text = await readFile('content/grammar/generated/ko.json', 'utf8'), points = JSON.parse(text);
  check(isDeepStrictEqual(validated.points.filter(point => point.language === 'ko'), points), 'Korean validation changed the source payload; refusing to publish altered content.');
  check(points.length === 60 && new Set(points.map(point => point.id)).size === 60, 'The intended Korean source must contain sixty unique lesson identities.');
  check(points.every(point => point.language === 'ko' && point.status === 'published-ai' && point.reviewer === null && point.developmentSeed === false && point.modificationNotes.includes('AI-authored; not human-reviewed') && point.examples.length >= 3 && point.exercises.length === 5), 'Korean source publication or lesson requirements are invalid.');
  report.sourceSha256 = createHash('sha256').update(text).digest('hex');
  admin = client(privateKey);
  originalBefore = await originalSnapshot();
  report.originalBefore = originalBefore;
  const existing = await data(admin.from('grammar_points').select('id,current_version').eq('language', 'ko').order('id'), 'Korean pre-import inventory failed.');
  check(existing.every(point => points.some(expected => expected.id === point.id && expected.contentVersion === point.current_version)), 'Unexpected Korean lessons or versions exist; refusing to overwrite or delete them.');
  if (args.includes('--import')) {
    report.import = await data(admin.rpc('nl_import_grammar', { p_points: points }), 'Korean-only import transaction was rejected; provider payload withheld.');
    check(report.import.imported + report.import.unchanged === 60, 'Korean import count is invalid.');
    // An identical replay must be a no-op, including all relational children.
    const beforeReplay = await koreanSnapshot(points);
    report.idempotentReplay = await data(admin.rpc('nl_import_grammar', { p_points: points }), 'Idempotent Korean import replay was rejected.');
    check(report.idempotentReplay.imported === 0 && report.idempotentReplay.unchanged === 60, 'Identical Korean import was not idempotent.');
    check(isDeepStrictEqual(await koreanSnapshot(points), beforeReplay), 'Identical import changed Korean version or child records.');
    console.log(`Korean-only publication: ${report.import.imported} imported, ${report.import.unchanged} unchanged; replay 0 imported / 60 unchanged.`);
  }
  const inventory = await koreanSnapshot(points);
  report.korean = inventory;
  check(inventory.grammar_points.rows === 60 && inventory.grammar_versions.rows === 60 && inventory.grammar_examples.rows === 180 && inventory.grammar_exercises.rows === 300 && inventory.grammar_reviews.rows === 0, 'Korean relational counts or no-review requirement failed.');
  const email = `ninglingo-korean-publication-${randomUUID()}@example.invalid`, password = randomBytes(30).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Disposable Korean publication verification' } });
  check(!created.error && Boolean(created.data.user), 'Temporary Korean publication account could not be created; credentials withheld.');
  account = { id: created.data.user.id, user: created.data.user, email, password, client: client(publicKey) };
  const login = await account.client.auth.signInWithPassword({ email, password });
  check(!login.error && Boolean(login.data.session), 'Temporary Korean publication authentication failed; credentials withheld.');
  const visible = await data(account.client.rpc('nl_grammar_points', { p_language: 'ko' }), 'Authenticated Korean publication lookup failed.');
  check(visible.length === 60 && new Set(visible.map(point => point.id)).size === 60, 'Normal authenticated users cannot read exactly sixty unique Korean lessons.');
  const expectedById = new Map(points.map(point => [point.id, point]));
  for (const point of visible) {
    const expected = expectedById.get(point.id);
    check(Boolean(expected) && isDeepStrictEqual(comparable(point), comparable(expected)), 'Authenticated Korean content differs from the intended source.');
    check(point.status === 'published-ai' && point.reviewer === null && point.modificationNotes.includes('AI-authored; not human-reviewed'), 'An authenticated Korean lesson lost its explicit AI provenance.');
    check(point.examples.length >= 3 && point.examples.every(example => example.translation.trim()) && point.exercises.length === 5, 'Authenticated Korean examples or exercises are incomplete.');
    const detail = await data(account.client.rpc('nl_grammar_point', { p_id: point.id }), 'An individual Korean lesson is not readable under ordinary RLS.');
    check(isDeepStrictEqual(detail, point), 'Individual Korean lookup differs from its listing.');
  }
  const loadTS = createCloudDomainLoader(), { createSupabaseRepositories } = loadTS('src/repositories/supabase.ts');
  const ordered = await createSupabaseRepositories(account.client, account.user).grammar.getPoints('ko');
  check(isDeepStrictEqual(ordered.map(point => point.id), points.map(point => point.id)), 'Application Korean order differs from the authored syllabus.');
  report.authenticatedLessons = ordered.length;
  report.orderVerified = true;
  console.log('Korean live verification: 60/60 authenticated lessons, exact content/answers/order, 180 translated examples, 300 exercises, zero human-review records.');
  if (args.includes('--browser')) {
    await startBrowser();
    const before = report.checks;
    report.browser = await verifyKoreanBrowser({ browser, base: 'http://127.0.0.1:3124', account, points, check });
    report.browser.checks = report.checks - before;
    console.log(`Korean production-browser smoke: ${report.browser.checks} checks passed; 60 lesson cards, first/middle/last lessons, reload and two devices.`);
  }
  report.passed = true;
}
async function koreanSnapshot(points) {
  const ids = points.map(point => point.id), result = {};
  const current = await allRows('grammar_points', ['id'], query => query.eq('language', 'ko'));
  check(current.length === 60 && current.every(point => ids.includes(point.id)), 'Korean point identities or total count do not match the source.');
  result.grammar_points = { rows: current.length, sha256: hash(current) };
  for (const [table, order] of [['grammar_versions', ['point_id', 'content_version']], ['grammar_examples', ['point_id', 'content_version', 'ordinal']], ['grammar_exercises', ['point_id', 'content_version', 'ordinal']], ['grammar_sources', ['point_id', 'content_version', 'ordinal']], ['grammar_reviews', ['point_id', 'content_version', 'id']]]) {
    const rows = await allRows(table, order, query => query.in('point_id', ids));
    if (table === 'grammar_versions') check(rows.length === 60 && rows.every(row => row.status === 'published-ai' && isDeepStrictEqual(row.manifest, points.find(point => point.id === row.point_id))), 'Stored Korean versions differ from the exact intended manifests.');
    result[table] = { rows: rows.length, sha256: hash(rows) };
  }
  return result;
}
try { await main(); }
catch (error) { report.passed = false; report.error = redact(error instanceof Error ? error.message.split('\n')[0] : 'Korean publication verification failed.'); console.error(report.error); process.exitCode = 1; }
finally {
  try { await browser?.close(); }
  catch { process.exitCode = 1; console.error('Browser shutdown failed; continuing account and integrity cleanup.'); }
  if (server?.pid && server.exitCode === null) {
    if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { server.kill(); } }
    else server.kill();
  }
  serverLog?.end();
  if (account) {
    try {
      const removed = await admin.auth.admin.deleteUser(account.id);
      check(!removed.error, 'Temporary Korean verification account cleanup failed.');
      for (const table of ['profiles', 'vocabulary_lists', 'vocabulary_entries', 'word_progress', 'quiz_sessions', 'alphabet_quiz_sessions', 'learning_activity', 'readings', 'translation_cache', 'grammar_progress', 'word_pairs', 'word_care_states', 'quiz_preferences']) {
        const residual = await admin.from(table).select('user_id', { count: 'exact', head: true }).eq('user_id', account.id);
        check(!residual.error && residual.count === 0, 'Temporary Korean verification data cleanup failed.');
      }
      const absent = await admin.auth.admin.getUserById(account.id);
      check(!absent.data.user && Boolean(absent.error), 'Temporary auth account remains after deletion.');
      report.temporaryAccountRemoved = true;
      console.log('Temporary Korean verification account removed; no owned test data remains.');
    } catch { report.temporaryAccountRemoved = false; process.exitCode = 1; console.error('Temporary Korean verification cleanup failed; identifiers withheld.'); }
  }
  if (originalBefore) {
    try {
      report.originalAfter = await originalSnapshot();
      check(isDeepStrictEqual(originalBefore, report.originalAfter), 'Original grammar content or review/version history changed.');
      report.original240Unchanged = true;
      console.log('Original 240 lessons and all version/example/exercise/source/review records are unchanged.');
    } catch { report.original240Unchanged = false; process.exitCode = 1; console.error('Original grammar integrity verification failed; inspect the local report before release.'); }
  }
  report.completedAt = new Date().toISOString();
  report.exitCode = process.exitCode ?? 0;
  report.passed = report.passed === true && report.exitCode === 0;
  await mkdir('.local-preview', { recursive: true });
  await writeFile(`.local-preview/korean-production-${args.includes('--import') ? 'import' : 'verification'}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`Korean production verification: ${report.checks} checks passed; no migrations or deployment executed.`);
}
