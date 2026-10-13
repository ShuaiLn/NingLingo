import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

// GET requests only: no lifecycle/import RPCs, fixtures, domain writes or DDL.
const tables = {
  profiles: 'user_id,language_preferences',
  vocabulary_lists: 'id,user_id,language',
  vocabulary_entries: 'id,user_id,language',
  quiz_sessions: 'id,user_id,language,quiz_type,state,snapshot,participating_languages,presentation',
  quiz_questions: 'session_id,user_id,id,word_id,configuration',
  quiz_attempts: 'session_id,user_id,id,word_id,correct',
  retry_reservations: 'session_id,user_id,word_id',
  word_progress: 'word_id,user_id,stage,due_date,errors',
  review_settlements: 'session_id,user_id,word_id,perfect',
  learning_activity: 'id,user_id,language,kind',
  readings: 'id,user_id,language',
  translation_cache: 'language,lookup_kind,target_language',
  grammar_points: 'id,language,current_version',
  grammar_versions: 'point_id,content_version,status,development_seed,modification_notes,manifest',
  grammar_examples: 'point_id,content_version,id,ordinal',
  grammar_exercises: 'point_id,content_version,id,ordinal',
  grammar_sources: 'point_id,content_version,ordinal',
  grammar_reviews: 'point_id,content_version,human_review',
  grammar_progress: 'point_id,user_id',
  alphabet_quiz_sessions: 'id,user_id,language,content_version,snapshot,state,random_seed,scheduler_version,version,status,learning_date,created_at,updated_at',
  alphabet_quiz_attempts: 'session_id,user_id,id,question_id,item_id,position,kind,answer,correct,answered_at',
  word_pairs: 'id,user_id,source_word_id,target_word_id,status,confidence,warning,created_at,updated_at',
  quiz_preferences: 'user_id,presentation,vocabulary_auto_audio,alphabet_auto_audio,updated_at',
  word_care_states: 'word_id,user_id,manual_care,automatic_suppressed,updated_at',
};
const rpcs = {
  nl_import_grammar: ['p_points'],
  nl_grammar_is_published: ['p_id', 'p_version'],
  nl_word_pairs: [],
  nl_suggest_word_pairs: ['p_pairs'],
  nl_save_word_pair: ['p_source_word_id', 'p_target_word_id', 'p_pair_id'],
  nl_delete_word_pair: ['p_pair_id'],
  nl_create_quiz: ['p_user_id', 'p_state'],
  nl_commit_quiz: ['p_user_id', 'p_session_id', 'p_expected_version', 'p_state', 'p_submission_id'],
  nl_quiz_preferences: [],
  nl_update_quiz_preferences: ['p_preferences'],
  nl_word_care: ['p_language'],
  nl_set_word_care: ['p_word_id', 'p_action'],
  nl_validate_alphabet_mcq: ['p_item', 'p_template'],
  nl_create_alphabet_quiz: ['p_user_id', 'p_state'],
  nl_commit_alphabet_quiz: ['p_user_id', 'p_session_id', 'p_expected_version', 'p_state', 'p_submission_id'],
};
const argumentFormats = {
  p_points: 'jsonb', p_id: 'text', p_version: 'int32', p_pairs: 'jsonb',
  p_source_word_id: 'uuid', p_target_word_id: 'uuid', p_pair_id: 'uuid',
  p_user_id: 'uuid', p_state: 'jsonb', p_session_id: 'uuid', p_expected_version: 'int32',
  p_submission_id: 'text', p_preferences: 'jsonb', p_language: 'text',
  p_word_id: 'uuid', p_action: 'text', p_item: 'jsonb', p_template: 'jsonb',
};
const optionalArguments = {
  nl_grammar_is_published: ['p_version'],
  nl_save_word_pair: ['p_pair_id'],
  nl_commit_quiz: ['p_submission_id'],
  nl_word_care: ['p_language'],
  nl_commit_alphabet_quiz: ['p_submission_id'],
};
const newColumnFormats = {
  'quiz_sessions.participating_languages': 'text[]',
  'quiz_sessions.presentation': 'text',
  'word_pairs.id': 'uuid',
  'word_pairs.user_id': 'uuid',
  'word_pairs.source_word_id': 'uuid',
  'word_pairs.target_word_id': 'uuid',
  'word_pairs.status': 'text',
  'word_pairs.confidence': 'double precision',
  'word_pairs.warning': 'text',
  'word_pairs.created_at': 'timestamp with time zone',
  'word_pairs.updated_at': 'timestamp with time zone',
  'quiz_preferences.user_id': 'uuid',
  'quiz_preferences.presentation': 'text',
  'quiz_preferences.vocabulary_auto_audio': 'boolean',
  'quiz_preferences.alphabet_auto_audio': 'boolean',
  'quiz_preferences.updated_at': 'timestamp with time zone',
  'word_care_states.word_id': 'uuid',
  'word_care_states.user_id': 'uuid',
  'word_care_states.manual_care': 'boolean',
  'word_care_states.automatic_suppressed': 'boolean',
  'word_care_states.updated_at': 'timestamp with time zone',
};

