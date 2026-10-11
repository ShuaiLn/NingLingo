import { afterEach, expect, it, vi } from "vitest";
import { localDevelopmentMode } from "./runtime";
afterEach(() => vi.unstubAllEnvs());
it("defaults to production and requires an explicit local development switch", () => {
  vi.stubEnv("NINGLINGO_REPOSITORY_MODE", ""); expect(localDevelopmentMode()).toBe(false);
  vi.stubEnv("NINGLINGO_REPOSITORY_MODE", "local"); vi.stubEnv("VERCEL", ""); expect(localDevelopmentMode()).toBe(true);
});
it("cannot activate mock authentication on Vercel", () => {
  vi.stubEnv("NINGLINGO_REPOSITORY_MODE", "local"); vi.stubEnv("VERCEL", "1"); expect(localDevelopmentMode()).toBe(false);
});
