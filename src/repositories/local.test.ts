import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VocabularyEntry, VocabularyInput } from "@/domain/models";
import { previewCsv } from "@/domain/csv";
import { createQuizSession } from "@/domain/quiz";
import { createLocalRepositories } from "./local";
import { VersionConflictError } from "./contracts";
import { createDevelopmentSeed } from "./seed";
import { MemoryStorageAdapter } from "./storage";

const instant = new Date("2026-10-11T19:00:00.000Z");
function setup() {
  const adapter = new MemoryStorageAdapter();
  const seed = createDevelopmentSeed(instant);
  const repos = createLocalRepositories(adapter, seed);
  return { adapter, seed, repos };
}
function entryInput(entry: VocabularyEntry, changes: Partial<VocabularyInput> = {}): VocabularyInput {
  return { language: entry.language, listId: entry.listId, word: entry.word, reading: entry.reading, translation: entry.translation, type: entry.type, category: entry.category, example: entry.example, notes: entry.notes, acceptedAnswers: entry.acceptedAnswers, ...changes };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(instant); });
afterEach(() => { vi.useRealTimers(); });

describe("local vocabulary transactions and persistence", () => {
  it("persists saved vocabulary through an adapter across repository instances", async () => {
    const { adapter, seed, repos } = setup();
    const saved = await repos.vocabulary.saveEntry(entryInput(seed.entries.find(entry => entry.language === "es")!, { word: "café", translation: "coffee", acceptedAnswers: [{ id: "", text: " café drink " }] }));
    const anotherSession = createLocalRepositories(adapter, createDevelopmentSeed(instant));
    expect(await anotherSession.vocabulary.getEntries("es")).toContainEqual(saved);
    expect(saved.acceptedAnswers[0]).toMatchObject({ text: "café drink" });
    expect(saved.acceptedAnswers[0].id).not.toBe("");
    expect((await anotherSession.progress.getWords("es")).find(word => word.wordId === saved.id)).toMatchObject({ stage: 0, dueDate: "2026-10-12" });
  });

  it("imports the confirmed CSV preview and skips exact duplicate rows", async () => {
    const { seed, repos } = setup();
    const list = seed.lists.find(row => row.language === "es")!;
    const existing = await repos.vocabulary.getEntries("es");
    const preview = previewCsv('\uFEFFword,reading,translation,type,category,example,notes\r\n"café",,"coffee, freshly brewed",noun,food,"El café\nes bueno.",\r\ncafé,,coffee shop,noun,places,,\r\ncafé,,coffee shop,noun,places,,\r\n, ,missing word,,,,', existing, "es", list.id);
    expect(preview.valid).toHaveLength(2);
    expect(preview.duplicates).toHaveLength(1);
    expect(preview.invalid).toHaveLength(1);
    expect(await repos.vocabulary.importEntries(preview.valid.map(row => row.input))).toEqual({ imported: 2, duplicates: 0 });
    expect(await repos.vocabulary.importEntries(preview.valid.map(row => row.input))).toEqual({ imported: 0, duplicates: 2 });
    const imported = (await repos.vocabulary.getEntries("es")).filter(word => word.word === "café");
    expect(imported.map(word => word.translation)).toEqual(["coffee, freshly brewed", "coffee shop"]);
    expect(imported[0].example).toBe("El café\nes bueno.");
  });

  it("rolls back the whole import when any row fails repository validation", async () => {
    const { adapter, seed, repos } = setup();
    const source = seed.entries.find(row => row.language === "es")!;
    const before = adapter.read();
    await expect(repos.vocabulary.importEntries([entryInput(source, { word: "nuevo", translation: "new" }), entryInput(source, { word: "invalid", translation: "" })])).rejects.toThrow("required");
    expect(adapter.read()).toEqual(before);
    expect((await repos.vocabulary.getEntries("es")).some(word => word.word === "nuevo")).toBe(false);
    // A rejected transaction does not poison the serialization queue.
    await expect(repos.vocabulary.saveEntry(entryInput(source, { word: "nuevo", translation: "new" }))).resolves.toMatchObject({ word: "nuevo" });
  });

  it("rejects list-language mismatches without committing changes", async () => {
    const { adapter, seed, repos } = setup();
    const source = seed.entries.find(row => row.language === "es")!;
    const before = adapter.read();
    await expect(repos.vocabulary.saveEntry(entryInput(source, { word: "nuevo", listId: "list-ja-essentials" }))).rejects.toThrow("this language");
    expect(adapter.read()).toEqual(before);
  });

  it("returns detached records so callers cannot mutate stored state", async () => {
    const { repos } = setup();
    const entries = await repos.vocabulary.getEntries("es");
    const translation = entries[0].translation;
    entries[0].translation = "unsaved mutation";
    expect((await repos.vocabulary.getEntries("es"))[0].translation).toBe(translation);
  });
});

