import type { GrammarExercise, GrammarPoint } from "./models";

export function scoreGrammarExercises(exercises: GrammarExercise[], answers: number[]): { correct: number; total: number; percentage: number; completed: boolean } {
  if (answers.length !== exercises.length || answers.some((answer, index) => !Number.isInteger(answer) || answer < 0 || answer >= exercises[index].choices.length)) throw new Error("Answer every exercise before submitting.");
  const correct = exercises.reduce((count, exercise, index) => count + Number(exercise.correctIndex === answers[index]), 0);
  const total = exercises.length;
  const percentage = total ? correct / total * 100 : 0;
  return { correct, total, percentage, completed: total > 0 && correct / total >= 0.8 };
}

export function grammarContentIssues(point: GrammarPoint): string[] {
  const issues: string[] = [];
  if (point.examples.length < 3) issues.push("At least three examples are required.");
  if (point.exercises.length < 5) issues.push("At least five exercises are required.");
  for (const exercise of point.exercises) {
    if (new Set(exercise.choices).size !== exercise.choices.length || exercise.correctIndex < 0 || exercise.correctIndex >= exercise.choices.length) issues.push(`Invalid exercise: ${exercise.id}.`);
  }
  if (point.status !== "draft" && !point.reviewer) issues.push("Reviewed and published content requires a human review record.");
  if (!point.sources.length || point.sources.some((source) => !source.license || !source.version)) issues.push("Record source license and version.");
  return issues;
}
