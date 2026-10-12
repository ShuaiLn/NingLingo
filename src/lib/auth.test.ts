import { describe, expect, it } from "vitest";
import { authDestination, authOrigin, signupError, signupInput } from "./auth";
describe("email/password signup boundaries", () => {
  it.each(["https://attacker.invalid/ja", "//attacker.invalid/ja", "/ja/../../admin", "/ja/%2e%2e/admin", "/ja\\evil", "/ja/%5c/evil", "http://[", undefined])("rejects an unsafe return path: %s", value => {
    expect(authDestination(value)).toBe("/ja");
  });
  it("retains valid language routes and queries", () => { expect(authDestination("/es/vocabulary?category=food")).toBe("/es/vocabulary?category=food"); });
  it("uses the incoming HTTPS origin without trusting forwarded host", () => {
    expect(authOrigin(new Headers({ host: "ninglingo.example", "x-forwarded-proto": "https", "x-forwarded-host": "attacker.invalid" }))).toBe("https://ninglingo.example");
  });
  it.each([{ host: "user@attacker.invalid" }, { host: "example.com/evil" }, { host: "example.com", "x-forwarded-proto": "javascript" }, {}])("rejects an invalid callback origin: %j", headers => {
    expect(() => authOrigin(new Headers(Object.entries(headers).filter((pair): pair is [string, string] => pair[1] !== undefined)))).toThrow();
  });
  it.each([
    { email: "invalid", password: "secret123", confirmation: "secret123" },
    { email: "learner@example.com", password: "short", confirmation: "short" },
    { email: "learner@example.com", password: "secret123", confirmation: "different" },
  ])("validates signup fields before calling Auth: %j", input => { expect(signupInput.safeParse(input).success).toBe(false); });
  it("accepts matching credentials without inventing metadata", () => { expect(signupInput.parse({ email: "learner@example.com", password: "secret123", confirmation: "secret123" })).toEqual({ email: "learner@example.com", password: "secret123", confirmation: "secret123" }); });
  it.each(["user_already_exists", "email_exists", "weak_password", "email_address_invalid", "over_email_send_rate_limit", "email_address_not_authorized", "signup_disabled", "unexpected_failure"])("provides a safe actionable state for %s", code => {
    expect(signupError({ code }).length).toBeGreaterThan(20);
    expect(signupError({ code })).not.toContain(code);
  });
});
