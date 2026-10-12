import type { AppRepositories } from "./contracts";
import { AlphabetQuizVersionConflictError, VersionConflictError } from "./contracts";
import { BrowserStorageAdapter, LOCAL_STORAGE_KEY, LocalStore, type LocalDatabase, type StorageAdapter } from "./storage";
import { createDevelopmentSeed } from "./seed";
import { grammarSeeds } from "@/data/grammar";
import { vocabularyDuplicateKey } from "@/domain/csv";
import { normalizeVocabularyDetails, vocabularyExamples } from "@/domain/vocabulary";
import { createQuizSession, answerQuiz } from "@/domain/quiz";
import { createAlphabetQuizSession, answerAlphabetQuiz } from "@/domain/alphabet-quiz";
import { resolveVocabularyTranslations } from "@/services/vocabulary-translation";
import { captureDueReview, initialWordProgress, settleQuizReview } from "@/domain/review";
import { learningDate } from "@/domain/dates";
import { planReadingEdit, assertLookupRange, ReadingLookupService } from "@/domain/reading";
import { MockTranslationProvider } from "@/services/translation";
import { scoreGrammarExercises } from "@/domain/grammar";
import type { GrammarProgress, QuizSession, Reading, VocabularyEntry, VocabularyInput } from "@/domain/models";

