import type { LanguageCode, VocabularyEntry, VocabularyList } from "@/domain/models";

type SeedWord = [word: string, reading: string, translation: string, category: string, example: string, accepted?: string[]];
const words: Record<LanguageCode, SeedWord[]> = {
  ko: [
    ["개", "gae", "dog", "Animals", "개를 좋아해요."], ["고양이", "goyangi", "cat", "Animals", "고양이가 작아요."],
    ["물", "mul", "water", "Food", "물을 마셔요."], ["빵", "ppang", "bread", "Food", "빵을 먹어요."],
    ["책", "chaek", "book", "Everyday", "책을 읽어요."], ["학교", "hakgyo", "school", "Places", "학교에 가요."],
    ["먹다", "meokda", "to eat", "Actions", "빵을 먹어요.", ["eat"]], ["읽다", "ikda", "to read", "Actions", "책을 읽어요.", ["read"]],
    ["크다", "keuda", "big", "Descriptions", "집이 커요.", ["large"]], ["작다", "jakda", "small", "Descriptions", "고양이가 작아요.", ["little"]],
    ["오늘", "oneul", "today", "Time", "오늘 한국어를 공부해요."], ["내일", "naeil", "tomorrow", "Time", "내일 학교에 가요."],
    ["한국어", "hangugeo", "Korean language", "Everyday", "한국어를 배워요.", ["Korean"]], ["감사합니다", "gamsahamnida", "thank you", "Greetings", "감사합니다."],
  ],
  ja: [
    ["犬", "いぬ", "dog", "Animals", "犬が好きです。"], ["猫", "ねこ", "cat", "Animals", "猫は小さいです。"],
    ["水", "みず", "water", "Food", "水を飲みます。"], ["お茶", "おちゃ", "tea", "Food", "お茶を飲みます。"],
    ["本", "ほん", "book", "Everyday", "本を読みます。"], ["学校", "がっこう", "school", "Places", "学校に行きます。"],
    ["食べる", "たべる", "to eat", "Actions", "パンを食べます。", ["eat"]], ["読む", "よむ", "to read", "Actions", "本を読みます。", ["read"]],
    ["大きい", "おおきい", "big", "Descriptions", "大きい犬です。", ["large"]], ["小さい", "ちいさい", "small", "Descriptions", "小さい猫です。", ["little"]],
    ["今日", "きょう", "today", "Time", "今日は日曜日です。"], ["明日", "あした", "tomorrow", "Time", "明日、学校に行きます。"],
    ["日本語", "にほんご", "Japanese language", "Everyday", "日本語を勉強します。", ["Japanese"]], ["ありがとう", "ありがとう", "thank you", "Greetings", "ありがとう。"],
  ],
  es: [
    ["perro", "", "dog", "Animals", "El perro es pequeño."], ["gato", "", "cat", "Animals", "El gato duerme."],
    ["agua", "", "water", "Food", "Bebo agua."], ["pan", "", "bread", "Food", "Como pan."],
    ["libro", "", "book", "Everyday", "Leo un libro."], ["escuela", "", "school", "Places", "Voy a la escuela."],
    ["comer", "", "to eat", "Actions", "Me gusta comer fruta.", ["eat"]], ["leer", "", "to read", "Actions", "Me gusta leer.", ["read"]],
    ["grande", "", "big", "Descriptions", "La casa es grande.", ["large"]], ["pequeño", "", "small", "Descriptions", "El perro es pequeño.", ["little"]],
    ["hoy", "", "today", "Time", "Hoy estudio español."], ["mañana", "", "tomorrow", "Time", "Mañana voy a la escuela."],
    ["año", "", "year", "Time", "Este año aprendo español."], ["gracias", "", "thank you", "Greetings", "Muchas gracias."],
  ],
  el: [
    ["σκύλος", "", "dog", "Animals", "Ο σκύλος είναι μικρός."], ["γάτα", "", "cat", "Animals", "Η γάτα κοιμάται."],
    ["νερό", "", "water", "Food", "Πίνω νερό."], ["ψωμί", "", "bread", "Food", "Τρώω ψωμί."],
    ["βιβλίο", "", "book", "Everyday", "Διαβάζω ένα βιβλίο."], ["σχολείο", "", "school", "Places", "Πηγαίνω στο σχολείο."],
    ["τρώω", "", "I eat", "Actions", "Τρώω ένα μήλο.", ["eat"]], ["διαβάζω", "", "I read", "Actions", "Διαβάζω ελληνικά.", ["read"]],
    ["μεγάλος", "", "big", "Descriptions", "Ο σκύλος είναι μεγάλος.", ["large"]], ["μικρός", "", "small", "Descriptions", "Ο σκύλος είναι μικρός.", ["little"]],
    ["σήμερα", "", "today", "Time", "Σήμερα μαθαίνω ελληνικά."], ["αύριο", "", "tomorrow", "Time", "Αύριο πάω στο σχολείο."],
    ["ελληνικά", "", "Greek language", "Everyday", "Μιλάω ελληνικά.", ["Greek"]], ["ευχαριστώ", "", "thank you", "Greetings", "Ευχαριστώ πολύ."],
  ],
};
const createdAt = "2026-10-01T12:00:00.000Z";
export function seedVocabularyLists(userId: string): VocabularyList[] {
  return (["ja", "es", "el", "ko"] as const).map((language) => ({ id: `list-${language}-essentials`, userId, language, name: "Everyday essentials", createdAt }));
}
export function seedVocabulary(userId: string): VocabularyEntry[] {
  return (["ja", "es", "el", "ko"] as const).flatMap((language) => words[language].map(([word, reading, translation, category, example, accepted = []], index) => ({
    id: `word-${language}-${index + 1}`, userId, language, listId: `list-${language}-essentials`, word, reading, translation, category, example,
    type: category === "Actions" ? "verb" : category === "Descriptions" ? "adjective" : category === "Time" ? "adverb" : "noun", notes: "Development sample. Edit or replace with your own vocabulary.",
    acceptedAnswers: accepted.map((text, answerIndex) => ({ id: `answer-${language}-${index}-${answerIndex}`, text })), createdAt, updatedAt: createdAt,
  })));
}
