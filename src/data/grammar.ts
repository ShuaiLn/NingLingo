import type { GrammarPoint } from "@/domain/models";

const metadata = {
  status: "draft" as const, reviewer: null, contentVersion: 1, developmentSeed: true,
  sources: [{ title: "NingLingo original development examples", url: "", version: "development-v1", license: "Original development content; production licensing pending owner review", attribution: "Written for NingLingo development; not imported from a published course" }],
  modificationNotes: "Initial development sample. Requires human linguistic review before publication.",
};

export const grammarSeeds: GrammarPoint[] = [
  { ...metadata, id: "ja-desu", language: "ja", title: "Polite noun sentences with です", level: "Beginner", category: "Sentence patterns",
    explanation: "Use です after a noun to make a polite statement. は marks the topic and is pronounced wa here. Japanese commonly omits a topic when it is clear from context. In a negative polite noun sentence, ではありません means ‘is not’. Questions can end in か.",
    formation: "Topic + は + noun + です。\nNegative: noun + ではありません。\nQuestion: noun + ですか。",
    examples: [{ id: "ja-desu-1", text: "私は学生です。", reading: "わたしはがくせいです。", translation: "I am a student." }, { id: "ja-desu-2", text: "これは本です。", reading: "これはほんです。", translation: "This is a book." }, { id: "ja-desu-3", text: "犬ではありません。", reading: "いぬではありません。", translation: "It is not a dog." }],
    exercises: [
      { id: "ja-desu-q1", prompt: "Complete the polite statement: 私は学生___。", choices: ["です", "か", "を"], correctIndex: 0, explanation: "です follows the noun 学生 to make a polite statement." },
      { id: "ja-desu-q2", prompt: "Which particle marks the topic in 私は学生です？", choices: ["を", "は", "に"], correctIndex: 1, explanation: "は marks the topic; it is pronounced wa in this function." },
      { id: "ja-desu-q3", prompt: "Which means ‘This is a book’?", choices: ["これは本ではありません。", "これは本ですか。", "これは本です。"], correctIndex: 2, explanation: "これは本です is an affirmative statement. か would make it a question." },
      { id: "ja-desu-q4", prompt: "Choose the polite negative form: 犬___。", choices: ["ではありません", "ですか", "を"], correctIndex: 0, explanation: "ではありません makes the noun predicate negative: ‘is not a dog’." },
      { id: "ja-desu-q5", prompt: "Which means ‘Are you a student?’", choices: ["学生ではありません。", "学生ですか。", "学生を。"], correctIndex: 1, explanation: "The sentence-final particle か marks the question; the understood topic can be omitted." },
    ],
  },
  { ...metadata, id: "es-ser", language: "es", title: "Ser: identity and origin", level: "Beginner", category: "Verbs",
    explanation: "Use ser to state identity, profession, and origin. The present forms depend on the subject: yo soy, tú eres, él/ella/usted es, nosotros/nosotras somos, vosotros/vosotras sois, ellos/ellas/ustedes son. Subject pronouns are often omitted when the verb ending and context make the subject clear. Use de before a place of origin.",
    formation: "Subject + ser + identity/profession\nSubject + ser + de + place\nsoy · eres · es · somos · sois · son",
    examples: [{ id: "es-ser-1", text: "Soy estudiante.", translation: "I am a student." }, { id: "es-ser-2", text: "Ella es de México.", translation: "She is from Mexico." }, { id: "es-ser-3", text: "Somos amigos.", translation: "We are friends." }],
    exercises: [
      { id: "es-ser-q1", prompt: "Yo ___ estudiante.", choices: ["es", "soy", "son"], correctIndex: 1, explanation: "The yo form of ser is soy." },
      { id: "es-ser-q2", prompt: "Tú ___ de España.", choices: ["eres", "somos", "soy"], correctIndex: 0, explanation: "The tú form of ser is eres. De introduces origin." },
      { id: "es-ser-q3", prompt: "Nosotros ___ amigos.", choices: ["son", "sois", "somos"], correctIndex: 2, explanation: "The nosotros form is somos." },
      { id: "es-ser-q4", prompt: "Choose ‘She is from Mexico’.", choices: ["Ella es de México.", "Ella soy de México.", "Ella somos de México."], correctIndex: 0, explanation: "Ella takes es, followed by de and the place of origin." },
      { id: "es-ser-q5", prompt: "Ellos ___ estudiantes.", choices: ["es", "eres", "son"], correctIndex: 2, explanation: "Ellos takes the third-person plural form son." },
    ],
  },
  { ...metadata, id: "el-eimai", language: "el", title: "Είμαι: saying who you are", level: "Beginner", category: "Verbs",
    explanation: "The verb είμαι means ‘to be’. Its present forms are είμαι (I am), είσαι (you are, singular), είναι (he/she/it is), είμαστε (we are), είστε (you are, plural or polite), and είναι (they are). Greek often omits the subject pronoun. Put δεν before the verb to make a negative statement. Written Greek uses the semicolon-shaped question mark (;).",
    formation: "Subject + είμαι + description/identity\nNegative: δεν + verb\nείμαι · είσαι · είναι · είμαστε · είστε · είναι",
    examples: [{ id: "el-eimai-1", text: "Είμαι φοιτητής.", translation: "I am a university student (male)." }, { id: "el-eimai-2", text: "Είμαστε φίλοι.", translation: "We are friends." }, { id: "el-eimai-3", text: "Δεν είναι εδώ.", translation: "He/she is not here." }],
    exercises: [
      { id: "el-eimai-q1", prompt: "Εγώ ___ φοιτητής.", choices: ["είσαι", "είμαι", "είμαστε"], correctIndex: 1, explanation: "Εγώ (‘I’) takes είμαι." },
      { id: "el-eimai-q2", prompt: "Εμείς ___ φίλοι.", choices: ["είμαστε", "είμαι", "είστε"], correctIndex: 0, explanation: "Εμείς (‘we’) takes είμαστε." },
      { id: "el-eimai-q3", prompt: "Which word makes the statement negative?", choices: ["εδώ", "φίλοι", "δεν"], correctIndex: 2, explanation: "Δεν is placed before the verb to make a negative statement." },
      { id: "el-eimai-q4", prompt: "Εσύ ___ εδώ;", choices: ["είστε", "είσαι", "είμαστε"], correctIndex: 1, explanation: "Εσύ (‘you’, singular) takes είσαι. The semicolon-shaped mark ends the question." },
      { id: "el-eimai-q5", prompt: "Αυτοί ___ φίλοι.", choices: ["είμαι", "είσαι", "είναι"], correctIndex: 2, explanation: "Αυτοί (‘they’, masculine) takes είναι." },
    ],
  },
];
