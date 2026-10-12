import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alphabetEntries } from "@/data/alphabet";
import { answerAlphabetQuiz, createAlphabetQuizSession } from "@/domain/alphabet-quiz";
import type { AlphabetEntry, AlphabetQuizSession } from "@/domain/models";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = "2026-10-12T06:59:59.000Z";
let db: PGlite;
async function identity(role: "authenticated" | "service_role" | "anon" | "postgres", user = userA) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`set role ${role}`);
}
async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const result = await db.query<{ result: T }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`,
    args.map(arg => typeof arg === "object" && arg !== null ? JSON.stringify(arg) : arg));
  return result.rows[0].result;
}
function draft(symbol = "あ", userId = userA, sourceEntries = alphabetEntries) {
  const item = sourceEntries.find(item => item.symbol === symbol)!;
  return createAlphabetQuizSession({ id: crypto.randomUUID(), userId, language: item.language,
    itemIds: [item.id], randomSeed: 18, learningDate: "2026-10-11", now, sourceEntries });
}
async function create(symbol = "あ", userId = userA, sourceEntries = alphabetEntries) {
  await identity("service_role", userId);
  return rpc<AlphabetQuizSession>("nl_create_alphabet_quiz", [userId, draft(symbol, userId, sourceEntries)]);
}
async function commit(previous: AlphabetQuizSession, next: AlphabetQuizSession, submissionId: string | null = next.attempts.at(-1)?.id ?? null, user = userA) {
  await identity("service_role", user);
  return rpc<{ conflict: boolean; session: AlphabetQuizSession }>("nl_commit_alphabet_quiz", [user, previous.id, previous.version, next, submissionId]);
}
function answer(previous: AlphabetQuizSession, text = previous.currentQuestion!.acceptedAnswers[0], id = crypto.randomUUID(), at = now) {
  return answerAlphabetQuiz(previous, text, id, at);
}
function changeStatus(previous: AlphabetQuizSession, status: "active" | "saved" | "ended"): AlphabetQuizSession {
  return { ...previous, status, currentQuestion: status === "ended" ? null : previous.currentQuestion, version: previous.version + 1, updatedAt: now };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
  `);
  const directory = resolve("database/migrations");
  for (const file of (await readdir(directory)).filter(file => file.endsWith(".sql")).sort()) {
    try { await db.exec(await readFile(resolve(directory, file), "utf8")); }
    catch (error) { throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
}, 60_000);
beforeEach(async () => {
  await identity("postgres");
  await db.exec("truncate auth.users cascade");
  await db.query("insert into auth.users(id,email) values($1,'a@example.test'),($2,'b@example.test')", [userA, userB]);
  await identity("service_role");
});
afterAll(async () => { await db?.close(); });

describe("Alphabet migration, RLS and service-only writes", () => {
  it("persists explicit content versions, text IDs and complete snapshot arrays", async () => {
    const created = await create();
    const result = await db.query<{ content_version: number; snapshot: unknown; state: unknown }>("select content_version,snapshot,state from public.alphabet_quiz_sessions");
    expect(result.rows[0].content_version).toBe(1);
    expect(result.rows[0].snapshot).toMatchObject({ contentVersion: 1, items: created.items, questionTemplates: created.questionTemplates, configuration: created.configuration });
    expect(result.rows[0].state).toEqual(created);
    expect(created.items[0].itemId).toBe("ja-hiragana-あ");
    expect(created.items[0].pronunciationAnswers).toEqual(["a", "ah"]);
  });
  it("isolates sessions, attempts and history between accounts", async () => {
    const a = await create();
    await commit(a, answer(a));
    await create("β", userB);
    await identity("authenticated", userB);
    expect((await db.query<{ language: string }>("select language from public.alphabet_quiz_sessions")).rows).toEqual([{ language: "el" }]);
    expect((await db.query("select * from public.alphabet_quiz_attempts")).rows).toEqual([]);
    expect((await db.query("select * from public.learning_activity")).rows).toEqual([]);
    await identity("service_role", userB);
    await expect(commit(a, answer(a), null, userB)).rejects.toThrow("not found");
    await identity("authenticated");
    expect((await db.query("select * from public.alphabet_quiz_attempts")).rows).toHaveLength(1);
  });
  it("denies ordinary users direct writes, administrative RPCs and anonymous reads", async () => {
    const a = await create();
    await identity("authenticated");
    await expect(db.exec("update public.alphabet_quiz_sessions set version=100")).rejects.toThrow("permission denied");
    await expect(db.exec("delete from public.alphabet_quiz_attempts")).rejects.toThrow("permission denied");
    await expect(rpc("nl_create_alphabet_quiz", [userA, a])).rejects.toThrow("permission denied");
    await expect(rpc("nl_commit_alphabet_quiz", [userA, a.id, a.version, answer(a), "id"])).rejects.toThrow("permission denied");
    await identity("anon", "");
    await expect(db.exec("select * from public.alphabet_quiz_sessions")).rejects.toThrow("permission denied");
    await expect(db.exec("select * from public.alphabet_quiz_attempts")).rejects.toThrow("permission denied");
  });
  it("rejects inconsistent owner/language/content version or missing snapshot metadata", async () => {
    const a = draft();
    await expect(rpc("nl_create_alphabet_quiz", [userB, a])).rejects.toThrow("owner");
    await expect(rpc("nl_create_alphabet_quiz", [userA, { ...a, contentVersion: undefined }])).rejects.toThrow("initial");
    await expect(rpc("nl_create_alphabet_quiz", [userA, { ...a, language: "es" }])).rejects.toThrow("snapshot");
    const incomplete = structuredClone(a);
    delete (incomplete.items[0] as Partial<AlphabetEntry>).audioText;
    await expect(rpc("nl_create_alphabet_quiz", [userA, incomplete])).rejects.toThrow("snapshot");
    const forged = structuredClone(a);
    forged.questionTemplates[0].acceptedAnswers.push("name");
    await expect(rpc("nl_create_alphabet_quiz", [userA, forged])).rejects.toThrow("frozen pronunciation");
  });
  it("enforces the attempt owner foreign key even for service writes", async () => {
    const a = await create();
    await expect(db.query("insert into public.alphabet_quiz_attempts(session_id,user_id,id,question_id,item_id,position,kind,answer,correct,answered_at) values($1,$2,'id','q','text',0,'initial','a',true,now())", [a.id, userB])).rejects.toThrow("foreign key");
  });
});

