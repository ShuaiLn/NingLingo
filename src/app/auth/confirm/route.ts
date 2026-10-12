import { serverSupabase } from "@/lib/supabase/server";
import { authDestination, authOrigin } from "@/lib/auth";

/** Supports SSR email templates using /auth/confirm?token_hash=…&type=signup.
 * Only account-confirmation tokens are accepted; no admin operation is used. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = authOrigin(request.headers);
  const tokenHash = url.searchParams.get("token_hash");
  const destination = authDestination(url.searchParams.get("next"));
  if (tokenHash && url.searchParams.get("type") === "signup") {
    const supabase = await serverSupabase();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "signup" });
    if (!error) return Response.redirect(`${origin}/signup?next=${encodeURIComponent(destination)}`, 303);
  }
  return Response.redirect(`${origin}/signup?error=confirmation&next=${encodeURIComponent(destination)}`, 303);
}
