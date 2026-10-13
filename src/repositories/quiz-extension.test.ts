import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "./local";
import { createDevelopmentSeed } from "./seed";
import { MemoryStorageAdapter, isLocalDatabase } from "./storage";
import { aggregateQuizSummary } from "@/domain/quiz-summary";
import { wordCareStatus } from "@/domain/word-care";

function setup() { const adapter = new MemoryStorageAdapter(), seed = createDevelopmentSeed(); const repos = createLocalRepositories(adapter, seed); return { adapter, seed, repos, word: seed.entries[0] }; }

describe("care, presentation and mixed quiz persistence", () => {
  it("defaults preferences compatibly without rewriting existing v1 storage", async () => {
    const { adapter, seed } = setup(); adapter.write(seed); const repos = createLocalRepositories(adapter, { ...seed, entries: [] });
    expect(await repos.settings.getQuizPreferences()).toEqual({ presentation: "always", vocabularyAutoAudio: false, alphabetAutoAudio: false });
    expect(adapter.read()).toEqual(seed); expect(isLocalDatabase(adapter.read())).toBe(true);
  });
  it("preserves manual care after ordinary correct answers and SRS settlement", async () => {
    const { repos, word } = setup(); await repos.care.setManual(word.id, "add");
    const quiz = await repos.quiz.create({ language: word.language, wordIds: [word.id], type: "typing", randomSeed: 1 });
    await repos.quiz.answer(quiz.id, { answer: quiz.currentQuestion!.acceptedAnswers[0], version: 1, submissionId: "correct" });
    expect((await repos.care.getStates())[0].manualCare).toBe(true);
    expect((await repos.progress.getWords(word.language)).find(p => p.wordId === word.id)?.settledSessionIds).toEqual([quiz.id]);
  });
  it("Remove suppresses current automatic evidence without erasing it", async () => {
    const { repos, word } = setup(); let quiz = await repos.quiz.create({ language: word.language, wordIds: [word.id], type: "typing", randomSeed: 1 });
    quiz = await repos.quiz.answer(quiz.id, { answer: "wrong", version: quiz.version, submissionId: "wrong" });
    await repos.quiz.end(quiz.id, quiz.version);
    const before = (await repos.progress.getWords(word.language)).find(p => p.wordId === word.id)!;
    expect(wordCareStatus(before).automatic).toBe(true);
    const state = await repos.care.setManual(word.id, "remove");
    expect(wordCareStatus(before, state)).toMatchObject({ active: false, suppressed: true });
    expect((await repos.progress.getWords(word.language)).find(p => p.wordId === word.id)).toEqual(before);
  });
  it("old incorrect settlement and changed-payload idempotent replay never reactivate suppression", async () => {
    const { repos, word } = setup(); let quiz = await repos.quiz.create({ language: word.language, wordIds: [word.id], type: "typing", randomSeed: 1 });
    quiz = await repos.quiz.answer(quiz.id, { answer: "wrong", version: 1, submissionId: "old" });
    await repos.care.setManual(word.id, "remove");
    await repos.quiz.answer(quiz.id, { answer: "changed", version: 1, submissionId: "old" });
    await repos.quiz.end(quiz.id, quiz.version);
    expect((await repos.care.getStates())[0]).toMatchObject({ manualCare: false, automaticSuppressed: true });
    expect((await repos.quiz.getSession(quiz.id)).attempts).toHaveLength(1);
  });
  it("only a genuinely new incorrect submission clears suppression and keeps manual care", async () => {
    const { repos, word } = setup(); const quiz = await repos.quiz.create({ language: word.language, wordIds: [word.id], type: "typing", randomSeed: 1 });
    await repos.care.setManual(word.id, "remove"); await repos.care.setManual(word.id, "add");
    await expect(repos.quiz.answer(quiz.id, { answer: "wrong", version: 0, submissionId: "stale" })).rejects.toThrow();
    expect((await repos.care.getStates())[0].automaticSuppressed).toBe(true);
    await repos.quiz.answer(quiz.id, { answer: "wrong", version: 1, submissionId: "new" });
    expect((await repos.care.getStates())[0]).toMatchObject({ manualCare: true, automaticSuppressed: false });
  });
  it("does not reactivate care or duplicate answers when an atomic write fails", async () => {
    const { adapter, repos, word } = setup(); const quiz = await repos.quiz.create({ language: word.language, wordIds: [word.id], type: "typing" }); await repos.care.setManual(word.id, "remove");
    const write = adapter.write.bind(adapter); adapter.write = () => { throw new Error("Failed write"); };
    await expect(repos.quiz.answer(quiz.id, { answer: "wrong", version: 1, submissionId: "new" })).rejects.toThrow("Failed write");
    expect((await repos.care.getStates())[0].automaticSuppressed).toBe(true);
    expect((await repos.quiz.getSession(quiz.id)).attempts).toEqual([]); adapter.write = write;
  });
  it.each(["always", "incorrect", "never"] as const)("freezes %s per session across changed defaults and another device", async presentation => {
    const { adapter, seed, repos, word } = setup(); await repos.settings.updateQuizPreferences({ presentation, vocabularyAutoAudio: true });
    const initial = await repos.quiz.create({ language: word.language, wordIds: [word.id], type: "typing", randomSeed: 42 });
    await repos.quiz.saveAndExit(initial.id, initial.version);
    await repos.settings.updateQuizPreferences({ presentation: presentation === "never" ? "always" : "never" });
    const otherDevice = createLocalRepositories(adapter, seed), resumed = await otherDevice.quiz.resume(initial.id);
    expect(resumed.presentation).toBe(presentation); expect(resumed.questionTemplates).toEqual(initial.questionTemplates);
    expect((await otherDevice.settings.getQuizPreferences()).vocabularyAutoAudio).toBe(true);
  });
  it("presentation never changes frozen questions, random state, grading, retries or settlement", async () => {
    const { repos, seed } = setup(); const wordIds = seed.entries.filter(entry => entry.language === "ja").slice(0, 5).map(entry => entry.id);
    const sessions = await Promise.all((["always", "incorrect", "never"] as const).map(presentation => repos.quiz.create({ language: "ja", wordIds, type: "word-meaning", randomSeed: 123, presentation })));
    for (const quiz of sessions.slice(1)) { expect(quiz.questionTemplates).toEqual(sessions[0].questionTemplates); expect(quiz.randomState).toBe(sessions[0].randomState); }
    const answered = await Promise.all(sessions.map(quiz => repos.quiz.answer(quiz.id, { answer: "wrong", version: 1, submissionId: "same" })));
    for (const quiz of answered.slice(1)) { expect(quiz.reservations).toEqual(answered[0].reservations); expect(quiz.randomState).toBe(answered[0].randomState); expect(quiz.attempts[0].correct).toBe(false); }
  });
  it("attributes activities and SRS only to the tested word language in one-way translation", async () => {
    const { repos, seed } = setup(); const ja = seed.entries.find(e => e.language === "ja" && e.translation === "dog")!, ko = seed.entries.find(e => e.language === "ko" && e.translation === "dog")!;
    const quiz = await repos.quiz.create({ language: "ja", wordIds: [ja.id, ko.id], type: "translation-typing", languages: ["ja", "ko"], directions: [{ source: "ja", target: "ko" }], randomSeed: 1 });
    expect(quiz.entries.map(e => e.id)).toEqual([ja.id]); expect((await repos.quiz.getSessions("ko"))[0].id).toBe(quiz.id);
    const finished = await repos.quiz.answer(quiz.id, { answer: ko.word, version: 1, submissionId: "cross" });
    expect(finished.testedWordIds).toEqual([ja.id]); expect(await repos.progress.getActivity("ko")).toEqual([]); expect(await repos.progress.getActivity("ja")).toHaveLength(1);
    expect((await repos.progress.getWords("ja")).find(p => p.wordId === ja.id)?.firstAttempts).toBe(1);
    expect((await repos.progress.getWords("ko")).find(p => p.wordId === ko.id)?.firstAttempts).toBe(0);
  });
  it("persists suggestions, confirmation, edits and deletion tombstones", async () => {
    const { repos, seed } = setup(); const ja = seed.entries.find(e => e.language === "ja" && e.translation === "dog")!, ko = seed.entries.find(e => e.language === "ko" && e.translation === "dog")!, koCat = seed.entries.find(e => e.language === "ko" && e.translation === "cat")!;
    const suggestions = await repos.wordPairs.suggest({ wordIds: [ja.id, ko.id] }); expect(suggestions).toHaveLength(1); expect(suggestions[0].status).toBe("suggested");
    const confirmed = await repos.wordPairs.save({ id: suggestions[0].id, sourceWordId: ja.id, targetWordId: ko.id }); expect(confirmed.status).toBe("confirmed");
    const edited = await repos.wordPairs.save({ id: confirmed.id, sourceWordId: ja.id, targetWordId: koCat.id }); expect(edited.targetWordId).toBe(koCat.id);
    const pair = await repos.wordPairs.save({ sourceWordId: ja.id, targetWordId: ko.id }); await repos.wordPairs.remove(pair.id); await repos.wordPairs.suggest({ wordIds: [ja.id, ko.id] });
    expect((await repos.wordPairs.getPairs()).filter(p => p.sourceWordId === ja.id && p.targetWordId === ko.id)).toEqual([{ ...pair, status: "deleted" }]);
  });
  it("keeps current word details separate from frozen answers, then preserves deleted history", async () => {
    const { repos, word } = setup(); const quiz = await repos.quiz.create({ language: word.language, wordIds: [word.id], type: "typing", presentation: "never" });
    await repos.vocabulary.saveEntry({ ...word, translation: "updated meaning", notes: "latest notes" }, word.id);
    const done = await repos.quiz.answer(quiz.id, { answer: word.translation, version: 1, submissionId: "correct-old" });
    let summary = aggregateQuizSummary(done, await repos.vocabulary.getEntries(word.language)); expect(summary.words[0].entry.notes).toBe("latest notes"); expect(summary.words[0].attempts[0].correctAnswer).toContain(word.translation.toLowerCase()); expect(summary.words[0].deleted).toBe(false);
    await repos.care.setManual(word.id, "add"); await repos.vocabulary.deleteEntries([word.id]);
    summary = aggregateQuizSummary(await repos.quiz.getSession(quiz.id), await repos.vocabulary.getEntries(word.language)); expect(summary.words[0].deleted).toBe(true); expect(summary.words[0].entry.word).toBe(word.word); expect(await repos.care.getStates()).toEqual([]);
  });
  it("cascades pair/care cleanup when deleting an entire vocabulary list", async () => {
    const { repos, seed, word } = setup(); const other = seed.entries.find(e => e.language === "ko")!;
    await repos.wordPairs.save({ sourceWordId: word.id, targetWordId: other.id }); await repos.care.setManual(word.id, "add"); await repos.vocabulary.deleteList(word.listId);
    expect(await repos.care.getStates()).toEqual([]); expect(await repos.wordPairs.getPairs()).toEqual([]);
  });
});
