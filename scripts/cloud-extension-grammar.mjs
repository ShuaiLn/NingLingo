import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function verifyExtensionGrammar({ a, b, admin, check, data, denied, issues, withGrammar }) {
  const inventory = await data(admin.from('grammar_versions').select('point_id,content_version,status').order('point_id').order('content_version'), 'Grammar inventory read failed.');
  const realKorean = await data(a.client.rpc('nl_grammar_points', { p_language: 'ko' }), 'Korean published lesson lookup failed.');
  check(realKorean.every(point => point.language === 'ko' && ['published', 'published-ai'].includes(point.status)), 'Korean draft/review-only lessons leaked.');
  if (realKorean.length !== 60) issues.push(`Production Korean grammar inventory has ${realKorean.length}/60 visible lessons; verification will not install production content.`);
  const source = JSON.parse(await readFile('content/grammar/generated/ko.json', 'utf8'));
  const original = Array.isArray(source) ? source[0] : source.points?.[0];
  check(Boolean(original), 'Korean lesson verification source is unavailable.');
  const createdIds = [];
  const fixture = (status, overrides = {}) => {
    const id = `ko-verification-${randomUUID()}`; createdIds.push(id);
    return { ...structuredClone(original), id, status, ...overrides };
  };
  try {
    const ai = fixture('published-ai'), draft = fixture('draft');
    const imported = await data(admin.rpc('nl_import_grammar', { p_points: [ai, draft] }), 'Temporary Korean grammar import failed.');
    check(imported.imported === 2, 'Temporary Korean grammar import count is wrong.');
    const visible = await data(a.client.rpc('nl_grammar_points', { p_language: 'ko' }), 'Temporary AI lesson visibility failed.');
    const lesson = visible.find(point => point.id === ai.id);
    check(lesson?.status === 'published-ai' && lesson.reviewer === null && /AI-authored; not human-reviewed/.test(lesson.modificationNotes), 'AI lesson lost its independent publication/provenance.');
    check(!visible.some(point => point.id === draft.id), 'A temporary draft lesson is visible.');
    for (const [table, column] of [['grammar_points', 'id'], ['grammar_versions', 'point_id'], ['grammar_examples', 'point_id'], ['grammar_exercises', 'point_id'], ['grammar_sources', 'point_id']]) {
      const hidden = await data(a.client.from(table).select(column).eq(column, draft.id), `Draft RLS read failed for ${table}.`);
      check(hidden.length === 0, `Draft content leaked from ${table}.`);
    }
    await denied(a.client.rpc('nl_import_grammar', { p_points: [fixture('published-ai')] }), 'Ordinary account can import/publish grammar.');
    await denied(a.client.from('grammar_versions').update({ status: 'published' }).eq('point_id', ai.id), 'Ordinary account can forge grammar publication.');
    for (const invalid of [fixture('published-ai', { modificationNotes: 'Missing required disclosure' }), fixture('published-ai', { reviewer: { name: 'Invented reviewer', date: '2026-10-12' } }), fixture('published', { reviewer: null })]) {
      const rejected = await admin.rpc('nl_import_grammar', { p_points: [invalid] });
      check(rejected.error?.code === '22023', 'Invalid human/AI publication provenance was accepted.');
      const rows = await data(admin.from('grammar_points').select('id').eq('id', invalid.id), 'Publication rollback read failed.');
      check(rows.length === 0, 'A rejected grammar import left partial content.');
    }
    const correct = lesson.exercises.map(exercise => exercise.correctIndex);
    const progress = await data(a.client.rpc('nl_submit_grammar', { p_point_id: ai.id, p_answers: correct }), 'Korean AI lesson server grading failed.');
    check(progress.correct === correct.length && progress.completed === true, 'Korean AI lesson grade/completion is wrong.');
    const wrong = await data(a.client.rpc('nl_submit_grammar', { p_point_id: ai.id, p_answers: correct.map((value, index) => (value + 1) % lesson.exercises[index].choices.length) }), 'Korean repeat grammar grading failed.');
    check(wrong.correct === 0 && wrong.completed === true, 'Later errors erased established grammar completion.');
    const sync = await data(a.secondDevice.from('grammar_progress').select('*').eq('point_id', ai.id), 'Second-device Korean grammar progress failed.');
    check(sync.length === 1 && sync[0].completed === true, 'Korean grammar progress did not persist cross-device.');
    const hiddenProgress = await data(b.client.from('grammar_progress').select('*').eq('user_id', a.id).eq('point_id', ai.id), 'Grammar cross-account isolation read failed.');
    check(hiddenProgress.length === 0, 'Korean grammar progress leaked cross-account.');
    const noDraftScore = await a.client.rpc('nl_submit_grammar', { p_point_id: draft.id, p_answers: correct });
    check(Boolean(noDraftScore.error), 'Hidden draft grammar can be graded by an ordinary account.');
    for (const language of ['ja', 'es', 'el']) {
      const points = await data(a.client.rpc('nl_grammar_points', { p_language: language }), `Legacy ${language} grammar visibility failed.`);
      check(points.length > 0 && points.every(point => point.status === 'published' && point.reviewer), `Legacy ${language} human-reviewed publication regressed.`);
      const old = points[0];
      const score = await data(a.client.rpc('nl_submit_grammar', { p_point_id: old.id, p_answers: old.exercises.map(exercise => exercise.correctIndex) }), `Legacy ${language} grammar grading failed.`);
      check(score.completed === true && score.correct === old.exercises.length, `Legacy ${language} grammar grading is wrong.`);
    }
    if (withGrammar) await withGrammar({ lesson });
  } finally {
    if (createdIds.length) {
      // Progress deliberately references published version history without a
      // content-delete cascade. Remove only these disposable owners' attempts.
      await data(admin.from('grammar_progress').delete().in('point_id', createdIds).in('user_id', [a.id, b.id]), 'Temporary grammar progress cleanup failed.');
      await data(admin.from('grammar_points').delete().in('id', createdIds), 'Temporary grammar cleanup failed.');
      for (const [table, column] of [['grammar_points', 'id'], ['grammar_versions', 'point_id'], ['grammar_examples', 'point_id'], ['grammar_exercises', 'point_id'], ['grammar_sources', 'point_id'], ['grammar_reviews', 'point_id'], ['grammar_progress', 'point_id']]) {
        const residual = await data(admin.from(table).select(column).in(column, createdIds), `Temporary grammar cleanup verification failed for ${table}.`);
        check(residual.length === 0, `Temporary grammar records remain in ${table}.`);
      }
    }
    const after = await data(admin.from('grammar_versions').select('point_id,content_version,status').order('point_id').order('content_version'), 'Final grammar inventory read failed.');
    check(JSON.stringify(after) === JSON.stringify(inventory), 'Production grammar inventory changed during verification.');
  }
  return { visibleProductionKoreanLessons: realKorean.length, temporaryGrammarPointsCreatedAndRemoved: 2, temporaryGrammarFixtureIdsVerifiedAbsent: createdIds.length, grammarTablesVerifiedClean: 7 };
}
