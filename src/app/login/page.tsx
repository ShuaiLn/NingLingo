import { redirect } from "next/navigation";
import Link from "next/link";
import { authDestination } from "@/lib/auth";
import { serverSupabase } from "@/lib/supabase/server";
import { localDevelopmentMode } from "@/lib/runtime";
import { signIn } from "./actions";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  if (localDevelopmentMode()) redirect("/ja");
  const supabase = await serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const params = await searchParams;
  if (user) redirect(authDestination(params.next));
  return <main className="login-page"><section className="card login-card"><span className="brand-mark">n</span><p className="eyebrow">YOUR LANGUAGE SPACE</p><h1>Welcome back.</h1><p className="muted">Sign in to continue your Japanese, Spanish, and Greek practice.</p><form action={signIn} className="settings-form"><input type="hidden" name="next" value={authDestination(params.next)}/><label className="field">Email<input type="email" name="email" autoComplete="username" required/></label><label className="field">Password<input type="password" name="password" autoComplete="current-password" required minLength={6}/></label>{params.error && <p className="notice error" role="alert">{params.error === "expired" ? "Your session expired. Sign in to continue." : params.error === "confirmation" ? "Confirm your email using the link in your inbox before signing in." : "Could not sign in. Check your email and password and try again."}</p>}<button className="button" type="submit">Sign in</button></form><p className="mini-note">New to NingLingo? <Link className="text-button" href={`/signup?next=${encodeURIComponent(authDestination(params.next))}`}>Create an account</Link></p></section></main>;
}
