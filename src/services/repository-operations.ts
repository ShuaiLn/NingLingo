import { z } from "zod";
import type { AppRepositories } from "@/repositories/contracts";
const language = z.enum(["ja", "es", "el"]);
const id = z.uuid();
const text = z.string().max(10000);
const nonempty = z.string().trim().min(1).max(10000);
const version = z.number().int().positive();
const example = z.object({ id: z.string().max(100), text: nonempty, reading: text, translation: text });
const relation = z.object({ id: z.string().max(100), word: nonempty, reading: text, translation: text, relationType: z.enum(["derived", "compound", "synonym", "antonym", "word_form", "related"]) });
const vocabulary = z.object({ language, listId: id, word: nonempty, reading: text, translation: nonempty, type: text, category: text, example: text, notes: text, acceptedAnswers: z.array(z.object({ id: z.string().max(100), text: nonempty })).max(100), examples: z.array(example).max(100).optional(), relatedWords: z.array(relation).max(100).optional() });
const quizType = z.enum(["word-meaning", "meaning-word", "typing", "japanese-reading"]);
const readingInput = z.object({ language, title: z.string().trim().min(1).max(1000), body: z.string().min(1).max(750000), status: z.enum(["unread", "reading", "finished"]) });
export async function executeRepositoryOperation(repos: AppRepositories, operation: string, input: unknown): Promise<unknown> {
  switch (operation) {
    case "auth.session": return repos.auth.getSession();
    case "settings.profile": return repos.settings.getProfile();
    case "settings.update": return repos.settings.update(z.object({ displayName: z.string().trim().min(1).max(80), timezone: z.string().min(1).max(100) }).parse(input));
    case "vocabulary.lists": return repos.vocabulary.getLists(z.object({ language }).parse(input).language);
    case "vocabulary.entries": return repos.vocabulary.getEntries(z.object({ language }).parse(input).language);
    case "vocabulary.createList": { const p = z.object({ language, name: z.string().trim().min(1).max(200) }).parse(input); return repos.vocabulary.createList(p.language, p.name); }
    case "vocabulary.renameList": { const p = z.object({ id, name: z.string().trim().min(1).max(200) }).parse(input); return repos.vocabulary.renameList(p.id, p.name); }
    case "vocabulary.deleteList": return repos.vocabulary.deleteList(z.object({ id }).parse(input).id);
    case "vocabulary.save": { const p = z.object({ input: vocabulary, id: id.optional() }).parse(input); return repos.vocabulary.saveEntry(p.input, p.id); }
    case "vocabulary.delete": return repos.vocabulary.deleteEntries(z.object({ ids: z.array(id).min(1).max(1000) }).parse(input).ids);
    case "vocabulary.import": return repos.vocabulary.importEntries(z.object({ inputs: z.array(vocabulary).min(1).max(2000) }).parse(input).inputs);
    case "quiz.sessions": return repos.quiz.getSessions(z.object({ language }).parse(input).language);
    case "quiz.session": return repos.quiz.getSession(z.object({ id }).parse(input).id);
    case "quiz.create": return repos.quiz.create(z.object({ language, wordIds: z.array(id).min(1).max(1000), type: quizType, randomSeed: z.number().int().min(0).max(4294967295).optional() }).parse(input));
    case "quiz.answer": { const p = z.object({ id, answer: text, version, submissionId: z.string().min(1).max(200) }).parse(input); return repos.quiz.answer(p.id, p); }
    case "quiz.save": { const p = z.object({ id, version }).parse(input); return repos.quiz.saveAndExit(p.id, p.version); }
    case "quiz.resume": return repos.quiz.resume(z.object({ id }).parse(input).id);
    case "quiz.end": { const p = z.object({ id, version }).parse(input); return repos.quiz.end(p.id, p.version); }
    case "reading.list": return repos.reading.getReadings(z.object({ language }).parse(input).language);
    case "reading.save": { const p = z.object({ input: readingInput, id: id.optional(), clearAnnotations: z.boolean().optional(), expectedBodyVersion: version.optional() }).parse(input); return repos.reading.save(p.input, p.id, p.clearAnnotations, p.expectedBodyVersion); }
    case "reading.delete": return repos.reading.delete(z.object({ id }).parse(input).id);
    case "reading.versions": return repos.reading.getVersions(z.object({ id }).parse(input).id);
    case "reading.annotations": return repos.reading.getAnnotations(z.object({ id }).parse(input).id);
    case "reading.cache": return repos.reading.getCache();
    case "reading.usage": return repos.reading.getTranslationUsage?.() ?? { used: 0, limit: 0, available: false };
    case "reading.annotate": return repos.reading.annotate(z.object({ readingId: id, bodyVersion: version, start: z.number().int().nonnegative(), end: z.number().int().positive(), text: nonempty, translation: nonempty, reading: text, vocabularyEntryId: id.nullable() }).parse(input));
    case "reading.lookup": return repos.reading.lookup(z.object({ readingId: id, bodyVersion: version, start: z.number().int().nonnegative(), end: z.number().int().positive() }).parse(input));
    case "grammar.points": return repos.grammar.getPoints(z.object({ language }).parse(input).language);
    case "grammar.progress": return repos.grammar.getProgress(z.object({ language }).parse(input).language);
    case "grammar.submit": { const p = z.object({ pointId: z.string().regex(/^[a-z0-9-]+$/).max(200), answers: z.array(z.number().int().min(0).max(3)).min(1).max(100) }).parse(input); return repos.grammar.submit(p.pointId, p.answers); }
    case "progress.words": return repos.progress.getWords(z.object({ language }).parse(input).language);
    case "progress.activity": return repos.progress.getActivity(z.object({ language: language.optional() }).parse(input).language);
    default: throw new Error("Unknown repository operation.");
  }
}
