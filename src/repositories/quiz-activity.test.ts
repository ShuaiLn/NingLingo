import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateDashboardStats } from "@/domain/stats";
import { learningDate } from "@/domain/dates";
import { createLocalRepositories } from "./local";
import { createDevelopmentSeed } from "./seed";
import { MemoryStorageAdapter } from "./storage";

const sundayEvening = new Date("2026-10-12T06:59:00.000Z");

function setup() {
  const adapter = new MemoryStorageAdapter();
  const seed = createDevelopmentSeed(sundayEvening);
  const repos = createLocalRepositories(adapter, seed);
  const words = seed.entries.filter((entry) => entry.language === "es").slice(0, 2);
  return { adapter, seed, repos, words };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(sundayEvening); });
afterEach(() => { vi.useRealTimers(); });

describe("quiz learning activity", () => {
  it("records practice immediately even if the user saves an unfinished session", async () => {
    const { repos, words } = setup();
    const session = await repos.quiz.create({ language: "es", wordIds: words.map((word) => word.id), type: "typing", randomSeed: 1 });
    const answered = await repos.quiz.answer(session.id, { answer: session.currentQuestion!.acceptedAnswers[0], version: session.version, submissionId: "sunday-answer" });
    expect(answered.status).toBe("active");
    expect(await repos.progress.getActivity("es")).toEqual([{ id: `quiz:${session.id}:sunday-answer`, userId: session.userId, language: "es", date: "2026-10-11", kind: "quiz", count: 1 }]);
    await repos.quiz.saveAndExit(session.id, answered.version);
    expect(await repos.progress.getActivity("es")).toHaveLength(1);
    expect((await repos.progress.getWords("es")).filter((word) => words.some((entry) => entry.id === word.wordId)).every((word) => word.settledSessionIds.length === 0)).toBe(true);
  });

  it("preserves both account learning days and streak when a saved session finishes after midnight", async () => {
    const { adapter, seed, repos, words } = setup();
    const initial = await repos.quiz.create({ language: "es", wordIds: words.map((word) => word.id), type: "typing", randomSeed: 5 });
    const sunday = await repos.quiz.answer(initial.id, { answer: initial.currentQuestion!.acceptedAnswers[0], version: initial.version, submissionId: "sunday" });
    await repos.quiz.saveAndExit(initial.id, sunday.version);
    vi.setSystemTime("2026-10-12T07:01:00.000Z");
    const nextTab = createLocalRepositories(adapter, seed);
    const resumed = await nextTab.quiz.resume(initial.id);
    const monday = await nextTab.quiz.answer(resumed.id, { answer: resumed.currentQuestion!.acceptedAnswers[0], version: resumed.version, submissionId: "monday" });
    expect(monday).toMatchObject({ status: "completed", settled: true });
    const activity = await nextTab.progress.getActivity("es");
    expect(activity.map((record) => ({ date: record.date, count: record.count }))).toEqual([{ date: "2026-10-11", count: 1 }, { date: "2026-10-12", count: 1 }]);
    expect(activity.every((record) => record.id !== monday.id)).toBe(true);
    const profile = await nextTab.settings.getProfile();
    const stats = calculateDashboardStats({ entries: await nextTab.vocabulary.getEntries("es"), wordProgress: await nextTab.progress.getWords("es"), sessions: await nextTab.quiz.getSessions("es"), grammarPoints: [], grammarProgress: [], activity, today: learningDate(new Date(), profile.timezone) });
    expect(stats.streak).toBe(2);
    expect(stats.activity).toEqual([{ date: "2026-10-11", count: 1 }, { date: "2026-10-12", count: 1 }]);
  });

  it("replayed submissions, failed versions and repeated ending never duplicate activity", async () => {
    const { adapter, repos, words } = setup();
    const initial = await repos.quiz.create({ language: "es", wordIds: words.map((word) => word.id), type: "typing", randomSeed: 8 });
    const answered = await repos.quiz.answer(initial.id, { answer: initial.currentQuestion!.acceptedAnswers[0], version: initial.version, submissionId: "once" });
    await repos.quiz.answer(initial.id, { answer: "changed replay", version: initial.version, submissionId: "once" });
    await expect(repos.quiz.answer(initial.id, { answer: "stale new submission", version: initial.version, submissionId: "stale" })).rejects.toThrow("latest version");
    expect(await repos.progress.getActivity("es")).toHaveLength(1);
    const ended = await repos.quiz.end(initial.id, answered.version);
    await repos.quiz.end(initial.id, ended.version);
    expect(await repos.progress.getActivity("es")).toHaveLength(1);
    expect(adapter.read()?.sessions[0].attempts).toHaveLength(1);
  });

  it("records an answer only when its atomic repository commit succeeds", async () => {
    const { adapter, repos, words } = setup();
    const initial = await repos.quiz.create({ language: "es", wordIds: words.map((word) => word.id), type: "typing", randomSeed: 9 });
    const before = adapter.read();
    vi.spyOn(adapter, "write").mockImplementationOnce(() => { throw new Error("Simulated write failure"); });
    await expect(repos.quiz.answer(initial.id, { answer: initial.currentQuestion!.acceptedAnswers[0], version: initial.version, submissionId: "retryable" })).rejects.toThrow("Simulated write failure");
    expect(adapter.read()).toEqual(before);
    expect(await repos.progress.getActivity("es")).toEqual([]);
    await repos.quiz.answer(initial.id, { answer: initial.currentQuestion!.acceptedAnswers[0], version: initial.version, submissionId: "retryable" });
    expect(await repos.progress.getActivity("es")).toHaveLength(1);
  });
});
