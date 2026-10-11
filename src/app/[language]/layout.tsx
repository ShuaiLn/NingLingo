import { notFound } from "next/navigation";
import { isLanguage } from "@/domain/languages";
import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { localDevelopmentMode } from "@/lib/runtime";
export default async function LanguageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ language: string }> }) { const { language } = await params; if (!isLanguage(language)) notFound(); if (!localDevelopmentMode()) { const supabase = await serverSupabase(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login"); } return <AppShell language={language}>{children}</AppShell>; }
