import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { answerQuiz, createQuizSession } from "@/domain/quiz";
import type { GrammarPoint, QuizSession, VocabularyEntry } from "@/domain/models";

// Real embedded PostgreSQL runs the checked-in Cloud migrations. Auth functions/roles
// reproduce Supabase's JWT identity boundary without a local Supabase stack or Docker.
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const listA = "11111111-1111-4111-8111-111111111111";
const listB = "22222222-2222-4222-8222-222222222222";
let db: PGlite;

async function identity(role: "authenticated" | "service_role" | "anon" | "postgres", user = userA) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, email: `${user.slice(0, 1)}@example.test` })]);
  await db.exec(`set role ${role}`);
}
async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(",");
  const result = await db.query<{ result: T }>(`select public.${name}(${placeholders}) as result`, args.map(arg => typeof arg === "object" && arg !== null ? JSON.stringify(arg) : arg));
  return result.rows[0].result;
}
function input(changes: Record<string, unknown> = {}) {
  return { language: "es", listId: listA, word: "café", reading: "", translation: "coffee", type: "noun", category: "food", example: "El café está listo.", notes: "", acceptedAnswers: [{ id: "", text: "coffee drink" }], ...changes };
}
async function word(changes: Record<string, unknown> = {}) { return rpc<VocabularyEntry>("nl_save_vocabulary", [input(changes)]); }
async function learningDay(at?: string) {
  const result = await db.query<{ day: string }>("select public.nl_learning_date($1,coalesce($2::timestamptz,now()))::text as day", [userA, at ?? null]);
  return result.rows[0].day;
}
function lesson(changes: Partial<GrammarPoint> = {}): GrammarPoint {
  return {
    id: "es-test-present", language: "es", title: "Present tense", level: "A1", category: "Verbs", explanation: "Use the present tense for routines.", formation: "Subject + verb",
    examples: Array.from({ length: 3 }, (_, i) => ({ id: `example-${i}`, text: `Yo estudio ${i + 1} horas.`, translation: `I study for ${i + 1} hours.` })),
    exercises: Array.from({ length: 5 }, (_, i) => ({ id: `exercise-${i}`, prompt: `Choose the present form (${i + 1}).`, choices: ["estudio", "estudié", "estudiaré"], correctIndex: 0, explanation: "Estudio is first-person singular present." })),
    status: "draft", sources: [{ title: "Reference", url: "https://en.wikibooks.org/wiki/Spanish/Contents", version: "pinned-test-version", license: "CC BY-SA 4.0", attribution: "Wikibooks contributors" }],
    reviewer: null, contentVersion: 1, modificationNotes: "Test fixture only.", developmentSeed: false, ...changes,
  };
}
async function createSession(entries: VocabularyEntry[], due = entries.map(entry => entry.id), seed = 28) {
  await identity("postgres");
  const today = await learningDay();
  await identity("service_role");
  const session = createQuizSession({ id: crypto.randomUUID(), userId: userA, language: "es", entries, type: "typing", randomSeed: seed, learningDate: today, dueWordIds: due });
  return rpc<QuizSession>("nl_create_quiz", [userA, session]);
}
async function commit(previous: QuizSession, next: QuizSession, submissionId: string | null = next.attempts.at(-1)?.id ?? null) {
  await identity("service_role");
  return rpc<{ conflict: boolean; session: QuizSession }>("nl_commit_quiz", [userA, previous.id, previous.version, next, submissionId]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
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
  await db.exec("truncate auth.users,public.grammar_points cascade");
  await db.query("insert into auth.users(id,email) values($1,'a@example.test'),($2,'b@example.test')", [userA, userB]);
  await db.query("insert into public.vocabulary_lists(id,user_id,language,name) values($1,$2,'es','Essentials'),($3,$4,'es','Private B')", [listA, userA, listB, userB]);
  await identity("authenticated");
});
afterAll(async () => { await db?.close(); });

