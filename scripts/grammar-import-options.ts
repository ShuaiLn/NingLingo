export interface GrammarImportOptions {
  reviewedFile?: string;
  validateOnly: boolean;
}

export function parseGrammarImportOptions(args: string[]): GrammarImportOptions {
  const options: GrammarImportOptions = { validateOnly: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--validate-only") {
      if (options.validateOnly) throw new Error("Duplicate --validate-only option.");
      options.validateOnly = true;
    } else if (argument === "--reviewed-file" || argument.startsWith("--reviewed-file=")) {
      if (options.reviewedFile !== undefined) throw new Error("Duplicate --reviewed-file option.");
      const path = argument === "--reviewed-file" ? args[++index] : argument.slice("--reviewed-file=".length);
      if (!path?.trim() || path.startsWith("--")) throw new Error("--reviewed-file requires a nonempty file path.");
      options.reviewedFile = path;
    } else {
      throw new Error(`Unknown or malformed grammar import option: ${argument}`);
    }
  }
  return options;
}

export const grammarImportVersionNotice = "Each imported content version is immutable, including its status. Import the final published version after human review; changing an already imported reviewed version to published requires a new contentVersion. Reviewed lessons stay hidden from learners.";
