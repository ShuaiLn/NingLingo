import { notFound } from "next/navigation";
import { isLanguage } from "@/domain/languages";
import { DashboardPage } from "@/components/dashboard-page";
export default async function Dashboard({ params }: { params: Promise<{ language: string }> }) { const { language } = await params; if (!isLanguage(language)) notFound(); return <DashboardPage language={language} />; }
