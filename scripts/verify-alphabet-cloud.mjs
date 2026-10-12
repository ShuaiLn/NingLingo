import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

nextEnv.loadEnvConfig(process.cwd());
// This runner writes exclusively to temporary accounts. Grammar is read only.
// Cache fixtures eliminate billable/real DeepL requests during verification.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const privateKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.NINGLINGO_CLOUD_TEST_URL ?? 'http://127.0.0.1:3102';
const ownedUsers = [];
const privateValues = [privateKey, process.env.DEEPL_API_KEY, process.env.SUPABASE_ACCESS_TOKEN, process.env.DATABASE_URL].filter(Boolean);
let admin, server, browser, passed = 0;
function check(condition, message) { assert.ok(condition, message); passed++; }
function redact(value) {
  let result = String(value).replace(/cookie:[^\r\n]*/gi, 'cookie: [redacted]');
  for (const secret of privateValues) result = result.split(secret).join('[redacted]');
  return result;
}
async function data(query, message) {
  const result = await query;
  check(!result.error, `${message} (${result.error?.code ?? 'database'})`);
  return result.data;
}
async function account() {
  const email = `ninglingo-alphabet-${randomUUID()}@example.invalid`;
  const password = randomBytes(30).toString('base64url');
  privateValues.push(email, password);
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Temporary Alphabet verification' } });
  if (result.error || !result.data.user) throw new Error('Temporary cloud account creation failed; account credentials withheld.');
  ownedUsers.push(result.data.user.id);
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  check(!login.error, 'Temporary account authentication failed');
  return { id: result.data.user.id, email, password, client };
}
async function signIn(context, user) {
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/ja(?:\/|$)/, { timeout: 90_000 });
  return page;
}
async function api(context, operation, args = {}, expected = 200) {
  let response;
  try {
    response = await context.request.post(`${base}/api/repository`, { data: { operation, args }, timeout: 90_000 });
  } catch { throw new Error(`${operation}: authenticated API request failed; request headers withheld.`); }
  check(response.status() === expected, `${operation}: expected HTTP ${expected}, received ${response.status()}`);
  check(response.headers()['content-type']?.includes('application/json'), `${operation}: expected JSON response`);
  const body = await response.json();
  return expected === 200 ? body.data : body;
}
async function startServer() {
  if (process.env.NINGLINGO_CLOUD_TEST_URL) return;
  if (!existsSync('.next/BUILD_ID')) throw new Error('Run npm run build before live Alphabet verification.');
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('Port 3102 is occupied; set NINGLINGO_CLOUD_TEST_URL to an authorized verification server.')));
    probe.listen(3102, '127.0.0.1', () => probe.close(resolve));
  });
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3102'], {
    env: { ...process.env, NINGLINGO_REPOSITORY_MODE: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  // Raw server logs can contain cookies; retain only sanitized output on failure.
  let serverOutput = '';
  for (const stream of [server.stdout, server.stderr]) stream.on('data', value => { serverOutput = (serverOutput + redact(value)).slice(-2000); });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Alphabet verification server exited during startup. ${serverOutput}`);
    try { if ((await fetch(`${base}/login`)).ok) return; } catch { /* Server starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Alphabet verification production server did not become ready.');
}
async function grammarInventory() {
  return data(admin.from('grammar_versions').select('point_id,content_version,status').order('point_id').order('content_version'), 'Read-only Grammar inventory');
}
function wordInput(listId, word, translation) {
  return { language: 'ja', listId, word, reading: '', translation, type: '', category: '', example: '', notes: '', acceptedAnswers: [] };
}

// Delay a real, cache-backed cloud response at the browser boundary. This tests
// edit/file races without enabling test providers in the production HTTP API.
async function holdTranslation(page) {
  let releaseResponse, responseReady, responseFinished;
  const release = new Promise(resolve => { releaseResponse = resolve; });
  const ready = new Promise(resolve => { responseReady = resolve; });
  const finished = new Promise(resolve => { responseFinished = resolve; });
  let request;
  const handler = async route => {
    const payload = route.request().postDataJSON();
    if (payload.operation !== 'vocabulary.resolveTranslations') return route.continue();
    request = payload.args;
    const response = await route.fetch();
    responseReady();
    await release;
    await route.fulfill({ response });
    responseFinished();
  };
  await page.route('**/api/repository', handler);
  return {
    async wait() {
      let timeout;
      try {
        await Promise.race([ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('CSV translation response did not arrive.')), 90_000); })]);
      } finally { clearTimeout(timeout); }
      return request;
    },
    async release() { releaseResponse(); await finished; await page.unroute('**/api/repository', handler); },
  };
}

async function uploadCsv(page, source, name = 'temporary-words.csv') {
  await page.getByLabel('Upload UTF-8 CSV').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(source, 'utf8') });
  return page.getByRole('region', { name: 'CSV import preview' });
}

async function verifyCsvBrowser(page, context) {
  await page.goto(`${base}/ja/vocabulary`);
  await expect(page.getByRole('button', { name: '+ Add word', exact: true })).toBeEnabled();
  let held = await holdTranslation(page);
  let preview = await uploadCsv(page, 'word\n犬\n犬\n犬\n猫');
  const request = await held.wait();
  check(request.rows.length === 2 && request.rows.map(row => row.word).join(',') === '犬,猫', 'Word-only CSV failed to deduplicate the entire preview before requests');
  await expect(preview.getByText('4 unresolved', { exact: true })).toBeVisible();
  check((await api(context, 'vocabulary.entries', { language: 'ja' })).length === 0, 'Pending CSV preview created words');
  await held.release();
  await expect(preview.getByText('2 valid', { exact: true })).toBeVisible();
  await expect(preview.getByText('2 duplicates', { exact: true })).toBeVisible();
  await expect(preview.getByText('Machine translation (cached)', { exact: true })).toHaveCount(4);
  await preview.getByLabel('English meaning for CSV line 2', { exact: true }).fill('hound');
  await expect(preview.getByText('3 valid', { exact: true })).toBeVisible();
  await preview.getByLabel('English meaning for CSV line 2', { exact: true }).fill('dog');
  await expect(preview.getByText('2 valid', { exact: true })).toBeVisible();
  await preview.getByRole('button', { name: 'Confirm import of 2 valid rows', exact: true }).click();
  await expect(preview).toHaveCount(0);
  check((await api(context, 'vocabulary.entries', { language: 'ja' })).length === 2, 'Word-only CSV did not import only unique resolved words');

  held = await holdTranslation(page);
  preview = await uploadCsv(page, 'notes,translation,word,reading,type,category,example\n,,犬,,,,\n,,猫,,,,\nkeep,provided meaning,犬,,,,', 'legacy.csv');
  await held.wait();
  await preview.getByLabel('English meaning for CSV line 2', { exact: true }).fill('manual hound');
  await preview.getByLabel('English meaning for CSV line 3', { exact: true }).fill('temporary kitten');
  await preview.getByLabel('English meaning for CSV line 3', { exact: true }).fill('');
  await held.release();
  await expect(preview.getByLabel('English meaning for CSV line 2', { exact: true })).toHaveValue('manual hound');
  await expect(preview.getByLabel('English meaning for CSV line 3', { exact: true })).toHaveValue('');
  await expect(preview.getByLabel('English meaning for CSV line 4', { exact: true })).toHaveValue('provided meaning');
  await expect(preview.getByText('1 unresolved', { exact: true })).toBeVisible();
  passed += 3; // supplied, manually edited, and manually cleared meanings survived late results

  // A rejected confirmation must retain every row and leave cloud data intact.
  const rejectImport = async route => route.request().postDataJSON().operation === 'vocabulary.import'
    ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary import failure for verification.' }) })
    : route.continue();
  await page.route('**/api/repository', rejectImport);
  await preview.getByRole('button', { name: 'Confirm import of 2 valid rows', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Temporary import failure');
  await expect(preview.getByRole('row')).toHaveCount(4);
  check((await api(context, 'vocabulary.entries', { language: 'ja' })).length === 2, 'Rejected confirmation changed cloud words');
  await page.unroute('**/api/repository', rejectImport);
  await preview.getByRole('button', { name: 'Confirm import of 2 valid rows', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Imported 2 words');
  await expect(preview.getByRole('row')).toHaveCount(2);
  await expect(preview.getByLabel('English meaning for CSV line 3', { exact: true })).toHaveValue('');
  const imported = await api(context, 'vocabulary.entries', { language: 'ja' });
  check(imported.length === 4 && imported.every(row => row.reading === '' && row.example === '' && row.type === '' && row.category === ''), 'Partial atomic import included unresolved data or generated metadata');
  await preview.getByRole('button', { name: 'Retry missing translations', exact: true }).click();
  await expect(preview.getByLabel('English meaning for CSV line 3', { exact: true })).toHaveValue('cat');
  await expect(preview.getByText('1 duplicates', { exact: true })).toBeVisible();
  await preview.getByRole('button', { name: 'Close preview', exact: true }).click();

  held = await holdTranslation(page);
  await uploadCsv(page, 'word\n犬', 'old.csv');
  await held.wait();
  preview = await uploadCsv(page, 'word,translation\n猫,new file meaning', 'replacement.csv');
  await held.release();
  await expect(preview.getByLabel('English meaning for CSV line 2', { exact: true })).toHaveValue('new file meaning');
  await expect(preview.getByRole('row')).toHaveCount(2);
  passed++;
  await preview.getByRole('button', { name: 'Close preview', exact: true }).click();
  held = await holdTranslation(page);
  preview = await uploadCsv(page, 'word\n犬', 'closed.csv');
  await held.wait();
  await preview.getByRole('button', { name: 'Close preview', exact: true }).click();
  await held.release();
  await expect(preview).toHaveCount(0);
  passed++;
}

// An unapplied migration still permits useful ownership/import regression checks.
// This path uses the existing live schema and never starts the application server.
async function verifyExistingCloudBoundaries() {
  const grammarBefore = await grammarInventory();
  const a = await account(), b = await account();
  const listA = await data(a.client.from('vocabulary_lists').insert({ user_id: a.id, language: 'ja', name: 'Temporary baseline A' }).select().single(), 'Create owned baseline list');
  const listB = await data(b.client.from('vocabulary_lists').insert({ user_id: b.id, language: 'ja', name: 'Temporary baseline B' }).select().single(), 'Create second owned baseline list');
  const imported = await data(a.client.rpc('nl_import_vocabulary', { p_entries: [wordInput(listA.id, '犬', 'dog'), wordInput(listA.id, '猫', 'cat'), wordInput(listA.id, '犬', 'dog')] }), 'Existing atomic import');
  check(imported.imported === 2 && imported.duplicates === 1, 'Existing atomic import duplicate handling regressed');
  const before = await data(a.client.rpc('nl_vocabulary_entries', { p_language: 'ja' }), 'Read imported owned words');
  check(before.length === 2, 'Existing atomic import persisted an incorrect row count');
  const foreignRows = await data(b.client.from('vocabulary_entries').select('id').eq('user_id', a.id), 'Existing Vocabulary RLS');
  check(foreignRows.length === 0, 'Existing Vocabulary RLS exposed another account’s rows');
  const foreignSave = await b.client.rpc('nl_save_vocabulary', { p_entry: wordInput(listA.id, 'stolen', 'stolen') });
  check(Boolean(foreignSave.error), 'Existing save accepted another account’s list');
  const foreignImport = await b.client.rpc('nl_import_vocabulary', { p_entries: [wordInput(listB.id, 'first', 'first'), wordInput(listA.id, 'stolen', 'stolen')] });
  check(Boolean(foreignImport.error), 'Existing import accepted another account’s list');
  check((await data(b.client.rpc('nl_vocabulary_entries', { p_language: 'ja' }), 'Read second account after rejected import')).length === 0, 'Ownership failure left a partial import');
  const rollback = await a.client.rpc('nl_import_vocabulary', { p_entries: [wordInput(listA.id, 'rollback-first', 'first'), wordInput(listA.id, 'rollback-invalid', '')] });
  check(Boolean(rollback.error), 'Existing import accepted an empty translation');
  const after = await data(a.client.rpc('nl_vocabulary_entries', { p_language: 'ja' }), 'Read words after rollback');
  check(JSON.stringify(before) === JSON.stringify(after), 'Existing failed import did not roll back atomically');
  for (const [language, text, owner, translation] of [
    ['ja', '犬', a.id, 'A dog'], ['ja', '犬', b.id, 'B dog'], ['es', '犬', a.id, 'Spanish dog'],
  ]) await data(admin.from('translation_cache').insert({ id: randomUUID(), user_id: owner, language, text, context: '', translation, source: 'deepl' }), 'Temporary existing-schema cache fixture');
  const cacheA = await data(a.client.from('translation_cache').select('language,translation').order('language'), 'Existing account A cache RLS');
  const cacheB = await data(b.client.from('translation_cache').select('language,translation'), 'Existing account B cache RLS');
  check(cacheA.length === 2 && cacheA.some(row => row.language === 'ja' && row.translation === 'A dog') && cacheA.some(row => row.language === 'es' && row.translation === 'Spanish dog'), 'Existing cache account/language identities regressed');
  check(cacheB.length === 1 && cacheB[0].translation === 'B dog', 'Existing cache RLS crossed account boundaries');
  const forgedCache = await a.client.from('translation_cache').insert({ user_id: a.id, language: 'ja', text: 'forged', context: '', translation: 'forged', source: 'deepl' });
  check(forgedCache.error?.code === '42501', 'Ordinary account gained privileged cache writes');
  const deniedCreate = await a.client.rpc('nl_create_quiz', { p_user_id: a.id, p_state: {} });
  check(deniedCreate.error?.code === '42501', 'Ordinary account gained service-only Vocabulary quiz RPC access');
  const deniedProgress = await a.client.from('word_progress').update({ stage: 6 }).eq('user_id', a.id);
  check(deniedProgress.error?.code === '42501', 'Ordinary account gained direct SRS grade writes');
  const anonymous = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymousRead = await anonymous.from('vocabulary_entries').select('id');
  check(Boolean(anonymousRead.error), 'Anonymous client gained existing Vocabulary reads');
  const boundary = await data(admin.rpc('nl_learning_date', { p_user_id: a.id, p_at: '2026-10-12T06:59:59Z' }), 'Existing account timezone date');
  check(boundary === '2026-10-11', 'Existing timezone boundary calculation regressed');
  check(JSON.stringify(grammarBefore) === JSON.stringify(await grammarInventory()), 'Grammar inventory changed during existing-schema verification');
  console.log(`Existing live Cloud isolation/import/cache checks passed: ${passed} checks using two temporary accounts. Grammar inventory unchanged; no DeepL requests made.`);
}

try {
  if (!url || !publicKey || !privateKey) throw new Error('Cloud Alphabet verification needs the configured public Supabase URL/key and server-only admin key.');
  admin = createClient(url, privateKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const schema = await admin.from('alphabet_quiz_sessions').select('id,content_version,snapshot').limit(0);
  const attempts = await admin.from('alphabet_quiz_attempts').select('session_id,item_id').limit(0);
  const cacheSchema = await admin.from('translation_cache').select('lookup_kind,target_language').limit(0);
  if (schema.error || attempts.error || cacheSchema.error) {
    const codes = [schema.error?.code, attempts.error?.code, cacheSchema.error?.code].filter(Boolean).join(',');
    await verifyExistingCloudBoundaries();
    throw new Error(`EXTERNAL BLOCKER: apply database/migrations/013_alphabet_quiz.sql to the connected Supabase project before new-feature live verification (${codes}). Existing isolation/import/cache checks passed; new Alphabet transitions and Vocabulary lookup namespace checks require 013. This runner did not apply migrations.`);
  }
  const grammarBefore = await grammarInventory();
  await startServer();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const a = await account(), b = await account();
  const context = await browser.newContext(), foreign = await browser.newContext();
  const page = await signIn(context, a);
  await signIn(foreign, b);
  const secondDevice = await browser.newContext({ storageState: await context.storageState() });
  const unauthenticated = await browser.newContext();
  await api(unauthenticated, 'alphabetQuiz.sessions', { language: 'ja' }, 401);
  await unauthenticated.close();

  for (const [language, itemId, accepted, rejected] of [
    ['ja', 'ja-hiragana-あ', 'ah', 'i'], ['es', 'es-letter-1', 'b', 'be'],
    ['el', 'el-lower-1', 'v', 'b'], ['el', 'el-lower-3', 'dh', 'th'], ['es', 'es-letter-7', 'silent', 'hache'],
  ]) {
    let current = await api(context, 'alphabetQuiz.create', { language, itemIds: [itemId], randomSeed: 28 });
    check(current.contentVersion === 1 && current.items[0].itemId === itemId, `${language}: missing immutable content version/items`);
    const snapshot = structuredClone(current.items);
    const wrongId = randomUUID();
    const initial = current;
    current = await api(context, 'alphabetQuiz.answer', { id: current.id, answer: rejected, version: current.version, submissionId: wrongId });
    check(current.attempts.length === 1 && !current.attempts[0].correct && current.currentQuestion.kind === 'retry', `${language}: incorrect pronunciation did not retry`);
    const replay = await api(secondDevice, 'alphabetQuiz.answer', { id: initial.id, answer: accepted, version: initial.version, submissionId: wrongId });
    check(JSON.stringify(replay) === JSON.stringify(current), `${language}: duplicate submission changed state`);
    const conflict = await api(secondDevice, 'alphabetQuiz.answer', { id: initial.id, answer: accepted, version: initial.version, submissionId: randomUUID() }, 409);
    check(JSON.stringify(conflict.latest) === JSON.stringify(current), `${language}: version conflict omitted latest session`);
    const saved = await api(context, 'alphabetQuiz.save', { id: current.id, version: current.version });
    const refreshed = await api(secondDevice, 'alphabetQuiz.session', { id: current.id });
    check(refreshed.status === 'saved' && JSON.stringify(refreshed.items) === JSON.stringify(snapshot), `${language}: save/refresh changed snapshot`);
    current = await api(secondDevice, 'alphabetQuiz.resume', { id: saved.id, version: saved.version });
    current = await api(secondDevice, 'alphabetQuiz.answer', { id: current.id, answer: accepted.toUpperCase(), version: current.version, submissionId: randomUUID() });
    check(current.status === 'completed' && current.attempts[1].correct && JSON.stringify(current.items) === JSON.stringify(snapshot), `${language}: frozen equivalent answer/save-resume failed`);
    const records = await data(a.client.from('alphabet_quiz_attempts').select('kind,correct').eq('session_id', current.id).order('position'), 'Read owned Alphabet attempts');
    check(records.length === 2 && !records[0].correct && records[1].correct, `${language}: cloud attempt history mismatch`);
  }

  const ui = await api(context, 'alphabetQuiz.create', { language: 'ja', itemIds: ['ja-hiragana-あ'], randomSeed: 7 });
  await page.goto(`${base}/ja/alphabet?session=${ui.id}`);
  await expect(page.getByRole('button', { name: 'Show Letter Name', exact: true })).toBeVisible();
  const beforeHints = await api(context, 'alphabetQuiz.session', { id: ui.id });
  await page.getByRole('button', { name: 'Show Letter Name', exact: true }).click();
  await page.getByRole('button', { name: 'Show Association', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide Association', exact: true })).toBeVisible();
  const afterHints = await api(context, 'alphabetQuiz.session', { id: ui.id });
  check(JSON.stringify(afterHints) === JSON.stringify(beforeHints), 'Opening hints changed persisted score/progress/version');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show Letter Name', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show Association', exact: true })).toBeVisible();
  const frozen = await data(admin.from('alphabet_quiz_sessions').select('snapshot,state').eq('id', ui.id).single(), 'Read saved immutable snapshot');
  const changedSnapshot = structuredClone(frozen.snapshot);
  changedSnapshot.items[0].symbol = 'forged character';
  changedSnapshot.items[0].pronunciationAnswers = ['forged answer'];
  const snapshotWrite = await admin.from('alphabet_quiz_sessions').update({ snapshot: changedSnapshot }).eq('id', ui.id);
  check(snapshotWrite.error?.code === '22023', 'Database allowed replacement of an existing immutable snapshot');
  const changedState = structuredClone(frozen.state);
  changedState.items[0].audioText = 'forged audio';
  const stateWrite = await admin.from('alphabet_quiz_sessions').update({ state: changedState }).eq('id', ui.id);
  check(stateWrite.error?.code === '22023', 'Database allowed changed immutable item data inside session state');
  const stillFrozen = await data(admin.from('alphabet_quiz_sessions').select('snapshot,state').eq('id', ui.id).single(), 'Read snapshot after rejected replacement');
  check(JSON.stringify(stillFrozen) === JSON.stringify(frozen), 'Rejected snapshot changes damaged the saved session');
  const foreignRead = await b.client.from('alphabet_quiz_sessions').select('id').eq('id', ui.id);
  check(!foreignRead.error && foreignRead.data.length === 0, 'RLS exposed another account’s Alphabet session');
  check((await api(foreign, 'alphabetQuiz.sessions', { language: 'ja' })).length === 0, 'API exposed another account’s Alphabet history');
  await api(foreign, 'alphabetQuiz.session', { id: ui.id }, 400);
  await api(foreign, 'alphabetQuiz.answer', { id: ui.id, answer: 'a', version: ui.version, submissionId: randomUUID() }, 400);
  const denied = await a.client.rpc('nl_create_alphabet_quiz', { p_user_id: a.id, p_state: ui });
  check(denied.error?.code === '42501', 'Authenticated account gained service-only Alphabet RPC access');
  const deniedCommit = await a.client.rpc('nl_commit_alphabet_quiz', { p_user_id: a.id, p_session_id: ui.id, p_expected_version: ui.version, p_state: ui });
  check(deniedCommit.error?.code === '42501', 'Authenticated account gained service-only commit access');
  const deniedWrite = await a.client.from('alphabet_quiz_sessions').update({ version: 999 }).eq('id', ui.id);
  check(deniedWrite.error?.code === '42501', 'Authenticated account gained direct Alphabet state writes');
  const deniedAttempt = await a.client.from('alphabet_quiz_attempts').delete().eq('session_id', ui.id);
  check(deniedAttempt.error?.code === '42501', 'Authenticated account gained direct Alphabet attempt writes');
  let ownB = await api(foreign, 'alphabetQuiz.create', { language: 'es', itemIds: ['es-letter-1'], randomSeed: 3 });
  ownB = await api(foreign, 'alphabetQuiz.answer', { id: ownB.id, answer: 'b', version: ownB.version, submissionId: randomUUID() });
  const hiddenB = await data(a.client.from('alphabet_quiz_sessions').select('id').eq('id', ownB.id), 'Reverse Alphabet session RLS');
  const hiddenAttemptsA = await data(b.client.from('alphabet_quiz_attempts').select('id').eq('user_id', a.id), 'Alphabet attempt RLS B to A');
  const hiddenAttemptsB = await data(a.client.from('alphabet_quiz_attempts').select('id').eq('user_id', b.id), 'Alphabet attempt RLS A to B');
  check(hiddenB.length === 0 && hiddenAttemptsA.length === 0 && hiddenAttemptsB.length === 0, 'Populated two-account Alphabet isolation failed');
  check(!(await api(context, 'alphabetQuiz.sessions', { language: 'es' })).some(session => session.id === ownB.id), 'Alphabet API history crossed account boundaries');
  await api(context, 'alphabetQuiz.end', { id: ui.id, version: ui.version }, 409);
  const latestUi = await api(context, 'alphabetQuiz.session', { id: ui.id });
  const endedUi = await api(context, 'alphabetQuiz.end', { id: ui.id, version: latestUi.version });
  check(endedUi.status === 'ended' && endedUi.currentQuestion === null, 'Alphabet end operation did not preserve a closed history record');
  const vocabularySessions = await api(context, 'quiz.sessions', { language: 'ja' });
  check(vocabularySessions.length === 0, 'Alphabet sessions leaked into Vocabulary history');
  check((await api(context, 'progress.words', { language: 'ja' })).length === 0, 'Alphabet modified Vocabulary SRS');
  const activities = await api(context, 'progress.activity', { language: 'ja' });
  check(activities.length > 0 && activities.every(record => record.kind === 'alphabet-quiz'), 'Alphabet answers did not produce independent activity');
  const timezoneDate = await data(admin.rpc('nl_learning_date', { p_user_id: a.id, p_at: '2026-10-12T06:59:59Z' }), 'Account timezone boundary');
  check(timezoneDate === '2026-10-11', 'Alphabet account learning dates ignored timezone');
  await page.goto(`${base}/ja/progress`);
  const history = page.getByRole('region', { name: 'Alphabet practice history' });
  await expect(history.getByText('Alphabet first-attempt accuracy', { exact: true })).toBeVisible();
  await expect(history.locator('.alphabet-accuracy')).toHaveText('0%');
  await expect(history.getByRole('link', { name: 'View alphabet quiz', exact: true })).toHaveCount(2);
  passed++; // cloud-backed independent history and first-attempt accuracy rendered

  const fixtures = [
    [a.id, 'ja', '犬', 'vocabulary', 'dog'], [a.id, 'ja', '猫', 'vocabulary', 'cat'],
    [a.id, 'ja', '犬', 'reading', 'contextual dog'], [b.id, 'ja', '犬', 'vocabulary', 'B-private dog'],
    [a.id, 'es', '犬', 'vocabulary', 'Spanish-private dog'], [a.id, 'es', 'café', 'vocabulary', 'coffee'],
    [a.id, 'es', 'CAFÉ', 'vocabulary', 'capital coffee'],
  ];
  await data(admin.from('translation_cache').insert(fixtures.map(([user_id, language, text, lookup_kind, translation]) => ({
    id: randomUUID(), user_id, language, text, context: '', lookup_kind, target_language: 'EN', translation, source: 'deepl',
  }))), 'Temporary translation cache fixtures');
  const duplicates = await api(context, 'vocabulary.resolveTranslations', { language: 'ja', rows: [
    { line: 2, word: '犬' }, { line: 3, word: ' 犬 ' }, { line: 4, word: '犬' }, { line: 5, word: '猫' },
  ] });
  check(duplicates.map(row => row.translation).join(',') === 'dog,dog,dog,cat' && duplicates.every(row => row.source === 'cache'), 'Unique cache lookup did not map ordered duplicate rows');
  const isolatedB = await api(foreign, 'vocabulary.resolveTranslations', { language: 'ja', rows: [{ line: 2, word: '犬' }] });
  check(isolatedB[0].translation === 'B-private dog', 'Vocabulary cache crossed account boundaries');
  const isolatedLanguage = await api(context, 'vocabulary.resolveTranslations', { language: 'es', rows: [{ line: 2, word: '犬' }] });
  check(isolatedLanguage[0].translation === 'Spanish-private dog', 'Vocabulary cache crossed language boundaries');
  const canonical = await api(context, 'vocabulary.resolveTranslations', { language: 'es', rows: [
    { line: 2, word: 'café' }, { line: 3, word: 'cafe\u0301' }, { line: 4, word: 'CAFÉ' },
  ] });
  check(canonical.map(row => row.translation).join(',') === 'coffee,coffee,capital coffee', 'NFC equivalence/case-preserving Vocabulary cache failed');
  check((await api(context, 'vocabulary.entries', { language: 'ja' })).length === 0, 'Translation preview created Vocabulary entries');
  check((await api(context, 'progress.words', { language: 'ja' })).length === 0, 'Translation preview created SRS data');
  const readingCache = await api(context, 'reading.cache');
  check(readingCache.length === 1 && readingCache[0].translation === 'contextual dog', 'Vocabulary cache contaminated Reading lookups');

  const list = await api(context, 'vocabulary.createList', { language: 'ja', name: 'Temporary resolved CSV import' });
  await verifyCsvBrowser(page, context);
  const wordsBeforeRollback = await api(context, 'vocabulary.entries', { language: 'ja' });
  const rollback = await a.client.rpc('nl_import_vocabulary', { p_entries: [wordInput(list.id, 'rollback-first', 'first'), wordInput(list.id, 'rollback-invalid', '')] });
  check(Boolean(rollback.error), 'Invalid import unexpectedly committed');
  const wordsAfterRollback = await api(context, 'vocabulary.entries', { language: 'ja' });
  check(JSON.stringify(wordsBeforeRollback) === JSON.stringify(wordsAfterRollback), 'Failed atomic import left partial Vocabulary data');
  check((await api(foreign, 'vocabulary.entries', { language: 'ja' })).length === 0, 'Imported Vocabulary crossed account boundaries');
  const grammarAfter = await grammarInventory();
  check(JSON.stringify(grammarBefore) === JSON.stringify(grammarAfter), 'Grammar statuses/content versions changed during verification');
  console.log(`Cloud Alphabet/Vocabulary verification passed ${passed} checks using two temporary accounts. Grammar inventory unchanged; no DeepL requests made.`);
} catch (error) {
  const message = redact(error instanceof Error ? error.message : 'Cloud Alphabet verification failed.');
  console.error(message);
  process.exitCode = message.includes('EXTERNAL BLOCKER:') ? 2 : 1;
} finally {
  await browser?.close();
  server?.kill();
  let cleaned = 0;
  for (const id of ownedUsers) {
    try {
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error) throw new Error('cleanup');
      cleaned++;
    } catch {
      console.error(`Temporary verification account cleanup failed for ${id}; remove this disposable account manually.`);
      process.exitCode = 1;
    }
  }
  if (ownedUsers.length) console.log(`Cleaned ${cleaned}/${ownedUsers.length} temporary verification accounts and their owned data.`);
}
