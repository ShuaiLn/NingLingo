import { describe, expect, it } from "vitest";
import { migrationPreflight } from "../../scripts/migration-state.mjs";

const migrations = Array.from({ length: 17 }, (_, index) => ({ name: `${String(index + 1).padStart(3, "0")}_migration.sql`, checksum: `checksum-${index + 1}` }));
const existing = { tables: ["profiles", "vocabulary_entries", "alphabet_quiz_sessions"], historyExists: true };

describe("Cloud migration preflight preserves existing schema", () => {
  it("applies only 014–017 when the complete baseline ledger is verified", () => {
    const result = migrationPreflight(migrations, migrations.slice(0, 13), existing);
    expect(result.pending).toEqual(migrations.slice(13));
    expect(result.initializeLedger).toBe(false);
  });
  it.each([false, true])("stops before any DDL on existing tables with missing checksum history (ledger exists=%s)", historyExists => {
    expect(() => migrationPreflight(migrations, [], { ...existing, historyExists })).toThrow("will never be replayed");
  });
  it("stops on an incomplete baseline even if its recorded prefix has valid checksums", () => {
    expect(() => migrationPreflight(migrations, migrations.slice(0, 12), existing)).toThrow("incomplete 001–013");
  });
  it("rejects checksum drift, unknown history and duplicate ledger rows", () => {
    expect(() => migrationPreflight(migrations, [{ ...migrations[0], checksum: "rewritten" }], existing)).toThrow("mismatch");
    expect(() => migrationPreflight(migrations, [{ name: "018_unknown.sql", checksum: "unknown" }], existing)).toThrow("mismatch");
    expect(() => migrationPreflight(migrations, [migrations[0], migrations[0]], existing)).toThrow("mismatch");
  });
  it("rejects gaps rather than replaying earlier migrations", () => {
    expect(() => migrationPreflight(migrations, migrations.filter((_, index) => index !== 5), existing)).toThrow("prevent replay");
  });
  it("allows first-time initialization only for an empty schema", () => {
    const result = migrationPreflight(migrations, [], { tables: [], historyExists: false });
    expect(result.pending).toEqual(migrations);
    expect(result.initializeLedger).toBe(true);
  });
  it("does no application when all recorded checksums match", () => {
    expect(migrationPreflight(migrations, migrations, existing).pending).toEqual([]);
  });
  it("rejects malformed inspection responses and a vanished ledger", () => {
    expect(() => migrationPreflight(migrations, [], { tables: null as unknown as string[], historyExists: false })).toThrow("inspection response");
    expect(() => migrationPreflight(migrations, migrations, { tables: [], historyExists: false })).toThrow("disappeared");
  });
});
