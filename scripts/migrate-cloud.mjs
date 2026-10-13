import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { migrationPreflight } from "./migration-state.mjs";

nextEnv.loadEnvConfig(process.cwd());

// Administrative Management API credentials are deliberately independent of browser
// publishable keys and service-role Data API keys. No Docker/local Supabase is required.
const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const quote = value => `'${value.replaceAll("'", "''")}'`;

async function main() {
  const directory = resolve("database/migrations");
  const names = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!names.length || names.some((name, index) => name.slice(0, 3) !== String(index + 1).padStart(3, "0"))) throw new Error("Migration filenames must form a unique uninterrupted sequence starting at 001.");
  const migrations = await Promise.all(names.map(async name => {
    const sql = await readFile(resolve(directory, name), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
  if (process.argv.includes("--check")) {
    console.log(`Validated ${migrations.length} ordered SQL migration files; no cloud connection made.`);
    return;
  }
  if (!url || !token) throw new Error("Cloud SQL application requires NEXT_PUBLIC_SUPABASE_URL and an authorized SUPABASE_ACCESS_TOKEN (Management API database:write). A Supabase secret/service-role Data API key cannot execute SQL migrations.");
  const hostname = new URL(url).hostname;
  const ref = hostname.endsWith(".supabase.co") ? hostname.split(".")[0] : process.env.SUPABASE_PROJECT_REF;
  if (!ref || !/^[a-z0-9]+$/.test(ref)) throw new Error("Cannot determine the Supabase Cloud project reference; configure SUPABASE_PROJECT_REF for a custom domain.");
  async function query(sql, readOnly = true) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Supabase Management API rejected SQL application (HTTP ${response.status}). No credentials or SQL response are printed.`);
    return response.json();
  }
  // Inspect both schema and ledger without issuing CREATE/ALTER first. An empty
  // or incomplete checksum table is not evidence that production DDL is absent.
  const inspected = await query("select coalesce((select jsonb_agg(tablename order by tablename) from pg_catalog.pg_tables where schemaname='public'),'[]'::jsonb) as tables, to_regclass('ninglingo_internal.applied_migrations') is not null as history_exists;");
  if (!Array.isArray(inspected) || inspected.length !== 1) throw new Error("Unexpected cloud catalog response; stopped before DDL.");
  const catalog = { tables: inspected[0].tables, historyExists: inspected[0].history_exists };
  const history = catalog.historyExists ? await query("select name,checksum from ninglingo_internal.applied_migrations order by name;") : [];
  const preflight = migrationPreflight(migrations, history, catalog);
  console.log(`Inspected cloud schema and checksum history before DDL: ${catalog.tables.length} public tables, ${history.length} recorded migrations, ${preflight.pending.length} pending.`);
  if (preflight.initializeLedger) {
    await query("create schema if not exists ninglingo_internal; revoke all on schema ninglingo_internal from public,anon,authenticated; create table ninglingo_internal.applied_migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now());", false);
  }
  for (const migration of preflight.pending) {
    // DDL + checksum commit together; a failure leaves the migration unapplied.
    await query(`begin; select pg_advisory_xact_lock(hashtextextended('ninglingo:migrations',0)); ${migration.sql}\ninsert into ninglingo_internal.applied_migrations(name,checksum) values(${quote(migration.name)},${quote(migration.checksum)}); commit;`, false);
    console.log(`Applied ${migration.name}`);
  }
  const verification = await query("select count(*)::integer as applied from ninglingo_internal.applied_migrations;");
  if (verification[0]?.applied !== migrations.length) throw new Error("Cloud migration history verification failed.");
  console.log(`Verified ${migrations.length} applied Cloud migrations.`);
}

main().catch(error => {
  // Error messages come from this script, never a credential-bearing response/request.
  console.error(error instanceof Error && !["TypeError", "AbortError", "TimeoutError"].includes(error.name) ? error.message : "Cloud migration request failed; verify administrative access and network availability.");
  process.exitCode = 1;
});
