import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import korean from "../../content/grammar/generated/ko.json";
import release from "../../content/grammar/releases/2026-10-11-v2.json";
import type { GrammarPoint, GrammarProgress, VocabularyEntry } from "@/domain/models";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const listA = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
async function identity(role: "postgres" | "authenticated" | "service_role" | "anon", user = userA) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`set role ${role}`);
}
async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const result = await db.query<{ result: T }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`, args.map(value => typeof value === "object" && value !== null ? JSON.stringify(value) : value));
  return result.rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role; grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const directory = resolve("database/migrations");
  for (const file of (await readdir(directory)).filter(file => file.endsWith(".sql") && file < "014").sort()) await db.exec(await readFile(resolve(directory, file), "utf8"));
  await db.query("insert into auth.users(id,email) values($1,'a@example.test'),($2,'b@example.test')", [userA, userB]);
  await identity("service_role");
  await rpc("nl_import_grammar", [release]);
  await identity("postgres");
  await db.exec(await readFile(resolve(directory, "014_korean_and_ai_grammar.sql"), "utf8"));
  await identity("service_role");
  await rpc("nl_import_grammar", [korean]);
  await rpc("nl_import_grammar", [[{ ...korean[0], id: "ko-hidden-draft", title: "Hidden draft", status: "draft" }]]);
}, 60_000);
beforeEach(async () => { await identity("authenticated"); });
afterAll(async () => { await db?.close(); });

describe("Korean additive migration and independent AI publication", () => {
  it("preserves all 240 published versions and human review records while adding 60 AI lessons", async () => {
    for (const [language, count] of [["ja", 100], ["es", 80], ["el", 60], ["ko", 60]] as const) expect(await rpc<GrammarPoint[]>("nl_grammar_points", [language])).toHaveLength(count);
    await identity("postgres");
    const reviews = await db.query<{ count: number }>("select count(*)::integer as count from public.grammar_reviews where human_review");
    expect(reviews.rows[0].count).toBe(240);
    expect(await rpc("nl_grammar_point", [release[0].id])).toMatchObject({ status: "published", contentVersion: 2, reviewer: { name: "ning lu", date: "2026-10-11" } });
    const profile = await db.query<{ language_preferences: string[] }>("select language_preferences from public.profiles where user_id=$1", [userA]);
    expect(profile.rows[0].language_preferences).toEqual(["ja", "es", "el"]);
  });

  it("allows reading AI lessons without making hidden drafts accessible", async () => {
    const points = await rpc<GrammarPoint[]>("nl_grammar_points", ["ko"]);
    expect(points.every(point => point.status === "published-ai" && point.reviewer === null)).toBe(true);
    expect(await rpc("nl_grammar_point", ["ko-hidden-draft"])).toBeNull();
    expect((await db.query("select * from public.grammar_versions where status='draft'")).rows).toEqual([]);
    await expect(rpc("nl_submit_grammar", ["ko-hidden-draft", [0, 0, 0, 0, 0]])).rejects.toThrow("unavailable");
  });

  it("grades answers on the server and isolates Korean progress and activity by owner", async () => {
    const point = korean[0];
    const answers = point.exercises.map(exercise => exercise.correctIndex);
    answers[0] = (answers[0] + 1) % point.exercises[0].choices.length;
    const score = await rpc<GrammarProgress>("nl_submit_grammar", [point.id, answers]);
    expect(score).toMatchObject({ userId: userA, language: "ko", correct: 4, total: 5, completed: true, contentVersion: 1 });
    await identity("authenticated", userB);
    expect((await db.query("select * from public.grammar_progress")).rows).toEqual([]);
    expect((await db.query("select * from public.learning_activity")).rows).toEqual([]);
    await expect(db.query("update public.grammar_progress set correct=5")).rejects.toThrow("permission denied");
  });

  it("ordinary and anonymous accounts cannot publish, import, or forge review records", async () => {
    await expect(rpc("nl_import_grammar", [korean])).rejects.toThrow("permission denied");
    await expect(db.query("update public.grammar_versions set status='published' where point_id=$1", [korean[0].id])).rejects.toThrow("permission denied");
    await expect(db.query("insert into public.grammar_reviews(point_id,content_version,reviewer_name,reviewed_at,human_review) values($1,1,'Fake',current_date,true)", [korean[0].id])).rejects.toThrow("permission denied");
    await identity("anon");
    await expect(rpc("nl_grammar_points", ["ko"])).rejects.toThrow("permission denied");
  });

  it("retains version immutability and same-version import idempotency", async () => {
    await identity("service_role");
    expect(await rpc("nl_import_grammar", [korean])).toEqual({ imported: 0, unchanged: 60 });
    await expect(rpc("nl_import_grammar", [[{ ...korean[0], explanation: "Changed after publication." }]])).rejects.toThrow("immutable");
  });

  it("rejects misleading AI provenance and keeps the human-review requirement", async () => {
    await identity("service_role");
    for (const [suffix, changes] of [["disclosure", { modificationNotes: "Ready." }], ["reviewer", { reviewer: { name: "Fake", date: "2026-10-12" } }], ["human", { status: "published" }]] as const) {
      await expect(rpc("nl_import_grammar", [[{ ...korean[0], id: `ko-invalid-${suffix}`, ...changes }]])).rejects.toThrow(/review|origin/u);
    }
  });

  it("accepts Korean vocabulary, reading, translation cache and profile language preferences", async () => {
    await db.query("insert into public.vocabulary_lists(id,user_id,language,name) values($1,$2,'ko','Korean')", [listA, userA]);
    const entry = await rpc<VocabularyEntry>("nl_save_vocabulary", [{ language: "ko", listId: listA, word: "물", reading: "mul", translation: "water", category: "Food", type: "noun", notes: "", example: "물을 마셔요.", acceptedAnswers: [] }]);
    expect(entry).toMatchObject({ language: "ko", word: "물", reading: "mul" });
    expect(await rpc("nl_save_reading", [{ language: "ko", title: "아침", body: "물을 마셔요.", status: "unread" }])).toMatchObject({ language: "ko", body: "물을 마셔요." });
    await db.query("update public.profiles set language_preferences=array['ko'] where user_id=$1", [userA]);
    await identity("service_role");
    await db.query("insert into public.translation_cache(user_id,language,text,context,translation,source) values($1,'ko','물','물을 마셔요.','water','deepl')", [userA]);
    await identity("authenticated", userB);
    expect(await rpc("nl_vocabulary_entries", ["ko"])).toEqual([]);
  });
});
