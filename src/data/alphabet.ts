import type { AlphabetEntry } from "@/domain/models";

type KanaRow = [symbol: string, name: string, hint: string, example: string, translation: string, pronunciationAnswers: string[]];
const basic: KanaRow[] = [
  ["あ","a","ah","あさ","morning",["a","ah"]],["い","i","ee","いぬ","dog",["i","ee"]],["う","u","oo, with relaxed lips","うみ","sea",["u","oo"]],["え","e","eh","えき","station",["e","eh"]],["お","o","oh","おと","sound",["o","oh"]],
  ["か","ka","kah","かさ","umbrella",["ka","kah"]],["き","ki","kee","き","tree",["ki","kee"]],["く","ku","koo","くつ","shoes",["ku","koo"]],["け","ke","keh","けむり","smoke",["ke","keh"]],["こ","ko","koh","こえ","voice",["ko","koh"]],
  ["さ","sa","sah","さかな","fish",["sa","sah"]],["し","shi","shee","しお","salt",["shi","shee"]],["す","su","soo","すし","sushi",["su","soo"]],["せ","se","seh","せかい","world",["se","seh"]],["そ","so","soh","そら","sky",["so","soh"]],
  ["た","ta","tah","たまご","egg",["ta","tah"]],["ち","chi","chee","ちず","map",["chi","chee"]],["つ","tsu","tsoo","つき","moon",["tsu","tsoo"]],["て","te","teh","て","hand",["te","teh"]],["と","to","toh","とり","bird",["to","toh"]],
  ["な","na","nah","なつ","summer",["na","nah"]],["に","ni","nee","にく","meat",["ni","nee"]],["ぬ","nu","noo","ぬの","cloth",["nu","noo"]],["ね","ne","neh","ねこ","cat",["ne","neh"]],["の","no","noh","のり","seaweed",["no","noh"]],
  ["は","ha","hah; topic particle: wa","はな","flower",["ha","hah"]],["ひ","hi","hee","ひと","person",["hi","hee"]],["ふ","fu","soft foo, air through both lips","ふね","boat",["fu","foo"]],["へ","he","heh; direction particle: e","へや","room",["he","heh"]],["ほ","ho","hoh","ほし","star",["ho","hoh"]],
  ["ま","ma","mah","まち","town",["ma","mah"]],["み","mi","mee","みず","water",["mi","mee"]],["む","mu","moo","むし","insect",["mu","moo"]],["め","me","meh","め","eye",["me","meh"]],["も","mo","moh","もり","forest",["mo","moh"]],
  ["や","ya","yah","やま","mountain",["ya","yah"]],["ゆ","yu","yoo","ゆき","snow",["yu","yoo"]],["よ","yo","yoh","よる","night",["yo","yoh"]],
  ["ら","ra","rah; light tongue tap","らいねん","next year",["ra","rah"]],["り","ri","ree; light tongue tap","りんご","apple",["ri","ree"]],["る","ru","roo; light tongue tap","るす","absence",["ru","roo"]],["れ","re","reh; light tongue tap","れきし","history",["re","reh"]],["ろ","ro","roh; light tongue tap","ろく","six",["ro","roh"]],
  ["わ","wa","wah","わたし","I",["wa","wah"]],["を","wo","usually oh (object particle)","ほんをよむ","read a book",["wo","woh"]],["ん","n","nasal sound; varies with the next sound","ほん","book",["n"]],
];
const voiced: KanaRow[] = [
  ["が","ga","gah","がっこう","school",["ga","gah"]],["ぎ","gi","gee, hard g","ぎんこう","bank",["gi","gee"]],["ぐ","gu","goo","ぐあい","condition",["gu","goo"]],["げ","ge","geh, hard g","げんき","well; healthy",["ge","geh"]],["ご","go","goh","ごはん","rice; meal",["go","goh"]],
  ["ざ","za","zah","ざっし","magazine",["za","zah"]],["じ","ji","jee","じかん","time",["ji","jee"]],["ず","zu","zoo","ずかん","illustrated encyclopedia",["zu","zoo"]],["ぜ","ze","zeh","ぜんぶ","all",["ze","zeh"]],["ぞ","zo","zoh","ぞう","elephant",["zo","zoh"]],
  ["だ","da","dah","だいがく","university",["da","dah"]],["ぢ","ji","jee (usually same as じ)","はなぢ","nosebleed",["ji","jee"]],["づ","zu","zoo (usually same as ず)","つづく","continue",["zu","zoo"]],["で","de","deh","でんわ","telephone",["de","deh"]],["ど","do","doh","どようび","Saturday",["do","doh"]],
  ["ば","ba","bah","ばしょ","place",["ba","bah"]],["び","bi","bee","びょういん","hospital",["bi","bee"]],["ぶ","bu","boo","ぶた","pig",["bu","boo"]],["べ","be","beh","べんきょう","study",["be","beh"]],["ぼ","bo","boh","ぼうし","hat",["bo","boh"]],["ゔ","vu","voiced u; chiefly loanwords","ヴァイオリン","violin",["vu","voo"]],
];
const halfVoiced: KanaRow[] = [["ぱ","pa","pah","ぱん","bread",["pa","pah"]],["ぴ","pi","pee","ぴかぴか","sparkling",["pi","pee"]],["ぷ","pu","poo","ぷりん","custard pudding",["pu","poo"]],["ぺ","pe","peh","ぺん","pen",["pe","peh"]],["ぽ","po","poh","ぽすと","mailbox",["po","poh"]]];
const yoon: KanaRow[] = [
  ["きゃ","kya","kyah, one beat","きゃく","guest",["kya","kyah"]],["きゅ","kyu","kyoo, one beat","きゅう","nine",["kyu","kyoo"]],["きょ","kyo","kyoh, one beat","きょう","today",["kyo","kyoh"]],
  ["しゃ","sha","shah, one beat","しゃしん","photograph",["sha","shah"]],["しゅ","shu","shoo, one beat","しゅくだい","homework",["shu","shoo"]],["しょ","sho","shoh, one beat","しょくじ","meal",["sho","shoh"]],
  ["ちゃ","cha","chah, one beat","ちゃわん","rice bowl",["cha","chah"]],["ちゅ","chu","choo, one beat","ちゅうがく","junior high school",["chu","choo"]],["ちょ","cho","choh, one beat","ちょっと","a little",["cho","choh"]],
  ["にゃ","nya","nyah, one beat","にゃんこ","kitty",["nya","nyah"]],["にゅ","nyu","nyoo, one beat","にゅうがく","school enrollment",["nyu","nyoo"]],["にょ","nyo","nyoh, one beat","にょう","urine",["nyo","nyoh"]],
  ["ひゃ","hya","hyah, one beat","ひゃく","one hundred",["hya","hyah"]],["ひゅ","hyu","hyoo, one beat","ひゅうひゅう","whistling sound",["hyu","hyoo"]],["ひょ","hyo","hyoh, one beat","ひょう","leopard",["hyo","hyoh"]],
  ["みゃ","mya","myah, one beat","みゃく","pulse",["mya","myah"]],["みゅ","myu","myoo, one beat","ミュージック","music",["myu","myoo"]],["みょ","myo","myoh, one beat","みょうじ","surname",["myo","myoh"]],
  ["りゃ","rya","ryah, one beat","りゃく","abbreviation",["rya","ryah"]],["りゅ","ryu","ryoo, one beat","りゅう","dragon",["ryu","ryoo"]],["りょ","ryo","ryoh, one beat","りょこう","travel",["ryo","ryoh"]],
  ["ぎゃ","gya","gyah, one beat","ぎゃく","reverse",["gya","gyah"]],["ぎゅ","gyu","gyoo, one beat","ぎゅうにゅう","milk",["gyu","gyoo"]],["ぎょ","gyo","gyoh, one beat","ぎょうざ","dumplings",["gyo","gyoh"]],
  ["じゃ","ja","jah, one beat","じゃま","obstruction",["ja","jah"]],["じゅ","ju","joo, one beat","じゅう","ten",["ju","joo"]],["じょ","jo","joh, one beat","じょうず","skillful",["jo","joh"]],
  ["びゃ","bya","byah, one beat","びゃくや","white night",["bya","byah"]],["びゅ","byu","byoo, one beat","びゅうびゅう","wind blowing sound",["byu","byoo"]],["びょ","byo","byoh, one beat","びょういん","hospital",["byo","byoh"]],
  ["ぴゃ","pya","pyah, one beat","ぴゃー","sharp cry",["pya","pyah"]],["ぴゅ","pyu","pyoo, one beat","ぴゅうぴゅう","whistling sound",["pyu","pyoo"]],["ぴょ","pyo","pyoh, one beat","ぴょんぴょん","hopping",["pyo","pyoh"]],
];
function katakana(value: string): string { return value.replace(/[ぁ-ゖ]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 0x60)); }
function kanaEntries(rows: KanaRow[], group: string, script: "hiragana" | "katakana"): AlphabetEntry[] {
  return rows.map(([symbol, name, pronunciation, example, exampleTranslation, pronunciationAnswers]) => ({ id: `ja-${script}-${symbol}`, language: "ja", group, symbol: script === "katakana" ? katakana(symbol) : symbol, name, pronunciation, pronunciationAnswers: [...pronunciationAnswers], example: script === "katakana" ? katakana(example) : example, exampleTranslation, audioText: script === "katakana" ? katakana(symbol) : symbol, exampleReading: script === "katakana" ? katakana(example) : example }));
}
const spanish: [string, string, string, string, string, string[]][] = [
  ["A a","a","ah","agua","water",["a","ah"]],["B b","be","b; softer between vowels","barco","boat",["b"]],["C c","ce","k before a/o/u; th in Spain or s before e/i","casa","house",["k","s","th"]],["D d","de","d; softer between vowels","día","day",["d"]],["E e","e","eh","escuela","school",["e","eh"]],["F f","efe","f","flor","flower",["f"]],["G g","ge","hard g before a/o/u; throaty h before e/i","gato","cat",["g","h","kh"]],["H h","hache","silent","hola","hello",["silent","no sound"]],["I i","i","ee","isla","island",["i","ee"]],["J j","jota","throaty h","jardín","garden",["h","kh"]],["K k","ka","k","kilómetro","kilometer",["k"]],["L l","ele","l","libro","book",["l"]],["M m","eme","m","mano","hand",["m"]],["N n","ene","n","noche","night",["n"]],["Ñ ñ","eñe","ny as in canyon","niño","boy",["ny"]],["O o","o","oh","ojo","eye",["o","oh"]],["P p","pe","p","pan","bread",["p"]],["Q q","cu","k; normally written qu before e/i","queso","cheese",["k"]],["R r","erre","tap r; trill initially or as rr","rosa","rose",["r","rr"]],["S s","ese","s","sol","sun",["s"]],["T t","te","t with tongue at teeth","té","tea",["t"]],["U u","u","oo","uva","grape",["u","oo"]],["V v","uve","same sound family as b","vida","life",["b"]],["W w","uve doble","varies in borrowed words","wifi","Wi-Fi",["w","u","gu","b"]],["X x","equis","usually ks; varies in proper names","examen","exam",["ks","s","h","kh","sh"]],["Y y","ye","y or regionally sh/zh; vowel ee when alone","yo","I",["y","sh","zh","i","ee"]],["Z z","zeta","th in much of Spain; s in Latin America","zapato","shoe",["s","th"]],
];
const greek: [string, string, string, string, string, string, string[]][] = [
  ["Α","α","άλφα","ah","αγάπη","love",["a","ah"]],["Β","β","βήτα","v","βιβλίο","book",["v"]],["Γ","γ","γάμμα","voiced throaty sound; softer before e/i","γάτα","cat",["gh","y"]],["Δ","δ","δέλτα","th as in this","δέντρο","tree",["dh"]],["Ε","ε","έψιλον","eh","ένα","one",["e","eh"]],["Ζ","ζ","ζήτα","z","ζάχαρη","sugar",["z"]],["Η","η","ήτα","ee","ήλιος","sun",["i","ee"]],["Θ","θ","θήτα","th as in thin","θάλασσα","sea",["th"]],["Ι","ι","γιώτα","ee","ιστορία","history",["i","ee"]],["Κ","κ","κάππα","k","καφές","coffee",["k"]],["Λ","λ","λάμδα","l","λεμόνι","lemon",["l"]],["Μ","μ","μι","m","μήλο","apple",["m"]],["Ν","ν","νι","n","νερό","water",["n"]],["Ξ","ξ","ξι","ks","ξύλο","wood",["ks","x"]],["Ο","ο","όμικρον","oh","όνομα","name",["o","oh"]],["Π","π","πι","p","πόρτα","door",["p"]],["Ρ","ρ","ρο","tapped or trilled r","ρύζι","rice",["r"]],["Σ","σ","σίγμα","s","σπίτι","house",["s"]],["Τ","τ","ταυ","t","τυρί","cheese",["t"]],["Υ","υ","ύψιλον","ee","ύπνος","sleep",["i","ee"]],["Φ","φ","φι","f","φως","light",["f","ph"]],["Χ","χ","χι","unvoiced throaty sound; softer before e/i","χέρι","hand",["kh","h"]],["Ψ","ψ","ψι","ps","ψωμί","bread",["ps"]],["Ω","ω","ωμέγα","oh","ώρα","hour",["o","oh"]],
];
type HangulRow = [symbol: string, name: string, sound: string, answers: string[], example: string, translation: string, note: string];
const hangulConsonants: HangulRow[] = [
  ["ㄱ", "기역", "g before a vowel; unreleased k as a final", ["g", "k"], "가방", "bag", "Combine ㄱ + ㅏ as 가. Final ㄱ in 국 is an unreleased k; connected speech can change the sound."],
  ["ㄴ", "니은", "n", ["n"], "나무", "tree", "Combine ㄴ + ㅏ as 나. Final ㄴ remains a nasal n, as in 산."],
  ["ㄷ", "디귿", "d before a vowel; unreleased t as a final", ["d", "t"], "다리", "leg; bridge", "Combine ㄷ + ㅏ as 다. Final ㄷ is an unreleased t, as in 곧."],
  ["ㄹ", "리을", "light r between vowels; l as a final", ["r", "l"], "라디오", "radio", "Combine ㄹ + ㅏ as 라. Final ㄹ is l, as in 달; ㄹㄹ commonly sounds like a longer l."],
  ["ㅁ", "미음", "m", ["m"], "모자", "hat", "Combine ㅁ + ㅗ as 모. Final ㅁ remains a nasal m, as in 밤."],
  ["ㅂ", "비읍", "b before a vowel; unreleased p as a final", ["b", "p"], "바다", "sea", "Combine ㅂ + ㅏ as 바. Final ㅂ is an unreleased p, as in 밥."],
  ["ㅅ", "시옷", "s; sh-like before i or a y-vowel", ["s", "sh"], "사과", "apple", "Combine ㅅ + ㅏ as 사. Final ㅅ alone is an unreleased t, as in 옷; the sound changes before a vowel."],
  ["ㅇ", "이응", "silent initially; ng as a final", ["silent", "ng", "no sound"], "우유", "milk", "Initial ㅇ fills the consonant slot without a sound, as in 아. Final ㅇ is ng, as in 강."],
  ["ㅈ", "지읒", "j", ["j"], "지도", "map", "Combine ㅈ + ㅣ as 지. Final ㅈ alone is an unreleased t, as in 낮."],
  ["ㅊ", "치읓", "aspirated ch", ["ch"], "차", "tea; car", "Combine ㅊ + ㅏ as 차 with a puff of air. Final ㅊ alone is an unreleased t, as in 꽃."],
  ["ㅋ", "키읔", "aspirated k", ["k", "kh"], "코", "nose", "Combine ㅋ + ㅗ as 코 with a puff of air. Final ㅋ is an unreleased k, as in 부엌."],
  ["ㅌ", "티읕", "aspirated t", ["t", "th"], "토끼", "rabbit", "Combine ㅌ + ㅗ as 토 with a puff of air. Final ㅌ alone is an unreleased t, as in 밭."],
  ["ㅍ", "피읖", "aspirated p", ["p", "ph"], "포도", "grape", "Combine ㅍ + ㅗ as 포 with a puff of air. Final ㅍ is an unreleased p, as in 앞."],
  ["ㅎ", "히읗", "h", ["h"], "하늘", "sky", "Combine ㅎ + ㅏ as 하. Final ㅎ often affects a neighboring consonant or disappears before a vowel."],
];
const hangulTense: HangulRow[] = [
  ["ㄲ", "쌍기역", "tense kk", ["kk"], "꼬리", "tail", "ㄲ is tense, with no strong puff of air. Combine ㄲ + ㅗ as 꼬; final ㄲ is an unreleased k, as in 밖."],
  ["ㄸ", "쌍디귿", "tense tt", ["tt"], "딸", "daughter", "ㄸ is tense rather than aspirated. Combine ㄸ + ㅏ + ㄹ as 딸. ㄸ is not a final consonant in standard syllable spelling."],
  ["ㅃ", "쌍비읍", "tense pp", ["pp"], "빵", "bread", "ㅃ is tense rather than aspirated. Combine ㅃ + ㅏ + ㅇ as 빵. ㅃ is not a final consonant in standard syllable spelling."],
  ["ㅆ", "쌍시옷", "tense ss", ["ss"], "쌀", "rice (uncooked)", "Combine ㅆ + ㅏ + ㄹ as 쌀. Final ㅆ alone is an unreleased t, as in 있다 before a consonant."],
  ["ㅉ", "쌍지읒", "tense jj", ["jj"], "짜다", "to be salty", "ㅉ is tense rather than aspirated. Combine ㅉ + ㅏ as 짜. ㅉ is not a final consonant in standard syllable spelling."],
];
const hangulVowels: HangulRow[] = [
  ["ㅏ", "아", "a", ["a", "ah"], "아기", "baby", "Write the vertical vowel to the right of the initial consonant: ㅇ + ㅏ = 아. Initial ㅇ is silent."],
  ["ㅑ", "야", "ya", ["ya", "yah"], "야구", "baseball", "The extra short stroke adds a y-glide: ㅇ + ㅑ = 야. Audio is the example syllable 야."],
  ["ㅓ", "어", "eo; open unrounded vowel", ["eo"], "어머니", "mother", "Write ㅓ to the right of the initial: ㅇ + ㅓ = 어. Romanized eo represents one vowel, not two separate sounds."],
  ["ㅕ", "여", "yeo", ["yeo"], "여름", "summer", "The extra short stroke adds a y-glide: ㅇ + ㅕ = 여. Romanized yeo is one syllable here."],
  ["ㅗ", "오", "o", ["o", "oh"], "오이", "cucumber", "Write the horizontal vowel below the initial: ㅇ + ㅗ = 오. Keep the lips rounded."],
  ["ㅛ", "요", "yo", ["yo", "yoh"], "요리", "cooking; dish", "Write ㅛ below the initial: ㅇ + ㅛ = 요. The two short strokes indicate a y-glide."],
  ["ㅜ", "우", "u", ["u", "oo"], "우유", "milk", "Write ㅜ below the initial: ㅇ + ㅜ = 우. Round the lips; audio is the example syllable 우."],
  ["ㅠ", "유", "yu", ["yu", "yoo"], "유리", "glass", "Write ㅠ below the initial: ㅇ + ㅠ = 유. The two short strokes indicate a y-glide."],
  ["ㅡ", "으", "eu; unrounded close back vowel", ["eu"], "음악", "music", "Write ㅡ below the initial: ㅇ + ㅡ = 으. Keep the lips unrounded; eu does not mean English yoo."],
  ["ㅣ", "이", "i", ["i", "ee"], "이름", "name", "Write ㅣ to the right of the initial: ㅇ + ㅣ = 이. Audio is the example syllable 이."],
];
const hangulCompound: HangulRow[] = [
  ["ㅐ", "애", "ae", ["ae"], "애기", "baby (colloquial)", "ㅏ + ㅣ forms ㅐ: ㅇ + ㅐ = 애. Many modern speakers merge its sound with ㅔ, but the spelling stays distinct."],
  ["ㅒ", "얘", "yae", ["yae"], "얘기", "story; talk", "ㅑ + ㅣ forms ㅒ: ㅇ + ㅒ = 얘. It may merge in speech with ㅖ; preserve the written form."],
  ["ㅔ", "에", "e", ["e", "eh"], "에너지", "energy", "ㅓ + ㅣ forms ㅔ: ㅇ + ㅔ = 에. Modern ㅐ and ㅔ may sound alike; romanized answers retain the spelling distinction."],
  ["ㅖ", "예", "ye", ["ye", "yeh"], "예술", "art", "ㅕ + ㅣ forms ㅖ: ㅇ + ㅖ = 예. The y-glide may weaken after some consonants."],
  ["ㅘ", "와", "wa", ["wa", "wah"], "와인", "wine", "Combine horizontal ㅗ and vertical ㅏ: ㅇ + ㅘ = 와. The vowel wraps below and to the right of the initial."],
  ["ㅙ", "왜", "wae", ["wae"], "왜", "why", "ㅗ + ㅐ forms ㅙ: ㅇ + ㅙ = 왜. It is often close to ㅚ and ㅞ in modern speech, but spellings differ."],
  ["ㅚ", "외", "oe; commonly pronounced like we", ["oe", "we"], "외국", "foreign country", "ㅗ + ㅣ forms ㅚ: ㅇ + ㅚ = 외. Revised Romanization uses oe even when the modern pronunciation is we-like."],
  ["ㅝ", "워", "wo", ["wo", "weo"], "원", "won (currency)", "ㅜ + ㅓ forms ㅝ: ㅇ + ㅝ = 워. The first part is a w-glide, not a separate syllable."],
  ["ㅞ", "웨", "we", ["we", "weh"], "웨이터", "waiter", "ㅜ + ㅔ forms ㅞ: ㅇ + ㅞ = 웨. The sound can merge with ㅙ and ㅚ, but the written forms remain distinct."],
  ["ㅟ", "위", "wi", ["wi", "wee"], "위", "above; stomach", "ㅜ + ㅣ forms ㅟ: ㅇ + ㅟ = 위. It is commonly pronounced with a w-glide in modern speech."],
  ["ㅢ", "의", "ui; pronunciation varies by position", ["ui", "eui"], "의자", "chair", "ㅡ + ㅣ forms ㅢ: ㅇ + ㅢ = 의. It may sound like i after a consonant, and the possessive particle 의 may sound like e."],
];
function hangulEntries(rows: HangulRow[], group: string, audioKind: "letter-name" | "example-syllable"): AlphabetEntry[] {
  return rows.map(([symbol, name, pronunciation, pronunciationAnswers, example, exampleTranslation, notes]) => ({
    id: `ko-hangul-${symbol}`, language: "ko", group, symbol, name, pronunciation, pronunciationAnswers: [...pronunciationAnswers],
    example, exampleTranslation, notes, audioKind, audioText: name, exampleReading: example,
  }));
}
export const alphabetEntries: AlphabetEntry[] = [
  ...kanaEntries(basic, "Hiragana", "hiragana"), ...kanaEntries(basic, "Katakana", "katakana"),
  ...kanaEntries(voiced, "Dakuten · Hiragana", "hiragana"), ...kanaEntries(voiced, "Dakuten · Katakana", "katakana"),
  ...kanaEntries(halfVoiced, "Handakuten · Hiragana", "hiragana"), ...kanaEntries(halfVoiced, "Handakuten · Katakana", "katakana"),
  ...kanaEntries(yoon, "Yōon · Hiragana", "hiragana"), ...kanaEntries(yoon, "Yōon · Katakana", "katakana"),
  ...spanish.map(([symbol, name, pronunciation, example, exampleTranslation, pronunciationAnswers], index) => ({ id: `es-letter-${index}`, language: "es" as const, group: "Alphabet", symbol, name, pronunciation, pronunciationAnswers: [...pronunciationAnswers], example, exampleTranslation, audioText: name })),
  ...greek.flatMap(([upper, lower, name, pronunciation, example, exampleTranslation, pronunciationAnswers], index) => ([{ id: `el-upper-${index}`, language: "el" as const, group: "Uppercase", symbol: upper, name, pronunciation, pronunciationAnswers: [...pronunciationAnswers], example, exampleTranslation, audioText: name }, { id: `el-lower-${index}`, language: "el" as const, group: "Lowercase", symbol: lower, name, pronunciation, pronunciationAnswers: [...pronunciationAnswers], example, exampleTranslation, audioText: name }])),
  { id: "el-final-sigma", language: "el", group: "Final sigma", symbol: "ς", name: "σίγμα τελικό", pronunciation: "s; lowercase sigma at the end of a word", pronunciationAnswers: ["s"], example: "κόσμος", exampleTranslation: "world", audioText: "σίγμα", exampleReading: "κόσμος" },
  ...hangulEntries(hangulConsonants, "Basic consonants", "letter-name"),
  ...hangulEntries(hangulVowels, "Basic vowels", "example-syllable"),
  ...hangulEntries(hangulTense, "Tense consonants", "letter-name"),
  ...hangulEntries(hangulCompound, "Compound vowels", "example-syllable"),
];
