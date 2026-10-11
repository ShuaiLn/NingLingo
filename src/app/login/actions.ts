"use server";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
export async function signIn(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/ja");
  const destination = /^\/(ja|es|el)(\/|$)/.test(next) && !next.includes("\\") ? next : "/ja";
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=credentials&next=${encodeURIComponent(destination)}`);
  redirect(destination);
}
export async function signOut() {
  const supabase = await serverSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
