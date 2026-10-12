import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => ({ auth: { signUp: mocks.signUp } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "ninglingo.example", "x-forwarded-proto": "https" }) }));
import { signUp } from "./actions";
const form = (overrides: Record<string, string> = {}) => { const value = new FormData(); Object.entries({ email: " learner@example.com ", password: "secret123", confirmation: "secret123", next: "/el/reading", ...overrides }).forEach(([key, text]) => value.set(key, text)); return value; };
describe("Supabase signup action", () => {
  beforeEach(() => { mocks.signUp.mockReset(); });
  it("uses public signup with a safe PKCE callback and no admin privileges", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "new-user" }, session: null }, error: null });
    const state = await signUp({ status: "idle" }, form());
    expect(state.status).toBe("confirmation");
    expect(mocks.signUp).toHaveBeenCalledWith({ email: "learner@example.com", password: "secret123", options: { emailRedirectTo: "https://ninglingo.example/auth/callback?next=%2Fel%2Freading" } });
    expect(JSON.stringify(state)).not.toContain("secret123");
  });
  it("preserves Supabase email-enumeration protection for obfuscated duplicate responses", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    expect((await signUp({ status: "idle" }, form())).status).toBe("confirmation");
  });
  it("returns success when confirmation is not required and a cookie session is issued", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: "never-return-this" } }, error: null });
    expect(await signUp({ status: "idle" }, form({ next: "//attacker.invalid" }))).toEqual({ status: "success", destination: "/ja", message: "Your account is ready. Continue to your workspace." });
  });
  it.each(["user_already_exists", "weak_password", "email_address_invalid", "email_address_not_authorized", "over_email_send_rate_limit"])("handles provider failure %s without echoing raw errors", async code => {
    mocks.signUp.mockResolvedValue({ data: {}, error: { code, message: "sensitive provider detail" } });
    const state = await signUp({ status: "idle" }, form());
    expect(state.status).toBe("error"); expect(JSON.stringify(state)).not.toContain("sensitive provider detail");
  });
  it("rejects password mismatch without contacting Supabase", async () => {
    expect((await signUp({ status: "idle" }, form({ confirmation: "different" }))).message).toBe("Passwords do not match.");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it("identifies the provider email-send limit without exposing raw error messages", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: { code: "over_email_send_rate_limit", status: 429, message: "private provider detail" } });
    const state = await signUp({ status: "idle" }, form());
    expect(state).toMatchObject({ status: "error", errorCode: "over_email_send_rate_limit", errorStatus: 429 });
    expect(JSON.stringify(state)).not.toContain("private provider detail");
  });
  it("handles network failure without exposing credentials", async () => {
    mocks.signUp.mockRejectedValue(new Error("sensitive credentials"));
    const state = await signUp({ status: "idle" }, form());
    expect(state.status).toBe("error"); expect(state.message).toContain("temporarily unavailable");
  });
});
