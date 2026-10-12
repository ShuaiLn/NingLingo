import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => ({ auth: mocks }) }));
import { GET as confirm } from "./confirm/route";
import { GET as callback } from "./callback/route";
const request = (query: string) => new Request(`http://localhost:3101/auth/confirm?${query}`, { headers: { host: "127.0.0.1:3101" } });
describe("email confirmation routes", () => {
  beforeEach(() => { mocks.verifyOtp.mockReset(); mocks.exchangeCodeForSession.mockReset(); });
  it("verifies a signup token through the user Auth API and preserves the browser origin", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const response = await confirm(request("token_hash=test-token&type=signup&next=/es/reading"));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "test-token", type: "signup" });
    expect(response.headers.get("Location")).toBe("http://127.0.0.1:3101/signup?next=%2Fes%2Freading");
  });
  it.each(["", "token_hash=token&type=recovery", "token_hash=token&type=invite", "type=signup"])("rejects unsupported or missing confirmation tokens: %s", async query => {
    expect((await confirm(request(query))).headers.get("Location")).toContain("error=confirmation");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("handles expired tokens and does not accept an external next URL", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    expect((await confirm(request("token_hash=expired&type=signup&next=//attacker.invalid"))).headers.get("Location")).toBe("http://127.0.0.1:3101/signup?error=confirmation&next=%2Fja");
  });
  it("exchanges a PKCE code using the SSR cookie client", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    expect((await callback(request("code=pkce-code&next=/ja"))).status).toBe(303);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
  });
  it("handles a missing PKCE verifier or expired code", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { code: "flow_state_not_found" } });
    expect((await callback(request("code=expired"))).headers.get("Location")).toContain("error=confirmation");
  });
});