describe("local quiz session integration", () => {
  it("replays duplicate answer submissions idempotently, including stale versions", async () => {
    const { seed, repos } = setup();
    const source = seed.entries.find(row => row.language === "es")!;
    const initial = await repos.quiz.create({ language: "es", wordIds: [source.id], type: "typing", randomSeed: 27 });
    const completed = await repos.quiz.answer(initial.id, { answer: source.translation, version: initial.version, submissionId: "same-submission" });
    expect(completed).toMatchObject({ status: "completed", settled: true });
    expect(await repos.quiz.answer(initial.id, { answer: "different replay payload", version: initial.version, submissionId: "same-submission" })).toEqual(completed);
    const progress = (await repos.progress.getWords("es")).find(word => word.wordId === source.id)!;
    expect(progress).toMatchObject({ stage: 1, dueDate: "2026-10-14", firstAttempts: 1, firstCorrect: 1, settledSessionIds: [initial.id] });
    expect((await repos.progress.getActivity("es")).filter(row => row.id === `quiz:${initial.id}:same-submission`)).toHaveLength(1);
  });

  it("returns the latest session for a conflicting answer from another repository instance", async () => {
    const { adapter, seed, repos } = setup();
    const sources = seed.entries.filter(row => row.language === "es").slice(0, 2);
    const session = await repos.quiz.create({ language: "es", wordIds: sources.map(word => word.id), type: "typing", randomSeed: 17 });
    const secondTab = createLocalRepositories(adapter, seed);
    const answer = session.currentQuestion!.acceptedAnswers[0];
    const latest = await repos.quiz.answer(session.id, { answer, version: session.version, submissionId: "first-tab" });
    try {
      await secondTab.quiz.answer(session.id, { answer, version: session.version, submissionId: "second-tab" });
      expect.fail("Expected a version conflict.");
    } catch (error) {
      expect(error).toBeInstanceOf(VersionConflictError);
      if (error instanceof VersionConflictError) expect(error.latest).toEqual(latest);
    }
    expect(adapter.read()?.sessions[0].attempts).toHaveLength(1);
  });

  it("freezes vocabulary and accepted answers after the live entry is edited", async () => {
    const { seed, repos } = setup();
    const source = seed.entries.find(row => row.language === "es" && row.acceptedAnswers.length > 0)!;
    const session = await repos.quiz.create({ language: "es", wordIds: [source.id], type: "typing", randomSeed: 99 });
    await repos.vocabulary.saveEntry(entryInput(source, { word: "changed", translation: "changed meaning", acceptedAnswers: [{ id: "new-answer", text: "changed alternative" }] }), source.id);
    const restored = await repos.quiz.getSession(session.id);
    expect(restored.entries).toEqual([source]);
    expect(restored.currentQuestion?.acceptedAnswers).toContain(source.acceptedAnswers[0].text);
    expect((await repos.quiz.answer(session.id, { answer: source.acceptedAnswers[0].text, version: session.version, submissionId: "frozen-answer" })).status).toBe("completed");
  });

  it("saves and resumes wrong-answer reservations without settling, then settles once", async () => {
    const { adapter, seed, repos } = setup();
    const source = seed.entries.find(row => row.language === "es")!;
    const initial = await repos.quiz.create({ language: "es", wordIds: [source.id], type: "typing", randomSeed: 1 });
    const wrong = await repos.quiz.answer(initial.id, { answer: "incorrect", version: initial.version, submissionId: "wrong-answer" });
    const saved = await repos.quiz.saveAndExit(initial.id, wrong.version);
    expect(saved.status).toBe("saved");
    expect(saved.reservations).toEqual([{ wordId: source.id, position: 1, interval: 0 }]);
    expect((await repos.progress.getWords("es")).find(word => word.wordId === source.id)?.settledSessionIds).toEqual([]);
    const refreshed = createLocalRepositories(adapter, seed);
    const resumed = await refreshed.quiz.resume(initial.id);
    expect(resumed.currentQuestion).toEqual(saved.currentQuestion);
    expect(resumed.randomState).toBe(saved.randomState);
    const completed = await refreshed.quiz.answer(initial.id, { answer: source.translation, version: resumed.version, submissionId: "retry-answer" });
    expect(completed).toMatchObject({ status: "completed", settled: true });
    const progress = (await refreshed.progress.getWords("es")).find(word => word.wordId === source.id)!;
    expect(progress).toMatchObject({ stage: 0, dueDate: "2026-10-12", firstAttempts: 1, firstCorrect: 0, errors: 1, settledSessionIds: [initial.id] });
    await refreshed.quiz.end(initial.id, completed.version);
    expect((await refreshed.progress.getWords("es")).find(word => word.wordId === source.id)).toEqual(progress);
  });

  it("settles only tested words on active ending and never postpones early practice", async () => {
    const { adapter, seed, repos } = setup();
    const words = seed.entries.filter(row => row.language === "es").slice(0, 2);
    const progress = adapter.read()!;
    for (const word of progress.wordProgress.filter(row => words.some(entry => entry.id === row.wordId))) { word.stage = 3; word.dueDate = "2026-10-25"; }
    adapter.write(progress);
    const session = await repos.quiz.create({ language: "es", wordIds: words.map(word => word.id), type: "typing", randomSeed: 2 });
    const answered = await repos.quiz.answer(session.id, { answer: session.currentQuestion!.acceptedAnswers[0], version: session.version, submissionId: "first-only" });
    const ended = await repos.quiz.end(session.id, answered.version);
    expect(ended.status).toBe("ended");
    expect(ended.settled).toBe(true);
    const data = await repos.progress.getWords("es");
    const tested = data.find(word => word.wordId === session.currentQuestion!.wordId)!;
    const untested = data.find(word => words.some(entry => entry.id === word.wordId) && word.wordId !== tested.wordId)!;
    expect(tested).toMatchObject({ stage: 3, dueDate: "2026-10-25", settledSessionIds: [session.id] });
    expect(untested.settledSessionIds).toEqual([]);
    expect(await repos.quiz.end(session.id, ended.version)).toEqual(ended);
    expect((await repos.progress.getActivity("es")).filter(row => row.id === `quiz:${session.id}:first-only`)).toHaveLength(1);
  });

  it("captures a due review when its first answer crosses account midnight", async () => {
    vi.setSystemTime("2026-10-11T06:59:59.000Z");
    const { adapter, seed, repos } = setup();
    const source = seed.entries.find(row => row.language === "es")!;
    const progress = adapter.read()!;
    progress.wordProgress.find(word => word.wordId === source.id)!.dueDate = "2026-10-11";
    adapter.write(progress);
    const initial = await repos.quiz.create({ language: "es", wordIds: [source.id], type: "typing", randomSeed: 8 });
    expect(initial.dueWordIds).toEqual([]);
    const saved = await repos.quiz.saveAndExit(initial.id, initial.version);
    expect(saved.learningDate).toBe("2026-10-10");
    vi.setSystemTime("2026-10-11T07:00:00.000Z");
    const resumed = await repos.quiz.resume(initial.id);
    const completed = await repos.quiz.answer(initial.id, { answer: source.translation, version: resumed.version, submissionId: "after-midnight" });
    expect(completed.dueWordIds).toEqual([source.id]);
    expect((await repos.progress.getWords("es")).find(word => word.wordId === source.id)).toMatchObject({ stage: 1, dueDate: "2026-10-14", lastAdvancedDate: "2026-10-11" });
  });

  it("does not convert a retry for an early-tested word into a due review after midnight", async () => {
    vi.setSystemTime("2026-10-11T06:59:59.000Z");
    const { adapter, seed, repos } = setup();
    const source = seed.entries.find(row => row.language === "es")!;
    const progress = adapter.read()!;
    Object.assign(progress.wordProgress.find(word => word.wordId === source.id)!, { dueDate: "2026-10-11", stage: 3 });
    adapter.write(progress);
    const initial = await repos.quiz.create({ language: "es", wordIds: [source.id], type: "typing", randomSeed: 8 });
    const wrong = await repos.quiz.answer(initial.id, { answer: "early wrong", version: initial.version, submissionId: "before-midnight" });
    const saved = await repos.quiz.saveAndExit(initial.id, wrong.version);
    expect(saved.currentQuestion?.kind).toBe("retry");
    vi.setSystemTime("2026-10-11T07:00:00.000Z");
    const resumed = await repos.quiz.resume(initial.id);
    const completed = await repos.quiz.answer(initial.id, { answer: source.translation, version: resumed.version, submissionId: "after-midnight" });
    expect(completed.dueWordIds).toEqual([]);
    expect((await repos.progress.getWords("es")).find(word => word.wordId === source.id)).toMatchObject({ stage: 3, dueDate: "2026-10-11", errors: 1 });
  });
});

