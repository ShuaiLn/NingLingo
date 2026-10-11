"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { AppRepositories } from "@/repositories/contracts";
import { createHttpRepositories } from "@/repositories/http";
import { useRouter } from "next/navigation";
import type { ActivityRecord, GrammarPoint, GrammarProgress, LanguageCode, QuizSession, Reading, UserProfile, VocabularyEntry, VocabularyList, WordProgress } from "@/domain/models";
const RepositoryContext = createContext<AppRepositories | null>(null);
let browserRepositories: AppRepositories | null = null;
export function AppProvider({ children, local = false }: { children: React.ReactNode; local?: boolean }) {
  const router = useRouter();
  const [repos, setRepos] = useState<AppRepositories | null>(null);
  useEffect(() => { let active = true; Promise.resolve().then(async () => { browserRepositories ??= local ? (await import("@/repositories/local")).createLocalRepositories() : createHttpRepositories(() => router.replace("/login?error=expired")); if (active) setRepos(browserRepositories); }); return () => { active = false; }; }, [local, router]);
  if (!repos) return <div className="initial-loader" role="status"><span className="brand-mark">n</span><p>Opening your learning space…</p></div>;
  return <RepositoryContext.Provider value={repos}>{children}</RepositoryContext.Provider>;
}
export function useRepositories(): AppRepositories { const repos = useContext(RepositoryContext); if (!repos) throw new Error("Repositories must be used inside AppProvider."); return repos; }
interface AppData { language: LanguageCode; entries: VocabularyEntry[]; lists: VocabularyList[]; sessions: QuizSession[]; readings: Reading[]; grammar: GrammarPoint[]; grammarProgress: GrammarProgress[]; wordProgress: WordProgress[]; activity: ActivityRecord[]; allActivity: ActivityRecord[]; profile: UserProfile; ready: boolean }
const emptyProfile: UserProfile = { id: "", email: "", displayName: "Ning", timezone: "America/Tijuana", createdAt: "" };
function emptyData(language: LanguageCode): AppData { return { language, entries: [], lists: [], sessions: [], readings: [], grammar: [], grammarProgress: [], wordProgress: [], activity: [], allActivity: [], profile: emptyProfile, ready: false }; }
export function useAppData(language: LanguageCode) {
  const repos = useRepositories();
  const revision = useSyncExternalStore(repos.subscribe, repos.getRevision, () => 0);
  const [data, setData] = useState<AppData>(() => emptyData(language));
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([repos.vocabulary.getEntries(language), repos.vocabulary.getLists(language), repos.quiz.getSessions(language), repos.reading.getReadings(language), repos.grammar.getPoints(language), repos.grammar.getProgress(language), repos.progress.getWords(language), repos.progress.getActivity(language), repos.progress.getActivity(), repos.settings.getProfile()]).then(([entries, lists, sessions, readings, grammar, grammarProgress, wordProgress, activity, allActivity, profile]) => { if (active) { setData({ language, entries, lists, sessions, readings, grammar, grammarProgress, wordProgress, activity, allActivity, profile, ready: true }); setError(""); } }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Could not load your learning data."); });
    return () => { active = false; };
  }, [repos, language, revision]);
  return { ...(data.language === language ? data : emptyData(language)), repos, error };
}
