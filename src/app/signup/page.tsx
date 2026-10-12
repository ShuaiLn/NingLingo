import Link from "next/link";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { localDevelopmentMode } from "@/lib/runtime";
import { authDestination } from "@/lib/auth";
import { SignupForm } from "@/components/signup-form";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (localDevelopmentMode()) redirect("/ja");
  const params = await searchParams;
  const destination = authDestination(params.next);
  const supabase = await serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return <main className="login-page"><section className="card login-card"><span className="brand-mark">n</span><p className="eyebrow">YOUR LANGUAGE SPACE</p>
    <h1>{user ? "Your account is ready." : "Start learning."}</h1>
    {user ? <div className="stack"><p className="notice" role="status">You are signed in. Your learning data belongs to your account.</p><Link href={destination} className="button">Continue to workspace</Link></div> : <>
      <p className="muted">Create an email/password account to practice Japanese, Spanish, and Modern Greek.</p>
      {params.error === "confirmation" && <p className="notice error" role="alert">This confirmation link is invalid or expired. Try the latest link in your email, or sign in if you have already confirmed your account.</p>}
      <SignupForm destination={destination}/>
      <p className="mini-note">Already have an account? <Link className="text-button" href={`/login?next=${encodeURIComponent(destination)}`}>Sign in</Link></p>
    </>}
  </section></main>;
}
