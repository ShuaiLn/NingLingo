import { notFound } from "next/navigation";
import { isLanguage } from "@/domain/languages";
import { AppShell } from "@/components/app-shell";
export default async function LanguageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ language: string }> }) { const { language } = await params; if (!isLanguage(language)) notFound(); return <AppShell language={language}>{children}</AppShell>; }
