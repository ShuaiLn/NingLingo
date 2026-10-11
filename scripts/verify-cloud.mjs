import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const base = process.env.NINGLINGO_CLOUD_TEST_URL ?? 'http://127.0.0.1:3101';
const ownedUsers = [];
let server, browser, passed = 0;
function check(condition, message) { assert.ok(condition, message); passed++; }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function account() {
  const email = `ninglingo-verification-${randomUUID()}@example.invalid`, password = randomBytes(30).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Temporary verification user' } });
  if (error || !data.user) throw new Error('Supabase admin account creation is unavailable. No credentials were printed.');
  ownedUsers.push(data.user.id);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  check(!login.error, 'Email/password authentication failed');
  return { email, password, id: data.user.id, client };
}
try {
  const a = await account(), b = await account();
  if (!process.env.NINGLINGO_CLOUD_TEST_URL) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3101'], { env: { ...process.env, NINGLINGO_REPOSITORY_MODE: '' }, stdio: 'ignore', windowsHide: true });
    let available = false;
    for (let count = 0; count < 120; count++) { try { if ((await fetch(`${base}/login`)).ok) { available = true; break; } } catch { /* Server is starting. */ } await pause(1000); }
    if (!available) throw new Error('Production-mode verification server could not start.');
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/ja/vocabulary`);
  check(page.url().includes('/login'), 'Unauthenticated protected page did not redirect');
  await page.getByLabel('Email', { exact: true }).fill(a.email);
  await page.getByLabel('Password', { exact: true }).fill(a.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/ja\/vocabulary/);
  check(!page.url().includes('/login'), 'Login did not reach the protected workspace');
  await page.reload();
  check(!page.url().includes('/login'), 'Authenticated cookie session did not persist');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(/\/login/);
  await page.goto(`${base}/ja`);
  check(page.url().includes('/login'), 'Logout did not protect subsequent requests');
  const rejected = await context.request.post(`${base}/api/repository`, { data: { operation: 'settings.profile', args: {} } });
  check(rejected.status() === 401, 'Unauthenticated API request was accepted');
  console.log(`Live authentication: ${passed} assertions passed (temporary users only).`);
  const profile = await a.client.rpc('nl_profile');
  if (profile.error) throw new Error('Live application/RLS verification blocked: NingLingo SQL migrations are not applied to the cloud project.');
  const list = await a.client.from('vocabulary_lists').insert({ user_id: a.id, language: 'es', name: 'Verification only' }).select().single();
  check(!list.error, 'Owned list creation failed');
  const word = { language: 'es', listId: list.data.id, word: 'árbol', reading: '', translation: 'tree', type: 'noun', category: 'verification', example: '', notes: '', acceptedAnswers: [] };
  const imported = await a.client.rpc('nl_import_vocabulary', { p_entries: [word, word, { ...word, translation: 'shaft' }] });
  check(!imported.error && imported.data.imported === 2 && imported.data.duplicates === 1, 'Atomic import/deduplication failed');
  const before = await a.client.rpc('nl_vocabulary_entries', { p_language: 'es' });
  const invalid = await a.client.rpc('nl_import_vocabulary', { p_entries: [{ ...word, word: 'válido' }, { ...word, word: '' }] });
  const after = await a.client.rpc('nl_vocabulary_entries', { p_language: 'es' });
  check(Boolean(invalid.error) && before.data.length === after.data.length, 'Invalid import was not atomic');
  for (const table of ['profiles','vocabulary_lists','vocabulary_entries','accepted_answers','vocabulary_examples','vocabulary_related_words','word_progress','quiz_sessions','quiz_attempts','readings','reading_versions','reading_annotations','translation_cache','grammar_progress','learning_activity']) {
    const foreign = await b.client.from(table).select('*').eq('user_id', a.id);
    check(!foreign.error && foreign.data.length === 0, `RLS isolation failed for ${table}`);
  }
  const foreignMutation = await b.client.from('vocabulary_lists').update({ name: 'forbidden' }).eq('id', list.data.id).select();
  check(!foreignMutation.error && foreignMutation.data.length === 0, 'Cross-user mutation succeeded');
  const forbiddenStage = await a.client.from('word_progress').update({ stage: 6 }).eq('user_id', a.id);
  check(Boolean(forbiddenStage.error), 'Client forged SRS advancement');
  console.log(`Live cloud repository/security: ${passed} total assertions passed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Cloud verification failed.');
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill();
  for (const id of ownedUsers) {
    const removed = await admin.auth.admin.deleteUser(id);
    if (removed.error) { console.error('A temporary verification user could not be removed. Re-run cleanup before production use.'); process.exitCode = 1; }
  }
  console.log(`Cloud verification cleanup: ${ownedUsers.length} temporary accounts removed.`);
}
