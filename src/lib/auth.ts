import { z } from "zod";

export function authDestination(value: unknown): string {
  if (typeof value !== "string" || /[\\\s]|%2f|%5c/i.test(value)) return "/ja";
  try {
    const url = new URL(value, "https://ninglingo.invalid");
    return url.origin === "https://ninglingo.invalid" && /^\/(ja|es|el|ko)(\/|$)/.test(url.pathname)
      ? url.pathname + url.search : "/ja";
  } catch { return "/ja"; }
}

/** Use the incoming host, not Next's internal localhost URL. Redirect URLs must
 * also be allowed by Supabase's project redirect allowlist. */
export function authOrigin(headers: Pick<Headers, "get">): string {
  const host = headers.get("host") ?? "";
  const protocol = headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? "http";
  if (!host || /[\s\\/@?#]/.test(host) || !["http", "https"].includes(protocol)) throw new Error("Invalid application origin.");
  return new URL(`${protocol}://${host}`).origin;
}

export const signupInput = z.object({
  email: z.email("Enter a valid email address.").max(254).transform(value => value.trim()),
  password: z.string().min(6, "Use at least 6 characters; your account may require a stronger password.").max(256, "Use no more than 256 characters."),
  confirmation: z.string(),
}).refine(value => value.password === value.confirmation, { path: ["confirmation"], message: "Passwords do not match." });

export type SignupState = { status: "idle" | "error" | "confirmation" | "success"; message?: string; email?: string; destination?: string; errorCode?: string; errorStatus?: number };

export function signupError(error: { code?: string }): string {
  switch (error.code) {
    case "user_already_exists": case "email_exists": return "An account with this email already exists. Sign in to continue.";
    case "email_address_invalid": case "validation_failed": return "Enter a valid email address and password.";
    case "weak_password": return "This password does not meet the account security requirements. Choose a stronger password.";
    case "over_email_send_rate_limit": case "over_request_rate_limit": return "Too many attempts. Please wait before trying again.";
    case "email_address_not_authorized": return "Confirmation email could not be sent to this address. Please contact the site owner.";
    case "signup_disabled": return "Account creation is temporarily unavailable. Please try again later.";
    default: return "Could not create your account. Please try again. If you already have an account, sign in.";
  }
}