describe("Alphabet transactional frozen grading and retry history", () => {
  it.each([["あ", "ah", true], ["B b", "b", true], ["B b", "be", false], ["β", "v", true], ["δ", "dh", true], ["δ", "th", false], ["H h", "silent", true]] as const)("grades and persists %s → %s", async (symbol, submitted, correct) => {
    const original = await create(symbol);
    const result = await commit(original, answer(original, submitted));
    expect(result.conflict).toBe(false);
    expect(result.session.attempts[0].correct).toBe(correct);
    const rows = await db.query<{ correct: boolean; item_id: string }>("select correct,item_id from public.alphabet_quiz_attempts");
    expect(rows.rows).toEqual([{ correct, item_id: original.items[0].itemId }]);
  });
  it("keeps old content/accepted answers after changes, save, refresh, resume and retry", async () => {
    const source = [structuredClone(alphabetEntries[0])];
    const original = await create("あ", userA, source);
    source[0] = { ...source[0], symbol: "new", name: "new name", pronunciation: "new hint", pronunciationAnswers: ["new", "other"], example: "new example", exampleTranslation: "new translation", audioText: "new audio", exampleReading: "new reading" };
    const wrong = (await commit(original, answer(original, "wrong"))).session;
    const saved = (await commit(wrong, changeStatus(wrong, "saved"), null)).session;
    const loaded = (await db.query<{ state: AlphabetQuizSession }>("select state from public.alphabet_quiz_sessions where id=$1", [saved.id])).rows[0].state;
    const resumed = (await commit(loaded, changeStatus(loaded, "active"), null)).session;
    const complete = (await commit(resumed, answer(resumed, "ah"))).session;
    expect(complete.items).toEqual(original.items);
    expect(complete.questionTemplates).toEqual(original.questionTemplates);
    expect(complete.attempts.map(attempt => [attempt.kind, attempt.correct])).toEqual([["initial", false], ["retry", true]]);
    expect(complete.status).toBe("completed");
    const fresh = await create("new", userA, source);
    expect(fresh.items[0]).toMatchObject({ symbol: "new", audioText: "new audio", pronunciationAnswers: ["new", "other"] });
  });
  it("does not produce attempts or activity on save/resume/end", async () => {
    const original = await create();
    const saved = (await commit(original, changeStatus(original, "saved"), null)).session;
    const resumed = (await commit(saved, changeStatus(saved, "active"), null)).session;
    const ended = (await commit(resumed, changeStatus(resumed, "ended"), null)).session;
    expect(ended.attempts).toEqual([]);
    expect((await db.query("select * from public.learning_activity")).rows).toEqual([]);
    expect((await db.query("select * from public.alphabet_quiz_attempts")).rows).toEqual([]);
  });
  it("returns the latest session for stale versions without applying the answer", async () => {
    const original = await create();
    const saved = (await commit(original, changeStatus(original, "saved"), null)).session;
    const conflict = await commit(original, answer(original));
    expect(conflict).toEqual({ conflict: true, session: saved });
    expect((await db.query("select * from public.alphabet_quiz_attempts")).rows).toEqual([]);
  });
  it("deduplicates submissions before version checks, including changed replay payloads", async () => {
    const original = await create();
    const submitted = answer(original, "wrong", "same-submission");
    const first = await commit(original, submitted);
    const replay = await commit(original, { ...submitted, items: [] }, "same-submission");
    expect(replay).toEqual(first);
    expect((await db.query("select * from public.alphabet_quiz_attempts")).rows).toHaveLength(1);
    expect((await db.query("select * from public.learning_activity")).rows).toHaveLength(1);
  });
  it("rejects forged grades and empty answers without partial writes", async () => {
    const original = await create("δ");
    const forged = answer(original, "th");
    forged.attempts[0].correct = true;
    await expect(commit(original, forged)).rejects.toThrow("frozen pronunciation");
    const empty = answer(original, "dh");
    empty.attempts[0].answer = " \n\uFEFF";
    await expect(commit(original, empty)).rejects.toThrow("current alphabet question");
    expect((await db.query("select * from public.alphabet_quiz_attempts")).rows).toEqual([]);
    expect((await db.query("select * from public.learning_activity")).rows).toEqual([]);
  });
  it.each(["items", "questionTemplates", "configuration", "contentVersion"] as const)("rejects replacing immutable %s", async key => {
    const original = await create();
    const modified = answer(original);
    if (key === "items") modified.items[0].audioText = "changed";
    if (key === "questionTemplates") modified.questionTemplates[0].acceptedAnswers.push("changed");
    if (key === "configuration") modified.configuration.retryRange = [10, 20];
    if (key === "contentVersion") modified.contentVersion++;
    await expect(commit(original, modified)).rejects.toThrow("immutable");
  });
  it("protects direct snapshot replacement with a database trigger", async () => {
    const original = await create();
    await expect(db.query("update public.alphabet_quiz_sessions set state=jsonb_set(state,'{contentVersion}','2') where id=$1", [original.id])).rejects.toThrow("immutable");
    await expect(db.query("update public.alphabet_quiz_sessions set content_version=2 where id=$1", [original.id])).rejects.toThrow("immutable");
  });
  it("rejects forged current questions or prior attempts", async () => {
    const original = await create();
    const wrong = (await commit(original, answer(original, "wrong"))).session;
    const forgedHistory = answer(wrong, "ah");
    forgedHistory.attempts[0].correct = true;
    await expect(commit(wrong, forgedHistory)).rejects.toThrow("answers are immutable");
    const forgedQuestion = answer(wrong, "wrong");
    forgedQuestion.currentQuestion!.acceptedAnswers = ["wrong"];
    await expect(commit(wrong, forgedQuestion)).rejects.toThrow("immutable templates");
  });
  it("records each account's timezone activity while leaving Vocabulary SRS untouched", async () => {
    const a = await create();
    await commit(a, answer(a));
    const afterMidnight = await create("β");
    await commit(afterMidnight, answer(afterMidnight, "v", "next-day", "2026-10-12T07:00:00.000Z"));
    expect((await db.query<{ day: string }>("select learning_date::text as day from public.learning_activity order by learning_date")).rows).toEqual([{ day: "2026-10-11" }, { day: "2026-10-12" }]);
    for (const table of ["word_progress", "review_settlements", "quiz_sessions", "quiz_attempts"]) expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
  });
});

