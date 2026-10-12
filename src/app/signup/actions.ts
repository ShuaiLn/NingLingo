"use server";
import { headers } from "next/headers";
import { serverSupabase } from "@/lib/supabase/server";
import { authDestination, authOrigin, signupError, signupInput, type SignupState } from "@/lib/auth";

export async function signUp(_previous: SignupState, form: FormData): Promise<SignupState> {
  const email = String(form.get("email") ?? "").trim();
  const parsed = signupInput.safeParse({ email, password: form.get("password"), confirmation: form.get("confirmation") });
  if (!parsed.success) return { status: "error", email, message: parsed.error.issues[0].message };
  const destination = authDestination(form.get("next"));
  try {
    const origin = authOrigin(await headers());
    const supabase = await serverSupabase();
    const { data, error } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password,
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(destination)}` } });
    if (error) return { status: "error", email, message: signupError(error), errorCode: error.code, errorStatus: error.status };
    if (data.session) return { status: "success", destination, message: "Your account is ready. Continue to your workspace." };
    // Confirm-email projects intentionally conceal existing accounts. Do not
    // query admin APIs or turn an obfuscated response into an email oracle.
    return { status: "confirmation", email, message: "Check your email for a confirmation link before signing in. If this email already has an account, sign in instead." };
  } catch {
    return { status: "error", email, message: "Authentication is temporarily unavailable. Please try again." };
  }
}
