import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

// Administrative fixtures belong exclusively to disposable verification users.
// This runner never edits an owner's data or changes grammar publication/review status.
export async function verifyCloudScenarios({ a, b, admin, base, browser, context, check }) {
  const integrationIssues = [];
  async function signIn(target, account) {
    const page = await target.newPage();
    await page.goto(`${base}/login`);
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(/\/ja/, { timeout: 90000 });
    return page;
  }
  async function request(target, operation, args = {}, status = 200, path, timeout = 90000) {
    let response;
    try {
      response = await target.request.post(`${base}${path ?? '/api/repository'}`, {
        data: path ? args : { operation, args }, timeout,
      });
    } catch {
      // Playwright's raw exception includes authentication Cookie headers.
      throw new Error(`${operation}: the authenticated request failed or exceeded ${timeout / 1000} seconds. Inspect the local server log; request headers are withheld.`);
    }
    const body = await response.json();
    check(response.status() === status, `${operation}: expected HTTP ${status}, received ${response.status()} (${body.error ?? 'no error'})`);
    return status === 200 ? body.data : body;
  }
  const api = (operation, args, status, path) => request(context, operation, args, status, path);
  async function database(query, message) {
    const result = await query;
    check(!result.error, `${message}: ${result.error?.code ?? 'unknown database error'}`);
    return result.data;
  }
  function dayAt(instant, timezone) {
    const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
    const value = type => parts.find(part => part.type === type).value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
  function plusDays(day, days) { return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
  async function create(wordIds, type = 'typing', randomSeed = 42) {
    return api('quiz.create', { language: 'ja', wordIds, type, randomSeed }, 200, '/api/quiz/sessions');
  }
  async function answer(session, value, target = context, submissionId = randomUUID(), status = 200) {
    return request(target, 'quiz.answer', { answer: value, version: session.version, submissionId }, status, `/api/quiz/sessions/${session.id}/answers`);
  }
  const correctAnswer = session => session.type === 'typing' ? session.currentQuestion.acceptedAnswers[0] : session.currentQuestion.correctChoiceId;
  async function finish(session) {
    while (session.status === 'active') session = await answer(session, correctAnswer(session));
    check(session.status === 'completed' && session.settled, 'Completed cloud quiz was not settled');
    return session;
  }

  const authResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } });
  check(authResponse.ok, 'Live Auth settings are unavailable');
  const authSettings = await authResponse.json();
  const signupInitiallyDisabled = authSettings.disable_signup === true;
  check(authSettings.external?.email === true, 'Email/password Auth is disabled');
  const signedInPage = await signIn(context, a);
  const browserRequestStatus = await signedInPage.evaluate(async () => (await fetch('/api/repository', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'settings.profile', args: {} }) })).status);
  check(browserRequestStatus === 200, 'Same-origin browser repository requests were rejected');
  const secondDevice = await browser.newContext({ storageState: await context.storageState() });
  const foreignContext = await browser.newContext();
  await signIn(foreignContext, b);
  const profile = await api('settings.profile');
  check(profile.id === a.id && profile.timezone === 'America/Tijuana', 'Profile bootstrap/default timezone failed');
  const preferences = await database(a.client.from('profiles').select('language_preferences').eq('user_id', a.id).single(), 'Language preferences');
  check(preferences.language_preferences.join(',') === 'ja,es,el', 'Profile language preferences were not initialized');
  const updatedProfile = await api('settings.update', { timezone: 'UTC', displayName: 'Cloud verification' });
  check(updatedProfile.timezone === 'UTC', 'Settings timezone did not persist');
  check((await request(secondDevice, 'settings.profile')).timezone === 'UTC', 'Settings did not sync to the second device');
  await api('settings.update', { timezone: 'Not/A_Timezone', displayName: 'Cloud verification' }, 400);
  await api('settings.update', { timezone: 'America/Tijuana', displayName: 'Cloud verification' });
  for (const [instant, expected] of [['2026-01-02T07:59:59Z', '2026-01-01'], ['2026-01-02T08:00:00Z', '2026-01-02']]) {
    const value = await database(admin.rpc('nl_learning_date', { p_user_id: a.id, p_at: instant }), 'Learning-day boundary RPC');
    check(value === expected, 'Cloud learning-day calculation ignored the timezone boundary');
  }
  console.log(`Cloud settings/Auth: cookie sessions, device sync and timezone boundaries passed; signup ${signupInitiallyDisabled ? 'disabled' : 'configuration requires correction'}.`);

  const list = await api('vocabulary.createList', { language: 'ja', name: 'Cloud verification' });
  const renamed = await api('vocabulary.renameList', { id: list.id, name: 'Cloud verification renamed' });
  check(renamed.name.endsWith('renamed'), 'Vocabulary list rename failed');
  const words = [
    ['犬', 'いぬ', 'dog'], ['猫', 'ねこ', 'cat'], ['鳥', 'とり', 'bird'], ['魚', 'さかな', 'fish'],
    ['山', 'やま', 'mountain'], ['川', 'かわ', 'river'], ['水', 'みず', 'water'], ['空', 'そら', 'sky'],
    ['花', 'はな', 'flower'], ['木', 'き', 'tree'], ['雨', 'あめ', 'rain'],
  ];
  const inputs = words.map(([word, reading, translation]) => ({ language: 'ja', listId: list.id, word, reading, translation, type: 'noun', category: 'verification', notes: 'Disposable cloud fixture', example: '', acceptedAnswers: [] }));
  const imported = await api('vocabulary.import', { inputs });
  check(imported.imported === 11 && imported.duplicates === 0, 'Cloud vocabulary import failed');
  let entries = await api('vocabulary.entries', { language: 'ja' });
  const dog = entries.find(entry => entry.word === '犬');
  const detailed = {
    ...inputs[0], acceptedAnswers: [{ id: randomUUID(), text: 'canine' }],
    examples: [{ id: randomUUID(), text: '犬が好きです。', reading: 'いぬがすきです。', translation: 'I like dogs.' }, { id: randomUUID(), text: '犬がいます。', reading: 'いぬがいます。', translation: 'There is a dog.' }],
    relatedWords: ['derived', 'compound', 'synonym', 'antonym', 'word_form', 'related'].map((relationType, index) => ({ id: randomUUID(), word: `explicit fixture ${index}`, reading: '', translation: `fixture ${index}`, relationType })),
  };
  const savedDog = await api('vocabulary.save', { input: detailed, id: dog.id });
  check(savedDog.examples.length === 2 && savedDog.examples[0].translation === 'I like dogs.' && savedDog.relatedWords.length === 6 && savedDog.acceptedAnswers[0].text === 'canine', 'Relational vocabulary examples/relations/answers failed');
  const syncedDog = (await request(secondDevice, 'vocabulary.entries', { language: 'ja' })).find(entry => entry.id === dog.id);
  assert.deepEqual(syncedDog, savedDog); check(true, 'Vocabulary child data did not sync');
  const homograph = await api('vocabulary.import', { inputs: [inputs[0], { ...inputs[0], translation: 'a dog' }] });
  check(homograph.imported === 1 && homograph.duplicates === 1, 'Exact duplicate/homograph handling changed');
  const beforeRollback = await api('vocabulary.entries', { language: 'ja' });
  const broken = await a.client.rpc('nl_import_vocabulary', { p_entries: [{ ...inputs[0], word: 'valid rollback fixture' }, { ...inputs[1], word: '' }] });
  const afterRollback = await api('vocabulary.entries', { language: 'ja' });
  check(Boolean(broken.error) && beforeRollback.length === afterRollback.length, 'Cloud import did not roll back all rows');
  entries = afterRollback.filter(entry => words.some(([word, , translation]) => entry.word === word && entry.translation === translation));
  const insufficient = await api('quiz.create', { language: 'ja', wordIds: [dog.id], type: 'word-meaning' }, 400);
  check(insufficient.error.includes('fewer than two'), 'Insufficient distractors did not explain the problem');
  const cat = entries.find(entry => entry.word === '猫');
  await api('vocabulary.save', { input: { ...inputs[1], acceptedAnswers: [{ id: randomUUID(), text: 'canine' }] }, id: cat.id });
  const ambiguous = await api('quiz.create', { language: 'ja', wordIds: [dog.id, cat.id], type: 'word-meaning' }, 400);
  check(ambiguous.error.includes('unambiguous'), 'Accepted-answer ambiguity allowed a synonymous distractor');
  await api('vocabulary.save', { input: inputs[1], id: cat.id });
  console.log('Cloud vocabulary: relational CRUD, atomic import, duplicates and device reads passed.');

  const directReading = await database(a.client.rpc('nl_save_reading', { p_input: { language: 'ja', title: 'Direct RPC smoke test', body: '犬。', status: 'unread' }, p_id: null, p_clear_annotations: false, p_expected_version: null }), 'Direct cloud Reading RPC');
  await api('reading.delete', { id: directReading.id });
  const smokeReading = await api('reading.save', { input: { language: 'ja', title: 'Reading API smoke test', body: '犬。', status: 'unread' } });
  await api('reading.delete', { id: smokeReading.id });

  for (const type of ['word-meaning', 'meaning-word', 'japanese-reading']) {
    const session = await create(entries.slice(0, 3).map(entry => entry.id), type, 2026);
    check(session.questionTemplates.every(question => question.choices.length >= 2 && question.choices.length <= 4), `${type} choice configuration failed`);
    await finish(session);
  }
  for (const n of [1, 2, 3, 4, 10, 11]) {
    let session = await create(entries.slice(0, n).map(entry => entry.id), 'typing', 800 + n);
    const expected = n === 1 ? [0, 0] : n <= 3 ? [1, n - 1] : n <= 10 ? [3, n - 1] : [3, 10];
    assert.deepEqual(session.configuration.retryRange, expected);
    check(session.entries.length === n, `n=${n}: wrong eligible count`);
    let repeated = false, steps = 0;
    while (session.status === 'active') {
      check(++steps < 150, `n=${n}: cloud retry session did not terminate`);
      const question = session.currentQuestion;
      const initialCount = session.attempts.filter(attempt => attempt.kind === 'initial').length;
      const wrong = (question.kind === 'initial' && (initialCount < 2 || initialCount === n - 1)) || (question.kind === 'retry' && !repeated);
      if (question.kind === 'retry') {
        const previous = session.attempts.filter(attempt => attempt.wordId === question.wordId).at(-1);
        const interval = question.position - previous.position - 1;
        check(!previous.correct && interval >= expected[0] && interval <= expected[1], `n=${n}: retry spacing was shortened or exceeded`);
        if (wrong) repeated = true;
      }
      session = await answer(session, wrong ? '__incorrect__' : correctAnswer(session));
      check(new Set(session.reservations.map(reservation => reservation.position)).size === session.reservations.length, `n=${n}: retry positions collided`);
      check(session.reservations.every(reservation => reservation.interval >= expected[0] && reservation.interval <= expected[1]), `n=${n}: retry outside the allowed interval`);
      check(session.questions.every(item => session.entries.some(entry => entry.id === item.wordId)), `n=${n}: an unselected word appeared`);
      if (session.currentQuestion) check(!session.reservations.some(reservation => reservation.wordId === session.currentQuestion.wordId && reservation.position > session.currentQuestion.position), `n=${n}: pending retry appeared early`);
    }
    check(session.testedWordIds.length === n && session.reservations.length === 0 && session.settled, `n=${n}: completed prematurely`);
    check(session.attempts.length > n && repeated, `n=${n}: tail/repeated retries were not exercised`);
  }
  let session = await create([dog.id], 'typing', 31415);
  const frozen = structuredClone(session.entries);
  await api('vocabulary.save', { input: { ...detailed, translation: 'edited meaning', acceptedAnswers: [] }, id: dog.id });
  session = await api('quiz.save', { id: session.id, version: session.version });
  check(session.status === 'saved', 'Save and Exit failed');
  const resumed = await request(secondDevice, 'quiz.resume', { id: session.id });
  assert.deepEqual(resumed.entries, frozen); check(resumed.status === 'active', 'Resume changed the frozen snapshot');
  const stale = await answer(session, 'canine', context, randomUUID(), 409);
  check(stale.latest.version === resumed.version, 'Stale device did not receive the latest session');
  const submissionId = randomUUID();
  const completed = await answer(resumed, '  CANINE  ', secondDevice, submissionId);
  check(completed.attempts[0].correct && completed.settled, 'Frozen accepted answer or normalization failed');
  const replay = await answer(resumed, '__changed duplicate__', context, submissionId);
  check(replay.version === completed.version && replay.attempts.length === 1, 'Duplicate submission was not idempotent');
  const settlements = await database(a.client.from('review_settlements').select('*').eq('session_id', completed.id), 'Quiz settlements');
  check(settlements.length === 1, 'A completed word settled more than once');
  await api('vocabulary.save', { input: detailed, id: dog.id });
  const deterministicA = await create(entries.slice(0, 4).map(entry => entry.id), 'typing', 123456);
  const deterministicB = await create(entries.slice(0, 4).map(entry => entry.id), 'typing', 123456);
  const nextA = await answer(deterministicA, '__incorrect__');
  const nextB = await answer(deterministicB, '__incorrect__');
  check(nextA.randomState === nextB.randomState && nextA.currentQuestion.wordId === nextB.currentQuestion.wordId, 'Cloud deterministic replay diverged');
  assert.deepEqual(nextA.reservations, nextB.reservations); check(true, 'Deterministic retry reservations diverged');
  // Leave one real pending retry for the final non-vacuous ownership checks.
  await api('quiz.end', { id: nextA.id, version: nextA.version });
  const racing = await create(entries.slice(0, 2).map(entry => entry.id));
  const raceResponses = await Promise.all([context, secondDevice].map(target => target.request.post(`${base}/api/quiz/sessions/${racing.id}/answers`, { data: { answer: correctAnswer(racing), version: racing.version, submissionId: randomUUID() } })));
  check(raceResponses.map(response => response.status()).sort().join(',') === '200,409', 'Concurrent devices did not enforce compare-and-swap');
  const latestRace = await api('quiz.session', { id: racing.id });
  check(latestRace.attempts.length === 1, 'Concurrent answers were persisted twice');
  await api('quiz.end', { id: latestRace.id, version: latestRace.version });
  console.log('Cloud quizzes: all modes/boundary sizes, retries, frozen snapshots, resume, CAS and idempotency passed.');

  const today = dayAt(new Date(), 'America/Tijuana');
  await database(admin.from('word_progress').update({ stage: 0, due_date: today, last_advanced_date: null }).eq('user_id', a.id).eq('word_id', dog.id), 'Due review fixture');
  const due = await finish(await create([dog.id]));
  check(due.learningDate === today && due.dueWordIds.includes(dog.id), 'Due review/timezone capture failed');
  const wordProgress = async () => (await api('progress.words', { language: 'ja' })).find(word => word.wordId === dog.id);
  const promoted = await wordProgress();
  check(promoted.stage === 1 && promoted.dueDate === plusDays(today, 3) && promoted.lastAdvancedDate === today, 'Perfect due review did not advance to three days');
  await finish(await create([dog.id]));
  const early = await wordProgress();
  check(early.stage === promoted.stage && early.dueDate === promoted.dueDate, 'Early practice postponed the due date');
  await database(admin.from('word_progress').update({ due_date: today }).eq('user_id', a.id).eq('word_id', dog.id), 'Same-day due fixture');
  await finish(await create([dog.id]));
  const sameDay = await wordProgress();
  check(sameDay.stage === 1 && sameDay.dueDate === today, 'A word advanced twice on the same learning day');
  const incorrectDue = await answer(await create([dog.id]), '__incorrect__');
  const ended = await api('quiz.end', { id: incorrectDue.id, version: incorrectDue.version });
  const reset = await wordProgress();
  check(ended.settled && reset.stage === 0 && reset.dueDate === plusDays(today, 1) && reset.lastAdvancedDate === today, 'Incorrect due review did not reset to next day');
  const beforeEndReplay = JSON.stringify(reset);
  await api('quiz.end', { id: ended.id, version: ended.version });
  check(JSON.stringify(await wordProgress()) === beforeEndReplay, 'Repeated settlement changed SRS progress');
  const activity = await api('progress.activity', { language: 'ja' });
  check(activity.length > 0 && activity.every(item => item.date === today), 'Cloud activity dates did not map to learning days');
  const initialCount = (await api('quiz.sessions', { language: 'ja' })).reduce((count, item) => count + item.attempts.filter(attempt => attempt.kind === 'initial').length, 0);
  check(initialCount > 0 && activity.length > initialCount, 'Retry/filler statistics fixture was not exercised');
  console.log('Cloud SRS/progress: promotion, early practice, same-day limit, reset and once-only settlement passed.');

  let reading = await api('reading.save', { input: { language: 'ja', title: 'Cloud Reading verification', body: '犬が好きです。未知の文章です。', status: 'reading' } });
  const lookup = async (item, start, end, status = 200, target = context) => request(target, 'reading.lookup', { bodyVersion: item.version, start, end }, status, `/api/readings/${item.id}/lookup`);
  const vocabularyLookup = await lookup(reading, 0, 1);
  check(vocabularyLookup.source === 'vocabulary' && vocabularyLookup.vocabularyEntryId === dog.id, 'Vocabulary lookup priority failed');
  await database(admin.from('translation_cache').insert({ user_id: a.id, language: 'ja', text: '犬', context: '犬が好きです。', translation: 'cache must lose to vocabulary', source: 'deepl' }), 'Cache precedence fixture');
  check((await lookup(reading, 0, 1)).source === 'vocabulary', 'Cache overrode personal vocabulary');
  const annotation = await api('reading.annotate', { readingId: reading.id, bodyVersion: reading.version, start: 0, end: 1, text: '犬', translation: 'manual dog', reading: 'いぬ', vocabularyEntryId: dog.id });
  check(annotation.vocabularyEntryId === dog.id, 'Annotation vocabulary link did not persist');
  check((await lookup(reading, 0, 1)).source === 'annotation', 'Manual annotation did not have highest priority');
  const secondDeviceAnnotations = await request(secondDevice, 'reading.annotations', { id: reading.id });
  check(secondDeviceAnnotations[0].start === 0 && secondDeviceAnnotations[0].end === 1, 'Annotation offsets did not survive cloud mapping');
  await api('reading.save', { input: { language: 'ja', title: reading.title, body: '新しい本文です。', status: 'reading' }, id: reading.id, expectedBodyVersion: reading.version }, 400);
  reading = await api('reading.save', { input: { language: 'ja', title: reading.title, body: '新しい本文です。', status: 'reading' }, id: reading.id, expectedBodyVersion: reading.version, clearAnnotations: true });
  check(reading.version === 2 && (await api('reading.annotations', { id: reading.id })).length === 0, 'Body edit did not invalidate annotations/increment version');
  check((await api('reading.versions', { id: reading.id })).length === 2, 'Reading versions were not retained');
  await lookup({ ...reading, version: 1 }, 0, 1, 400);
  try {
    await request(context, 'reading.save', { input: { language: 'ja', title: reading.title, body: reading.body, status: 'finished' }, id: reading.id, expectedBodyVersion: 1 }, 400, undefined, 8000);
  } catch {
    integrationIssues.push('Reading stale-save RPC did not reject promptly. Apply database/migrations/012_reading_conflict_errors.sql; the currently applied 40001 error triggers PostgREST retries.');
    // Removing this disposable reading stops the retry loop on its next ownership check.
    await api('reading.delete', { id: reading.id });
    reading = await api('reading.save', { input: { language: 'ja', title: reading.title, body: reading.body, status: 'reading' } });
  }
  const staleAnnotationFixture = await api('reading.save', { input: { language: 'ja', title: 'Stale annotation verification', body: '犬。', status: 'reading' } });
  await api('reading.save', { input: { language: 'ja', title: staleAnnotationFixture.title, body: '犬がいます。', status: 'reading' }, id: staleAnnotationFixture.id, expectedBodyVersion: 1 });
  try {
    await request(context, 'reading.annotate', { readingId: staleAnnotationFixture.id, bodyVersion: 1, start: 0, end: 1, text: '犬', translation: 'dog', reading: '', vocabularyEntryId: null }, 400, undefined, 8000);
  } catch {
    integrationIssues.push('Reading stale-annotation RPC did not reject promptly. The same migration 012 corrects its non-retryable error code.');
  } finally {
    await api('reading.delete', { id: staleAnnotationFixture.id });
  }
  const cachedReading = await api('reading.save', { input: { language: 'es', title: 'Context cache', body: 'El banco está cerrado.', status: 'unread' } });
  await database(admin.from('translation_cache').insert({ user_id: a.id, language: 'es', text: 'banco', context: cachedReading.body, translation: 'bank (cached fixture)', source: 'deepl' }), 'Contextual cache fixture');
  const cached = await lookup(cachedReading, 3, 8);
  check(cached.source === 'cache' && cached.translation === 'bank (cached fixture)', 'Contextual cache lookup failed');
  const different = await api('reading.save', { input: { language: 'es', title: 'Different context', body: 'Me siento en el banco.', status: 'unread' } });
  const usageBefore = await api('reading.usage');
  check(usageBefore.available && usageBefore.limit > 0, 'Configured live DeepL allowance is unavailable');
  const machineStart = different.body.indexOf('banco');
  const machineResults = await Promise.all([lookup(different, machineStart, machineStart + 5), lookup(different, machineStart, machineStart + 5)]);
  check(machineResults.some(result => result.source === 'deepl') && machineResults.every(result => ['deepl', 'cache'].includes(result.source) && result.translation && result.reading === '' && result.vocabularyEntryId === null), 'Live DeepL fallback invented dictionary data or failed');
  const reused = await lookup(different, machineStart, machineStart + 5, 200, secondDevice);
  check(reused.source === 'cache' && reused.translation === machineResults[0].translation, 'Machine cache did not persist across devices');
  const machineRows = await database(a.client.from('translation_cache').select('*').eq('text', 'banco').eq('context', different.body), 'Machine cache uniqueness');
  check(machineRows.length === 1, 'Concurrent machine lookup created duplicate cache records');
  const translatedWord = await api('vocabulary.save', { input: { language: 'es', listId: (await api('vocabulary.lists', { language: 'es' }))[0].id, word: 'banco', reading: '', translation: `${reused.translation} (edited)`, type: '', category: '', example: '', notes: 'Edited machine result', acceptedAnswers: [] } });
  check(translatedWord.translation.endsWith('(edited)') && translatedWord.reading === '', 'Edited translation could not be added to vocabulary');
  const greek = await api('reading.save', { input: { language: 'el', title: 'Greek accents', body: 'Η γλώσσα είναι όμορφη.', status: 'reading' } });
  const greekAnnotation = await api('reading.annotate', { readingId: greek.id, bodyVersion: 1, start: 2, end: 8, text: 'γλώσσα', translation: 'language', reading: '', vocabularyEntryId: null });
  check(greekAnnotation.text === 'γλώσσα' && (await lookup(greek, 2, 8)).translation === 'language', 'Greek accents were lost');
  // Restore a positional annotation for the final ownership checks after the edit test.
  await api('reading.annotate', { readingId: reading.id, bodyVersion: reading.version, start: 0, end: 3, text: '新しい', translation: 'new', reading: 'あたらしい', vocabularyEntryId: null });
  const finishedReading = await api('reading.save', { input: { language: 'ja', title: reading.title, body: reading.body, status: 'finished' }, id: reading.id, expectedBodyVersion: reading.version });
  check(finishedReading.status === 'finished' && finishedReading.version === reading.version, 'Reading status edit changed the body version');
  console.log('Cloud Reading/DeepL: annotation/vocabulary/cache/provider priority, contexts, deduplication, versions and accents passed.');

  const content = (await Promise.all(['ja', 'es', 'el'].map(async language => JSON.parse(await readFile(new URL(`../content/grammar/generated/${language}.json`, import.meta.url), 'utf8'))))).flat();
  for (const language of ['ja', 'es', 'el']) {
    const ids = content.filter(point => point.language === language).map(point => point.id);
    const stored = await database(admin.from('grammar_points').select('id,language,current_version').in('id', ids), `${language} cloud grammar`);
    const versions = await database(admin.from('grammar_versions').select('point_id,status,content_version').in('point_id', ids), `${language} draft versions`);
    const reviews = await database(admin.from('grammar_reviews').select('point_id').in('point_id', ids), `${language} review metadata`);
    check(stored.length === ids.length && versions.length === ids.length && versions.every(version => version.status === 'draft' && version.content_version === 1) && reviews.length === 0, `${language}: grammar was not imported strictly as unreviewed drafts`);
    for (const [table, perLesson] of [['grammar_examples', 3], ['grammar_exercises', 5]]) {
      const count = await admin.from(table).select('point_id', { count: 'exact', head: true }).in('point_id', ids);
      check(!count.error && count.count === ids.length * perLesson, `${language}: stored ${table} count differs from the validated dataset`);
    }
    check((await api('grammar.points', { language })).length === 0, 'Production listing exposed unpublished draft lessons');
  }
  const unchangedImport = await database(admin.rpc('nl_import_grammar', { p_points: content }), 'Idempotent draft import');
  check(unchangedImport.imported === 0 && unchangedImport.unchanged === 240, 'Re-import changed immutable draft content');
  const draft = content[0];
  await api('grammar.submit', { pointId: draft.id, answers: [0, 0, 0, 0, 0] }, 400);
  check((await api('grammar.progress', { language: draft.language })).length === 0, 'Draft lesson submission persisted progress');
  // An admin-only disposable row makes the grammar-progress ownership test non-vacuous.
  await database(admin.from('grammar_progress').insert({ user_id: a.id, point_id: draft.id, language: draft.language, content_version: 1, correct: 0, total: 5, completed: false }), 'Temporary grammar progress isolation fixture');
  check((await request(secondDevice, 'grammar.progress', { language: draft.language })).length === 1, 'Grammar progress did not persist for its owner');
  console.log('Cloud Grammar: all 240 drafts persisted, repeat import unchanged, no review records or published visibility.');

  const cloudPage = await context.newPage();
  const currentEntries = await api('vocabulary.entries', { language: 'ja' });
  const allSessions = await api('quiz.sessions', { language: 'ja' });
  const vocabularyIds = new Set(currentEntries.map(entry => entry.id));
  const firstAttempts = allSessions.flatMap(item => item.attempts.filter(attempt => attempt.kind === 'initial' && vocabularyIds.has(attempt.wordId)));
  const firstAccuracy = `${Math.round(firstAttempts.filter(attempt => attempt.correct).length / firstAttempts.length * 100)}%`;
  await cloudPage.goto(`${base}/ja`);
  await cloudPage.getByRole('heading', { name: 'Welcome back, Cloud verification.' }).waitFor();
  check(await cloudPage.locator('.stat-card').filter({ hasText: 'Words collected' }).locator('.stat-value').innerText() === String(currentEntries.length), 'Dashboard vocabulary count differs from cloud data');
  check(await cloudPage.locator('.stat-card').filter({ hasText: 'First-try accuracy' }).locator('.stat-value').innerText() === firstAccuracy, 'Dashboard inflated first-attempt accuracy with retries/filler');
  check(await cloudPage.locator('.stat-card').filter({ hasText: 'Learning streak' }).locator('.stat-value').innerText() === '1', 'Dashboard streak did not use persisted activity');
  check(await cloudPage.getByRole('link', { name: 'Resume quiz', exact: false }).count() === 1, 'Dashboard did not expose a resumable cloud session');
  for (const [path, heading] of [['vocabulary', 'Vocabulary'], ['quiz', 'Quiz'], ['reading', 'Reading'], ['grammar', 'Grammar'], ['alphabet', 'Alphabet'], ['progress', 'Progress.'], ['settings', 'Settings']]) {
    await cloudPage.goto(`${base}/ja/${path}`);
    await cloudPage.getByRole('heading', { level: 1, name: new RegExp(`^${heading.replace('.', '\\.')}[.!]?$`) }).waitFor({ timeout: 60000 });
    // Next's accessibility route announcer also has role=alert; only workspace
    // alerts represent application load failures.
    const alerts = await cloudPage.locator('main.page-content').getByRole('alert').allTextContents();
    check(alerts.length === 0, `${path}: production page reported a cloud load error (${alerts.join('; ')})`);
  }
  for (const language of ['es', 'el']) {
    await cloudPage.goto(`${base}/${language}`);
    await cloudPage.getByRole('heading', { name: 'Welcome back, Cloud verification.' }).waitFor();
    const languageEntries = await api('vocabulary.entries', { language });
    check(await cloudPage.locator('.stat-card').filter({ hasText: 'Words collected' }).locator('.stat-value').innerText() === String(languageEntries.length), `${language}: Dashboard mixed language vocabulary`);
  }
  await cloudPage.close();
  console.log('Cloud UI: all eight pages, Dashboard counts/accuracy/streak/resume and language-specific data passed.');

  const ownedTables = ['profiles','vocabulary_lists','vocabulary_entries','accepted_answers','vocabulary_examples','vocabulary_related_words','word_progress','quiz_sessions','quiz_questions','quiz_attempts','retry_reservations','review_settlements','learning_activity','readings','reading_versions','reading_annotations','translation_cache','grammar_progress'];
  const grammarTables = ['grammar_points','grammar_versions','grammar_examples','grammar_exercises','grammar_sources','grammar_reviews'];
  const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const table of ownedTables) {
    const own = await a.client.from(table).select('*').eq('user_id', a.id).limit(1);
    check(!own.error && own.data.length === 1, `RLS ${table}: owner fixture/read missing`);
    const foreign = await b.client.from(table).select('*').eq('user_id', a.id);
    check(!foreign.error && foreign.data.length === 0, `RLS ${table}: user B read user A data`);
    const unauthenticated = await anonymous.from(table).select('*').limit(1);
    check(Boolean(unauthenticated.error), `RLS ${table}: anonymous access was granted`);
    if (!['profiles', 'vocabulary_lists'].includes(table)) {
      const forged = await a.client.from(table).update({ user_id: a.id }).eq('user_id', a.id);
      check(Boolean(forged.error), `RLS ${table}: direct computed/relational writes were granted`);
    }
  }
  for (const table of grammarTables) {
    const visible = await a.client.from(table).select('*');
    check(!visible.error && visible.data.length === 0, `RLS ${table}: draft metadata leaked`);
    const unauthenticated = await anonymous.from(table).select('*');
    check(Boolean(unauthenticated.error), `RLS ${table}: anonymous access was granted`);
  }
  const foreignInsert = await b.client.from('vocabulary_lists').insert({ user_id: a.id, language: 'ja', name: 'Forbidden' });
  check(Boolean(foreignInsert.error), 'User B inserted a row owned by A');
  const stolenProfile = await a.client.from('profiles').update({ user_id: b.id }).eq('user_id', a.id);
  check(Boolean(stolenProfile.error), 'Owner update transferred a profile to another user');
  const foreignDelete = await b.client.from('readings').delete().eq('id', reading.id).select();
  check(!foreignDelete.error && foreignDelete.data.length === 0, 'User B deleted user A reading');
  await request(foreignContext, 'vocabulary.save', { input: detailed, id: dog.id }, 400);
  await request(foreignContext, 'quiz.session', { id: nextB.id }, 400);
  await lookup(reading, 0, 3, 400, foreignContext);
  const forbiddenQuizRpc = await a.client.rpc('nl_commit_quiz', { p_user_id: a.id, p_session_id: nextB.id, p_expected_version: nextB.version, p_state: nextB });
  check(Boolean(forbiddenQuizRpc.error), 'Authenticated client could execute the privileged quiz RPC');
  const forbiddenImport = await a.client.rpc('nl_import_grammar', { p_points: [] });
  check(Boolean(forbiddenImport.error), 'Authenticated client could import grammar');
  const forbiddenPublication = await a.client.from('grammar_versions').update({ status: 'published' }).eq('point_id', draft.id);
  check(Boolean(forbiddenPublication.error), 'Authenticated client could publish grammar');
  const crossOrigin = await context.request.post(`${base}/api/repository`, { headers: { Origin: 'https://untrusted.invalid' }, data: { operation: 'settings.profile', args: {} } });
  check(crossOrigin.status() === 403, 'Cross-origin mutation was accepted');
  const foreignLinkedAnnotation = await b.client.rpc('nl_annotate_reading', { p_input: { readingId: reading.id, bodyVersion: reading.version, start: 0, end: 3, text: '新しい', translation: 'forbidden', reading: '', vocabularyEntryId: dog.id } });
  check(Boolean(foreignLinkedAnnotation.error), 'User B linked another user\'s reading/vocabulary');
  console.log('Cloud RLS: populated owner rows, user A/B isolation, anonymous denial and privileged-write rejection passed for all 24 tables.');

  const disposableList = await api('vocabulary.createList', { language: 'el', name: 'Delete verification' });
  const disposableWord = await api('vocabulary.save', { input: { ...inputs[0], language: 'el', listId: disposableList.id, word: 'λέξη', reading: '', translation: 'word' } });
  await api('vocabulary.delete', { ids: [disposableWord.id] });
  check(!(await api('vocabulary.entries', { language: 'el' })).some(entry => entry.id === disposableWord.id), 'Vocabulary deletion failed');
  await api('vocabulary.deleteList', { id: disposableList.id });
  check(!(await api('vocabulary.lists', { language: 'el' })).some(item => item.id === disposableList.id), 'List deletion failed');
  await api('reading.delete', { id: cachedReading.id });
  check(!(await api('reading.list', { language: 'es' })).some(item => item.id === cachedReading.id), 'Reading deletion failed');
  await secondDevice.close();
  await foreignContext.close();
  const finalAuthResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } });
  check(finalAuthResponse.ok, 'Final Auth configuration probe failed');
  const finalAuthSettings = await finalAuthResponse.json();
  const configurationIssues = finalAuthSettings.disable_signup === true ? [] : ['The configured Supabase project still reports disable_signup=false; disable Allow new users to sign up and save the Auth configuration.'];
  if (!configurationIssues.length) check(true, 'Public signup is disabled');
  return { issues: [...integrationIssues, ...configurationIssues] };
}
