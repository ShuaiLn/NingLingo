import { serverSupabase } from "@/lib/supabase/server";
import { authDestination, authOrigin } from "@/lib/auth";

/** Default Supabase confirmation links return the PKCE code to this route. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = authOrigin(request.headers);
  const code = url.searchParams.get("code");
  const destination = authDestination(url.searchParams.get("next"));
  if (code) {
    const supabase = await serverSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return Response.redirect(`${origin}/signup?next=${encodeURIComponent(destination)}`, 303);
  }
  return Response.redirect(`${origin}/signup?error=confirmation&next=${encodeURIComponent(destination)}`, 303);
}
