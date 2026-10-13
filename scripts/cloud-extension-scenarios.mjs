import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

/**
 * Real repositories, real Supabase RPCs and the shipped deterministic schedulers.
 * The caller owns both disposable accounts and guarantees cleanup in finally.
 * No DDL, migration execution, grammar publication or permanent account writes.
 */
export async function verifyExtensionScenarios({ a, b, admin, anonymous, check, data, denied, loadTS }) {
  const { createSupabaseRepositories } = await loadTS('src/repositories/supabase.ts');
  const { createQuizSession, answerQuiz } = await loadTS('src/domain/quiz.ts');
  const { answerAlphabetQuiz, alphabetMcqEligibility } = await loadTS('src/domain/alphabet-quiz.ts');
  const { aggregateQuizSummary } = await loadTS('src/domain/quiz-summary.ts');
  const { wordCareStatus } = await loadTS('src/domain/word-care.ts');
  const { alphabetEntries } = await loadTS('src/data/alphabet.ts');
  const repos = createSupabaseRepositories(a.client, a.user ?? { id: a.id });
  const device = createSupabaseRepositories(a.secondDevice, a.user ?? { id: a.id });
  const other = createSupabaseRepositories(b.client, b.user ?? { id: b.id });
  const equal = (left, right, message) => check(isDeepStrictEqual(left, right), message);
  const rejected = async (operation, message) => {
    let error;
    try { await operation(); } catch (failure) { error = failure; }
    check(Boolean(error), message);
    return error;
  };
  const stateChange = (session, status) => ({ ...session, status, version: session.version + 1,
    currentQuestion: status === 'ended' ? null : session.currentQuestion, updatedAt: new Date().toISOString() });
  const commit = (previous, next, submissionId = null) => data(admin.rpc('nl_commit_quiz', {
    p_user_id: a.id, p_session_id: previous.id, p_expected_version: previous.version, p_state: next, p_submission_id: submissionId,
  }), 'Extended quiz transactional commit failed.');
  const commitAlphabet = (previous, next, submissionId = null) => data(admin.rpc('nl_commit_alphabet_quiz', {
    p_user_id: a.id, p_session_id: previous.id, p_expected_version: previous.version, p_state: next, p_submission_id: submissionId,
  }), 'Extended Alphabet transactional commit failed.');
  const correctAnswer = (session) => session.currentQuestion.inputMode === 'text' || (!session.currentQuestion.inputMode && session.type === 'typing')
    ? session.currentQuestion.acceptedAnswers[0] : session.currentQuestion.correctChoiceId;
  const answer = async (session, text = correctAnswer(session), submissionId = randomUUID(), repository = repos) => {
    const result = await repository.quiz.answer(session.id, { version: session.version, answer: text, submissionId });
    check(result.attempts.length === session.attempts.length + 1, 'A new extended answer was not appended exactly once.');
    return result;
  };
  const finish = async (session, repository = repos) => {
    let current = session;
    for (let count = 0; current.status === 'active' && count < 100; count++) current = await answer(current, correctAnswer(current), randomUUID(), repository);
    check(current.status === 'completed', 'Extended quiz did not complete within its deterministic bound.');
    return current;
  };
  const progress = async (word) => (await repos.progress.getWords(word.language)).find(row => row.wordId === word.id);
  const careState = async (word) => (await repos.care.getStates()).find(row => row.wordId === word.id);
  const languages = ['ja', 'es', 'el', 'ko'];
  const definitions = {
    ja: [['犬', 'いぬ', 'dog'], ['猫', 'ねこ', 'cat'], ['木', 'き', 'tree'], ['太陽', 'たいよう', 'sun'], ['水', 'みず', 'water']],
    es: [['perro', '', 'dog'], ['gato', '', 'cat'], ['árbol', '', 'tree'], ['sol', '', 'sun'], ['agua', '', 'water']],
    el: [['σκύλος', '', 'dog'], ['γάτα', '', 'cat'], ['δέντρο', '', 'tree'], ['ήλιος', '', 'sun'], ['νερό', '', 'water']],
    ko: [['개', 'gae', 'dog'], ['고양이', 'goyangi', 'cat'], ['나무', 'namu', 'tree'], ['태양', 'taeyang', 'sun'], ['물', 'mul', 'water']],
  };
  const lists = {}, words = {};
  for (const language of languages) {
    lists[language] = await repos.vocabulary.createList(language, `Disposable extension ${language}`);
    words[language] = [];
    for (const [word, reading, translation] of definitions[language]) words[language].push(await repos.vocabulary.saveEntry({
      language, listId: lists[language].id, word, reading, translation, type: 'noun', category: 'temporary verification', notes: 'Disposable extension verification', acceptedAnswers: [],
      examples: [{ text: word, translation, reading }], relatedWords: [],
    }));
    const synced = await device.vocabulary.getEntries(language);
    check(words[language].every(word => synced.some(row => row.id === word.id && row.word === word.word && row.examples.length === 1)), `${language} complete vocabulary failed second-device persistence.`);
  }
  const allWords = languages.flatMap(language => words[language]);
  const koDog = words.ko[0], jaDog = words.ja[0], koCat = words.ko[1];
  check(/^[\uac00-\ud7a3]+$/u.test(koDog.word) && koDog.reading === 'gae', 'Korean vocabulary did not preserve Hangul separately from romanization.');
  let noPairs = await repos.quiz.create({ language: 'ko', languages, wordIds: languages.map(language => words[language][4].id), type: 'typing', types: ['typing'], randomSeed: 9 });
  check(noPairs.entries.length === 4 && noPairs.questionTemplates.every(question => !question.contextWordId), 'Ordinary multi-language creation required a word pair.');
  noPairs = await repos.quiz.end(noPairs.id, noPairs.version);
  check(noPairs.attempts.length === 0, 'Unanswered no-pair quiz counted an attempt.');

  // Suggestions are durable, bidirectional, editable and tombstoned. Explicit
  // pair suggestions can be used before confirmation; confirmed matches win.
  let pairs = await repos.wordPairs.suggest({ wordIds: [jaDog.id, koDog.id, koCat.id] });
  let dogPair = pairs.find(pair => [pair.sourceWordId, pair.targetWordId].includes(jaDog.id) && [pair.sourceWordId, pair.targetWordId].includes(koDog.id));
  check(dogPair?.status === 'suggested' && dogPair.confidence === 1, 'Shared English meaning did not produce a durable unconfirmed pair.');
  equal(await device.wordPairs.getPairs(), pairs, 'Word-pair suggestions did not sync to the second device.');
  let suggestedQuiz = await repos.quiz.create({ language: 'ja', languages: ['ja', 'ko'], wordIds: [jaDog.id, koDog.id], type: 'translation-typing', directions: [{ source: 'ja', target: 'ko' }], randomSeed: 17 });
  check(suggestedQuiz.currentQuestion.contextWordId === koDog.id && suggestedQuiz.entries.length === 1, 'Unconfirmed eligible pair did not create one-way translation.');
  suggestedQuiz = await repos.quiz.end(suggestedQuiz.id, suggestedQuiz.version);
  check(suggestedQuiz.status === 'ended' && suggestedQuiz.attempts.length === 0, 'Unanswered unconfirmed-pair fixture unexpectedly counted progress.');
  dogPair = await repos.wordPairs.save({ id: dogPair.id, sourceWordId: jaDog.id, targetWordId: koDog.id });
  check(dogPair.status === 'confirmed' && dogPair.confidence === 1 && dogPair.warning === null, 'Pair confirmation did not persist.');
  const edited = await repos.wordPairs.save({ id: dogPair.id, sourceWordId: jaDog.id, targetWordId: koCat.id });
  check(edited.id === dogPair.id && edited.targetWordId === koCat.id && edited.status === 'confirmed', 'Editing a confirmed pair did not preserve its identity.');
  dogPair = await repos.wordPairs.save({ id: dogPair.id, sourceWordId: koDog.id, targetWordId: jaDog.id });
  check(dogPair.sourceWordId === koDog.id && dogPair.targetWordId === jaDog.id, 'Bidirectional pair editing failed.');
  const synonym = await repos.vocabulary.saveEntry({ language: 'ko', listId: lists.ko.id, word: '강아지', reading: 'gangaji', translation: 'dog', type: 'noun', category: 'temporary verification', notes: 'Ambiguous suggestion fixture', acceptedAnswers: [], examples: [], relatedWords: [] });
  const ambiguousSuggestions = await repos.wordPairs.suggest({ wordIds: [jaDog.id, koDog.id, synonym.id] });
  check(ambiguousSuggestions.some(pair => [pair.sourceWordId, pair.targetWordId].includes(synonym.id) && pair.status === 'suggested' && pair.confidence <= 0.5 && pair.warning?.includes('Multiple words')), 'Competing same-meaning suggestions did not preserve their ambiguity warning.');
  let priorityQuiz = await repos.quiz.create({ language: 'ja', languages: ['ja', 'ko'], wordIds: [jaDog.id, synonym.id, ...words.ko.map(word => word.id)], type: 'translation-mcq', directions: [{ source: 'ja', target: 'ko' }], randomSeed: 5 });
  check(priorityQuiz.currentQuestion.contextWordId === koDog.id && priorityQuiz.currentQuestion.correctChoiceId === koDog.id && !priorityQuiz.currentQuestion.choices.some(choice => choice.id === synonym.id), 'Confirmed pair did not take priority or a known equivalent became a distractor.');
  priorityQuiz = await repos.quiz.end(priorityQuiz.id, priorityQuiz.version);
  check(priorityQuiz.attempts.length === 0, 'Unanswered confirmed-priority fixture unexpectedly settled progress.');
  const treePair = await repos.wordPairs.save({ sourceWordId: words.ja[2].id, targetWordId: words.ko[2].id });
  await repos.wordPairs.remove(treePair.id);
  await repos.wordPairs.suggest({ wordIds: [words.ja[2].id, words.ko[2].id] });
  check((await device.wordPairs.getPairs()).find(pair => pair.id === treePair.id)?.status === 'deleted', 'Suggestions resurrected a deleted pair tombstone.');
  await rejected(() => repos.quiz.create({ language: 'ja', languages: ['ja', 'ko'], wordIds: [words.ja[2].id, words.ko[2].id], type: 'translation-typing', directions: [{ source: 'ja', target: 'ko' }] }), 'Deleted word pair remained eligible for translation.');
  await rejected(() => repos.quiz.create({ language: 'ja', languages: ['ja', 'ko'], wordIds: [jaDog.id, koDog.id], type: 'translation-typing', directions: [] }), 'Cross-language quiz silently enabled an unselected direction.');
  await rejected(() => repos.quiz.create({ language: 'ja', languages: ['ja'], wordIds: [jaDog.id, koDog.id], type: 'typing' }), 'Ordinary quiz silently included an unselected language.');

  // A directional target is contextual only: stage, counters, settlements and
  // learning activity belong solely to the tested source word.
  const day = await data(admin.rpc('nl_learning_date', { p_user_id: a.id }), 'Extension learning date lookup failed.');
  await data(admin.from('word_progress').update({ due_date: day }).eq('user_id', a.id).in('word_id', [jaDog.id, koDog.id]), 'Disposable due-review fixture update failed.');
  const beforeJa = await progress(jaDog), beforeKo = await progress(koDog);
  let cross = await repos.quiz.create({ language: 'ja', languages: ['ja', 'ko'], wordIds: [jaDog.id, koDog.id], type: 'translation-typing', directions: [{ source: 'ja', target: 'ko' }], randomSeed: 5, presentation: 'incorrect' });
  check(cross.entries.length === 1 && cross.entries[0].id === jaDog.id && cross.currentQuestion.wordId === jaDog.id && cross.currentQuestion.contextWordId === koDog.id, 'Cross-language target incorrectly became a tested SRS word.');
  equal(cross.currentQuestion.acceptedAnswers, ['개'], 'Cross-language spelling answer used romanization or the English pivot.');
  check(cross.currentQuestion.audioText === '犬' && cross.currentQuestion.audioLanguage === 'ja', 'Cross-language source TTS did not retain Japanese script.');
  await repos.vocabulary.saveEntry({ ...koDog, word: '임시수정', translation: 'temporarily edited meaning' }, koDog.id);
  const frozenCross = structuredClone(cross.questionTemplates);
  cross = await answer(cross, '개');
  check(cross.status === 'completed' && cross.attempts[0].correct && cross.settled, 'Frozen cross-language target answer failed after a live target edit.');
  equal(cross.questionTemplates, frozenCross, 'Live target edit mutated frozen cross-language templates.');
  const afterJa = await progress(jaDog), afterKo = await progress(koDog);
  check(afterJa.stage === beforeJa.stage + 1 && afterJa.firstAttempts === beforeJa.firstAttempts + 1 && afterJa.firstCorrect === beforeJa.firstCorrect + 1, 'Tested cross-language word did not receive its due SRS advancement.');
  equal(afterKo, beforeKo, 'Context-only translation target received SRS advancement or counters.');
  const activity = await data(a.client.from('learning_activity').select('language,count').like('id', `quiz:${cross.id}:%`), 'Cross-language activity lookup failed.');
  equal(activity, [{ language: 'ja', count: 1 }], 'Translation activity was credited to the context language.');
  equal((await data(a.client.from('review_settlements').select('word_id').eq('session_id', cross.id), 'Translation settlement read failed.')).map(row => row.word_id), [jaDog.id], 'Translation settlement included the context word.');
  for (const language of ['ja', 'ko']) check((await device.quiz.getSessions(language)).some(session => session.id === cross.id), `${language} history omitted a participating-language translation session.`);
  const crossSummary = aggregateQuizSummary(await device.quiz.getSession(cross.id), await device.vocabulary.getEntries('ja'));
  check(crossSummary.uniqueWords === 1 && crossSummary.words[0].wordId === jaDog.id && crossSummary.words[0].attempts[0].correctAnswer === '개', 'Cross-language history Summary did not aggregate by tested word and frozen answer.');
  await repos.vocabulary.saveEntry(koDog, koDog.id);

  // Explicit cross-language MCQ and reverse spelling share frozen grading.
  let crossMcq = await repos.quiz.create({ language: 'ja', languages: ['ja', 'ko'], wordIds: [jaDog.id, ...words.ko.map(word => word.id)], type: 'translation-mcq', directions: [{ source: 'ja', target: 'ko' }], randomSeed: 13 });
  check(crossMcq.currentQuestion.inputMode === 'choice' && crossMcq.currentQuestion.choices.length === 4 && crossMcq.currentQuestion.choices.some(choice => choice.text === '개'), 'Cross-language MCQ did not freeze four Korean options.');
  check(crossMcq.currentQuestion.choices.every(choice => words.ko.some(word => word.id === choice.id)), 'Cross-language MCQ used an unselected word or language as a distractor.');
  const forgedCross = answerQuiz(crossMcq, crossMcq.currentQuestion.correctChoiceId, randomUUID());
  forgedCross.attempts[0].correct = false;
  const forgedCrossResult = await admin.rpc('nl_commit_quiz', { p_user_id: a.id, p_session_id: crossMcq.id, p_expected_version: crossMcq.version, p_state: forgedCross, p_submission_id: forgedCross.attempts[0].id });
  check(forgedCrossResult.error?.code === '22023', 'Cloud cross-language MCQ accepted a forged grade.');
  crossMcq = await finish(crossMcq);
  let reverse = await repos.quiz.create({ language: 'ko', languages: ['ko', 'ja'], wordIds: [jaDog.id, koDog.id], type: 'translation-typing', directions: [{ source: 'ko', target: 'ja' }], randomSeed: 2 });
  check(reverse.currentQuestion.wordId === koDog.id && reverse.currentQuestion.audioText === '개' && reverse.currentQuestion.audioLanguage === 'ko', 'Reverse translation lost its Korean source script or tested owner.');
  reverse = await answer(reverse, 'inu');
  check(reverse.attempts[0].correct === false && reverse.currentQuestion.kind === 'retry', 'Cross-language grading accepted romanization instead of the frozen Japanese word.');
  reverse = await finish(reverse);

  // Normal multi-language quizzes require no pairs. Miss the last initial word
  // so the existing reservation scheduler must generate fillers before retry.
  const ordinarySelected = languages.flatMap(language => words[language].slice(0, 2));
  let ordinary = await repos.quiz.create({ language: 'ko', languages, wordIds: ordinarySelected.map(word => word.id), type: 'typing', types: ['typing'], randomSeed: 44, presentation: 'never' });
  check(ordinary.entries.length === ordinarySelected.length && ordinary.questionTemplates.every(question => question.type === 'typing' && !question.contextWordId), 'Normal multi-language quiz depended on word pairs or changed enabled type.');
  equal([...new Set(ordinary.entries.map(word => word.language))].sort(), [...languages].sort(), 'Normal mixing omitted an enabled language.');
  equal(ordinary.entries.map(word => word.id).sort(), ordinarySelected.map(word => word.id).sort(), 'Mixed quiz introduced words outside the explicitly selected sets.');
  check(ordinary.questionTemplates.every(question => { const word = ordinarySelected.find(word => word.id === question.wordId); return question.audioText === word.word && question.audioLanguage === word.language; }), 'Mixed ordinary TTS lost native source text for Korean, Japanese, Greek or Spanish.');
  for (const patch of [{ enabledTypes: ['translation-typing'] }, { languages: ['ko'] }, { directions: [{ source: 'ko', target: 'ja' }] }]) {
    const forgedConfiguration = await admin.rpc('nl_commit_quiz', { p_user_id: a.id, p_session_id: ordinary.id, p_expected_version: ordinary.version, p_state: { ...stateChange(ordinary, 'saved'), ...patch }, p_submission_id: null });
    check(forgedConfiguration.error?.code === '22023', 'Mixed quiz changed enabled languages, types or directions after creation.');
  }
  const ordinaryTemplates = structuredClone(ordinary.questionTemplates);
  for (let index = 0; index < ordinarySelected.length - 1; index++) ordinary = await answer(ordinary);
  const missedWord = ordinary.currentQuestion.wordId;
  ordinary = await answer(ordinary, 'deliberately incorrect');
  const saved = await repos.quiz.saveAndExit(ordinary.id, ordinary.version);
  equal(await device.quiz.getSession(saved.id), saved, 'Cross-device ordinary mixed save did not preserve full state.');
  await repos.settings.updateQuizPreferences({ presentation: 'always' });
  ordinary = await device.quiz.resume(saved.id);
  check(ordinary.presentation === 'never', 'Resume replaced the session presentation with changed personal defaults.');
  equal(ordinary.questionTemplates, ordinaryTemplates, 'Ordinary mixed resume regenerated frozen templates.');
  ordinary = await finish(ordinary, device);
  const reopened = await device.quiz.getSession(ordinary.id), summary = aggregateQuizSummary(reopened, allWords);
  check(summary.totalAnswered === reopened.attempts.length && summary.initialAttempts === ordinarySelected.length && summary.retries === 1 && summary.fillers >= 3 && summary.uniqueWords === ordinarySelected.length, 'Mixed Summary conflated answered questions, initials, retries, fillers or unique words.');
  check(summary.correct === summary.totalAnswered - 1 && summary.incorrect === 1 && summary.initialCorrect === ordinarySelected.length - 1, 'Mixed Summary accuracy did not retain the initial failure.');
  const missedSummary = summary.words.find(row => row.wordId === missedWord);
  check(missedSummary.initialAttemptCorrect === false && missedSummary.finalAttemptCorrect === true && missedSummary.attempts.length === 2, 'Mixed Summary did not separate initial and final outcomes.');
  equal(summary.words.flatMap(row => row.attempts.map(item => item.attempt)).sort((left, right) => left.position - right.position), reopened.attempts, 'Completed mixed history omitted or reordered attempts.');
  for (const language of languages) check((await device.quiz.getSessions(language)).some(session => session.id === ordinary.id && session.status === 'completed'), `${language} cross-device history did not reopen the complete mixed session.`);
  let ended = await repos.quiz.create({ language: 'ko', languages: ['ko', 'es'], wordIds: [words.ko[3].id, words.es[3].id], type: 'typing', types: ['typing'], randomSeed: 3 });
  ended = await answer(ended);
  ended = await repos.quiz.end(ended.id, ended.version);
  const endedSummary = aggregateQuizSummary(await device.quiz.getSession(ended.id), allWords);
  check(ended.status === 'ended' && ended.settled && endedSummary.totalAnswered === 1 && endedSummary.uniqueWords === 1, 'Manually ended mixed history lost its full Summary.');

  // Type mixing is independent of language mixing and translation. Select a
  // deterministic seed that exercises all three explicitly enabled types.
  let mixedSeed = 0;
  for (; mixedSeed < 1000; mixedSeed++) {
    const candidate = createQuizSession({ id: 'seed-probe', userId: a.id, language: 'ko', entries: words.ko, type: 'typing', types: ['typing', 'meaning-word', 'listening'], listeningLanguages: ['ko'], randomSeed: mixedSeed, learningDate: day });
    if (new Set(candidate.questionTemplates.map(question => question.type)).size === 3) break;
  }
  check(mixedSeed < 1000, 'Cannot generate an enabled mixed-type fixture with all three types.');
  let mixedTypes = await repos.quiz.create({ language: 'ko', wordIds: words.ko.map(word => word.id), type: 'typing', types: ['typing', 'meaning-word', 'listening'], listeningLanguages: ['ko'], randomSeed: mixedSeed });
  equal([...new Set(mixedTypes.questionTemplates.map(question => question.type))].sort(), ['listening', 'meaning-word', 'typing'], 'Single-language mixed types did not include the independently enabled modes.');
  check(mixedTypes.questionTemplates.filter(question => question.type === 'listening').every(question => question.audioLanguage === 'ko' && /^[\uac00-\ud7a3]+$/u.test(question.audioText) && question.acceptedAnswers.some(value => /^[\uac00-\ud7a3]+$/u.test(value))), 'Korean listening tested or spoke romanization instead of Hangul.');
  mixedTypes = await finish(mixedTypes);
  const noVoice = await rejected(() => repos.quiz.create({ language: 'ko', wordIds: [koDog.id], type: 'listening', types: ['listening'], listeningLanguages: [] }), 'Listening silently fell back when its enabled device voice was missing.');
  check(noVoice.message.includes('voice'), 'Unavailable listening did not explain the missing matching voice.');
  const combinedDirections = [{ source: 'ja', target: 'ko' }, { source: 'ko', target: 'ja' }];
  const combinedPairs = await repos.wordPairs.getPairs();
  let combinedSeed = 0;
  for (; combinedSeed < 1000; combinedSeed++) {
    const candidate = createQuizSession({ id: 'combined-probe', userId: a.id, language: 'ja', languages: ['ja', 'ko'], entries: [...words.ja, ...words.ko], type: 'typing', types: ['typing', 'word-meaning', 'translation-typing'], directions: combinedDirections, pairs: combinedPairs, randomSeed: combinedSeed, learningDate: day });
    if (new Set(candidate.questionTemplates.map(question => question.type)).size === 3) break;
  }
  check(combinedSeed < 1000, 'Cannot generate a fixture combining all three independent mixing capabilities.');
  let combined = await repos.quiz.create({ language: 'ja', languages: ['ja', 'ko'], wordIds: [...words.ja, ...words.ko].map(word => word.id), type: 'typing', types: ['typing', 'word-meaning', 'translation-typing'], directions: combinedDirections, randomSeed: combinedSeed });
  check(combined.questionTemplates.every(question => ['typing', 'word-meaning', 'translation-typing'].includes(question.type)), 'Combined mixing enabled an unselected question type.');
  check(combined.questionTemplates.some(question => question.type === 'translation-typing') && new Set(combined.entries.map(word => word.language)).size === 2, 'Language/type/direction mixing did not work together.');
  combined = await finish(combined);

  // Each presentation setting survives another device and new global defaults;
  // neither audio toggle is overwritten by partial presentation updates.
  let presentationReference;
  let presentationRetryReference;
  for (const presentation of ['always', 'incorrect', 'never']) {
    await repos.settings.updateQuizPreferences({ presentation, vocabularyAutoAudio: true, alphabetAutoAudio: true });
    let session = await repos.quiz.create({ language: 'ko', wordIds: [words.ko[3].id, words.ko[4].id], type: 'word-meaning', randomSeed: 28 });
    check(session.presentation === presentation, 'New session did not inherit its remembered presentation default.');
    const generated = { questionTemplates: session.questionTemplates, randomState: session.randomState };
    if (presentationReference) equal(generated, presentationReference, 'Presentation preference changed question generation or option order.');
    else presentationReference = structuredClone(generated);
    session = await answer(session, session.currentQuestion.choices.find(choice => choice.id !== session.currentQuestion.correctChoiceId).id);
    const scheduling = { reservations: session.reservations, randomState: session.randomState, correct: session.attempts[0].correct };
    if (presentationRetryReference) equal(scheduling, presentationRetryReference, 'Presentation preference changed grading or deterministic retry scheduling.');
    else presentationRetryReference = structuredClone(scheduling);
    session = await repos.quiz.saveAndExit(session.id, session.version);
    const preferences = await repos.settings.updateQuizPreferences({ presentation: presentation === 'never' ? 'always' : 'never' });
    check(preferences.vocabularyAutoAudio && preferences.alphabetAutoAudio, 'Presentation preference update reset independent automatic audio preferences.');
    const resumed = await device.quiz.resume(session.id);
    check(resumed.presentation === presentation && resumed.randomState === session.randomState, 'Presentation resume changed the saved setting or RNG.');
    equal(resumed.questionTemplates, session.questionTemplates, 'Presentation preference changed frozen questions.');
    const tampered = await admin.rpc('nl_commit_quiz', { p_user_id: a.id, p_session_id: resumed.id, p_expected_version: resumed.version, p_state: { ...stateChange(resumed, 'saved'), presentation: presentation === 'never' ? 'always' : 'never' }, p_submission_id: null });
    check(tampered.error?.code === '22023', 'Cloud immutable presentation trigger allowed changing an active session preference.');
    await finish(resumed, device);
  }
  const preferencesBeforeInvalid = await device.settings.getQuizPreferences();
  const invalidPreferences = await a.client.rpc('nl_update_quiz_preferences', { p_preferences: { presentation: 'sometimes' } });
  check(invalidPreferences.error?.code === '22023', 'Cloud preferences accepted an unknown presentation value.');
  equal(await device.settings.getQuizPreferences(), preferencesBeforeInvalid, 'Rejected preference update changed stored settings.');

  // Manual care is persistent. Remove suppresses existing evidence; settlement,
  // correct answers, stale attempts and changed-payload replays cannot reactivate.
  const careWord = await repos.vocabulary.saveEntry({ language: 'ko', listId: lists.ko.id, word: '확인', reading: 'hwagin', translation: 'verification', type: 'noun', category: 'temporary verification', notes: '', acceptedAnswers: [], examples: [], relatedWords: [] });
  await repos.care.setManual(careWord.id, 'add');
  let careQuiz = await repos.quiz.create({ language: 'ko', wordIds: [careWord.id], type: 'typing' });
  careQuiz = await finish(careQuiz);
  check((await careState(careWord)).manualCare, 'Correct grading or SRS settlement removed manual care.');
  careQuiz = await repos.quiz.create({ language: 'ko', wordIds: [careWord.id], type: 'typing' });
  const oldSession = careQuiz, oldId = randomUUID();
  careQuiz = await answer(careQuiz, 'old incorrect event', oldId);
  const evidenceBeforeRemove = await progress(careWord);
  const removed = await repos.care.setManual(careWord.id, 'remove');
  check(!removed.manualCare && removed.automaticSuppressed, 'Remove did not clear manual care and suppress automatic evidence.');
  equal(await progress(careWord), evidenceBeforeRemove, 'Remove deleted or rewrote historical SRS evidence.');
  const replayed = await commit(oldSession, { ...careQuiz, entries: [], presentation: 'forged' }, oldId);
  equal(replayed.session, careQuiz, 'Changed-payload replay mutated an existing incorrect submission.');
  careQuiz = await repos.quiz.end(careQuiz.id, careQuiz.version);
  const evidenceAfterSettlement = await progress(careWord), stateAfterSettlement = await careState(careWord);
  check(stateAfterSettlement.automaticSuppressed && evidenceAfterSettlement.errors > 0 && evidenceAfterSettlement.firstAttempts === 2, 'Delayed old incorrect settlement reactivated care or lost evidence.');
  check(wordCareStatus(evidenceAfterSettlement, stateAfterSettlement).active === false, 'Suppressed historical errors still displayed automatic care.');
  const correctAfterRemove = await repos.quiz.create({ language: 'ko', wordIds: [careWord.id], type: 'typing' });
  await finish(correctAfterRemove);
  check((await careState(careWord)).automaticSuppressed, 'Ordinary correct answer reactivated automatic care.');
  await repos.care.setManual(careWord.id, 'add');
  check((await careState(careWord)).automaticSuppressed && (await careState(careWord)).manualCare, 'Manual Add erased suppression history instead of remaining independent.');
  let newCare = await repos.quiz.create({ language: 'ko', wordIds: [careWord.id], type: 'typing' });
  const stale = await commit({ ...newCare, version: 0 }, answerQuiz(newCare, 'new incorrect event', randomUUID()), randomUUID());
  check(stale.conflict && (await careState(careWord)).automaticSuppressed, 'Rejected stale incorrect submission reactivated automatic care.');
  newCare = await answer(newCare, 'qualifying new incorrect');
  check((await careState(careWord)).manualCare && !(await careState(careWord)).automaticSuppressed, 'A genuine new incorrect event failed to reactivate automatic care while preserving manual care.');
  newCare = await repos.quiz.end(newCare.id, newCare.version);
  const activeCare = wordCareStatus(await progress(careWord), await careState(careWord));
  check(activeCare.manual && activeCare.automatic && activeCare.active, 'Manual and automatic care did not combine after a qualifying error.');
  equal(await device.care.getStates('ko'), await repos.care.getStates('ko'), 'Care states did not persist across devices.');
  const evidence = await data(a.client.from('quiz_attempts').select('id,correct').eq('word_id', careWord.id), 'Care history evidence read failed.');
  check(evidence.length === 4 && evidence.filter(attempt => !attempt.correct).length === 2, 'Suppression or replay deleted or duplicated historic care evidence.');

  // Both real Korean MCQ directions freeze the entire quartet, its ordering and
  // its one defensible answer before a retry can be scheduled.
  const koreanAlphabet = alphabetEntries.filter(item => item.language === 'ko');
  check(koreanAlphabet.length === 40 && koreanAlphabet.every(item => item.audioText && /[\uac00-\ud7a3]/u.test(item.audioText)), 'Korean alphabet lacks its forty native-script TTS cards.');
  for (const direction of ['character-to-pronunciation', 'pronunciation-to-character']) {
    const item = koreanAlphabet.find(item => alphabetMcqEligibility(item, direction).feasible.includes(direction));
    check(Boolean(item), `No Korean Alphabet MCQ is feasible in ${direction}.`);
    let session = await repos.alphabetQuiz.create({ language: 'ko', itemIds: [item.id], mode: 'mcq', direction, randomSeed: 19 });
    const frozen = structuredClone(session.questionTemplates), question = session.currentQuestion;
    check(question.mode === 'mcq' && question.direction === direction && question.options.length === 4 && new Set(question.options.map(option => option.id)).size === 4 && new Set(question.options.map(option => option.text)).size === 4, 'Korean Alphabet MCQ did not freeze four unique options.');
    if (direction === 'pronunciation-to-character') check(question.options.filter(option => option.pronunciationAnswers.includes(question.prompt)).length === 1, 'Alphabet pronunciation prompt has multiple defensible character answers.');
    else check(question.options.filter(option => option.pronunciationAnswers.some(value => item.pronunciationAnswers.includes(value))).length === 1, 'Alphabet character prompt has multiple equivalent pronunciation answers.');
    const wrong = question.options.find(option => option.id !== question.correctOptionId).id;
    const forged = answerAlphabetQuiz(session, wrong, randomUUID());
    forged.attempts[0].correct = true;
    const forgedResult = await admin.rpc('nl_commit_alphabet_quiz', { p_user_id: a.id, p_session_id: session.id, p_expected_version: session.version, p_state: forged, p_submission_id: forged.attempts[0].id });
    check(forgedResult.error?.code === '22023', 'Cloud Alphabet MCQ accepted a forged grade.');
    const original = session, submissionId = randomUUID();
    session = await repos.alphabetQuiz.answer(session.id, { version: session.version, answer: wrong, submissionId });
    check(!session.attempts[0].correct && session.currentQuestion.kind === 'retry', 'Alphabet MCQ miss did not generate its deterministic retry.');
    equal(session.currentQuestion.options, question.options, 'Alphabet retry regenerated or reordered frozen options.');
    const replay = await commitAlphabet(original, { ...session, items: [] }, submissionId);
    equal(replay.session, session, 'Alphabet changed-payload answer replay changed the persisted snapshot.');
    session = await repos.alphabetQuiz.saveAndExit(session.id, session.version);
    equal(await device.alphabetQuiz.getSession(session.id), session, 'Cross-device Alphabet save/resume state changed.');
    const conflict = await commitAlphabet({ ...session, version: session.version - 1 }, stateChange(session, 'active'));
    check(conflict.conflict && conflict.session.version === session.version, 'Alphabet stale-version update did not return the latest state.');
    session = await device.alphabetQuiz.resume(session.id, session.version);
    equal(session.questionTemplates, frozen, 'Alphabet resume regenerated frozen directions, answers, distractors or order.');
    const tampered = stateChange(session, 'saved');
    tampered.questionTemplates = structuredClone(tampered.questionTemplates);
    tampered.questionTemplates[0].options.reverse();
    const changedOptions = await admin.rpc('nl_commit_alphabet_quiz', { p_user_id: a.id, p_session_id: session.id, p_expected_version: session.version, p_state: tampered, p_submission_id: null });
    check(changedOptions.error?.code === '22023', 'Alphabet snapshot guard allowed reordering options during resume.');
    session = await device.alphabetQuiz.answer(session.id, { version: session.version, answer: session.currentQuestion.correctOptionId, submissionId: randomUUID() });
    check(session.status === 'completed' && session.attempts.map(attempt => attempt.correct).join(',') === 'false,true', 'Alphabet frozen retry grading failed.');
    const history = (await repos.alphabetQuiz.getSessions('ko')).find(row => row.id === session.id);
    equal(history, session, 'Completed Alphabet history omitted state or attempts.');
    equal(history.questionTemplates, frozen, 'Alphabet history changed frozen options or direction.');
    check((await data(a.client.from('alphabet_quiz_attempts').select('id').eq('session_id', session.id), 'Alphabet MCQ attempt count read failed.')).length === 2, 'Alphabet replay duplicated an attempt.');
  }
  const { createAlphabetQuizSession } = await loadTS('src/domain/alphabet-quiz.ts');
  let alphabetSeed = 0;
  for (; alphabetSeed < 1000; alphabetSeed++) {
    const candidate = createAlphabetQuizSession({ id: 'alphabet-probe', userId: a.id, language: 'ko', itemIds: koreanAlphabet.slice(0, 6).map(item => item.id), mode: 'mcq', direction: 'mixed', randomSeed: alphabetSeed, learningDate: day });
    if (new Set(candidate.questionTemplates.map(question => question.direction)).size === 2) break;
  }
  check(alphabetSeed < 1000, 'Cannot generate both enabled Alphabet directions in one frozen fixture.');
  let alphabetMixed = await repos.alphabetQuiz.create({ language: 'ko', itemIds: koreanAlphabet.slice(0, 6).map(item => item.id), mode: 'mcq', direction: 'mixed', randomSeed: alphabetSeed });
  equal([...new Set(alphabetMixed.questionTemplates.map(question => question.direction))].sort(), ['character-to-pronunciation', 'pronunciation-to-character'], 'Mixed Alphabet direction did not freeze both enabled directions.');
  alphabetMixed = await repos.alphabetQuiz.end(alphabetMixed.id, alphabetMixed.version);
  check((await device.alphabetQuiz.getSession(alphabetMixed.id)).status === 'ended', 'Ended mixed Alphabet did not sync.');

  // Populate the second account so isolation proves non-empty owner boundaries
  // in both directions for every new owner table and the changed session tables.
  const bKoList = await other.vocabulary.createList('ko', 'Disposable second account Korean');
  const bJaList = await other.vocabulary.createList('ja', 'Disposable second account Japanese');
  const bKo = await other.vocabulary.saveEntry({ ...koDog, language: 'ko', listId: bKoList.id, acceptedAnswers: [], examples: [], relatedWords: [] });
  const bJa = await other.vocabulary.saveEntry({ ...jaDog, language: 'ja', listId: bJaList.id, acceptedAnswers: [], examples: [], relatedWords: [] });
  const bPair = await other.wordPairs.save({ sourceWordId: bKo.id, targetWordId: bJa.id });
  await other.care.setManual(bKo.id, 'add');
  await other.settings.updateQuizPreferences({ presentation: 'never', vocabularyAutoAudio: false });
  let bQuiz = await other.quiz.create({ language: 'ko', wordIds: [bKo.id], type: 'typing' });
  bQuiz = await finish(bQuiz, other);
  const bAlpha = await other.alphabetQuiz.create({ language: 'ko', itemIds: [koreanAlphabet[0].id], mode: 'mcq', direction: 'character-to-pronunciation', randomSeed: 3 });
  await other.alphabetQuiz.answer(bAlpha.id, { version: bAlpha.version, answer: bAlpha.currentQuestion.correctOptionId, submissionId: randomUUID() });
  for (const table of ['word_pairs', 'quiz_preferences', 'word_care_states', 'quiz_sessions', 'quiz_attempts', 'alphabet_quiz_sessions', 'alphabet_quiz_attempts']) {
    for (const [owner, foreign] of [[a, b], [b, a]]) {
      const ownRows = await data(owner.client.from(table).select('user_id').eq('user_id', owner.id).limit(1), `Owner RLS read failed for ${table}.`);
      check(ownRows.length === 1, `Isolation test lacks populated ${table} owner data.`);
      const hidden = await data(foreign.client.from(table).select('user_id').eq('user_id', owner.id), `Cross-account read failed for ${table}.`);
      check(hidden.length === 0, `Cross-account RLS exposed ${table} data.`);
    }
    await denied(a.client.from(table).update({ user_id: a.id }).eq('user_id', a.id), `Ordinary client gained direct protected writes on ${table}.`);
    await denied(anonymous.from(table).select('*').limit(1), `Anonymous client gained access to ${table}.`);
  }
  await denied(b.client.rpc('nl_set_word_care', { p_word_id: careWord.id, p_action: 'remove' }), 'Foreign account changed manual/suppressed care.');
  await denied(b.client.rpc('nl_save_word_pair', { p_pair_id: dogPair.id, p_source_word_id: bKo.id, p_target_word_id: bJa.id }), 'Foreign account reassigned another owner pair.');
  await denied(b.client.rpc('nl_delete_word_pair', { p_pair_id: dogPair.id }), 'Foreign account deleted another owner pair.');
  await denied(a.client.rpc('nl_suggest_word_pairs', { p_pairs: [{ sourceWordId: koDog.id, targetWordId: bJa.id, confidence: 1 }] }), 'Cross-owner word-pair suggestion bypassed ownership.');
  await rejected(() => repos.wordPairs.save({ id: bPair.id, sourceWordId: koDog.id, targetWordId: jaDog.id }), 'Repository mutated another account pair.');
  await rejected(() => repos.quiz.getSession(bQuiz.id), 'Repository reopened another account quiz history.');
  await rejected(() => repos.alphabetQuiz.getSession(bAlpha.id), 'Repository reopened another account Alphabet history.');
  await denied(a.client.rpc('nl_validate_alphabet_mcq', { p_item: {}, p_template: {} }), 'Authenticated client gained service-only Alphabet MCQ validation.');
  for (const rpc of ['nl_word_pairs', 'nl_quiz_preferences', 'nl_word_care']) await denied(anonymous.rpc(rpc), `Anonymous client gained access to ${rpc}.`);
  equal(await other.settings.getQuizPreferences(), { presentation: 'never', vocabularyAutoAudio: false, alphabetAutoAudio: false }, 'Account A preference writes changed account B defaults.');
  equal((await other.care.getStates()).map(row => row.wordId), [bKo.id], 'Care RPC exposed another account state.');
  check((await other.wordPairs.getPairs()).every(pair => pair.userId === b.id), 'Word-pair RPC exposed another account relationships.');

  // Cascades for temporary owner data preserve a finished session's snapshot.
  const deleteList = await repos.vocabulary.createList('ko', 'Disposable cascade fixture');
  const deleteWord = await repos.vocabulary.saveEntry({ ...koCat, listId: deleteList.id, word: '삭제', translation: 'delete', acceptedAnswers: [], examples: [], relatedWords: [] });
  await repos.care.setManual(deleteWord.id, 'add');
  const deletePair = await repos.wordPairs.save({ sourceWordId: deleteWord.id, targetWordId: jaDog.id });
  let deletedHistory = await repos.quiz.create({ language: 'ko', wordIds: [deleteWord.id], type: 'typing' });
  deletedHistory = await finish(deletedHistory);
  await repos.vocabulary.deleteList(deleteList.id);
  check(!(await device.care.getStates()).some(state => state.wordId === deleteWord.id), 'Deleted vocabulary list retained dangling care state.');
  check(!(await device.wordPairs.getPairs()).some(pair => pair.id === deletePair.id), 'Deleted vocabulary list retained a dangling pair.');
  const deletedSummary = aggregateQuizSummary(await device.quiz.getSession(deletedHistory.id), await device.vocabulary.getEntries('ko'));
  check(deletedSummary.words[0].deleted && deletedSummary.words[0].entry.word === '삭제' && deletedSummary.words[0].attempts[0].correctAnswer === 'delete', 'Deleted word history lost its frozen full Summary.');
  return { groups: ['Korean vocabulary', 'pair suggestions/confirmation/edit/tombstone', 'one-way/reverse cross-language typing and MCQ', 'tested-word SRS/activity', 'ordinary four-language mixing', 'independent/combined type mixing', 'full completed/ended/deleted Summary', 'presentation/audio defaults and resume', 'manual/automatic/suppressed care and idempotency', 'both-direction frozen Korean Alphabet MCQ', 'two-device persistence', 'populated bidirectional RLS and protected writes'] };
}
