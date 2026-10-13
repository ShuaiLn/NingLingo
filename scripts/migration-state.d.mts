export interface MigrationRecord { name: string; checksum: string; sql?: string }
export function migrationPreflight(migrations: MigrationRecord[], history: MigrationRecord[], catalog: { tables: string[]; historyExists: boolean }): { applied: Set<string>; pending: MigrationRecord[]; initializeLedger: boolean };
