"use server";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { authDestination } from "@/lib/auth";
export async function signIn(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/ja");
  const destination = authDestination(next);
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${error.code === "email_not_confirmed" ? "confirmation" : "credentials"}&next=${encodeURIComponent(destination)}`);
  redirect(destination);
}
export async function signOut() {
  const supabase = await serverSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
