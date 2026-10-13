import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, createWriteStream, existsSync, writeFileSync } from 'node:fs';
import { createCloudDomainLoader } from './cloud-domain-loader.mjs';
import { verifyExtensionScenarios } from './cloud-extension-scenarios.mjs';
import { verifyExtensionGrammar } from './cloud-extension-grammar.mjs';
import { verifyExtensionBrowser } from './cloud-extension-browser.mjs';

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const privateKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const accounts = [];
let admin, passed = 0, phase = 'baseline', server, serverLog, browser;
let existingUserIds = [];
const counts = {}, issues = [];
const report = { startedAt: new Date().toISOString(), migrationExecution: 'none', phases: counts, issues };
const check = (condition, message) => { if (!condition) throw new Error(message); passed++; counts[phase] = (counts[phase] ?? 0) + 1; };
const ownerTables = ['profiles','vocabulary_lists','vocabulary_entries','accepted_answers','vocabulary_examples','vocabulary_related_words','word_progress','quiz_sessions','quiz_questions','quiz_attempts','retry_reservations','review_settlements','learning_activity','readings','reading_versions','reading_annotations','translation_cache','grammar_progress','alphabet_quiz_sessions','alphabet_quiz_attempts','word_pairs','quiz_preferences','word_care_states'];
function redact(value) {
  let result = String(value).replace(/cookie:[^\r\n]*/gi, 'cookie: [redacted]').replace(/([?&](?:token_hash|code|access_token|refresh_token)=)[^&\s]*/gi, '$1[redacted]');
  for (const name of ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DEEPL_API_KEY', 'DATABASE_URL', 'SUPABASE_ACCESS_TOKEN']) if (process.env[name]) result = result.split(process.env[name]).join('[redacted]');
  for (const record of accounts) for (const value of [record.email, record.password, record.id]) result = result.split(value).join('[temporary-account]');
  return result;
}
async function startBrowser() {
  if (!existsSync('.next/BUILD_ID')) throw new Error('A production build is required for live browser verification.');
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('Port 3123 is occupied; an unknown server will not be reused.')));
    probe.listen(3123, '127.0.0.1', () => probe.close(resolve));
  });
  mkdirSync('.local-preview', { recursive: true });
  serverLog = createWriteStream('.local-preview/cloud-extension-server.log', { flags: 'w' });
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3123'], { env: { ...process.env, NINGLINGO_REPOSITORY_MODE: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.on('data', value => serverLog.write(redact(value)));
  server.stderr.on('data', value => serverLog.write(redact(value)));
  let available = false;
  for (let count = 0; count < 60; count++) {
    if (server.exitCode !== null) throw new Error('Production verification server exited during startup.');
    try { if ((await fetch('http://127.0.0.1:3123/login', { signal: AbortSignal.timeout(2000) })).ok) { available = true; break; } } catch { /* Server is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!available) throw new Error('Production verification server startup exceeded its time limit.');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
}
const client = key => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.any([AbortSignal.timeout(20000), ...(init.signal ? [init.signal] : [])]) }) } });
async function data(query, message) { const result = await query; check(!result.error, message); return result.data; }
async function denied(query, message) { const result = await query; check(result.error?.code === '42501', message); }
async function account() {
  const email = `ninglingo-extension-${randomUUID()}@example.invalid`;
  const password = randomBytes(30).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Disposable extension verification' } });
  check(!created.error && Boolean(created.data.user), 'Disposable account provisioning failed; credentials withheld.');
  const record = { id: created.data.user.id, user: created.data.user, email, password, client: client(publicKey), secondDevice: client(publicKey) };
  accounts.push(record);
  for (const device of [record.client, record.secondDevice]) {
    const login = await device.auth.signInWithPassword({ email, password });
    check(!login.error && Boolean(login.data.session), 'Disposable account authentication failed; credentials withheld.');
  }
  return record;
}
function alphabetFixture(userId, day) {
  const id = randomUUID(), createdAt = new Date().toISOString(), itemId = 'ja-hiragana-あ';
  const item = { itemId, language: 'ja', group: 'Hiragana', symbol: 'あ', name: 'a', pronunciation: 'ah', pronunciationAnswers: ['a', 'ah'], example: 'あさ', exampleTranslation: 'morning', audioText: 'あ', exampleReading: 'あさ' };
  const template = { id: `template:${itemId}`, position: -1, itemId, kind: 'initial', prompt: 'あ', acceptedAnswers: ['a', 'ah'] };
  const question = { ...template, id: `${id}:0`, position: 0 };
  return { id, userId, language: 'ja', contentVersion: 1, items: [item], questionTemplates: [template], questions: [question], currentQuestion: question,
    attempts: [], reservations: [], testedItemIds: [], retryCompletedItemIds: [], status: 'active', randomSeed: 7, randomState: 7, schedulerVersion: 1,
    version: 1, createdAt, updatedAt: createdAt, learningDate: day, configuration: { retryRange: [0, 0] } };
}
async function commitAlphabet(previous, next, submissionId = null) {
  return data(admin.rpc('nl_commit_alphabet_quiz', { p_user_id: previous.userId, p_session_id: previous.id, p_expected_version: previous.version, p_state: next, p_submission_id: submissionId }), 'Baseline Alphabet transactional update failed.');
}
function status(previous, nextStatus) { return { ...previous, status: nextStatus, version: previous.version + 1, updatedAt: new Date().toISOString() }; }

async function main() {
  if (!url || !publicKey || !privateKey) throw new Error('Live extension verification requires configured public and server-only Supabase keys.');
  admin = client(privateKey);
  const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  check(!existing.error, 'Pre-existing account inventory could not be read.');
  existingUserIds = existing.data.users.map(user => user.id);
  // Probe schema before creating any disposable records. No old migrations or DDL.
  for (const [table, columns] of [['alphabet_quiz_sessions', 'id,snapshot,state'], ['alphabet_quiz_attempts', 'item_id,correct'], ['translation_cache', 'lookup_kind,target_language']]) {
    await data(admin.from(table).select(columns).limit(0), 'Baseline 013 schema is unavailable; no migration replay was attempted.');
  }
  for (const [table, columns] of [['word_pairs','user_id,status,confidence,warning'], ['quiz_preferences','user_id,presentation,vocabulary_auto_audio,alphabet_auto_audio'], ['word_care_states','user_id,word_id,manual_care,automatic_suppressed'], ['quiz_sessions','presentation,participating_languages,state,snapshot'], ['quiz_questions','configuration,word_id']]) {
    await data(admin.from(table).select(columns).limit(0), 'Required extension schema is unavailable; no migration execution was attempted.');
  }
  const grammarBefore = await data(admin.from('grammar_versions').select('point_id,content_version,status').order('point_id').order('content_version'), 'Read-only Grammar inventory failed.');
  const a = await account(), b = await account();
  const day = await data(admin.rpc('nl_learning_date', { p_user_id: a.id }), 'Account learning date lookup failed.');
  const listA = await data(a.client.from('vocabulary_lists').insert({ user_id: a.id, language: 'ja', name: 'Disposable extension A' }).select().single(), 'Owned list creation failed.');
  const listB = await data(b.client.from('vocabulary_lists').insert({ user_id: b.id, language: 'ja', name: 'Disposable extension B' }).select().single(), 'Second owned list creation failed.');
  const input = { language: 'ja', listId: listA.id, word: '犬', translation: 'dog', reading: 'いぬ', type: 'noun', category: 'animals', notes: 'Disposable verification only',
    acceptedAnswers: [{ text: 'hound' }], examples: [{ text: '犬です。', translation: 'It is a dog.', reading: 'いぬです。' }], relatedWords: [{ word: '子犬', reading: 'こいぬ', translation: 'puppy', relationType: 'derived' }] };
  const word = await data(a.client.rpc('nl_save_vocabulary', { p_entry: input }), 'Owned vocabulary save failed.');
  const synced = await data(a.secondDevice.rpc('nl_vocabulary_entries', { p_language: 'ja' }), 'Second-device vocabulary sync failed.');
  check(synced.some(entry => entry.id === word.id && entry.examples.length === 1 && entry.relatedWords.length === 1 && entry.acceptedAnswers.length === 1), 'Second device lost complete vocabulary metadata.');
  await denied(b.client.rpc('nl_save_vocabulary', { p_entry: { ...input, word: 'foreign attempt' } }), 'Foreign vocabulary owner boundary failed.');
  await denied(b.client.from('vocabulary_lists').insert({ user_id: a.id, language: 'ja', name: 'Foreign attempt' }), 'Foreign list insertion escaped RLS.');
  const importFailure = await b.client.rpc('nl_import_vocabulary', { p_entries: [{ ...input, listId: listB.id, word: 'rollback-first' }, input] });
  check(Boolean(importFailure.error), 'Cross-owner atomic import unexpectedly succeeded.');
  check((await data(b.client.rpc('nl_vocabulary_entries', { p_language: 'ja' }), 'Second account rollback read failed.')).length === 0, 'Rejected import left a partial word.');
  // Exercise legacy frozen Vocabulary grading and SRS settlement independently
  // of the application before testing the actual extended repositories.
  const quizId = randomUUID(), quizAt = new Date().toISOString();
  const template = { id: `template:${word.id}`, position: -1, wordId: word.id, kind: 'initial', prompt: word.word, choices: [], correctChoiceId: null, acceptedAnswers: ['dog', 'hound'] };
  const question = { ...template, id: `${quizId}:0`, position: 0 };
  let quiz = await data(admin.rpc('nl_create_quiz', { p_user_id: a.id, p_state: { id: quizId, userId: a.id, language: 'ja', type: 'typing', entries: [word], questionTemplates: [template], questions: [question], currentQuestion: question,
    attempts: [], reservations: [], testedWordIds: [], retryCompletedWordIds: [], status: 'active', randomSeed: 7, randomState: 7, schedulerVersion: 1, version: 1,
    createdAt: quizAt, updatedAt: quizAt, learningDate: day, dueWordIds: [], settled: false, configuration: { minChoices: 2, maxChoices: 4, retryRange: [0, 0] } } }), 'Legacy Vocabulary session creation failed.');
  const commitQuiz = (previous, next, id = null) => data(admin.rpc('nl_commit_quiz', { p_user_id: a.id, p_session_id: quizId, p_expected_version: previous.version, p_state: next, p_submission_id: id }), 'Legacy Vocabulary transaction failed.');
  const progressBefore = await data(a.client.rpc('nl_progress_words', { p_language: 'ja' }), 'Initial Vocabulary SRS read failed.');
  quiz = (await commitQuiz(quiz, status(quiz, 'saved'))).session;
  const quizRestored = await data(a.secondDevice.from('quiz_sessions').select('state').eq('id', quizId).single(), 'Second-device Vocabulary session read failed.');
  check(JSON.stringify(quizRestored.state) === JSON.stringify(quiz), 'Second-device Vocabulary save/resume snapshot changed.');
  quiz = (await commitQuiz(quiz, status(quiz, 'active'))).session;
  await data(a.client.rpc('nl_save_vocabulary', { p_entry_id: word.id, p_entry: { ...input, translation: 'edited live meaning', acceptedAnswers: [] } }), 'Live word edit fixture failed.');
  const vocabularySubmission = randomUUID(), vocabularyAnsweredAt = new Date().toISOString();
  const quizCompleted = { ...quiz, version: quiz.version + 1, updatedAt: vocabularyAnsweredAt, status: 'completed', currentQuestion: null, testedWordIds: [word.id],
    attempts: [{ id: vocabularySubmission, questionId: question.id, wordId: word.id, position: 0, kind: 'initial', answer: 'DOG', correct: true, answeredAt: vocabularyAnsweredAt }] };
  const graded = (await commitQuiz(quiz, quizCompleted, vocabularySubmission)).session;
  check(graded.status === 'completed' && graded.settled && graded.entries[0].translation === 'dog' && graded.attempts[0].correct, 'Live edits changed the legacy frozen answer or settlement.');
  const replayedQuiz = await commitQuiz(quiz, { ...quizCompleted, entries: [] }, vocabularySubmission);
  check(JSON.stringify(replayedQuiz.session) === JSON.stringify(graded), 'Legacy Vocabulary replay changed a completed session.');
  const progressAfter = await data(a.secondDevice.rpc('nl_progress_words', { p_language: 'ja' }), 'Settled Vocabulary SRS sync failed.');
  const beforeWord = progressBefore.find(progress => progress.wordId === word.id), afterWord = progressAfter.find(progress => progress.wordId === word.id);
  check(afterWord.firstAttempts === beforeWord.firstAttempts + 1 && afterWord.firstCorrect === beforeWord.firstCorrect + 1 && afterWord.stage === beforeWord.stage && afterWord.errors === beforeWord.errors, 'Legacy SRS settlement counts or non-due stage changed.');
  const settlements = await data(a.client.from('review_settlements').select('word_id').eq('session_id', quizId), 'Legacy settlement idempotency read failed.');
  check(settlements.length === 1, 'Legacy submission replay produced duplicate SRS settlements.');
  const reading = await data(a.client.rpc('nl_save_reading', { p_input: { language: 'ja', title: 'Disposable reading', body: '犬です。', status: 'reading' } }), 'Reading save failed.');
  await data(a.client.rpc('nl_annotate_reading', { p_input: { readingId: reading.id, bodyVersion: reading.version, start: 0, end: 1, text: '犬', translation: 'dog', reading: 'いぬ', vocabularyEntryId: word.id } }), 'Owned Reading annotation failed.');
  await denied(b.client.rpc('nl_save_reading', { p_id: reading.id, p_expected_version: reading.version, p_input: { language: 'ja', title: 'Foreign attempt', body: '犬です。', status: 'reading' } }), 'Foreign Reading owner boundary failed.');

  let alphabet = await data(admin.rpc('nl_create_alphabet_quiz', { p_user_id: a.id, p_state: alphabetFixture(a.id, day) }), 'Baseline frozen Alphabet creation failed.');
  const frozen = structuredClone(alphabet.questionTemplates);
  const initial = alphabet.currentQuestion, submission = randomUUID(), answeredAt = new Date().toISOString();
  const retry = { ...alphabet.questionTemplates[0], id: `${alphabet.id}:1`, position: 1, kind: 'retry' };
  const missed = { ...alphabet, version: alphabet.version + 1, updatedAt: answeredAt, randomState: (alphabet.randomState + 0x6D2B79F5) >>> 0,
    attempts: [{ id: submission, questionId: initial.id, itemId: initial.itemId, position: 0, kind: 'initial', answer: 'wrong', correct: false, answeredAt }],
    reservations: [{ itemId: initial.itemId, position: 1, interval: 0 }], testedItemIds: [initial.itemId], questions: [...alphabet.questions, retry], currentQuestion: retry };
  alphabet = (await commitAlphabet(alphabet, missed, submission)).session;
  const replay = await commitAlphabet({ ...alphabet, version: 1 }, { ...alphabet, items: [] }, submission);
  check(JSON.stringify(replay.session) === JSON.stringify(alphabet), 'Baseline answer replay changed the persisted session.');
  alphabet = (await commitAlphabet(alphabet, status(alphabet, 'saved'))).session;
  const restored = await data(a.secondDevice.from('alphabet_quiz_sessions').select('state').eq('id', alphabet.id).single(), 'Second-device Alphabet resume read failed.');
  check(JSON.stringify(restored.state) === JSON.stringify(alphabet), 'Second-device Alphabet snapshot changed.');
  const conflict = await commitAlphabet({ ...alphabet, version: alphabet.version - 1 }, status(alphabet, 'active'));
  check(conflict.conflict && conflict.session.version === alphabet.version, 'Baseline stale-version conflict lost its latest state.');
  alphabet = (await commitAlphabet(alphabet, status(alphabet, 'active'))).session;
  const correctId = randomUUID(), completedAt = new Date().toISOString();
  const completed = { ...alphabet, version: alphabet.version + 1, updatedAt: completedAt, status: 'completed', currentQuestion: null, reservations: [], retryCompletedItemIds: [...alphabet.testedItemIds],
    attempts: [...alphabet.attempts, { id: correctId, questionId: retry.id, itemId: retry.itemId, position: 1, kind: 'retry', answer: 'AH', correct: true, answeredAt: completedAt }] };
  alphabet = (await commitAlphabet(alphabet, completed, correctId)).session;
  check(alphabet.status === 'completed' && JSON.stringify(alphabet.questionTemplates) === JSON.stringify(frozen) && alphabet.attempts.map(value => value.correct).join(',') === 'false,true', 'Baseline retry grading or frozen history changed.');
  const forgedSnapshot = await admin.from('alphabet_quiz_sessions').update({ snapshot: { changed: true } }).eq('id', alphabet.id);
  check(forgedSnapshot.error?.code === '22023', 'Baseline immutable snapshot trigger accepted a replacement.');
  await data(admin.rpc('nl_create_alphabet_quiz', { p_user_id: b.id, p_state: alphabetFixture(b.id, day) }), 'Second account Alphabet fixture failed.');
  const ownerRows = ['profiles','vocabulary_lists','vocabulary_entries','accepted_answers','vocabulary_examples','vocabulary_related_words','word_progress','quiz_sessions','quiz_questions','quiz_attempts','retry_reservations','review_settlements','learning_activity','readings','reading_versions','reading_annotations','translation_cache','grammar_progress','alphabet_quiz_sessions','alphabet_quiz_attempts'];
  for (const table of ownerRows) {
    const hidden = await data(b.client.from(table).select('user_id').eq('user_id', a.id), `Cross-account read failed for ${table}.`);
    check(hidden.length === 0, `Cross-account RLS exposed rows in ${table}.`);
  }
  const reverse = await data(a.client.from('alphabet_quiz_sessions').select('id').eq('user_id', b.id), 'Reverse Alphabet isolation read failed.');
  check(reverse.length === 0, 'Reverse Alphabet RLS exposed a session.');
  for (const [table, patch] of [['word_progress', { stage: 6 }], ['quiz_sessions', { version: 99 }], ['quiz_attempts', { correct: true }], ['alphabet_quiz_sessions', { version: 99 }], ['alphabet_quiz_attempts', { correct: true }], ['learning_activity', { count: 99 }]]) {
    await denied(a.client.from(table).update(patch).eq('user_id', a.id), `Protected direct writes became available in ${table}.`);
  }
  await denied(a.client.from('grammar_versions').update({ status: 'draft' }).eq('point_id', 'disposable-nonexistent'), 'Ordinary accounts gained Grammar publication writes.');
  await denied(a.client.rpc('nl_create_alphabet_quiz', { p_user_id: a.id, p_state: alphabetFixture(a.id, day) }), 'Ordinary accounts gained service-only Alphabet creation.');
  await denied(a.client.rpc('nl_create_quiz', { p_user_id: a.id, p_state: {} }), 'Ordinary accounts gained service-only Vocabulary grading access.');
  const anonymous = client(publicKey);
  for (const table of ['vocabulary_entries', 'quiz_sessions', 'alphabet_quiz_sessions', 'word_progress']) await denied(anonymous.from(table).select('*').limit(0), `Anonymous reads became available in ${table}.`);
  const grammarAfter = await data(admin.from('grammar_versions').select('point_id,content_version,status').order('point_id').order('content_version'), 'Read-only final Grammar inventory failed.');
  check(JSON.stringify(grammarBefore) === JSON.stringify(grammarAfter), 'Grammar publication inventory changed during temporary verification.');
  console.log(`Live legacy baseline: ${counts.baseline} checks passed.`);
  phase = 'features';
  const loadTS = createCloudDomainLoader();
  report.features = await verifyExtensionScenarios({ a, b, admin, anonymous, check, data, denied, loadTS });
  console.log(`Live new-feature integration: ${counts.features} checks passed.`);
  phase = 'grammar';
  report.grammar = await verifyExtensionGrammar({ a, b, admin, check, data, denied, issues, withGrammar: async ({ lesson }) => {
    console.log(`Live Grammar: ${counts.grammar} checks passed; starting actual browser verification.`);
    await startBrowser();
    phase = 'browser';
    report.browser = await verifyExtensionBrowser({ a, b, admin, browser, base: 'http://127.0.0.1:3123', check, data, lesson, loadTS });
    console.log(`Live browser integration: ${counts.browser} checks passed.`);
    phase = 'grammar';
  } });
  report.integrationPassed = true;
  console.log(`Live integration passed ${passed} checks before account cleanup.`);
  for (const issue of issues) console.log(`Readiness gap: ${issue}`);
  if (issues.length) process.exitCode = 2;
}

try { await main(); }
catch (error) { report.failedPhase = phase; report.failure = redact(error instanceof Error ? error.message.split('\n')[0] : 'Live request failed; provider details withheld.'); console.error(report.failure); process.exitCode = 1; }
finally {
  await browser?.close();
  if (server?.pid && server.exitCode === null) {
    if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { server.kill(); } }
    else server.kill();
  }
  serverLog?.end();
  phase = 'cleanup';
  let cleaned = 0;
  for (const record of accounts) {
    try { const removed = await admin.auth.admin.deleteUser(record.id); if (removed.error) throw new Error('cleanup'); cleaned++; }
    catch { console.error('Disposable account cleanup failed; account identifiers withheld.'); process.exitCode = 1; }
  }
  if (accounts.length) {
    console.log(`Cleaned ${cleaned}/${accounts.length} temporary accounts and their owned data.`);
    if (cleaned === accounts.length) {
      for (const table of ownerTables) {
        const residual = await admin.from(table).select('user_id', { count: 'exact', head: true }).in('user_id', accounts.map(record => record.id));
        if (residual.error || residual.count !== 0) { console.error(`Disposable account cleanup verification failed for ${table}.`); process.exitCode = 1; }
        else { passed++; counts.cleanup = (counts.cleanup ?? 0) + 1; }
      }
      const remaining = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const ids = remaining.data?.users.map(user => user.id) ?? [];
      if (remaining.error || accounts.some(record => ids.includes(record.id)) || existingUserIds.some(id => !ids.includes(id))) { console.error('Account cleanup or pre-existing account preservation failed.'); process.exitCode = 1; }
      else { passed++; counts.cleanup++; }
      console.log(`Cleanup verified across ${ownerTables.length} owner tables; pre-existing accounts preserved.`);
    }
  }
  report.temporaryAccountsCreated = accounts.length;
  report.temporaryAccountsRemoved = cleaned;
  report.totalPassedChecks = passed;
  report.completedAt = new Date().toISOString();
  report.exitCode = process.exitCode ?? 0;
  mkdirSync('.local-preview', { recursive: true });
  writeFileSync('.local-preview/cloud-live-verification.json', JSON.stringify(report, null, 2) + '\n');
}
