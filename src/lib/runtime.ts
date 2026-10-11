/** Explicit local mode is for the preserved development/E2E workspace only. */
export function localDevelopmentMode(): boolean {
  return process.env.NINGLINGO_REPOSITORY_MODE === "local" && process.env.VERCEL !== "1";
}
