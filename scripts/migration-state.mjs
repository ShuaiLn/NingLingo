/** Pure preflight: never infer unapplied legacy DDL from an incomplete checksum ledger. */
export function migrationPreflight(migrations, history, catalog) {
  if (!Array.isArray(history) || !Array.isArray(catalog?.tables)) throw new Error('Unexpected cloud migration/schema inspection response; stopped before DDL.');
  const known = new Map(migrations.map(migration => [migration.name, migration]));
  const applied = new Set();
  for (const row of history) {
    if (!known.has(row.name) || known.get(row.name).checksum !== row.checksum || applied.has(row.name)) {
      throw new Error(`Migration history mismatch for ${String(row.name).replace(/[^a-zA-Z0-9_.-]/g, '')}; do not rewrite applied migrations.`);
    }
    applied.add(row.name);
  }
  const latest = history.map(row => row.name).sort().at(-1);
  if (latest && migrations.some(migration => !applied.has(migration.name) && migration.name < latest)) {
    throw new Error('An earlier migration is missing from cloud history; stopped before DDL to prevent replay or out-of-order application.');
  }
  const baseline = migrations.filter(migration => Number(migration.name.slice(0, 3)) <= 13);
  if (catalog.tables.length && baseline.some(migration => !applied.has(migration.name))) {
    throw new Error('Existing cloud schema has an incomplete 001–013 checksum baseline. Stopped before DDL; old migrations will never be replayed to fill missing history. Recover and verify the existing migration ledger with authorized SQL access first.');
  }
  if (!catalog.historyExists && history.length) throw new Error('Migration ledger disappeared during inspection; stopped before DDL.');
  return { applied, pending: migrations.filter(migration => !applied.has(migration.name)), initializeLedger: !catalog.historyExists };
}
