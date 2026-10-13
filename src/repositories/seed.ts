import { seedVocabulary, seedVocabularyLists } from "@/data/vocabulary";
import { initialWordProgress } from "@/domain/review";
import { learningDate } from "@/domain/dates";
import type { LanguageCode, Reading } from "@/domain/models";
import type { LocalDatabase } from "./storage";
export const MOCK_USER_ID = "local-personal-user";
export function createDevelopmentSeed(now = new Date()): LocalDatabase {
  const createdAt = now.toISOString();
  const profile = { id: MOCK_USER_ID, email: "personal@ninglingo.local", displayName: "Ning", timezone: "America/Tijuana", createdAt };
  const entries = seedVocabulary(profile.id);
  const today = learningDate(now, profile.timezone);
  const articles: Record<LanguageCode, { title: string; body: string }> = {
    ko: { title: "조용한 아침", body: "아침에 물을 마셔요. 창문 밖에 고양이가 있어요. 오늘 친구와 책을 읽어요. 작은 개도 있어요. 매일 한국어를 공부해요." },
    ja: { title: "A quiet morning", body: "朝、私は水を飲みます。窓の外に猫がいます。今日は友達と本を読みます。小さな犬もいます。毎日、日本語を勉強します。" },
    es: { title: "Un día tranquilo", body: "Por la mañana, bebo agua y leo un libro. Mi amigo tiene un gato y un perro. Hoy vamos a la escuela. Después comemos pan y hablamos de nuestra familia." },
    el: { title: "Μια ήρεμη μέρα", body: "Το πρωί πίνω νερό και διαβάζω ένα βιβλίο. Ο φίλος μου έχει μια γάτα. Σήμερα πηγαίνουμε στο σχολείο. Μετά τρώμε ψωμί και μιλάμε για την οικογένεια." },
  };
  const readings: Reading[] = (Object.keys(articles) as LanguageCode[]).map(language => ({ id: `seed-reading-${language}`, userId: profile.id, language, ...articles[language], status: "unread", version: 1, createdAt, updatedAt: createdAt }));
  return { schemaVersion: 1, profile, lists: seedVocabularyLists(profile.id), entries, wordProgress: entries.map(entry => ({ ...initialWordProgress(entry, today), dueDate: today })), sessions: [], alphabetSessions: [], readings, readingVersions: readings.map(reading => ({ id: `${reading.id}:1`, readingId: reading.id, version: 1, body: reading.body, createdAt })), annotations: [], cache: [], grammarProgress: [], activity: [] };
}