export function createLocalRepositories(adapter: StorageAdapter = new BrowserStorageAdapter(), seed = createDevelopmentSeed()): AppRepositories {
  const store = new LocalStore(adapter, seed);
  const lookupService = new ReadingLookupService(new MockTranslationProvider());
  const now = () => new Date().toISOString();
  const today = (data: LocalDatabase) => learningDate(new Date(), data.profile.timezone);
  const owned = <T extends { userId: string }>(record: T | undefined, data: LocalDatabase): T => { if (!record || record.userId !== data.profile.id) throw new Error("The requested record is unavailable in this personal workspace."); return record; };
  const personal = <T extends { userId: string }>(records: T[], data: LocalDatabase): T[] => records.filter(record => record.userId === data.profile.id);
  const findSession = (data: LocalDatabase, id: string) => owned(data.sessions.find(session => session.id === id), data);
  const checkVersion = (session: QuizSession, version: number) => { if (session.version !== version) throw new VersionConflictError(structuredClone(session)); };
  const settle = (data: LocalDatabase, session: QuizSession) => {
    if (session.settled) return;
    const settled = settleQuizReview(session, personal(data.wordProgress, data), { learningDate: today(data) }).filter(progress => data.entries.some(entry => entry.id === progress.wordId && entry.userId === data.profile.id));
    data.wordProgress = [...data.wordProgress.filter(progress => progress.userId !== data.profile.id), ...settled];
    session.settled = true;
  };
  const prepareEntry = (input: VocabularyInput, data: LocalDatabase, id?: string): VocabularyEntry => {
    if (!input.word.trim() || !input.translation.trim()) throw new Error("Word and English translation are required.");
    const list = owned(data.lists.find(item => item.id === input.listId), data);
    if (list.language !== input.language) throw new Error("Choose a list in this language.");
    const timestamp = now();
    const existing = id ? owned(data.entries.find(item => item.id === id), data) : undefined;
    if (existing && existing.language !== input.language) throw new Error("An entry cannot change language.");
    const entry: VocabularyEntry = { ...structuredClone(input), ...normalizeVocabularyDetails(input), word: input.word.trim(), translation: input.translation.trim(), reading: input.reading.trim(), id: id ?? crypto.randomUUID(), userId: data.profile.id, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, acceptedAnswers: input.acceptedAnswers.filter(answer => answer.text.trim()).map(answer => ({ id: answer.id || crypto.randomUUID(), text: answer.text.trim() })) };
    if (data.entries.some(item => item.userId === data.profile.id && item.id !== entry.id && item.language === entry.language && vocabularyDuplicateKey(item) === vocabularyDuplicateKey(entry))) throw new Error("An identical word, reading, and translation already exists.");
    return entry;
  };
  const repositories: AppRepositories = {
    auth: { getSession: async () => store.snapshot().profile },
    settings: {
      getProfile: async () => store.snapshot().profile,
      update: input => store.transaction(data => { try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }); } catch { throw new Error("Enter a valid IANA timezone, such as America/Tijuana."); } if (!input.displayName.trim()) throw new Error("Your display name is required."); data.profile = { ...data.profile, timezone: input.timezone, displayName: input.displayName.trim() }; return data.profile; }),
    },
    vocabulary: {
      getLists: async language => { const data = store.snapshot(); return personal(data.lists, data).filter(item => item.language === language); },
      createList: (language, name) => store.transaction(data => { if (!name.trim()) throw new Error("Give your list a name."); const list = { id: crypto.randomUUID(), userId: data.profile.id, language, name: name.trim(), createdAt: now() }; data.lists.push(list); return list; }),
      renameList: (id, name) => store.transaction(data => { const list = owned(data.lists.find(item => item.id === id), data); if (!name.trim()) throw new Error("Give your list a name."); list.name = name.trim(); return list; }),
      deleteList: id => store.transaction(data => { owned(data.lists.find(item => item.id === id), data); const ids = personal(data.entries, data).filter(entry => entry.listId === id).map(entry => entry.id); data.lists = data.lists.filter(list => list.id !== id || list.userId !== data.profile.id); data.entries = data.entries.filter(entry => entry.listId !== id || entry.userId !== data.profile.id); data.wordProgress = data.wordProgress.filter(word => word.userId !== data.profile.id || !ids.includes(word.wordId)); }),
      getEntries: async language => { const data = store.snapshot(); return personal(data.entries, data).filter(entry => entry.language === language).map(entry => ({ ...entry, examples: vocabularyExamples(entry), relatedWords: entry.relatedWords ?? [] })); },
      saveEntry: (input, id) => store.transaction(data => { const entry = prepareEntry(input, data, id); const index = data.entries.findIndex(item => item.id === entry.id); if (index >= 0) data.entries[index] = entry; else { data.entries.push(entry); data.wordProgress.push(initialWordProgress(entry, today(data))); } return entry; }),
      deleteEntries: ids => store.transaction(data => { ids.forEach(id => owned(data.entries.find(entry => entry.id === id), data)); data.entries = data.entries.filter(entry => entry.userId !== data.profile.id || !ids.includes(entry.id)); data.wordProgress = data.wordProgress.filter(progress => progress.userId !== data.profile.id || !ids.includes(progress.wordId)); }),
      importEntries: inputs => store.transaction(data => { let imported = 0; let duplicates = 0; for (const input of inputs) { if (personal(data.entries, data).some(entry => entry.language === input.language && vocabularyDuplicateKey(entry) === vocabularyDuplicateKey(input))) { duplicates++; continue; } const entry = prepareEntry(input, data); data.entries.push(entry); data.wordProgress.push(initialWordProgress(entry, today(data))); imported++; } return { imported, duplicates }; }),
      resolveTranslations: input => { const data = store.snapshot(); return resolveVocabularyTranslations({ ...input, userId: data.profile.id, cache: data.cache, provider: new MockTranslationProvider(), storeCache: entry => store.transaction(current => { if (current.profile.id !== entry.userId) throw new Error("The current account changed during translation."); current.cache.push(entry); }) }); },
    },
    alphabetQuiz: {
      getSessions: async language => { const data = store.snapshot(); return personal(data.alphabetSessions, data).filter(session => session.language === language).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
      getSession: async id => { const data = store.snapshot(); return owned(data.alphabetSessions.find(session => session.id === id), data); },
      create: input => store.transaction(data => { const session = createAlphabetQuizSession({ ...input, id: crypto.randomUUID(), userId: data.profile.id, randomSeed: input.randomSeed ?? crypto.getRandomValues(new Uint32Array(1))[0], learningDate: today(data) }); data.alphabetSessions.push(session); return session; }),
      answer: (id, input) => store.transaction(data => {
        const previous = owned(data.alphabetSessions.find(session => session.id === id), data);
        if (previous.attempts.some(attempt => attempt.id === input.submissionId)) return previous;
        if (previous.version !== input.version) throw new AlphabetQuizVersionConflictError(previous);
        const next = answerAlphabetQuiz(previous, input.answer, input.submissionId);
        const attempt = next.attempts.at(-1)!;
        data.activity.push({ id: `alphabet-quiz:${id}:${attempt.id}`, userId: data.profile.id, language: next.language, date: learningDate(attempt.answeredAt, data.profile.timezone), kind: "alphabet-quiz", count: 1 });
        data.alphabetSessions[data.alphabetSessions.findIndex(session => session.id === id)] = next;
        return next;
      }),
      saveAndExit: (id, version) => store.transaction(data => { const session = owned(data.alphabetSessions.find(session => session.id === id), data); if (session.version !== version) throw new AlphabetQuizVersionConflictError(session); if (session.status !== "active") throw new Error("Only an active alphabet quiz can be saved."); session.status = "saved"; session.version++; session.updatedAt = now(); return session; }),
      resume: (id, version) => store.transaction(data => { const session = owned(data.alphabetSessions.find(session => session.id === id), data); if (session.version !== version) throw new AlphabetQuizVersionConflictError(session); if (!["active", "saved"].includes(session.status)) throw new Error("This alphabet quiz has already ended."); session.status = "active"; session.version++; session.updatedAt = now(); return session; }),
      end: (id, version) => store.transaction(data => { const session = owned(data.alphabetSessions.find(session => session.id === id), data); if (session.version !== version) throw new AlphabetQuizVersionConflictError(session); if (!["active", "saved"].includes(session.status)) return session; session.status = "ended"; session.currentQuestion = null; session.version++; session.updatedAt = now(); return session; }),
    },
    quiz: {
      getSessions: async language => { const data = store.snapshot(); return personal(data.sessions, data).filter(session => session.language === language).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
      getSession: async id => { const data = store.snapshot(); return findSession(data, id); },
      create: input => store.transaction(data => { const entries = [...new Set(input.wordIds)].map(id => owned(data.entries.find(entry => entry.id === id), data)); const date = today(data); const session = createQuizSession({ ...input, id: crypto.randomUUID(), userId: data.profile.id, entries, learningDate: date, randomSeed: input.randomSeed ?? crypto.getRandomValues(new Uint32Array(1))[0], dueWordIds: personal(data.wordProgress, data).filter(progress => input.wordIds.includes(progress.wordId) && progress.dueDate <= date).map(progress => progress.wordId) }); data.sessions.push(session); return session; }),
      answer: (id, input) => store.transaction(data => {
        const session = findSession(data, id);
        if (session.attempts.some(attempt => attempt.id === input.submissionId)) return session;
        checkVersion(session, input.version);
        const updated = answerQuiz(captureDueReview(session, personal(data.wordProgress, data), today(data)), input.answer, input.submissionId);
        const attempt = updated.attempts.at(-1)!;
        data.activity.push({ id: `quiz:${session.id}:${attempt.id}`, userId: data.profile.id, language: session.language, date: learningDate(attempt.answeredAt, data.profile.timezone), kind: "quiz", count: 1 });
        if (updated.status === "completed") settle(data, updated);
        data.sessions[data.sessions.findIndex(item => item.id === id)] = updated;
        return updated;
      }),
      saveAndExit: (id, version) => store.transaction(data => { const session = findSession(data, id); checkVersion(session, version); if (session.status !== "active") throw new Error("Only an active quiz can be saved."); session.status = "saved"; session.version++; session.updatedAt = now(); return session; }),
      resume: id => store.transaction(data => { const session = findSession(data, id); if (session.status !== "saved" && session.status !== "active") throw new Error("This quiz has already ended."); session.status = "active"; session.version++; session.updatedAt = now(); return session; }),
      end: (id, version) => store.transaction(data => { const session = findSession(data, id); checkVersion(session, version); if (session.status !== "active" && session.status !== "saved") return session; session.status = "ended"; session.currentQuestion = null; session.version++; session.updatedAt = now(); settle(data, session); return session; }),
    },
    reading: {
      getReadings: async language => { const data = store.snapshot(); return personal(data.readings, data).filter(reading => reading.language === language); },
      save: (input, id, clearAnnotations, expectedBodyVersion) => store.transaction(data => { if (!input.title.trim() || !input.body.trim()) throw new Error("A title and body are required."); const timestamp = now(); let reading: Reading; if (id) { const existing = owned(data.readings.find(row => row.id === id), data); if (expectedBodyVersion !== undefined && existing.version !== expectedBodyVersion) throw new Error("The reading changed in another tab. Reopen the latest version before saving edits."); if (input.language !== existing.language) throw new Error("A reading cannot change language."); const plan = planReadingEdit(existing, input.body, data.annotations, clearAnnotations); data.annotations = plan.annotations; reading = { ...existing, ...input, title: input.title.trim(), version: plan.version, updatedAt: timestamp }; data.readings[data.readings.findIndex(row => row.id === id)] = reading; if (plan.changed) data.readingVersions.push({ id: crypto.randomUUID(), readingId: id, version: reading.version, body: reading.body, createdAt: timestamp }); } else { reading = { ...input, title: input.title.trim(), id: crypto.randomUUID(), userId: data.profile.id, version: 1, createdAt: timestamp, updatedAt: timestamp }; data.readings.push(reading); data.readingVersions.push({ id: crypto.randomUUID(), readingId: reading.id, version: 1, body: reading.body, createdAt: timestamp }); } if (input.status === "finished" && !data.activity.some(row => row.id === `reading:${reading.id}`)) data.activity.push({ id: `reading:${reading.id}`, userId: data.profile.id, language: reading.language, date: today(data), kind: "reading", count: 1 }); return reading; }),
      delete: id => store.transaction(data => { owned(data.readings.find(row => row.id === id), data); data.readings = data.readings.filter(row => row.id !== id); data.readingVersions = data.readingVersions.filter(row => row.readingId !== id); data.annotations = data.annotations.filter(row => row.readingId !== id); }),
      getVersions: async id => { const data = store.snapshot(); owned(data.readings.find(row => row.id === id), data); return data.readingVersions.filter(row => row.readingId === id); },
      getAnnotations: async id => { const data = store.snapshot(); owned(data.readings.find(row => row.id === id), data); return personal(data.annotations, data).filter(row => row.readingId === id); },
      annotate: input => store.transaction(data => { const reading = owned(data.readings.find(row => row.id === input.readingId), data); assertLookupRange(reading, { ...input, bodyVersion: input.bodyVersion }); if (reading.body.slice(input.start, input.end) !== input.text) throw new Error("The selected text changed. Please select it again."); if (!input.translation.trim()) throw new Error("Add an English meaning for this annotation."); if (input.vocabularyEntryId) { const entry = owned(data.entries.find(row => row.id === input.vocabularyEntryId), data); if (entry.language !== reading.language) throw new Error("Link a word in this language."); } const annotation = { ...input, translation: input.translation.trim(), reading: input.reading.trim(), id: crypto.randomUUID(), userId: data.profile.id, createdAt: now() }; data.annotations = data.annotations.filter(row => !(row.readingId === annotation.readingId && row.bodyVersion === annotation.bodyVersion && row.start === annotation.start && row.end === annotation.end)); data.annotations.push(annotation); return annotation; }),
      lookup: async request => { const data = store.snapshot(); const reading = owned(data.readings.find(row => row.id === request.readingId), data); return lookupService.lookup({ userId: data.profile.id, reading, request, entries: data.entries, annotations: data.annotations, cache: data.cache, storeCache: cacheEntry => store.transaction(current => { const latest = owned(current.readings.find(row => row.id === reading.id), current); if (latest.version !== request.bodyVersion) throw new Error("The reading changed during lookup. Select the text again."); current.cache.push(cacheEntry); }) }); },
      getCache: async () => { const data = store.snapshot(); return personal(data.cache, data).filter(entry => (entry.lookupKind ?? "reading") === "reading"); },
    },
    grammar: {
      getPoints: async language => structuredClone(grammarSeeds.filter(point => point.language === language)),
      getProgress: async language => { const data = store.snapshot(); return personal(data.grammarProgress, data).filter(progress => progress.language === language); },
      submit: (pointId, answers) => store.transaction(data => { const point = grammarSeeds.find(row => row.id === pointId); if (!point) throw new Error("This lesson is unavailable."); const score = scoreGrammarExercises(point.exercises, answers); const previous = personal(data.grammarProgress, data).find(row => row.pointId === pointId && row.contentVersion === point.contentVersion); const progress: GrammarProgress = { ...score, completed: Boolean(previous?.completed || score.completed), userId: data.profile.id, pointId, language: point.language, contentVersion: point.contentVersion, attemptedAt: now() }; data.grammarProgress = data.grammarProgress.filter(row => row.pointId !== pointId || row.userId !== data.profile.id); data.grammarProgress.push(progress); data.activity.push({ id: crypto.randomUUID(), userId: data.profile.id, language: point.language, date: today(data), kind: "grammar", count: answers.length }); return progress; }),
    },
    progress: { getWords: async language => { const data = store.snapshot(); return personal(data.wordProgress, data).filter(progress => progress.language === language); }, getActivity: async language => { const data = store.snapshot(); return personal(data.activity, data).filter(record => !language || record.language === language); } },
    subscribe: store.subscribe, getRevision: store.getRevision, getStorageStatus: store.status,
  };
  if (typeof window !== "undefined") window.addEventListener("storage", event => { if (event.key === LOCAL_STORAGE_KEY) store.reload(); });
  return repositories;
}
