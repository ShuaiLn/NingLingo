import { notFound } from "next/navigation";
import { isLanguage } from "@/domain/languages";
import { GrammarPage } from "@/components/grammar-page";
export default async function Lesson({ params }: { params: Promise<{ language: string; id: string }> }) { const { language, id } = await params; if (!isLanguage(language)) notFound(); return <GrammarPage key={id} language={language} pointId={id}/>; }