describe("local reading and settings integration", () => {
  it("requires annotation invalidation confirmation and preserves body history", async () => {
    const { repos } = setup();
    const reading = await repos.reading.save({ language: "es", title: "Coffee", body: "El café está aquí.", status: "unread" });
    await repos.reading.annotate({ readingId: reading.id, bodyVersion: 1, start: 3, end: 7, text: "café", translation: "coffee", reading: "", vocabularyEntryId: null });
    expect((await repos.reading.lookup({ readingId: reading.id, bodyVersion: 1, start: 3, end: 7 })).source).toBe("annotation");
    await expect(repos.reading.save({ language: "es", title: "Coffee", body: "Hay café.", status: "reading" }, reading.id)).rejects.toThrow("Confirm");
    expect(await repos.reading.getVersions(reading.id)).toHaveLength(1);
    const changed = await repos.reading.save({ language: "es", title: "Coffee", body: "Hay café.", status: "reading" }, reading.id, true);
    expect(changed.version).toBe(2);
    expect(await repos.reading.getAnnotations(reading.id)).toEqual([]);
    expect((await repos.reading.getVersions(reading.id)).map(version => version.body)).toEqual(["El café está aquí.", "Hay café."]);
    await expect(repos.reading.lookup({ readingId: reading.id, bodyVersion: 1, start: 3, end: 7 })).rejects.toThrow("changed");
  });

  it("rejects cross-language vocabulary links and stale or altered annotation text", async () => {
    const { seed, repos } = setup();
    const reading = await repos.reading.save({ language: "es", title: "Coffee", body: "café", status: "unread" });
    const annotation = { readingId: reading.id, bodyVersion: 1, start: 0, end: 4, text: "café", translation: "coffee", reading: "", vocabularyEntryId: null };
    await expect(repos.reading.annotate({ ...annotation, vocabularyEntryId: seed.entries.find(entry => entry.language === "ja")!.id })).rejects.toThrow("this language");
    await expect(repos.reading.annotate({ ...annotation, text: "cafe" })).rejects.toThrow("text changed");
    await expect(repos.reading.annotate({ ...annotation, bodyVersion: 0 })).rejects.toThrow("changed");
    expect(await repos.reading.getAnnotations(reading.id)).toEqual([]);
  });

  it("rejects a stale body or status edit instead of overwriting another tab's text", async () => {
    const { adapter, seed, repos } = setup();
    const original = await repos.reading.save({ language: "es", title: "Original", body: "Original body.", status: "unread" });
    const secondTab = createLocalRepositories(adapter, seed);
    const changed = await repos.reading.save({ language: "es", title: "Original", body: "Newer body.", status: "reading" }, original.id, false, 1);
    await expect(secondTab.reading.save({ language: "es", title: "Original", body: "Original body.", status: "finished" }, original.id, false, 1)).rejects.toThrow("changed in another tab");
    expect(adapter.read()?.readings.find(reading => reading.id === original.id)).toEqual(changed);
    expect(adapter.read()?.readingVersions.filter(version => version.readingId === original.id)).toHaveLength(2);
  });

  it("rejects foreign-owned reading mutations and hides foreign rows in read selectors", async () => {
    const seed = createDevelopmentSeed(instant);
    const foreignReading = { ...seed.readings.find(row => row.language === "es")!, id: "foreign-reading", userId: "other-user" };
    seed.readings.push(foreignReading);
    seed.entries.push({ ...seed.entries.find(row => row.language === "es")!, id: "foreign-word", userId: "other-user" });
    seed.lists.push({ ...seed.lists.find(row => row.language === "es")!, id: "foreign-list", userId: "other-user" });
    seed.cache.push({ id: "foreign-cache", userId: "other-user", language: "es", text: "café", context: "café", translation: "coffee", source: "mock", createdAt: instant.toISOString() });
    const foreignWord = seed.entries.find(row => row.id === "foreign-word")!;
    const foreignProgress = { ...seed.wordProgress.find(row => row.language === "es")!, wordId: foreignWord.id, userId: "other-user" };
    seed.wordProgress.push(foreignProgress);
    seed.grammarProgress.push({ userId: "other-user", pointId: "foreign-progress", language: "es", contentVersion: 1, correct: 5, total: 5, completed: true, attemptedAt: instant.toISOString() });
    seed.activity.push({ id: "foreign-activity", userId: "other-user", language: "es", date: "2026-10-11", kind: "reading", count: 1 });
    const foreignSession = createQuizSession({ id: "foreign-session", userId: "other-user", language: "es", entries: [foreignWord], type: "typing", randomSeed: 1, learningDate: "2026-10-11" });
    seed.sessions.push(foreignSession);
    const adapter = new MemoryStorageAdapter();
    const repos = createLocalRepositories(adapter, seed);
    await expect(repos.reading.delete(foreignReading.id)).rejects.toThrow("unavailable");
    await expect(repos.reading.save({ language: "es", title: "Changed", body: "changed", status: "unread" }, foreignReading.id)).rejects.toThrow("unavailable");
    expect((await repos.reading.getReadings("es")).every(row => row.userId === seed.profile.id)).toBe(true);
    expect((await repos.vocabulary.getEntries("es")).every(row => row.userId === seed.profile.id)).toBe(true);
    expect((await repos.vocabulary.getLists("es")).every(row => row.userId === seed.profile.id)).toBe(true);
    expect(await repos.reading.getCache()).toEqual([]);
    expect((await repos.progress.getWords("es")).every(row => row.userId === seed.profile.id)).toBe(true);
    expect((await repos.progress.getActivity()).every(row => row.userId === seed.profile.id)).toBe(true);
    expect(await repos.grammar.getProgress("es")).toEqual([]);
    expect(await repos.quiz.getSessions("es")).toEqual([]);
    await expect(repos.quiz.getSession(foreignSession.id)).rejects.toThrow("unavailable");
    // Personal quiz settlement leaves the other user's collection intact.
    const ownWord = seed.entries.find(row => row.language === "es" && row.userId === seed.profile.id)!;
    const ownSession = await repos.quiz.create({ language: "es", wordIds: [ownWord.id], type: "typing", randomSeed: 1 });
    await repos.quiz.answer(ownSession.id, { answer: ownWord.translation, version: ownSession.version, submissionId: "owned-answer" });
    expect(adapter.read()?.wordProgress.find(row => row.userId === "other-user")).toEqual(foreignProgress);
  });

  it("stores Grammar completion at eighty percent through the repository", async () => {
    const { repos } = setup();
    const point = (await repos.grammar.getPoints("es"))[0];
    const answers = point.exercises.map(exercise => exercise.correctIndex);
    answers[0] = (answers[0] + 1) % point.exercises[0].choices.length;
    const result = await repos.grammar.submit(point.id, answers);
    expect(result).toMatchObject({ correct: 4, total: 5, completed: true, contentVersion: point.contentVersion });
    expect(await repos.grammar.getProgress("es")).toEqual([result]);
    const lowerScore = point.exercises.map(exercise => (exercise.correctIndex + 1) % exercise.choices.length);
    const practice = await repos.grammar.submit(point.id, lowerScore);
    expect(practice).toMatchObject({ correct: 0, total: 5, completed: true, contentVersion: point.contentVersion });
    expect(await repos.grammar.getProgress("es")).toEqual([practice]);
  });

  it("validates timezone settings transactionally and persists valid changes", async () => {
    const { adapter, seed, repos } = setup();
    const original = await repos.settings.getProfile();
    await expect(repos.settings.update({ timezone: "Not/A_Zone", displayName: "Changed" })).rejects.toThrow("valid IANA");
    expect(await repos.settings.getProfile()).toEqual(original);
    const updated = await repos.settings.update({ timezone: "Asia/Tokyo", displayName: " Ning " });
    expect(updated).toMatchObject({ timezone: "Asia/Tokyo", displayName: "Ning" });
    expect(await createLocalRepositories(adapter, seed).settings.getProfile()).toEqual(updated);
  });
});