async function grammarInventory(client) {
  const results = await Promise.all([
    client.from('grammar_points').select('id,language,current_version', { count: 'exact' }).range(0, 999),
    client.from('grammar_versions').select('point_id,content_version,status,development_seed,modification_notes,reviewer:manifest->reviewer', { count: 'exact' }).range(0, 999),
    client.from('grammar_reviews').select('point_id,content_version,human_review', { count: 'exact' }).range(0, 999),
  ]);
  const failure = results.find(result => result.error);
  if (failure) return { available: false, errorCode: failure.error.code };
  const [points, versions, reviews] = results;
  const truncated = results.some(result => result.count > result.data.length);
  const current = points.data.map(point => ({ ...point, version: versions.data.find(version => version.point_id === point.id && version.content_version === point.current_version) }));
  const byLanguage = Object.fromEntries(['ja', 'es', 'el', 'ko'].map(language => {
    const lessons = current.filter(point => point.language === language);
    return [language, {
      points: lessons.length,
      currentVersions: lessons.filter(point => point.version).length,
      statuses: lessons.reduce((counts, point) => {
        const status = point.version?.status ?? 'missing';
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {}),
    }];
  }));
  const korean = current.filter(point => point.language === 'ko');
  const koreanIds = korean.map(point => point.id);
  const content = koreanIds.length ? await Promise.all(['grammar_examples', 'grammar_exercises', 'grammar_sources'].map(table => client.from(table).select('point_id,content_version', { count: 'exact' }).in('point_id', koreanIds).range(0, 999))) : [];
  const contentFailure = content.find(result => result.error);
  const complete = !truncated && !contentFailure && content.every(result => result.count <= result.data.length);
  const isAIProvenanceValid = point => point.version?.status === 'published-ai'
    && point.version.development_seed === false
    && point.version.reviewer === null
    && point.version.modification_notes.includes('AI-authored; not human-reviewed')
    && !reviews.data.some(review => review.point_id === point.id && review.content_version === point.current_version && review.human_review);
  return {
    available: true,
    inventoryComplete: complete,
    byLanguage,
    korean: {
      aiProvenanceValidLessons: korean.filter(isAIProvenanceValid).length,
      completeLessons: complete ? korean.filter(point => content[0].data.filter(row => row.point_id === point.id && row.content_version === point.current_version).length >= 3
        && content[1].data.filter(row => row.point_id === point.id && row.content_version === point.current_version).length >= 5
        && content[2].data.some(row => row.point_id === point.id && row.content_version === point.current_version)).length : null,
      contentCounts: Object.fromEntries(['examples', 'exercises', 'sources'].map((name, index) => [name, content[index]?.count ?? 0])),
      ...(contentFailure ? { errorCode: contentFailure.error.code } : {}),
    },
    note: 'Read-only inventory of global curriculum content; no personal vocabulary/session data fetched. Learner visibility and publication rejection are verified separately with temporary accounts.',
  };
}

async function main() {
  if (!url || !key) throw new Error('Read-only schema inspection requires the configured Supabase URL and server-only Data API key.');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(25_000) }) },
  });
  const [schema, openApiResponse, ledger, catalog, grammar] = await Promise.all([
    Promise.all(Object.entries(tables).map(async ([table, columns]) => {
      const response = await client.from(table).select(columns).limit(0);
      return { table, columns: columns.split(','), requestedColumnsAvailable: !response.error, errorCode: response.error?.code ?? null };
    })),
    fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' }, signal: AbortSignal.timeout(25_000) }),
    client.schema('ninglingo_internal').from('applied_migrations').select('name,checksum').limit(1000),
    client.schema('pg_catalog').from('pg_constraint').select('conname').limit(0),
    grammarInventory(client),
  ]);
  const openApi = openApiResponse.ok ? await openApiResponse.json() : null;
  const signatures = Object.entries(rpcs).map(([name, expectedArguments]) => {
    const endpoint = openApi?.paths?.[`/rpc/${name}`];
    const body = endpoint?.post?.parameters?.find(parameter => parameter.in === 'body')?.schema;
    const properties = body?.properties ?? {};
    const actualArguments = Object.keys(properties);
    const required = body?.required ?? [];
    const expectedRequired = expectedArguments.filter(argument => !(optionalArguments[name] ?? []).includes(argument));
    return { name, exists: Boolean(endpoint), signatureMatches: Boolean(endpoint)
      && expectedArguments.every(argument => properties[argument]?.format === argumentFormats[argument])
      && actualArguments.length === expectedArguments.length
      && expectedRequired.every(argument => required.includes(argument)) && required.length === expectedRequired.length };
  });
  const columns = Object.entries(newColumnFormats).map(([name, expectedFormat]) => {
    const [table, column] = name.split('.');
    const actual = openApi?.definitions?.[table]?.properties?.[column];
    return { name, expectedFormat, actualFormat: actual?.format ?? null, matches: actual?.format === expectedFormat };
  });
  const keys = ['word_pairs', 'quiz_preferences', 'word_care_states'].map(table => {
    const definition = openApi?.definitions?.[table];
    return {
      table,
      requiredColumns: definition?.required ?? [],
      primaryKeyColumns: Object.entries(definition?.properties ?? {}).filter(([, property]) => property.description?.includes('<pk/>')).map(([name]) => name),
      singleColumnForeignKeys: Object.entries(definition?.properties ?? {}).flatMap(([name, property]) => {
        const target = property.description?.match(/<fk table='([^']+)' column='([^']+)'\/>/);
        return target ? [{ column: name, targetTable: target[1], targetColumn: target[2] }] : [];
      }),
    };
  });
  const report = {
    inspectedAt: new Date().toISOString(),
    inspection: 'Read-only GET requests; zero personal domain rows requested; no RPC execution, fixtures, schema/data changes or migration replay.',
    schema,
    openApi: { available: openApiResponse.ok, status: openApiResponse.status, rpcs: signatures, columnFormats: columns, keys },
    grammar,
    catalog: {
      available: !catalog.error,
      errorCode: catalog.error?.code ?? null,
      limitation: 'OpenAPI confirms exposed tables, columns/types, RPC argument names, primary keys and simple foreign keys. It does not expose CHECK/unique/composite FK definitions, indexes, trigger definitions/function bodies or RLS policy definitions. Behavioral tests provide separate evidence; exact catalog equivalence is not inferred.',
      unverifiedIndexes: ['word_pairs_relationship', 'quiz_sessions_participating_languages', 'word_care_states_owner'],
      unverifiedTriggers: ['grammar_publication_validated', 'quiz_participating_languages', 'new_incorrect_submission_reactivates_care', 'quiz_presentation_immutable', 'alphabet_quiz_snapshot_immutable'],
      unverifiedTriggerFunctions: ['nl_validate_grammar_publication', 'nl_quiz_languages', 'nl_reactivate_word_care', 'nl_guard_quiz_presentation', 'nl_guard_alphabet_quiz_snapshot'],
      unverifiedPolicies: ['word_pairs_owner_read', 'quiz_preferences_owner_read', 'word_care_states_owner_read', 'alphabet_quiz_sessions.owner_select', 'alphabet_quiz_attempts.owner_select', 'published_grammar'],
    },
    checksumHistory: ledger.error ? { available: false, errorCode: ledger.error.code, reason: 'The private SQL ledger cannot be verified through the Data API; migration execution/checksum state is not inferred.' }
      : { available: true, recordedMigrations: ledger.data?.length ?? 0 },
    sqlAccess: { managementTokenConfigured: Boolean(process.env.SUPABASE_ACCESS_TOKEN), databaseUrlConfigured: Boolean(process.env.DATABASE_URL) },
  };
  report.observableSchemaMatches = schema.every(probe => probe.requestedColumnsAvailable) && signatures.every(probe => probe.signatureMatches) && columns.every(probe => probe.matches);
  const directory = resolve('.local-preview');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'cloud-schema-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  // Inaccessible catalog/history is a reported limitation, never a reason to replay migrations.
  if (!report.observableSchemaMatches) process.exitCode = 2;
}

main().catch(() => { console.error('Read-only cloud schema inspection failed; credentials and provider response withheld.'); process.exitCode = 1; });