describe("Cloud migrations and ownership", () => {
  it("bootstraps existing/new personal profiles with the default timezone", async () => {
    expect(await rpc("nl_profile")).toMatchObject({ id: userA, timezone: "America/Tijuana", email: "a@example.test" });
    const rows = await db.query("select user_id from public.profiles");
    expect(rows.rows).toHaveLength(1);
  });
  it("rejects invalid timezones and computes learning days across timezone boundaries", async () => {
    await expect(db.query("update public.profiles set timezone='Invalid/Timezone' where user_id=$1", [userA])).rejects.toThrow("IANA timezone");
    await identity("postgres");
    expect(await learningDay("2026-10-12T06:59:59Z")).toBe("2026-10-11");
    expect(await learningDay("2026-10-12T07:00:00Z")).toBe("2026-10-12");
  });
  it("enables RLS on every exposed domain table", async () => {
    await identity("postgres");
    const result = await db.query<{ relname: string; relrowsecurity: boolean }>("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    expect(result.rows).toHaveLength(24);
    expect(result.rows.filter(row => !row.relrowsecurity)).toEqual([]);
  });
  it("isolates vocabulary and child records between two real database roles", async () => {
    const entry = await word({ examples: [{ id: "", text: "Un café.", reading: "", translation: "A coffee." }], relatedWords: [{ id: "", word: "cafetería", reading: "", translation: "coffee shop", relationType: "derived" }] });
    expect((await rpc<VocabularyEntry[]>("nl_vocabulary_entries", ["es"]))[0]).toEqual(entry);
    await identity("authenticated", userB);
    expect(await rpc("nl_vocabulary_entries", ["es"])).toEqual([]);
    expect(await rpc("nl_vocabulary_entry", [entry.id])).toBeNull();
    for (const table of ["vocabulary_entries", "accepted_answers", "vocabulary_examples", "vocabulary_related_words", "word_progress"]) expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
    await expect(rpc("nl_save_vocabulary", [input({ listId: listB, word: "robado" }), entry.id])).rejects.toThrow("not found");
    await expect(word({ listId: listA })).rejects.toThrow("your lists");
  });
  it("rejects anonymous reads/RPCs and all client-forged grading/progress/cache writes", async () => {
    await word();
    await expect(db.exec("update public.word_progress set stage=6")).rejects.toThrow("permission denied");
    await expect(db.exec("insert into public.learning_activity values('fake','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','es',current_date,'quiz',1)")).rejects.toThrow("permission denied");
    await expect(rpc("nl_create_quiz", [userA, {}])).rejects.toThrow("permission denied");
    await expect(rpc("nl_import_grammar", [[]])).rejects.toThrow("permission denied");
    await expect(db.exec("delete from public.translation_cache")).rejects.toThrow("permission denied");
    await identity("anon", "");
    await expect(db.exec("select * from public.vocabulary_entries")).rejects.toThrow("permission denied");
    await expect(rpc("nl_save_vocabulary", [input()])).rejects.toThrow("permission denied");
  });
  it("enforces parent ownership and language at the database foreign key boundary", async () => {
    await identity("postgres");
    await expect(db.query("insert into public.vocabulary_entries(user_id,language,list_id,word,translation) values($1,'es',$2,'steal','steal')", [userA, listB])).rejects.toThrow("foreign key");
    await expect(db.query("insert into public.vocabulary_entries(user_id,language,list_id,word,translation) values($1,'ja',$2,'犬','dog')", [userA, listA])).rejects.toThrow("foreign key");
  });
});

describe("transactional vocabulary and legacy CSV expansion", () => {
  it("atomically imports Unicode duplicates while retaining same-spelling different-meaning words", async () => {
    const result = await rpc("nl_import_vocabulary", [[input(), input({ word: "cafe\u0301" }), input({ translation: "coffee shop" })]]);
    expect(result).toEqual({ imported: 2, duplicates: 1 });
    const entries = await rpc<VocabularyEntry[]>("nl_vocabulary_entries", ["es"]);
    expect(entries).toHaveLength(2);
    expect(entries[0].examples).toMatchObject([{ text: "El café está listo.", translation: "", reading: "" }]);
    expect(entries.map(entry => entry.translation).sort()).toEqual(["coffee", "coffee shop"]);
  });
  it("rolls back every import row when a later row is invalid", async () => {
    await expect(rpc("nl_import_vocabulary", [[input({ word: "primero" }), input({ word: "invalid", translation: "" })]])).rejects.toThrow("required");
    expect(await rpc("nl_vocabulary_entries", ["es"])).toEqual([]);
    expect((await db.query("select * from public.word_progress")).rows).toEqual([]);
  });
  it("rolls back the parent and all children if an explicit related-word type is invalid", async () => {
    await expect(word({ relatedWords: [{ word: "invented", relationType: "automatic-inference" }] })).rejects.toThrow("check constraint");
    expect(await rpc("nl_vocabulary_entries", ["es"])).toEqual([]);
  });
  it("preserves multiple translated examples, all six relation types, and deduplicated accepted answers", async () => {
    const types = ["derived", "compound", "synonym", "antonym", "word_form", "related"];
    const entry = await word({ acceptedAnswers: [{ text: "coffee drink" }, { text: " COFFEE DRINK " }], examples: [{ text: "Un café.", reading: "", translation: "A coffee." }, { text: "Tomo café.", reading: "", translation: "I drink coffee." }], relatedWords: types.map((relationType, i) => ({ word: `forma-${i}`, reading: "", translation: "explicit source form", relationType })) });
    expect(entry.acceptedAnswers).toHaveLength(1);
    expect(entry.examples).toHaveLength(2);
    expect(entry.relatedWords?.map(row => row.relationType)).toEqual(types);
    expect(await rpc("nl_progress_words", ["es"])).toMatchObject([{ wordId: entry.id, stage: 0, settledSessionIds: [] }]);
  });
});

describe("versioned Reading transactions", () => {
  it.each(["edit", "annotation"])("rejects stale %s versions with a non-retryable SQLSTATE", async operation => {
    const input = { language: "es", title: "Conflict regression", body: "Un café.", status: "reading" };
    const reading = await rpc<{ id: string }>("nl_save_reading", [input]);
    await rpc("nl_save_reading", [{ ...input, body: "Nuevo café." }, reading.id, false, 1]);
    const stale = operation === "edit"
      ? rpc("nl_save_reading", [input, reading.id, true, 1])
      : rpc("nl_annotate_reading", [{ readingId: reading.id, bodyVersion: 1, start: 0, end: 2, text: "Un", translation: "a" }]);
    await expect(stale).rejects.toMatchObject({ code: "22023" });
    expect(await rpc("nl_reading", [reading.id])).toMatchObject({ version: 2, body: "Nuevo café." });
  });
  it("validates UTF-16 positions after emoji and preserves Greek accents", async () => {
    const reading = await rpc<{ id: string; version: number }>("nl_save_reading", [{ language: "el", title: "Καφές", body: "😀 καφές!", status: "reading" }]);
    const annotation = await rpc("nl_annotate_reading", [{ readingId: reading.id, bodyVersion: 1, start: 3, end: 8, text: "καφές", translation: "coffee", reading: "", vocabularyEntryId: null }]);
    expect(annotation).toMatchObject({ start: 3, end: 8, text: "καφές", translation: "coffee" });
    await expect(rpc("nl_annotate_reading", [{ readingId: reading.id, bodyVersion: 1, start: 1, end: 2, text: "x", translation: "bad" }])).rejects.toThrow("splits a Unicode");
    await expect(rpc("nl_annotate_reading", [{ readingId: reading.id, bodyVersion: 1, start: 3, end: 100, text: "x", translation: "bad" }])).rejects.toThrow("inside this reading");
  });
  it("requires annotation clearing and an expected version before editing the body", async () => {
    const original = { language: "es", title: "Coffee", body: "Un café.", status: "unread" };
    const reading = await rpc<{ id: string }>("nl_save_reading", [original]);
    await rpc("nl_annotate_reading", [{ readingId: reading.id, bodyVersion: 1, start: 3, end: 7, text: "café", translation: "coffee" }]);
    await expect(rpc("nl_save_reading", [{ ...original, body: "Nuevo café." }, reading.id, false, 1])).rejects.toThrow("invalidates positional");
    expect(await rpc("nl_save_reading", [{ ...original, body: "Nuevo café." }, reading.id, true, 1])).toMatchObject({ version: 2 });
    expect((await db.query("select * from public.reading_annotations")).rows).toEqual([]);
    expect((await db.query("select * from public.reading_versions order by version")).rows).toHaveLength(2);
    await expect(rpc("nl_save_reading", [original, reading.id, true, 1])).rejects.toThrow("changed");
    await expect(rpc("nl_annotate_reading", [{ readingId: reading.id, bodyVersion: 1, start: 3, end: 7, text: "café", translation: "coffee" }])).rejects.toThrow("changed");
  });
  it("rejects annotation links to another user's vocabulary and scopes readings/versions", async () => {
    const reading = await rpc<{ id: string }>("nl_save_reading", [{ language: "es", title: "Coffee", body: "café", status: "reading" }]);
    await identity("authenticated", userB);
    const other = await word({ listId: listB });
    expect((await db.query("select * from public.readings")).rows).toEqual([]);
    expect((await db.query("select * from public.reading_versions")).rows).toEqual([]);
    await expect(rpc("nl_annotate_reading", [{ readingId: reading.id, bodyVersion: 1, start: 0, end: 4, text: "café", translation: "coffee" }])).rejects.toThrow("not found");
    await identity("authenticated");
    await expect(rpc("nl_annotate_reading", [{ readingId: reading.id, bodyVersion: 1, start: 0, end: 4, text: "café", translation: "coffee", vocabularyEntryId: other.id }])).rejects.toThrow("your words");
    await identity("service_role");
    await expect(db.query("insert into public.reading_annotations(user_id,reading_id,body_version,start_offset,end_offset,text,translation,vocabulary_entry_id) values($1,$2,1,0,4,'café','coffee',$3)", [userA, reading.id, other.id])).rejects.toThrow("foreign key");
  });
  it("isolates contextual machine cache by user, language, text, and full accented context", async () => {
    await identity("service_role");
    await db.query("insert into public.translation_cache(user_id,language,text,context,translation,source) values($1,'es','café','Quiero café.','coffee','deepl'),($1,'es','café','Un café bonito.','cafe','deepl'),($2,'es','café','Quiero café.','private','deepl')", [userA, userB]);
    await identity("authenticated");
    expect((await db.query("select translation from public.translation_cache order by translation")).rows).toEqual([{ translation: "cafe" }, { translation: "coffee" }]);
    await identity("service_role");
    await expect(db.query("insert into public.translation_cache(user_id,language,text,context,translation,source) values($1,'es',$2,'Quiero café.','duplicate','deepl')", [userA, "cafe\u0301"])).rejects.toThrow("unique constraint");
  });
});

describe("immutable Grammar content and server-side grading", () => {
  it("imports drafts idempotently, rejects same-version changes, and hides drafts through RLS", async () => {
    await identity("service_role");
    const draft = lesson();
    expect(await rpc("nl_import_grammar", [[draft]])).toEqual({ imported: 1, unchanged: 0 });
    expect(await rpc("nl_import_grammar", [[draft]])).toEqual({ imported: 0, unchanged: 1 });
    await expect(rpc("nl_import_grammar", [[{ ...draft, explanation: "changed" }]])).rejects.toThrow("immutable");
    await identity("authenticated");
    expect(await rpc("nl_grammar_points", ["es"])).toEqual([]);
    for (const table of ["grammar_points", "grammar_versions", "grammar_examples", "grammar_exercises", "grammar_sources"]) expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
    await expect(rpc("nl_submit_grammar", [draft.id, [0, 0, 0, 0, 0]])).rejects.toThrow("unavailable");
  });
  it("refuses publication without human review and malformed exercise content", async () => {
    await identity("service_role");
    await expect(rpc("nl_import_grammar", [[lesson({ status: "published" })]])).rejects.toThrow("Human review");
    const malformed = lesson(); malformed.exercises[0].choices = ["same", "same"];
    await expect(rpc("nl_import_grammar", [[malformed]])).rejects.toThrow("unique");
    expect((await db.query("select * from public.grammar_points")).rows).toEqual([]);
  });
  it("imports all 240 prepared production drafts through the relational pipeline and hides them until human review", async () => {
    await identity("service_role");
    const points = (await Promise.all(["ja", "es", "el"].map(async language => JSON.parse(await readFile(resolve(`content/grammar/generated/${language}.json`), "utf8")) as GrammarPoint[]))).flat();
    expect(points).toHaveLength(240);
    expect(await rpc("nl_import_grammar", [points])).toEqual({ imported: 240, unchanged: 0 });
    expect((await db.query<{ language: string; count: number }>("select language,count(*)::integer as count from public.grammar_points group by language order by language")).rows).toEqual([{ language: "el", count: 60 }, { language: "es", count: 80 }, { language: "ja", count: 100 }]);
    expect((await db.query<{ examples: number; exercises: number; reviews: number }>("select (select count(*)::integer from public.grammar_examples) as examples,(select count(*)::integer from public.grammar_exercises) as exercises,(select count(*)::integer from public.grammar_reviews) as reviews")).rows[0]).toEqual({ examples: 720, exercises: 1200, reviews: 0 });
    await identity("authenticated");
    expect(await rpc("nl_grammar_points", ["ja"])).toEqual([]);
    expect(await rpc("nl_grammar_points", ["es"])).toEqual([]);
    expect(await rpc("nl_grammar_points", ["el"])).toEqual([]);
  }, 30_000);
  it("does not overwrite the latest lesson header when importing an older historical version", async () => {
    await identity("service_role");
    await rpc("nl_import_grammar", [[lesson({ contentVersion: 3, title: "Current version" })]]);
    await rpc("nl_import_grammar", [[lesson({ contentVersion: 2, title: "Historical version" })]]);
    expect(await rpc("nl_grammar_point", ["es-test-present"])).toMatchObject({ title: "Current version", contentVersion: 3 });
  });
  it("publishes only reviewed content and persists the 80% threshold without later regression", async () => {
    await identity("service_role");
    const published = lesson({ status: "published", reviewer: { name: "Test human reviewer fixture", date: "2026-10-11" } });
    await rpc("nl_import_grammar", [[published]]);
    await identity("authenticated");
    expect(await rpc("nl_grammar_points", ["es"])).toMatchObject([{ id: published.id, status: "published", exercises: published.exercises }]);
    expect(await rpc("nl_submit_grammar", [published.id, [0, 0, 0, 1, 1]])).toMatchObject({ correct: 3, total: 5, completed: false });
    expect(await rpc("nl_submit_grammar", [published.id, [0, 0, 0, 0, 1]])).toMatchObject({ correct: 4, total: 5, completed: true });
    expect(await rpc("nl_submit_grammar", [published.id, [1, 1, 1, 1, 1]])).toMatchObject({ correct: 0, completed: true });
    await expect(rpc("nl_submit_grammar", [published.id, [0]])).rejects.toThrow("every exercise");
    await identity("authenticated", userB);
    expect((await db.query("select * from public.grammar_progress")).rows).toEqual([]);
  });
});

describe("atomic quiz CAS, replay, and SRS settlement", () => {
  it("freezes selected entries across vocabulary edits and rejects client quiz access", async () => {
    const entry = await word(); const session = await createSession([entry]);
    await identity("authenticated");
    await rpc("nl_save_vocabulary", [input({ translation: "edited meaning" }), entry.id]);
    expect((await db.query<{ state: QuizSession }>("select state from public.quiz_sessions")).rows[0].state.entries[0].translation).toBe("coffee");
    await identity("authenticated", userB);
    for (const table of ["quiz_sessions", "quiz_questions", "quiz_attempts", "retry_reservations", "review_settlements"]) expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
    await expect(rpc("nl_commit_quiz", [userA, session.id, 1, session, null])).rejects.toThrow("permission denied");
  });
  it("commits an answer exactly once, returns latest on stale versions, and never settles twice", async () => {
    const entry = await word();
    await identity("postgres"); await db.query("update public.word_progress set due_date=public.nl_learning_date(user_id)");
    const session = await createSession([entry]);
    const next = answerQuiz(session, "coffee", "answer-1");
    const result = await commit(session, next);
    expect(result).toMatchObject({ conflict: false, session: { settled: true, status: "completed" } });
    expect(await commit(session, { ...next, attempts: [] }, "answer-1")).toEqual(result);
    expect(await commit(session, next, "different-answer")).toMatchObject({ conflict: true, session: result.session });
    expect((await db.query("select * from public.quiz_attempts")).rows).toHaveLength(1);
    expect((await db.query("select * from public.review_settlements")).rows).toHaveLength(1);
    expect((await db.query("select * from public.learning_activity")).rows).toHaveLength(1);
    expect(await rpc("nl_progress_words", ["es"])).toMatchObject([{ stage: 1, firstAttempts: 1, firstCorrect: 1, settledSessionIds: [session.id] }]);
  });
  it("persists deterministic retries including tail questions and a repeated wrong retry", async () => {
    const entries = await Promise.all([word(), word({ word: "té", translation: "tea" }), word({ word: "agua", translation: "water" }), word({ word: "leche", translation: "milk" })]);
    let session = await createSession(entries);
    let wrong = 0;
    while (session.currentQuestion) {
      const current = session.currentQuestion;
      const forceWrong = current.wordId === session.entries.at(-1)!.id && wrong < 2;
      if (forceWrong) wrong++;
      const next = answerQuiz(session, forceWrong ? "wrong" : current.acceptedAnswers[0], crypto.randomUUID());
      session = (await commit(session, next)).session;
      const reservations = (await db.query("select word_id,position,interval from public.retry_reservations where session_id=$1", [session.id])).rows;
      expect(reservations).toHaveLength(session.reservations.length);
      expect(session.entries.map(entry => entry.id).sort()).toEqual(entries.map(entry => entry.id).sort());
    }
    expect(session.attempts.length).toBeGreaterThan(entries.length);
    expect(session.attempts.filter(attempt => attempt.kind === "retry")).toHaveLength(2);
    expect(session.reservations).toEqual([]);
    expect((await db.query("select * from public.review_settlements")).rows).toHaveLength(4);
  });
  it("rejects a forged grade and immutable snapshot alteration without committing partial state", async () => {
    const entry = await word(); const session = await createSession([entry]);
    const next = answerQuiz(session, "wrong", "bad-grade"); next.attempts[0].correct = true;
    await expect(commit(session, next)).rejects.toThrow("grade");
    const changed = answerQuiz(session, "coffee", "bad-snapshot"); changed.entries[0].translation = "tampered";
    await expect(commit(session, changed)).rejects.toThrow("immutable");
    expect((await db.query("select * from public.quiz_attempts")).rows).toEqual([]);
    expect((await db.query<{ version: number }>("select version from public.quiz_sessions")).rows[0].version).toBe(1);
  });
  it("save/resume preserves scheduler state and defers settlement until active ending", async () => {
    const entry = await word(); let session = await createSession([entry]);
    session = (await commit(session, answerQuiz(session, "wrong", "wrong"))).session;
    const beforeSave = session;
    session = (await commit(session, { ...session, version: session.version + 1, status: "saved" }, null)).session;
    expect(session.reservations).toEqual(beforeSave.reservations);
    expect((await db.query("select * from public.review_settlements")).rows).toEqual([]);
    session = (await commit(session, { ...session, version: session.version + 1, status: "active" }, null)).session;
    session = (await commit(session, { ...session, version: session.version + 1, status: "ended", currentQuestion: null }, null)).session;
    expect(session.settled).toBe(true);
    expect((await db.query("select * from public.review_settlements")).rows).toHaveLength(1);
  });
  it("early practice keeps the due date and same-day due reviews cannot advance twice", async () => {
    const entry = await word();
    await identity("postgres");
    const today = await learningDay();
    await db.query("update public.word_progress set due_date=$1::date+7", [today]);
    let session = await createSession([entry], []);
    await commit(session, answerQuiz(session, "coffee", "early"));
    expect((await db.query<{ due_date: string; stage: number }>("select due_date,stage from public.word_progress")).rows[0].stage).toBe(0);
    expect((await db.query<{ delta: number }>("select due_date-$1::date as delta from public.word_progress", [today])).rows[0].delta).toBe(7);
    await identity("postgres"); await db.query("update public.word_progress set due_date=$1::date", [today]);
    session = await createSession([entry]); await commit(session, answerQuiz(session, "coffee", "due-1"));
    expect((await db.query<{ stage: number }>("select stage from public.word_progress")).rows[0].stage).toBe(1);
    await identity("postgres"); await db.query("update public.word_progress set due_date=$1::date", [today]);
    session = await createSession([entry]); await commit(session, answerQuiz(session, "coffee", "due-2"));
    expect((await db.query<{ stage: number }>("select stage from public.word_progress")).rows[0].stage).toBe(1);
  });
  it("an error in a later due session resets next-day review without clearing the same-day promotion guard", async () => {
    const entry = await word();
    await identity("postgres"); await db.query("update public.word_progress set due_date=public.nl_learning_date(user_id),stage=4,last_advanced_date=public.nl_learning_date(user_id)");
    let session = await createSession([entry]);
    session = (await commit(session, answerQuiz(session, "wrong", "error"))).session;
    await commit(session, answerQuiz(session, "coffee", "retry"));
    const rows = await db.query<{ stage: number; delta: number; guarded: boolean; first_attempts: number; errors: number }>("select stage,due_date-public.nl_learning_date(user_id) as delta,last_advanced_date=public.nl_learning_date(user_id) as guarded,first_attempts,errors from public.word_progress");
    expect(rows.rows[0]).toEqual({ stage: 0, delta: 1, guarded: true, first_attempts: 1, errors: 1 });
  });
  it("grades JavaScript trim whitespace and equivalent Unicode answers without mutating submitted text", async () => {
    const entry = await word({ translation: "YES", acceptedAnswers: [{ text: "καφές" }] });
    let session = await createSession([entry]);
    const whitespaceAnswer = "\t YES\n\u00a0\ufeff";
    const first = await commit(session, answerQuiz(session, whitespaceAnswer, "whitespace-answer"));
    expect(first.session.attempts[0]).toMatchObject({ answer: whitespaceAnswer, correct: true });
    session = await createSession([entry]);
    const decomposed = "καφε\u0301ς";
    const second = await commit(session, answerQuiz(session, decomposed, "unicode-answer"));
    expect(second.session.attempts[0]).toMatchObject({ answer: decomposed, correct: true });
    expect(await rpc("nl_normalize_answer", ["\vVOICE\v"])).toBe("voice");
    expect(await rpc("nl_normalize_answer", ["ΟΣ"])).toBe("ΟΣ".toLocaleLowerCase("en"));
    expect(await rpc("nl_normalize_answer", ["İ"])).toBe("İ".toLocaleLowerCase("en"));
  });
});