describe("Vocabulary cache migration preserves contextual Reading identities", () => {
  async function cache(user: string, language: string, text: string, lookupKind = "vocabulary", context = "") {
    return db.query("insert into public.translation_cache(user_id,language,text,context,translation,source,lookup_kind) values($1,$2,$3,$4,'translation','deepl',$5)", [user, language, text, context, lookupKind]);
  }
  it("isolates lookup kinds, accounts and languages with canonical case-preserving words", async () => {
    await cache(userA, "es", "café");
    await expect(cache(userA, "es", "cafe\u0301")).rejects.toThrow("unique");
    await cache(userA, "es", "CAFÉ");
    await cache(userA, "es", "café", "reading");
    await cache(userB, "es", "café");
    await cache(userA, "el", "café");
    expect((await db.query("select * from public.translation_cache")).rows).toHaveLength(5);
    await identity("authenticated", userB);
    expect((await db.query("select * from public.translation_cache")).rows).toHaveLength(1);
  });
  it("defaults existing-compatible writes to Reading and English, and rejects vocabulary context", async () => {
    await db.query("insert into public.translation_cache(user_id,language,text,context,translation,source) values($1,'ja','犬','sentence','dog','deepl')", [userA]);
    expect((await db.query("select lookup_kind,target_language from public.translation_cache")).rows).toEqual([{ lookup_kind: "reading", target_language: "EN" }]);
    await expect(cache(userA, "ja", "犬", "vocabulary", "sentence")).rejects.toThrow("empty_context");
    await expect(db.query("update public.translation_cache set target_language='JA'")).rejects.toThrow("check constraint");
  });
});
