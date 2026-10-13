import { readFile } from 'node:fs/promises';

// Local files only. No environment loading, credentials, network or database writes.
// Usage: node scripts/compare-cloud-schema.mjs <provided-live.json> <expected.json>
function unwrap(value) {
  if (typeof value === 'string') return unwrap(JSON.parse(value.replace(/^\uFEFF/, '')));
  if (Array.isArray(value) && value.length === 1) return unwrap(value[0]);
  if (value?.schema_verification) return unwrap(value.schema_verification);
  if (!value?.tables || !Array.isArray(value.functions) || !Array.isArray(value.authTriggers)) {
    throw new Error('Expected the JSON result of database/verify_expansion_schema.sql.');
  }
  return value;
}

function sqlTokens(value, publicNames) {
  if (value === null) return null;
  // Preserve quoted identifiers and literal contents; fold only unquoted SQL
  // tokens. This also handles NORMALIZE vs normalize without changing its args.
  const tokens = value.match(/(?:[eE]'(?:\\.|''|[^'])*'|'(?:''|[^'])*'|"(?:""|[^"])*"|[a-zA-Z_][a-zA-Z_0-9$]*|[0-9]+(?:\.[0-9]+)?|[~!@#%^&|`?+*/<>=:\-]+|[^\s])/g) ?? [];
  const normalized = tokens.map(token => /^[a-zA-Z_][a-zA-Z_0-9$]*$/.test(token) ? token.toLowerCase() : token);
  const result = [];
  for (let index = 0; index < normalized.length; index++) {
    if (normalized[index] === 'public' && normalized[index + 1] === '.' && publicNames.has(normalized[index + 2])) {
      index += 1;
      continue;
    }
    result.push(normalized[index]);
  }
  return result.join(' ');
}

function canonical(schema, publicNames) {
  const copy = structuredClone(schema);
  delete copy.serverVersion;
  const sqlFields = new Set(['definition', 'default', 'using', 'withCheck']);
  function visit(value, key = '') {
    if (typeof value === 'string' && sqlFields.has(key)) return sqlTokens(value, publicNames);
    if (Array.isArray(value)) {
      const items = value.map(item => visit(item));
      if (items.every(item => item && typeof item === 'object' && typeof item.name === 'string')) {
        return items.sort((a, b) => `${a.name}:${a.arguments ?? ''}`.localeCompare(`${b.name}:${b.arguments ?? ''}`));
      }
      if (key === 'roles' || key === 'settings') return items.sort();
      return items;
    }
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => [name, visit(item, name)]));
    return value;
  }
  let redundantNotNullConstraints = 0;
  for (const table of Object.values(copy.tables)) {
    table.constraints = table.constraints.filter(constraint => {
      if (constraint.kind !== 'n') return true;
      const matchesColumn = table.columns.some(column => column.notNull && sqlTokens(constraint.definition, publicNames) === `not null ${column.name}`);
      // PostgreSQL 18 exposes these catalog objects; PostgreSQL 17 represents
      // the same rule solely through attnotnull. Every column flag still must
      // match exactly, and unexpected/invalid NOT NULL constraints remain diffs.
      const redundant = matchesColumn && constraint.validated === true && constraint.deferrable === false && constraint.initiallyDeferred === false;
      if (redundant) redundantNotNullConstraints++;
      return !redundant;
    });
  }
  return { schema: visit(copy), redundantNotNullConstraints };
}

function counts(schema) {
  const tables = Object.values(schema.tables);
  return {
    tables: tables.length,
    columns: tables.reduce((sum, table) => sum + table.columns.length, 0),
    constraints: tables.reduce((sum, table) => sum + table.constraints.length, 0),
    indexes: tables.reduce((sum, table) => sum + table.indexes.length, 0),
    triggers: tables.reduce((sum, table) => sum + table.triggers.length, 0),
    policies: tables.reduce((sum, table) => sum + table.policies.length, 0),
    functions: schema.functions.length,
    authTriggers: schema.authTriggers.length,
  };
}

function differences(expected, actual, path = '$', result = []) {
  if (Object.is(expected, actual)) return result;
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && Array.isArray(expected) === Array.isArray(actual)) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (!(key in expected)) result.push({ path: `${path}.${key}`, issue: 'unexpected actual field' });
      else if (!(key in actual)) result.push({ path: `${path}.${key}`, issue: 'missing actual field' });
      else differences(expected[key], actual[key], `${path}.${key}`, result);
    }
  } else {
    result.push({ path, expected, actual });
  }
  return result;
}

async function main() {
  const [actualPath, expectedPath, ...extra] = process.argv.slice(2);
  if (!actualPath || !expectedPath || extra.length) throw new Error('Usage: node scripts/compare-cloud-schema.mjs <provided-live.json> <expected.json>');
  const [actual, expected] = await Promise.all([actualPath, expectedPath].map(async path => unwrap(await readFile(path, 'utf8'))));
  const publicNames = new Set([...Object.keys(expected.tables), ...expected.functions.map(fn => fn.name), 'nl_english']);
  const expectedNormalized = canonical(expected, publicNames);
  const actualNormalized = canonical(actual, publicNames);
  const mismatches = differences(expectedNormalized.schema, actualNormalized.schema);
  console.log(JSON.stringify({
    source: 'Two supplied local JSON files; no live SQL access or independently acquired cloud evidence is implied.',
    matches: mismatches.length === 0,
    versions: { expected: expected.serverVersion, actual: actual.serverVersion },
    expectedCounts: counts(expected), actualCounts: counts(actual),
    normalization: {
      schemaQualification: 'Equivalent public qualification for known implementation objects only.',
      sqlRendering: 'Case and token spacing outside quoted identifiers/literals; function hashes and all SQL arguments remain exact.',
      redundantNotNullConstraints: { expected: expectedNormalized.redundantNotNullConstraints, actual: actualNormalized.redundantNotNullConstraints },
      notNullRule: 'Validated nondeferrable NOT NULL catalog objects are represented by the exactly compared columns.notNull flags across PostgreSQL versions.',
    },
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 100),
  }, null, 2));
  if (mismatches.length) process.exitCode = 2;
}

main().catch(() => { console.error('Schema JSON comparison failed. Supply both complete metadata JSON files; no provider credentials are needed.'); process.exitCode = 1; });
