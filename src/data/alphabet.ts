import type { AlphabetEntry } from "@/domain/models";

type KanaRow = [symbol: string, name: string, hint: string, example: string, translation: string];
const basic: KanaRow[] = [
  ["あ","a","ah","あさ","morning"],["い","i","ee","いぬ","dog"],["う","u","oo, with relaxed lips","うみ","sea"],["え","e","eh","えき","station"],["お","o","oh","おと","sound"],
  ["か","ka","kah","かさ","umbrella"],["き","ki","kee","き","tree"],["く","ku","koo","くつ","shoes"],["け","ke","keh","けむり","smoke"],["こ","ko","koh","こえ","voice"],
  ["さ","sa","sah","さかな","fish"],["し","shi","shee","しお","salt"],["す","su","soo","すし","sushi"],["せ","se","seh","せかい","world"],["そ","so","soh","そら","sky"],
  ["た","ta","tah","たまご","egg"],["ち","chi","chee","ちず","map"],["つ","tsu","tsoo","つき","moon"],["て","te","teh","て","hand"],["と","to","toh","とり","bird"],
  ["な","na","nah","なつ","summer"],["に","ni","nee","にく","meat"],["ぬ","nu","noo","ぬの","cloth"],["ね","ne","neh","ねこ","cat"],["の","no","noh","のり","seaweed"],
  ["は","ha","hah; topic particle: wa","はな","flower"],["ひ","hi","hee","ひと","person"],["ふ","fu","soft foo, air through both lips","ふね","boat"],["へ","he","heh; direction particle: e","へや","room"],["ほ","ho","hoh","ほし","star"],
  ["ま","ma","mah","まち","town"],["み","mi","mee","みず","water"],["む","mu","moo","むし","insect"],["め","me","meh","め","eye"],["も","mo","moh","もり","forest"],
  ["や","ya","yah","やま","mountain"],["ゆ","yu","yoo","ゆき","snow"],["よ","yo","yoh","よる","night"],
  ["ら","ra","rah; light tongue tap","らいねん","next year"],["り","ri","ree; light tongue tap","りんご","apple"],["る","ru","roo; light tongue tap","るす","absence"],["れ","re","reh; light tongue tap","れきし","history"],["ろ","ro","roh; light tongue tap","ろく","six"],
  ["わ","wa","wah","わたし","I"],["を","wo","usually oh (object particle)","ほんをよむ","read a book"],["ん","n","nasal sound; varies with the next sound","ほん","book"],
];
const voiced: KanaRow[] = [
  ["が","ga","gah","がっこう","school"],["ぎ","gi","gee, hard g","ぎんこう","bank"],["ぐ","gu","goo","ぐあい","condition"],["げ","ge","geh, hard g","げんき","well; healthy"],["ご","go","goh","ごはん","rice; meal"],
  ["ざ","za","zah","ざっし","magazine"],["じ","ji","jee","じかん","time"],["ず","zu","zoo","ずかん","illustrated encyclopedia"],["ぜ","ze","zeh","ぜんぶ","all"],["ぞ","zo","zoh","ぞう","elephant"],
  ["だ","da","dah","だいがく","university"],["ぢ","ji","jee (usually same as じ)","はなぢ","nosebleed"],["づ","zu","zoo (usually same as ず)","つづく","continue"],["で","de","deh","でんわ","telephone"],["ど","do","doh","どようび","Saturday"],
  ["ば","ba","bah","ばしょ","place"],["び","bi","bee","びょういん","hospital"],["ぶ","bu","boo","ぶた","pig"],["べ","be","beh","べんきょう","study"],["ぼ","bo","boh","ぼうし","hat"],["ゔ","vu","voiced u; chiefly loanwords","ヴァイオリン","violin"],
];
const halfVoiced: KanaRow[] = [["ぱ","pa","pah","ぱん","bread"],["ぴ","pi","pee","ぴかぴか","sparkling"],["ぷ","pu","poo","ぷりん","custard pudding"],["ぺ","pe","peh","ぺん","pen"],["ぽ","po","poh","ぽすと","mailbox"]];
const yoon: KanaRow[] = [
  ["きゃ","kya","kyah, one beat","きゃく","guest"],["きゅ","kyu","kyoo, one beat","きゅう","nine"],["きょ","kyo","kyoh, one beat","きょう","today"],
  ["しゃ","sha","shah, one beat","しゃしん","photograph"],["しゅ","shu","shoo, one beat","しゅくだい","homework"],["しょ","sho","shoh, one beat","しょくじ","meal"],
  ["ちゃ","cha","chah, one beat","ちゃわん","rice bowl"],["ちゅ","chu","choo, one beat","ちゅうがく","junior high school"],["ちょ","cho","choh, one beat","ちょっと","a little"],
  ["にゃ","nya","nyah, one beat","にゃんこ","kitty"],["にゅ","nyu","nyoo, one beat","にゅうがく","school enrollment"],["にょ","nyo","nyoh, one beat","にょう","urine"],
  ["ひゃ","hya","hyah, one beat","ひゃく","one hundred"],["ひゅ","hyu","hyoo, one beat","ひゅうひゅう","whistling sound"],["ひょ","hyo","hyoh, one beat","ひょう","leopard"],
  ["みゃ","mya","myah, one beat","みゃく","pulse"],["みゅ","myu","myoo, one beat","ミュージック","music"],["みょ","myo","myoh, one beat","みょうじ","surname"],
  ["りゃ","rya","ryah, one beat","りゃく","abbreviation"],["りゅ","ryu","ryoo, one beat","りゅう","dragon"],["りょ","ryo","ryoh, one beat","りょこう","travel"],
  ["ぎゃ","gya","gyah, one beat","ぎゃく","reverse"],["ぎゅ","gyu","gyoo, one beat","ぎゅうにゅう","milk"],["ぎょ","gyo","gyoh, one beat","ぎょうざ","dumplings"],
  ["じゃ","ja","jah, one beat","じゃま","obstruction"],["じゅ","ju","joo, one beat","じゅう","ten"],["じょ","jo","joh, one beat","じょうず","skillful"],
  ["びゃ","bya","byah, one beat","びゃくや","white night"],["びゅ","byu","byoo, one beat","びゅうびゅう","wind blowing sound"],["びょ","byo","byoh, one beat","びょういん","hospital"],
  ["ぴゃ","pya","pyah, one beat","ぴゃー","sharp cry"],["ぴゅ","pyu","pyoo, one beat","ぴゅうぴゅう","whistling sound"],["ぴょ","pyo","pyoh, one beat","ぴょんぴょん","hopping"],
];
function katakana(value: string): string { return value.replace(/[ぁ-ゖ]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 0x60)); }
function kanaEntries(rows: KanaRow[], group: string, script: "hiragana" | "katakana"): AlphabetEntry[] {
  return rows.map(([symbol, name, pronunciation, example, exampleTranslation]) => ({ id: `ja-${script}-${symbol}`, language: "ja", group, symbol: script === "katakana" ? katakana(symbol) : symbol, name, pronunciation, example: script === "katakana" ? katakana(example) : example, exampleTranslation, audioText: script === "katakana" ? katakana(symbol) : symbol, exampleReading: script === "katakana" ? katakana(example) : example }));
}
const spanish: [string, string, string, string, string][] = [
  ["A a","a","ah","agua","water"],["B b","be","b; softer between vowels","barco","boat"],["C c","ce","k before a/o/u; th in Spain or s before e/i","casa","house"],["D d","de","d; softer between vowels","día","day"],["E e","e","eh","escuela","school"],["F f","efe","f","flor","flower"],["G g","ge","hard g before a/o/u; throaty h before e/i","gato","cat"],["H h","hache","silent","hola","hello"],["I i","i","ee","isla","island"],["J j","jota","throaty h","jardín","garden"],["K k","ka","k","kilómetro","kilometer"],["L l","ele","l","libro","book"],["M m","eme","m","mano","hand"],["N n","ene","n","noche","night"],["Ñ ñ","eñe","ny as in canyon","niño","boy"],["O o","o","oh","ojo","eye"],["P p","pe","p","pan","bread"],["Q q","cu","k; normally written qu before e/i","queso","cheese"],["R r","erre","tap r; trill initially or as rr","rosa","rose"],["S s","ese","s","sol","sun"],["T t","te","t with tongue at teeth","té","tea"],["U u","u","oo","uva","grape"],["V v","uve","same sound family as b","vida","life"],["W w","uve doble","varies in borrowed words","wifi","Wi-Fi"],["X x","equis","usually ks; varies in proper names","examen","exam"],["Y y","ye","y or regionally sh/zh; vowel ee when alone","yo","I"],["Z z","zeta","th in much of Spain; s in Latin America","zapato","shoe"],
];
const greek: [string, string, string, string, string, string][] = [
  ["Α","α","άλφα","ah","αγάπη","love"],["Β","β","βήτα","v","βιβλίο","book"],["Γ","γ","γάμμα","voiced throaty sound; softer before e/i","γάτα","cat"],["Δ","δ","δέλτα","th as in this","δέντρο","tree"],["Ε","ε","έψιλον","eh","ένα","one"],["Ζ","ζ","ζήτα","z","ζάχαρη","sugar"],["Η","η","ήτα","ee","ήλιος","sun"],["Θ","θ","θήτα","th as in thin","θάλασσα","sea"],["Ι","ι","γιώτα","ee","ιστορία","history"],["Κ","κ","κάππα","k","καφές","coffee"],["Λ","λ","λάμδα","l","λεμόνι","lemon"],["Μ","μ","μι","m","μήλο","apple"],["Ν","ν","νι","n","νερό","water"],["Ξ","ξ","ξι","ks","ξύλο","wood"],["Ο","ο","όμικρον","oh","όνομα","name"],["Π","π","πι","p","πόρτα","door"],["Ρ","ρ","ρο","tapped or trilled r","ρύζι","rice"],["Σ","σ","σίγμα","s","σπίτι","house"],["Τ","τ","ταυ","t","τυρί","cheese"],["Υ","υ","ύψιλον","ee","ύπνος","sleep"],["Φ","φ","φι","f","φως","light"],["Χ","χ","χι","unvoiced throaty sound; softer before e/i","χέρι","hand"],["Ψ","ψ","ψι","ps","ψωμί","bread"],["Ω","ω","ωμέγα","oh","ώρα","hour"],
];
export const alphabetEntries: AlphabetEntry[] = [
  ...kanaEntries(basic, "Hiragana", "hiragana"), ...kanaEntries(basic, "Katakana", "katakana"),
  ...kanaEntries(voiced, "Dakuten · Hiragana", "hiragana"), ...kanaEntries(voiced, "Dakuten · Katakana", "katakana"),
  ...kanaEntries(halfVoiced, "Handakuten · Hiragana", "hiragana"), ...kanaEntries(halfVoiced, "Handakuten · Katakana", "katakana"),
  ...kanaEntries(yoon, "Yōon · Hiragana", "hiragana"), ...kanaEntries(yoon, "Yōon · Katakana", "katakana"),
  ...spanish.map(([symbol, name, pronunciation, example, exampleTranslation], index) => ({ id: `es-letter-${index}`, language: "es" as const, group: "Alphabet", symbol, name, pronunciation, example, exampleTranslation, audioText: name })),
  ...greek.flatMap(([upper, lower, name, pronunciation, example, exampleTranslation], index) => ([{ id: `el-upper-${index}`, language: "el" as const, group: "Uppercase", symbol: upper, name, pronunciation, example, exampleTranslation, audioText: name }, { id: `el-lower-${index}`, language: "el" as const, group: "Lowercase", symbol: lower, name, pronunciation, example, exampleTranslation, audioText: name }])),
  { id: "el-final-sigma", language: "el", group: "Final sigma", symbol: "ς", name: "σίγμα τελικό", pronunciation: "s; lowercase sigma at the end of a word", example: "κόσμος", exampleTranslation: "world", audioText: "σίγμα", exampleReading: "κόσμος" },
];
