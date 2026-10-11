import { afterEach, describe, expect, it, vi } from "vitest";
import { createQuizSession } from "@/domain/quiz";
import { createDevelopmentSeed } from "./seed";
import { BrowserStorageAdapter, isLocalDatabase, LocalStore, MemoryStorageAdapter } from "./storage";

afterEach(() => { vi.unstubAllGlobals(); });

describe("development persistence validation", () => {
  it("accepts valid data with frozen quiz sessions and rejects malformed nested rows", () => {
    const seed = createDevelopmentSeed(new Date("2026-10-11T19:00:00Z"));
    const entry = seed.entries.find(word => word.language === "es")!;
    seed.sessions.push(createQuizSession({ id: "session", userId: seed.profile.id, language: "es", entries: [entry], type: "typing", randomSeed: 5, learningDate: "2026-10-11" }));
    expect(isLocalDatabase(seed)).toBe(true);
    expect(isLocalDatabase({ ...seed, entries: [null] })).toBe(false);
    expect(isLocalDatabase({ ...seed, entries: [{ ...entry, acceptedAnswers: ["invalid"] }] })).toBe(false);
    expect(isLocalDatabase({ ...seed, sessions: [{ ...seed.sessions[0], questionTemplates: undefined }] })).toBe(false);
    expect(isLocalDatabase({ ...seed, sessions: [{ ...seed.sessions[0], currentQuestion: { prompt: "incomplete" } }] })).toBe(false);
    expect(isLocalDatabase({ ...seed, profile: { ...seed.profile, timezone: "Invalid/Timezone" } })).toBe(false);
  });

  it("preserves corrupted browser data and starts a reported memory fallback", () => {
    const seed = createDevelopmentSeed();
    const corrupted = JSON.stringify({ ...seed, readings: [{ id: "broken-row" }] });
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem: () => corrupted, setItem } });
    const adapter = new BrowserStorageAdapter();
    const store = new LocalStore(adapter, seed);
    expect(store.snapshot()).toEqual(seed);
    expect(adapter.status()).toContain("Memory only");
    expect(adapter.status()).toContain("existing data was preserved");
    expect(setItem).not.toHaveBeenCalled();
    expect(adapter.read()).toEqual(seed);
  });

  it("falls back to the latest in-memory transaction if browser storage fills up", async () => {
    const seed = createDevelopmentSeed();
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => { throw new Error("Quota exceeded"); } } });
    const adapter = new BrowserStorageAdapter();
    const store = new LocalStore(adapter, seed);
    await store.transaction(data => { data.profile.displayName = "Saved in memory"; });
    expect(adapter.status()).toContain("Memory only");
    expect(adapter.read()?.profile.displayName).toBe("Saved in memory");
    expect(store.snapshot().profile.displayName).toBe("Saved in memory");
  });

  it("does not rewrite persisted data when another store is initialized", () => {
    const seed = createDevelopmentSeed();
    const adapter = new MemoryStorageAdapter();
    adapter.write(seed);
    const write = vi.spyOn(adapter, "write");
    const differentSeed = { ...seed, profile: { ...seed.profile, displayName: "Different seed" } };
    const store = new LocalStore(adapter, differentSeed);
    expect(store.snapshot()).toEqual(seed);
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps adapter/store data unchanged when a transaction throws", async () => {
    const seed = createDevelopmentSeed();
    const adapter = new MemoryStorageAdapter();
    const store = new LocalStore(adapter, seed);
    await expect(store.transaction(data => { data.profile.displayName = "Uncommitted"; throw new Error("Rollback"); })).rejects.toThrow("Rollback");
    expect(store.snapshot()).toEqual(seed);
    expect(adapter.read()).toEqual(seed);
  });
});
