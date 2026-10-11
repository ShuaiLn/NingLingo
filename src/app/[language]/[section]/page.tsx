import { notFound } from "next/navigation";
import { isLanguage } from "@/domain/languages";
import { VocabularyPage } from "@/components/vocabulary-page";
import { QuizPage } from "@/components/quiz-page";
import { ReadingPage } from "@/components/reading-page";
import { GrammarPage } from "@/components/grammar-page";
import { AlphabetPage } from "@/components/alphabet-page";
import { ProgressPage } from "@/components/progress-page";
import { SettingsPage } from "@/components/settings-page";
export default async function Section({ params }: { params: Promise<{ language: string; section: string }> }) { const { language, section } = await params; if (!isLanguage(language)) notFound(); switch (section) { case "dashboard": { const { DashboardPage } = await import("@/components/dashboard-page"); return <DashboardPage language={language}/>; } case "vocabulary": return <VocabularyPage key={language} language={language}/>; case "quiz": return <QuizPage key={language} language={language}/>; case "reading": return <ReadingPage language={language}/>; case "grammar": return <GrammarPage key={language} language={language}/>; case "alphabet": return <AlphabetPage key={language} language={language}/>; case "progress": return <ProgressPage key={language} language={language}/>; case "settings": return <SettingsPage language={language}/>; default: notFound(); } }
