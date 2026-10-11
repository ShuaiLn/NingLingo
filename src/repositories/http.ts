import type { AppRepositories } from "./contracts";
import { VersionConflictError } from "./contracts";
import type { QuizSession } from "@/domain/models";
import { browserSupabase } from "@/lib/supabase/browser";
import type { AuthChangeEvent } from "@supabase/supabase-js";
/** Browser facade: persistence and grading are authenticated server operations. */
export function createHttpRepositories(onSessionExpired: () => void): AppRepositories {
  let revision = 0;
  const listeners = new Set<() => void>();
  const pending = new Map<string, Promise<unknown>>();
  const channel = typeof window === "undefined" || typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("ninglingo:cloud");
  const refresh = () => { revision++; listeners.forEach(listener => listener()); };
  channel?.addEventListener("message", refresh);
  if (typeof window !== "undefined") {
    browserSupabase().auth.onAuthStateChange((event: AuthChangeEvent) => { if (event === "SIGNED_OUT") onSessionExpired(); else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") refresh(); });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
    window.setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  }
  async function call<T>(operation: string, args: unknown = {}, mutation = false): Promise<T> {
    const key = JSON.stringify([operation, args]);
    if (!mutation && pending.has(key)) return pending.get(key) as Promise<T>;
    const request = (async () => {
      const response = await fetch("/api/repository", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, args }), credentials: "same-origin", cache: "no-store" });
      const result = await response.json() as { data?: T; error?: string; latest?: QuizSession };
      if (response.status === 401) { onSessionExpired(); throw new Error("Your session expired. Please sign in again."); }
      if (response.status === 409 && result.latest) { refresh(); throw new VersionConflictError(result.latest); }
      if (!response.ok) throw new Error(result.error ?? "Could not complete the cloud operation. Please try again.");
      if (mutation) { refresh(); channel?.postMessage("changed"); }
      return result.data as T;
    })();
    if (!mutation) pending.set(key, request);
    try { return await request; } finally { pending.delete(key); }
  }
  return {
    auth: { getSession: () => call("auth.session") },
    settings: { getProfile: () => call("settings.profile"), update: input => call("settings.update", input, true) },
    vocabulary: {
      getLists: language => call("vocabulary.lists", { language }),
      createList: (language, name) => call("vocabulary.createList", { language, name }, true),
      renameList: (id, name) => call("vocabulary.renameList", { id, name }, true),
      deleteList: id => call("vocabulary.deleteList", { id }, true),
      getEntries: language => call("vocabulary.entries", { language }),
      saveEntry: (input, id) => call("vocabulary.save", { input, id }, true),
      deleteEntries: ids => call("vocabulary.delete", { ids }, true),
      importEntries: inputs => call("vocabulary.import", { inputs }, true),
    },
    quiz: {
      getSessions: language => call("quiz.sessions", { language }), getSession: id => call("quiz.session", { id }),
      create: input => call("quiz.create", input, true),
      answer: (id, input) => call("quiz.answer", { id, ...input }, true),
      saveAndExit: (id, version) => call("quiz.save", { id, version }, true),
      resume: id => call("quiz.resume", { id }, true),
      end: (id, version) => call("quiz.end", { id, version }, true),
    },
    reading: {
      getTranslationUsage: () => call("reading.usage"),
      getReadings: language => call("reading.list", { language }),
      save: (input, id, clearAnnotations, expectedBodyVersion) => call("reading.save", { input, id, clearAnnotations, expectedBodyVersion }, true),
      delete: id => call("reading.delete", { id }, true),
      getVersions: id => call("reading.versions", { id }), getAnnotations: id => call("reading.annotations", { id }),
      annotate: input => call("reading.annotate", input, true), lookup: input => call("reading.lookup", input), getCache: () => call("reading.cache"),
    },
    grammar: { getPoints: language => call("grammar.points", { language }), getProgress: language => call("grammar.progress", { language }), submit: (pointId, answers) => call("grammar.submit", { pointId, answers }, true) },
    progress: { getWords: language => call("progress.words", { language }), getActivity: language => call("progress.activity", { language }) },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getRevision: () => revision, getStorageStatus: () => "Cloud sync · Supabase",
  };
}
