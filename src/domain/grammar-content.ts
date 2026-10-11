import { z } from "zod";
import type { GrammarPoint, LanguageCode } from "./models";

const nonblank = z.string().trim().min(1);
const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const normalized = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("en");
const source = z.object({ title: nonblank, url: z.url(), version: nonblank, license: nonblank, attribution: nonblank });
const example = z.object({ id: identifier, text: nonblank, reading: nonblank.optional(), translation: nonblank });
const exercise = z.object({ id: identifier, prompt: nonblank, choices: z.array(nonblank).min(2).max(4), correctIndex: z.number().int().nonnegative(), explanation: nonblank }).superRefine((entry, context) => {
  if (entry.correctIndex >= entry.choices.length) context.addIssue({ code: "custom", path: ["correctIndex"], message: "Exactly one answer must be identified by a valid index." });
  if (new Set(entry.choices.map(normalized)).size !== entry.choices.length) context.addIssue({ code: "custom", path: ["choices"], message: "Exercise choices must be distinct after Unicode normalization." });
});
export const grammarProductionPointSchema = z.object({
  id: identifier, language: z.enum(["ja", "es", "el"]), title: nonblank, level: nonblank, category: nonblank,
  explanation: z.string().trim().min(20), formation: nonblank,
  examples: z.array(example).min(3), exercises: z.array(exercise).min(5),
  status: z.enum(["draft", "reviewed", "published"]), sources: z.array(source).min(1),
  reviewer: z.object({ name: nonblank, date: z.iso.date() }).nullable(), contentVersion: z.number().int().positive(),
  modificationNotes: nonblank, developmentSeed: z.literal(false),
}).superRefine((point, context) => {
  if (!point.id.startsWith(`${point.language}-`)) context.addIssue({ code: "custom", path: ["id"], message: "Lesson ID must have its stable language prefix." });
  if (point.status !== "draft" && !point.reviewer) context.addIssue({ code: "custom", path: ["reviewer"], message: "Reviewed and published lessons require a real human review record." });
  if (new Set(point.examples.map(entry => normalized(entry.text))).size !== point.examples.length) context.addIssue({ code: "custom", path: ["examples"], message: "A lesson must not repeat the same example." });
  const ids = [...point.examples, ...point.exercises].map(entry => entry.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Example and exercise IDs must be unique within a version." });
});

export interface GrammarDatasetValidation { points: GrammarPoint[]; errors: string[]; counts: Record<LanguageCode, number> }
export function validateGrammarDataset(value: unknown): GrammarDatasetValidation {
  const parsed = z.array(grammarProductionPointSchema).safeParse(value);
  const counts: Record<LanguageCode, number> = { ja: 0, es: 0, el: 0 };
  if (!parsed.success) return { points: [], counts, errors: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`) };
  const errors: string[] = [];
  const ids = new Set<string>();
  const titles = new Set<string>();
  const childIds = new Set<string>();
  for (const point of parsed.data) {
    counts[point.language]++;
    if (ids.has(point.id)) errors.push(`Duplicate lesson ID: ${point.id}`);
    ids.add(point.id);
    const title = `${point.language}:${normalized(point.title)}`;
    if (titles.has(title)) errors.push(`Duplicate lesson title: ${point.title}`);
    titles.add(title);
    for (const entry of [...point.examples, ...point.exercises]) {
      if (childIds.has(entry.id)) errors.push(`Duplicate content ID: ${entry.id}`);
      childIds.add(entry.id);
    }
  }
  for (const language of ["ja", "es", "el"] as const) {
    const target = { ja: 100, es: 80, el: 60 }[language];
    if (counts[language] !== target) errors.push(`${language}: expected ${target} lessons; found ${counts[language]}.`);
  }
  return { points: parsed.data, errors, counts };
}
