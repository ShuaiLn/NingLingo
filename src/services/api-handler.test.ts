import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalRepositories } from "@/repositories/local";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createRepositories: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/repositories/supabase", () => ({ createSupabaseRepositories: mocks.createRepositories }));
import { repositoryRequest } from "./api-handler";
const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/repository", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
describe("server repository authentication boundary", () => {
  beforeEach(() => { mocks.getUser.mockReset(); mocks.createRepositories.mockReset(); });
  it("rejects an unauthenticated or expired session before running any repository operation", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await repositoryRequest(request({ operation: "vocabulary.entries", args: { language: "ja" } }));
    expect(response.status).toBe(401);
    expect(mocks.createRepositories).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations before inspecting sessions", async () => {
    const response = await repositoryRequest(request({ operation: "settings.update", args: {} }, "https://attacker.invalid"));
    expect(response.status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("accepts verified users and returns private uncached repository data", async () => {
    const repos = createLocalRepositories();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
    mocks.createRepositories.mockReturnValue(repos);
    const response = await repositoryRequest(request({ operation: "settings.profile", args: {} }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).data.timezone).toBe("America/Tijuana");
  });
  it.each([
    { host: "127.0.0.1:3101", origin: "http://127.0.0.1:3101", protocol: "http" },
    { host: "ninglingo.example", origin: "https://ninglingo.example", protocol: "https" },
  ])("accepts the incoming browser origin when Next uses an internal URL: $origin", async ({ host, origin, protocol }) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
    mocks.createRepositories.mockReturnValue(createLocalRepositories());
    const incoming = new Request("http://localhost:3101/api/repository", { method: "POST", headers: { "Content-Type": "application/json", Host: host, Origin: origin, "X-Forwarded-Proto": protocol, "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ operation: "settings.profile", args: {} }) });
    expect((await repositoryRequest(incoming)).status).toBe(200);
  });
  it.each([
    { origin: "https://attacker.invalid", site: "same-origin" },
    { origin: "https://ninglingo.example", site: "cross-site" },
    { origin: "null", site: "same-origin" },
    { origin: "http://ninglingo.example", site: "same-origin" },
  ])("rejects foreign, opaque and cross-site origins even with forwarded headers: $origin / $site", async ({ origin, site }) => {
    const incoming = new Request("http://localhost:3101/api/repository", { method: "POST", headers: { "Content-Type": "application/json", Host: "ninglingo.example", Origin: origin, "X-Forwarded-Proto": "https", "X-Forwarded-Host": "attacker.invalid", "Sec-Fetch-Site": site }, body: JSON.stringify({ operation: "settings.profile", args: {} }) });
    expect((await repositoryRequest(incoming)).status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("returns a version conflict with the latest session for multi-device recovery", async () => {
    const repos = createLocalRepositories();
    const words = await repos.vocabulary.getEntries("ja");
    const session = await repos.quiz.create({ language: "ja", wordIds: [words[0].id], type: "typing", randomSeed: 5 });
    await repos.quiz.saveAndExit(session.id, session.version);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
    mocks.createRepositories.mockReturnValue(repos);
    const response = await repositoryRequest(request({ operation: "quiz.answer", args: { id: session.id, answer: "incorrect", version: session.version, submissionId: "stale" } }));
    expect(response.status).toBe(409);
    expect((await response.json()).latest.status).toBe("saved");
  });
  it("validates payloads and rejects unknown privileged operations", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
    mocks.createRepositories.mockReturnValue(createLocalRepositories());
    const response = await repositoryRequest(request({ operation: "quiz.create", args: { userId: "other", state: {}, language: "ja" } }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("invalid");
  });
});
