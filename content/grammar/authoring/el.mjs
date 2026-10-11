// Original learner-facing Modern Greek drafts; publication requires human review.
const e = (text, translation, gap, answer, alternatives) => ({ text, translation, gap, answer, alternatives });
const q = (prompt, choices, correctIndex, explanation) => ({ prompt, choices, correctIndex, explanation });

const lessons = [
  {
    slug: 'subject-pronouns', title: 'Subject pronouns and omitted subjects', level: 'A1', category: 'Pronouns',
    explanation: 'Greek subject pronouns are εγώ, εσύ, αυτός/αυτή/αυτό, εμείς, εσείς and αυτοί/αυτές/αυτά. The verb normally identifies the person, so an explicit pronoun adds emphasis or contrast; it is not required in every sentence.',
    formation: 'Optional subject pronoun + verb agreeing in person and number',
    examples: [
      e('Εγώ μιλάω ελληνικά.', 'I speak Greek.', '___ μιλάω ελληνικά.', 'Εγώ', ['Εσύ', 'Εμείς', 'Εσείς']),
      e('Εμείς μένουμε εδώ.', 'We live here.', '___ μένουμε εδώ.', 'Εμείς', ['Εγώ', 'Εσύ', 'Αυτός']),
      e('Εσείς δουλεύετε αύριο.', 'You work tomorrow.', '___ δουλεύετε αύριο.', 'Εσείς', ['Εμείς', 'Εγώ', 'Αυτή']),
    ],
    checks: [
      q('Which sentence means “We study” with an explicit subject?', ['Εγώ διαβάζω.', 'Εμείς διαβάζουμε.', 'Εσείς διαβάζετε.', 'Αυτοί διαβάζουν.'], 1, 'Εμείς is “we” and agrees with διαβάζουμε.'),
      q('In an ordinary conversation, which statement about Μιλάω ελληνικά is correct?', ['It is missing a compulsory εγώ.', 'It has a plural subject.', 'The first-person verb allows εγώ to be omitted.', 'It can only be a command.'], 2, 'Μιλάω identifies the speaker; an explicit εγώ would add emphasis.'),
    ],
  },
  {
    slug: 'present-eimai', title: 'The present of είμαι', level: 'A1', category: 'Verbs',
    explanation: 'Είμαι means “be” and has the present forms είμαι, είσαι, είναι, είμαστε, είστε and είναι. Use it for identity, location or a description; the form είναι serves both third-person singular and plural.',
    formation: 'είμαι / είσαι / είναι / είμαστε / είστε / είναι + noun, adjective or location',
    examples: [
      e('Είμαι από την Ελλάδα.', 'I am from Greece.', '___ από την Ελλάδα.', 'Είμαι', ['Είσαι', 'Είμαστε', 'Είστε']),
      e('Η Μαρία είναι γιατρός.', 'Maria is a doctor.', 'Η Μαρία ___ γιατρός.', 'είναι', ['είμαι', 'είσαι', 'είμαστε']),
      e('Εμείς είμαστε στο σπίτι.', 'We are at home.', 'Εμείς ___ στο σπίτι.', 'είμαστε', ['είναι', 'είστε', 'είσαι']),
    ],
    checks: [
      q('Choose the form for “You are ready” addressed politely to one person.', ['Είσαι έτοιμος.', 'Είναι έτοιμοι.', 'Είμαστε έτοιμοι.', 'Είστε έτοιμος.'], 3, 'Είστε is also the polite singular form; έτοιμος here describes one man.'),
      q('Complete: Τα παιδιά ___ στο σχολείο.', ['είναι', 'είμαι', 'είσαι', 'είμαστε'], 0, 'Third-person plural uses είναι, the same form as third-person singular.'),
    ],
  },
  {
    slug: 'present-echo', title: 'The present of έχω', level: 'A1', category: 'Verbs',
    explanation: 'Έχω expresses possession and appears in common expressions such as έχω χρόνο and έχω δίκιο. Its endings identify the subject; do not substitute είμαι when the expression requires “have”.',
    formation: 'έχω / έχεις / έχει / έχουμε / έχετε / έχουν + object',
    examples: [
      e('Έχω ένα ποδήλατο.', 'I have a bicycle.', '___ ένα ποδήλατο.', 'Έχω', ['Έχεις', 'Έχουμε', 'Έχετε']),
      e('Εσύ έχεις χρόνο;', 'Do you have time?', 'Εσύ ___ χρόνο;', 'έχεις', ['έχω', 'έχει', 'έχουν']),
      e('Τα παιδιά έχουν βιβλία.', 'The children have books.', 'Τα παιδιά ___ βιβλία.', 'έχουν', ['έχει', 'έχουμε', 'έχετε']),
    ],
    checks: [
      q('Complete: Εμείς ___ δύο γάτες.', ['έχει', 'έχετε', 'έχουμε', 'έχω'], 2, 'Εμείς requires the first-person plural έχουμε.'),
      q('Which expression means “You are right” to one friend?', ['Είσαι δίκιο.', 'Έχεις δίκιο.', 'Έχω δίκιο.', 'Έχετε δίκιο.'], 1, 'The singular informal expression is έχεις δίκιο, literally “you have right”.'),
    ],
  },
  {
    slug: 'definite-articles-singular', title: 'Definite articles: ο, η, το', level: 'A1', category: 'Nouns and articles',
    explanation: 'Singular nominative definite articles are ο for masculine, η for feminine and το for neuter nouns. Learn each noun together with its article: grammatical gender is not reliably inferred from meaning, and objects can have any gender.',
    formation: 'ο + masculine noun / η + feminine noun / το + neuter noun',
    examples: [
      e('Ο φίλος μου είναι εδώ.', 'My friend is here.', '___ φίλος μου είναι εδώ.', 'Ο', ['Η', 'Το', 'Την']),
      e('Η πόρτα είναι ανοιχτή.', 'The door is open.', '___ πόρτα είναι ανοιχτή.', 'Η', ['Ο', 'Το', 'Τον']),
      e('Το παιδί παίζει.', 'The child is playing.', '___ παιδί παίζει.', 'Το', ['Ο', 'Η', 'Την']),
    ],
    checks: [
      q('Choose the correct nominative phrase for “the woman”.', ['ο γυναίκα', 'το γυναίκα', 'η γυναίκα', 'την γυναίκα'], 2, 'Γυναίκα is feminine; η is its nominative singular article.'),
      q('Complete the subject: ___ βιβλίο είναι καινούριο.', ['Το', 'Η', 'Ο', 'Τον'], 0, 'Βιβλίο is neuter, so its singular article is το.'),
    ],
  },
  {
    slug: 'indefinite-articles', title: 'Indefinite articles and gender', level: 'A1', category: 'Nouns and articles',
    explanation: 'Ένας, μία/μια and ένα mean “a/an” or “one” with masculine, feminine and neuter nouns. Greek has no plural indefinite article; a bare plural can mean “some”, and the indefinite article is often omitted when naming a profession after είμαι.',
    formation: 'ένας + masculine / μία or μια + feminine / ένα + neuter',
    examples: [
      e('Ένας μαθητής περιμένει.', 'A student is waiting.', '___ μαθητής περιμένει.', 'Ένας', ['Μία', 'Ένα', 'Έναν']),
      e('Μια γυναίκα διαβάζει.', 'A woman is reading.', '___ γυναίκα διαβάζει.', 'Μια', ['Ένας', 'Ένα', 'Έναν']),
      e('Ένα παιδί γελάει.', 'A child is laughing.', '___ παιδί γελάει.', 'Ένα', ['Ένας', 'Μία', 'Έναν']),
    ],
    checks: [
      q('Which phrase means “a house”?', ['ένας σπίτι', 'μία σπίτι', 'έναν σπίτι', 'ένα σπίτι'], 3, 'Σπίτι is neuter, requiring ένα.'),
      q('Which is an ordinary way to say “I am a doctor” as a profession?', ['Είμαι γιατρός.', 'Έχω γιατρός.', 'Είμαι έναν γιατρό.', 'Είμαι γιατροί.'], 0, 'Greek commonly omits an indefinite article before a profession after είμαι.'),
    ],
  },
  {
    slug: 'masculine-plural-os', title: 'Masculine nouns in -ος: nominative plural', level: 'A1', category: 'Nouns and articles',
    explanation: 'Many masculine nouns ending in -ος form the nominative plural in -οι, with the article οι. This pattern applies to nouns such as φίλος and δρόμος, but stress and irregular nouns must be learned rather than guessed from this rule alone.',
    formation: 'ο φίλος → οι φίλοι; ο δρόμος → οι δρόμοι',
    examples: [
      e('Οι φίλοι είναι εδώ.', 'The friends are here.', 'Οι ___ είναι εδώ.', 'φίλοι', ['φίλος', 'φίλο', 'φίλου']),
      e('Οι δρόμοι είναι ήσυχοι.', 'The streets are quiet.', 'Οι ___ είναι ήσυχοι.', 'δρόμοι', ['δρόμος', 'δρόμο', 'δρόμου']),
      e('Οι κήποι είναι μεγάλοι.', 'The gardens are large.', 'Οι ___ είναι μεγάλοι.', 'κήποι', ['κήπος', 'κήπο', 'κήπου']),
    ],
    checks: [
      q('Choose the nominative plural of ο δάσκαλος.', ['τα δάσκαλα', 'οι δάσκαλοι', 'οι δάσκαλος', 'τους δασκάλους'], 1, 'The masculine nominative plural changes -ος to -οι and uses οι.'),
      q('Complete the subject: ___ άνθρωποι περιμένουν.', ['Ο', 'Το', 'Οι', 'Τον'], 2, 'Άνθρωποι is a masculine nominative plural and takes οι.'),
    ],
  },
  {
    slug: 'feminine-plurals', title: 'Common feminine plurals in -ες', level: 'A1', category: 'Nouns and articles',
    explanation: 'Many feminine nouns in -α or -η form a plural in -ες, for example γάτα → γάτες and φίλη → φίλες. Their nominative plural article is οι; this is a common pattern, not a rule for every feminine noun.',
    formation: 'η γάτα → οι γάτες; η φίλη → οι φίλες',
    examples: [
      e('Οι γάτες κοιμούνται.', 'The cats are sleeping.', 'Οι ___ κοιμούνται.', 'γάτες', ['γάτα', 'γάτας', 'γατών']),
      e('Οι φίλες μου έρχονται.', 'My female friends are coming.', 'Οι ___ μου έρχονται.', 'φίλες', ['φίλη', 'φίλης', 'φιλών']),
      e('Οι πόρτες είναι κλειστές.', 'The doors are closed.', 'Οι ___ είναι κλειστές.', 'πόρτες', ['πόρτα', 'πόρτας', 'πορτών']),
    ],
    checks: [
      q('Choose the nominative plural of η ώρα.', ['οι ώρες', 'τα ώρες', 'οι ώρα', 'η ωρών'], 0, 'Ώρα forms ώρες, with the feminine plural article οι.'),
      q('Complete: Οι τσάντες ___ βαριές.', ['είμαι', 'είσαι', 'είμαστε', 'είναι'], 3, 'A plural subject uses third-person plural είναι; the noun and adjective are feminine plural.'),
    ],
  },
  {
    slug: 'neuter-plurals', title: 'Neuter plurals in -α and -ια', level: 'A1', category: 'Nouns and articles',
    explanation: 'Common neuter nouns in -ο form plurals in -α, while many nouns in -ι form plurals in -ια. The plural article is τα, and neuter nominative and accusative forms are identical; other neuter endings have separate patterns.',
    formation: 'το βιβλίο → τα βιβλία; το παιδί → τα παιδιά',
    examples: [
      e('Τα βιβλία είναι στο τραπέζι.', 'The books are on the table.', 'Τα ___ είναι στο τραπέζι.', 'βιβλία', ['βιβλίο', 'βιβλίου', 'βιβλίων']),
      e('Τα παιδιά παίζουν.', 'The children are playing.', 'Τα ___ παίζουν.', 'παιδιά', ['παιδί', 'παιδιού', 'παιδιών']),
      e('Τα σπίτια είναι μικρά.', 'The houses are small.', 'Τα ___ είναι μικρά.', 'σπίτια', ['σπίτι', 'σπιτιού', 'σπιτιών']),
    ],
    checks: [
      q('Choose the plural of το δώρο.', ['οι δώροι', 'τα δώρα', 'τα δώρος', 'η δώρα'], 1, 'The neuter -ο pattern gives δώρα, with τα.'),
      q('Which article completes ___ τραπέζια?', ['ο', 'η', 'τα', 'οι'], 2, 'Τραπέζια is neuter plural, so its article is τα.'),
    ],
  },
  {
    slug: 'adjective-agreement', title: 'Adjectives agree with nouns', level: 'A1', category: 'Adjectives',
    explanation: 'An adjective agrees with its noun in gender, number and case, even when it follows είμαι. A common pattern is καλός, καλή, καλό; do not use one masculine form for nouns of every gender.',
    formation: 'καλός φίλος / καλή φίλη / καλό παιδί; plural καλοί / καλές / καλά',
    examples: [
      e('Ο κήπος είναι μεγάλος.', 'The garden is large.', 'Ο κήπος είναι ___.', 'μεγάλος', ['μεγάλη', 'μεγάλο', 'μεγάλες']),
      e('Η πόλη είναι μικρή.', 'The city is small.', 'Η πόλη είναι ___.', 'μικρή', ['μικρός', 'μικρό', 'μικρά']),
      e('Τα παιδιά είναι χαρούμενα.', 'The children are happy.', 'Τα παιδιά είναι ___.', 'χαρούμενα', ['χαρούμενος', 'χαρούμενη', 'χαρούμενο']),
    ],
    checks: [
      q('Complete: Θέλω ένα ___ βιβλίο.', ['καλός', 'καλή', 'καλοί', 'καλό'], 3, 'Βιβλίο is neuter singular, so the adjective is καλό.'),
      q('Choose the correctly agreeing phrase.', ['οι καλές φίλες', 'οι καλός φίλες', 'οι καλή φίλες', 'οι καλό φίλες'], 0, 'A feminine plural noun requires feminine plural καλές.'),
    ],
  },
  {
    slug: 'accusative-objects', title: 'Direct objects and accusative articles', level: 'A1', category: 'Cases',
    explanation: 'A direct object normally uses the accusative: τον for masculine, τη(ν) for feminine and το for neuter singular. Nouns and adjectives also change where their declension requires it; the subject remains nominative.',
    formation: 'ο φίλος → βλέπω τον φίλο; η φίλη → βλέπω τη φίλη; το παιδί → βλέπω το παιδί',
    examples: [
      e('Βλέπω τον φίλο μου.', 'I see my friend.', 'Βλέπω ___ φίλο μου.', 'τον', ['ο', 'η', 'του']),
      e('Ανοίγω την πόρτα.', 'I open the door.', 'Ανοίγω ___ πόρτα.', 'την', ['η', 'ο', 'της']),
      e('Διαβάζω το βιβλίο.', 'I am reading the book.', 'Διαβάζω ___ βιβλίο.', 'το', ['ο', 'η', 'τον']),
    ],
    checks: [
      q('Choose “I know the teacher” with masculine δάσκαλος.', ['Ξέρω ο δάσκαλος.', 'Ξέρω τον δάσκαλο.', 'Ξέρω του δασκάλου.', 'Ξέρω το δάσκαλος.'], 1, 'A masculine direct object takes τον and the noun loses nominative -ς.'),
      q('Complete: Η Άννα βλέπει ___ φίλους της.', ['οι', 'των', 'τους', 'τον'], 2, 'The masculine accusative plural article is τους.'),
    ],
  },
  {
    slug: 'direct-object-clitics', title: 'Short direct-object pronouns', level: 'A1', category: 'Pronouns',
    explanation: 'Short accusative pronouns replace a known direct object: με, σε, τον, τη(ν), το, μας, σας, τους, τις and τα. In ordinary present statements they stand before the verb; gender and number follow the object being replaced, not the speaker.',
    formation: 'με / σε / τον / την / το / μας / σας / τους / τις / τα + verb',
    examples: [
      e('Το βιβλίο; Το διαβάζω.', 'The book? I am reading it.', 'Το βιβλίο; ___ διαβάζω.', 'Το', ['Τον', 'Την', 'Τα']),
      e('Οι φίλες; Τις ξέρω.', 'The female friends? I know them.', 'Οι φίλες; ___ ξέρω.', 'Τις', ['Τους', 'Τα', 'Τον']),
      e('Ο Νίκος; Τον βλέπω.', 'Nikos? I see him.', 'Ο Νίκος; ___ βλέπω.', 'Τον', ['Την', 'Το', 'Τους']),
    ],
    checks: [
      q('Replace τη Μαρία in Βλέπω τη Μαρία.', ['Τον βλέπω.', 'Τη βλέπω.', 'Τους βλέπω.', 'Τα βλέπω.'], 1, 'A feminine singular direct object is replaced by τη(ν).'),
      q('Choose the short pronoun for neuter plural τα παιδιά.', ['τους', 'τις', 'το', 'τα'], 3, 'Neuter plural direct objects use τα.'),
    ],
  },
  {
    slug: 'genitive-possession', title: 'Genitive nouns for possession', level: 'A2', category: 'Cases',
    explanation: 'A genitive noun phrase can identify an owner after the thing owned. Singular articles become του, της and του; noun endings follow their own pattern, so possession is not expressed simply by leaving a nominative phrase unchanged.',
    formation: 'thing + του φίλου / της φίλης / του παιδιού',
    examples: [
      e('Αυτό είναι το σπίτι του φίλου μου.', 'This is my friend’s house.', 'Αυτό είναι το σπίτι ___ φίλου μου.', 'του', ['τον', 'ο', 'τους']),
      e('Η τσάντα της Μαρίας είναι εδώ.', 'Maria’s bag is here.', 'Η τσάντα ___ Μαρίας είναι εδώ.', 'της', ['την', 'η', 'τις']),
      e('Το παιχνίδι του παιδιού είναι καινούριο.', 'The child’s toy is new.', 'Το παιχνίδι του ___ είναι καινούριο.', 'παιδιού', ['παιδί', 'παιδιά', 'παιδιών']),
    ],
    checks: [
      q('Choose “the teacher’s book” with masculine δάσκαλος.', ['το βιβλίο τον δάσκαλο', 'το βιβλίο ο δάσκαλος', 'το βιβλίο του δασκάλου', 'το βιβλίο τους δάσκαλοι'], 2, 'The owner is genitive: του δασκάλου, including the noun’s stress change.'),
      q('Which genitive article accompanies a singular feminine owner?', ['της', 'την', 'τις', 'η'], 0, 'Της is feminine genitive singular; την is accusative.'),
    ],
  },
  {
    slug: 'possessive-pronouns', title: 'Short possessives: μου, σου, του', level: 'A1', category: 'Pronouns',
    explanation: 'Short possessive pronouns follow the noun: μου, σου, του, της, του, μας, σας, τους. They identify the owner, not the gender of the possessed object; a noun stressed on the third syllable from the end gains an extra written accent before the clitic.',
    formation: 'noun + μου / σου / του / της / μας / σας / τους',
    examples: [
      e('Το σπίτι μου είναι μικρό.', 'My house is small.', 'Το σπίτι ___ είναι μικρό.', 'μου', ['εγώ', 'εμένα', 'με']),
      e('Πού είναι το βιβλίο σου;', 'Where is your book?', 'Πού είναι το βιβλίο ___;', 'σου', ['εσύ', 'εσένα', 'σε']),
      e('Ο δάσκαλός μας είναι εδώ.', 'Our teacher is here.', 'Ο δάσκαλός ___ είναι εδώ.', 'μας', ['εμείς', 'εμάς', 'εμένα']),
    ],
    checks: [
      q('Anna owns the car. Complete: Το αυτοκίνητο ___ είναι κόκκινο.', ['του', 'τους', 'της', 'σας'], 2, 'The owner is Anna, so feminine singular της is used even though αυτοκίνητο is neuter.'),
      q('Choose “their house”.', ['το σπίτι αυτοί', 'το σπίτι τους', 'το σπίτι αυτοίς', 'το σπίτι τις'], 1, 'The short possessive for plural owners is τους.'),
    ],
  },
  {
    slug: 'demonstratives', title: 'Demonstratives: αυτός and εκείνος', level: 'A1', category: 'Pronouns',
    explanation: 'Αυτός, αυτή, αυτό point to “this”, while εκείνος, εκείνη, εκείνο often point to “that”. Before a noun, the demonstrative normally appears with the definite article and agrees in gender, number and case; it does not replace the article.',
    formation: 'αυτός ο φίλος / αυτή η πόρτα / αυτό το βιβλίο',
    examples: [
      e('Αυτό το βιβλίο είναι δικό μου.', 'This book is mine.', '___ το βιβλίο είναι δικό μου.', 'Αυτό', ['Αυτός', 'Αυτή', 'Αυτοί']),
      e('Αυτή η τσάντα είναι καινούρια.', 'This bag is new.', '___ η τσάντα είναι καινούρια.', 'Αυτή', ['Αυτό', 'Αυτός', 'Αυτά']),
      e('Εκείνος ο δρόμος είναι κλειστός.', 'That street is closed.', '___ ο δρόμος είναι κλειστός.', 'Εκείνος', ['Εκείνη', 'Εκείνο', 'Εκείνα']),
    ],
    checks: [
      q('Choose the correctly formed phrase “these children”.', ['αυτό τα παιδιά', 'αυτοί τα παιδιά', 'αυτές τα παιδιά', 'αυτά τα παιδιά'], 3, 'Παιδιά is neuter plural, so the demonstrative is αυτά.'),
      q('Complete: Μου αρέσει ___ η μουσική.', ['αυτή', 'αυτός', 'αυτό', 'αυτοί'], 0, 'Μουσική is feminine singular, requiring αυτή before η μουσική.'),
    ],
  },
  {
    slug: 'interrogative-poios', title: 'Who and which: ποιος', level: 'A1', category: 'Questions',
    explanation: 'Ποιος, ποια and ποιο ask “who” or “which” and change to agree with a following noun or an identified person. Their case follows their role in the sentence: a masculine object uses ποιον, not nominative ποιος.',
    formation: 'ποιος / ποια / ποιο + noun; masculine accusative ποιον',
    examples: [
      e('Ποιος μαθητής μιλάει;', 'Which student is speaking?', '___ μαθητής μιλάει;', 'Ποιος', ['Ποια', 'Ποιο', 'Ποιον']),
      e('Ποια πόλη σου αρέσει;', 'Which city do you like?', '___ πόλη σου αρέσει;', 'Ποια', ['Ποιος', 'Ποιο', 'Ποιοι']),
      e('Ποιον φίλο περιμένεις;', 'Which friend are you waiting for?', '___ φίλο περιμένεις;', 'Ποιον', ['Ποιος', 'Ποια', 'Ποιοι']),
    ],
    checks: [
      q('Complete: ___ βιβλίο θέλεις;', ['Ποιος', 'Ποια', 'Ποιο', 'Ποιοι'], 2, 'Βιβλίο is neuter singular, so ποιο agrees with it.'),
      q('Choose “Who is coming?” about one person without specifying gender.', ['Ποιος έρχεται;', 'Ποιον έρχεται;', 'Ποιους έρχεται;', 'Ποιων έρχεται;'], 0, 'The interrogative is the subject and takes nominative ποιος.'),
    ],
  },
  {
    slug: 'ti-versus-poio', title: 'What versus which: τι and ποιο', level: 'A1', category: 'Questions',
    explanation: 'Τι is invariable and asks “what” or “what kind of”, while ποιος/ποια/ποιο usually selects an identifiable person or item. Context can allow either question with a different emphasis, so distinguish an open request for information from a stated choice between alternatives.',
    formation: 'τι + verb or noun; ποιος/ποια/ποιο + agreeing noun for a selection',
    examples: [
      e('Τι σημαίνει αυτή η λέξη;', 'What does this word mean?', '___ σημαίνει αυτή η λέξη;', 'Τι', ['Ποιος', 'Ποιον', 'Ποιων']),
      e('Ποιο από τα δύο βιβλία θέλεις;', 'Which of the two books do you want?', '___ από τα δύο βιβλία θέλεις;', 'Ποιο', ['Ποιος', 'Ποια', 'Ποιοι']),
      e('Τι ώρα είναι;', 'What time is it?', '___ ώρα είναι;', 'Τι', ['Ποιον', 'Ποιους', 'Ποιων']),
    ],
    checks: [
      q('Which question asks openly what someone is doing?', ['Ποιον κάνεις;', 'Τι κάνεις;', 'Ποιων κάνεις;', 'Ποιος κάνεις;'], 1, 'Τι κάνεις; asks “What are you doing?”; τι does not inflect.'),
      q('Complete a choice between two named cities: ___ από τις δύο πόλεις προτιμάς;', ['Ποιος', 'Ποιο', 'Ποιοι', 'Ποια'], 3, 'Ποια agrees with feminine singular πόλη when selecting one of the two cities.'),
    ],
  },
  {
    slug: 'present-first-conjugation', title: 'Present verbs in -ω', level: 'A1', category: 'Verbs',
    explanation: 'Many unstressed -ω verbs use the endings -ω, -εις, -ει, -ουμε, -ετε and -ουν(ε). The present can describe a habit or an action happening now; it does not by itself distinguish English simple and continuous forms.',
    formation: 'γράφω, γράφεις, γράφει, γράφουμε, γράφετε, γράφουν',
    examples: [
      e('Εγώ γράφω ένα γράμμα.', 'I am writing a letter.', 'Εγώ ___ ένα γράμμα.', 'γράφω', ['γράφεις', 'γράφει', 'γράφουν']),
      e('Εσύ μένεις στην Αθήνα.', 'You live in Athens.', 'Εσύ ___ στην Αθήνα.', 'μένεις', ['μένω', 'μένει', 'μένουμε']),
      e('Εμείς δουλεύουμε σήμερα.', 'We are working today.', 'Εμείς ___ σήμερα.', 'δουλεύουμε', ['δουλεύω', 'δουλεύεις', 'δουλεύουν']),
    ],
    checks: [
      q('Complete: Η Άννα ___ κάθε μέρα.', ['διαβάζω', 'διαβάζεις', 'διαβάζουμε', 'διαβάζει'], 3, 'A third-person singular subject uses -ει: διαβάζει.'),
      q('Which form of παίζω agrees with εσείς?', ['παίζετε', 'παίζουμε', 'παίζουν', 'παίζεις'], 0, 'Second-person plural takes -ετε: παίζετε.'),
    ],
  },
  {
    slug: 'present-ao-verbs', title: 'Present verbs in -άω / -ώ', level: 'A1', category: 'Verbs',
    explanation: 'Verbs such as μιλάω/μιλώ and αγαπάω/αγαπώ belong to a common stressed-ending pattern. Several forms have accepted contracted and uncontracted variants, but the second-person singular remains -άς rather than the -εις of γράφεις.',
    formation: 'μιλάω/μιλώ, μιλάς, μιλάει/μιλά, μιλάμε, μιλάτε, μιλάνε/μιλούν',
    examples: [
      e('Εσύ μιλάς ελληνικά.', 'You speak Greek.', 'Εσύ ___ ελληνικά.', 'μιλάς', ['μιλάω', 'μιλάμε', 'μιλάτε']),
      e('Εμείς αγαπάμε τη μουσική.', 'We love music.', 'Εμείς ___ τη μουσική.', 'αγαπάμε', ['αγαπάς', 'αγαπάτε', 'αγαπάω']),
      e('Εσείς περπατάτε γρήγορα.', 'You walk quickly.', 'Εσείς ___ γρήγορα.', 'περπατάτε', ['περπατάω', 'περπατάς', 'περπατάμε']),
    ],
    checks: [
      q('Complete: Εσύ ___ πολύ καλά.', ['τραγουδάω', 'τραγουδάς', 'τραγουδάμε', 'τραγουδάτε'], 1, 'Second-person singular in this pattern has -άς: τραγουδάς.'),
      q('Which pair contains two accepted first-person singular forms?', ['μιλάς / μιλάτε', 'μιλάμε / μιλούν', 'μιλάω / μιλώ', 'μιλάει / μιλάς'], 2, 'Μιλάω and μιλώ are common variants of “I speak”.'),
    ],
  },
  {
    slug: 'present-o-eis-verbs', title: 'Present verbs in -ώ, -είς', level: 'A1', category: 'Verbs',
    explanation: 'Stressed -ώ verbs such as μπορώ and αργώ use -είς in the second-person singular and -εί in the third-person singular. They differ from the μιλάω pattern, so learn which conjugation each verb follows rather than adding -άς automatically.',
    formation: 'μπορώ, μπορείς, μπορεί, μπορούμε, μπορείτε, μπορούν',
    examples: [
      e('Εσύ μπορείς να έρθεις.', 'You can come.', 'Εσύ ___ να έρθεις.', 'μπορείς', ['μπορώ', 'μπορεί', 'μπορούμε']),
      e('Η Άννα αργεί σήμερα.', 'Anna is late today.', 'Η Άννα ___ σήμερα.', 'αργεί', ['αργώ', 'αργείς', 'αργούμε']),
      e('Εμείς μπορούμε να βοηθήσουμε.', 'We can help.', 'Εμείς ___ να βοηθήσουμε.', 'μπορούμε', ['μπορώ', 'μπορείς', 'μπορείτε']),
    ],
    checks: [
      q('Choose the polite request to one person: “Can you help?”', ['Μπορώ να βοηθήσω;', 'Μπορείς να βοηθήσεις;', 'Μπορεί να βοηθήσει;', 'Μπορείτε να βοηθήσετε;'], 3, 'Μπορείτε is second-person plural and also the polite singular form.'),
      q('Complete: Οι φίλοι μου ___ συχνά.', ['αργούν', 'αργώ', 'αργείς', 'αργείτε'], 0, 'A third-person plural subject takes αργούν.'),
    ],
  },
  {
    slug: 'negation-den', title: 'Negating statements with δεν', level: 'A1', category: 'Sentence structure',
    explanation: 'Δεν negates an ordinary indicative statement and normally comes before the verb or a short object pronoun. Use μην in negative να-clauses and prohibitions instead; δεν is not a universal replacement for every English “not”.',
    formation: 'δεν + (object pronoun) + indicative verb; δεν + θα + future verb',
    examples: [
      e('Δεν έχω χρόνο.', 'I do not have time.', '___ έχω χρόνο.', 'Δεν', ['Μην', 'Να', 'Θα']),
      e('Δεν τον ξέρω.', 'I do not know him.', '___ τον ξέρω.', 'Δεν', ['Μην', 'Να', 'Ας']),
      e('Δεν θα έρθω αύριο.', 'I will not come tomorrow.', '___ θα έρθω αύριο.', 'Δεν', ['Μην', 'Να', 'Ας']),
    ],
    checks: [
      q('Choose “I do not understand”.', ['Μην καταλαβαίνω.', 'Δεν καταλαβαίνω.', 'Να καταλαβαίνω.', 'Θα καταλαβαίνω.'], 1, 'An ordinary negative present statement uses δεν.'),
      q('Which word order correctly means “I do not see him”?', ['Τον δεν βλέπω.', 'Βλέπω τον δεν.', 'Δεν τον βλέπω.', 'Δεν βλέπω δεν τον.'], 2, 'Δεν precedes the preverbal short object pronoun: δεν τον βλέπω.'),
    ],
  },
  {
    slug: 'yes-no-questions', title: 'Yes–no questions and Greek punctuation', level: 'A1', category: 'Questions',
    explanation: 'A yes–no question can use the same word order as a statement, with questioning intonation. Written Greek uses the semicolon-shaped question mark (;); it does not require an auxiliary equivalent to English “do”.',
    formation: 'statement word order + questioning intonation + ;',
    examples: [
      e('Μιλάς ελληνικά;', 'Do you speak Greek?', '___ ελληνικά;', 'Μιλάς', ['Μιλάω', 'Μιλάμε', 'Μιλάτε']),
      e('Είσαι έτοιμος;', 'Are you ready?', '___ έτοιμος;', 'Είσαι', ['Είμαι', 'Είμαστε', 'Είναι']),
      e('Η Μαρία μένει εδώ;', 'Does Maria live here?', 'Η Μαρία ___ εδώ;', 'μένει', ['μένω', 'μένεις', 'μένουμε']),
    ],
    checks: [
      q('Which written punctuation mark normally ends a Greek direct question?', [':', '.', ';', ','], 2, 'The Greek question mark has the shape of an English semicolon.'),
      q('Choose an ordinary yes–no question meaning “Do you have time?” to one friend.', ['Έχεις χρόνο;', 'Κάνεις έχεις χρόνο;', 'Έχω χρόνο;', 'Είσαι έχεις χρόνο;'], 0, 'Greek asks Έχεις χρόνο; without an English-style “do” auxiliary.'),
    ],
  },
  {
    slug: 'question-words', title: 'Where, when, how and why', level: 'A1', category: 'Questions',
    explanation: 'Πού asks where, πότε asks when, πώς asks how and γιατί asks why. Interrogative πού and πώς carry an accent to distinguish them from unaccented linking words; choose the question word for the information actually requested.',
    formation: 'πού / πότε / πώς / γιατί + clause + ;',
    examples: [
      e('Πού είναι ο σταθμός;', 'Where is the station?', '___ είναι ο σταθμός;', 'Πού', ['Πότε', 'Πώς', 'Πόσο']),
      e('Πότε φεύγει το τρένο;', 'When does the train leave?', '___ φεύγει το τρένο;', 'Πότε', ['Ποιος', 'Ποια', 'Ποιο']),
      e('Πώς σε λένε;', 'What is your name?', '___ σε λένε;', 'Πώς', ['Πόσο', 'Πότε', 'Ποιον']),
    ],
    checks: [
      q('You want the reason someone is late. Choose the question word: ___ άργησες;', ['Πού', 'Γιατί', 'Πόσο', 'Ποιο'], 1, 'Γιατί asks for a reason: “Why were you late?”'),
      q('Which question asks for a location?', ['Πότε δουλεύεις;', 'Πώς δουλεύεις;', 'Γιατί δουλεύεις;', 'Πού δουλεύεις;'], 3, 'Πού asks where; πότε asks when.'),
    ],
  },
  {
    slug: 'se-article-contractions', title: 'Σε plus an article: στον, στην, στο', level: 'A1', category: 'Prepositions',
    explanation: 'Σε often expresses location or destination and combines with the definite accusative article. Use στον, στη(ν), στο, στους, στις and στα; the contraction still agrees with the noun and does not determine whether English needs “in”, “at” or “to”.',
    formation: 'σε + τον → στον; σε + την → στην; σε + το → στο',
    examples: [
      e('Πάω στον σταθμό.', 'I am going to the station.', 'Πάω ___ σταθμό.', 'στον', ['στην', 'στο', 'στις']),
      e('Μένω στην Αθήνα.', 'I live in Athens.', 'Μένω ___ Αθήνα.', 'στην', ['στον', 'στο', 'στους']),
      e('Το βιβλίο είναι στο τραπέζι.', 'The book is on the table.', 'Το βιβλίο είναι ___ τραπέζι.', 'στο', ['στον', 'στην', 'στις']),
    ],
    checks: [
      q('Complete: Τα παιδιά πηγαίνουν ___ σχολείο.', ['στον', 'στην', 'στο', 'στις'], 2, 'Σχολείο is neuter singular: σε + το becomes στο.'),
      q('What is σε + τους?', ['στους', 'στις', 'στα', 'στον'], 0, 'The masculine accusative plural contraction is στους.'),
    ],
  },
  {
    slug: 'basic-prepositions', title: 'Από, με and για', level: 'A1', category: 'Prepositions',
    explanation: 'Από can indicate origin, με accompaniment or means, and για a recipient or purpose. These common prepositions normally take the accusative in everyday Modern Greek; their meanings are context-dependent and do not map to one English preposition in every phrase.',
    formation: 'από / με / για + accusative noun phrase',
    examples: [
      e('Είμαι από την Ελλάδα.', 'I am from Greece.', 'Είμαι ___ την Ελλάδα.', 'από', ['μέσα', 'πάνω', 'δίπλα']),
      e('Γράφω με ένα μολύβι.', 'I write with a pencil.', 'Γράφω ___ ένα μολύβι.', 'με', ['μέσα', 'έξω', 'κοντά']),
      e('Αυτό το δώρο είναι για τη Μαρία.', 'This present is for Maria.', 'Αυτό το δώρο είναι ___ τη Μαρία.', 'για', ['μέσα', 'πάνω', 'κάτω']),
    ],
    checks: [
      q('Choose “I come from Spain”.', ['Έρχομαι με την Ισπανία.', 'Έρχομαι για την Ισπανία.', 'Έρχομαι την Ισπανία.', 'Έρχομαι από την Ισπανία.'], 3, 'Από marks the place of origin.'),
      q('Which phrase correctly uses με for accompaniment?', ['με ο φίλος', 'με τον φίλο μου', 'με του φίλου', 'με οι φίλοι'], 1, 'Με takes an accusative phrase here: τον φίλο μου.'),
    ],
  },
  {
    slug: 'location-expressions', title: 'Location expressions with σε and από', level: 'A1', category: 'Prepositions',
    explanation: 'Many location expressions combine an adverb with a preposition: πάνω σε, κάτω από, μπροστά σε and δίπλα σε. Learn the whole expression; replacing its preposition freely can change or spoil the intended relation.',
    formation: 'πάνω στο / κάτω από το / μπροστά στο / δίπλα στο + noun',
    examples: [
      e('Η γάτα είναι κάτω από το τραπέζι.', 'The cat is under the table.', 'Η γάτα είναι κάτω ___ το τραπέζι.', 'από', ['σε', 'για', 'με']),
      e('Το βιβλίο είναι πάνω στο γραφείο.', 'The book is on the desk.', 'Το βιβλίο είναι πάνω ___ γραφείο.', 'στο', ['τον', 'του', 'το']),
      e('Το φαρμακείο είναι δίπλα στο σχολείο.', 'The pharmacy is next to the school.', 'Το φαρμακείο είναι δίπλα ___ σχολείο.', 'στο', ['τον', 'του', 'την']),
    ],
    checks: [
      q('Choose “in front of the house”.', ['μπροστά το σπίτι', 'μπροστά του σπίτι', 'μπροστά στο σπίτι', 'μπροστά τον σπίτι'], 2, 'The usual expression is μπροστά σε, contracted here to μπροστά στο.'),
      q('Which expression means “under the chair”?', ['κάτω από την καρέκλα', 'πάνω στην καρέκλα', 'δίπλα στην καρέκλα', 'μπροστά στην καρέκλα'], 0, 'Κάτω από expresses a position below something.'),
    ],
  },
  {
    slug: 'existence-yparchei', title: 'There is and there are: υπάρχει', level: 'A1', category: 'Verbs',
    explanation: 'Υπάρχει introduces the existence of a singular thing, while υπάρχουν introduces plural things. It is useful for saying what is available somewhere; use είναι instead when locating an already identified object.',
    formation: 'υπάρχει + singular noun; υπάρχουν + plural noun',
    examples: [
      e('Υπάρχει ένα πάρκο εδώ.', 'There is a park here.', '___ ένα πάρκο εδώ.', 'Υπάρχει', ['Υπάρχουν', 'Υπάρχουμε', 'Υπάρχετε']),
      e('Υπάρχουν δύο τράπεζες στην πλατεία.', 'There are two banks in the square.', '___ δύο τράπεζες στην πλατεία.', 'Υπάρχουν', ['Υπάρχει', 'Υπάρχω', 'Υπάρχεις']),
      e('Δεν υπάρχει λεωφορείο τώρα.', 'There is no bus now.', 'Δεν ___ λεωφορείο τώρα.', 'υπάρχει', ['υπάρχουν', 'υπάρχουμε', 'υπάρχετε']),
    ],
    checks: [
      q('Complete: ___ πολλά βιβλία στη βιβλιοθήκη.', ['Υπάρχω', 'Υπάρχουν', 'Υπάρχεις', 'Υπάρχει'], 1, 'The plural subject πολλά βιβλία requires υπάρχουν.'),
      q('You are locating a specific known book. Choose “The book is here”.', ['Το βιβλίο υπάρχουν εδώ.', 'Το βιβλίο υπάρχω εδώ.', 'Το βιβλίο είμαι εδώ.', 'Το βιβλίο είναι εδώ.'], 3, 'A known object’s location is expressed with είναι.'),
    ],
  },
  {
    slug: 'gendered-numbers', title: 'Numbers that change with gender', level: 'A1', category: 'Numbers',
    explanation: 'The number one changes as ένας, μία/μια, ένα; three has τρεις for masculine/feminine and τρία for neuter, and four similarly has τέσσερις/τέσσερα. Most cardinal numbers such as δύο do not change with gender, so do not attach adjective endings to every number.',
    formation: 'τρεις φίλοι / τρεις φίλες / τρία παιδιά; τέσσερις / τέσσερα',
    examples: [
      e('Τρεις φίλοι περιμένουν.', 'Three friends are waiting.', '___ φίλοι περιμένουν.', 'Τρεις', ['Τρία', 'Τριών', 'Τρίτος']),
      e('Έχω τρία βιβλία.', 'I have three books.', 'Έχω ___ βιβλία.', 'τρία', ['τρεις', 'τριών', 'τρίτη']),
      e('Βλέπω τέσσερις γάτες.', 'I see four cats.', 'Βλέπω ___ γάτες.', 'τέσσερις', ['τέσσερα', 'τεσσάρων', 'τέταρτη']),
    ],
    checks: [
      q('Complete: Έχω ___ παιδιά. (“four”)', ['τέσσερις', 'τεσσάρων', 'τέσσερα', 'τέταρτος'], 2, 'Παιδιά is neuter plural, requiring τέσσερα.'),
      q('Which number is unchanged before masculine, feminine and neuter nouns?', ['δύο', 'ένας', 'τρεις', 'τέσσερις'], 0, 'Δύο is invariable; one, three and four have gender-sensitive forms.'),
    ],
  },
  {
    slug: 'polys-versus-poly', title: 'Much, many and very: πολύς and πολύ', level: 'A2', category: 'Quantity',
    explanation: 'As an adjective, πολύς changes to agree with the noun: πολλή δουλειά, πολύ νερό, πολλοί φίλοι, πολλά βιβλία. The adverb πολύ means “very” or “a lot” and stays unchanged before adjectives or with verbs; note the spelling contrast πολλή versus πολύ.',
    formation: 'πολύς / πολλή / πολύ + noun; invariable πολύ + adjective or verb',
    examples: [
      e('Έχω πολλή δουλειά.', 'I have a lot of work.', 'Έχω ___ δουλειά.', 'πολλή', ['πολύ', 'πολλοί', 'πολλά']),
      e('Αυτό το βιβλίο είναι πολύ καλό.', 'This book is very good.', 'Αυτό το βιβλίο είναι ___ καλό.', 'πολύ', ['πολλή', 'πολλοί', 'πολλές']),
      e('Υπάρχουν πολλά παιδιά εδώ.', 'There are many children here.', 'Υπάρχουν ___ παιδιά εδώ.', 'πολλά', ['πολύ', 'πολλή', 'πολλοί']),
    ],
    checks: [
      q('Complete: Η Μαρία είναι ___ κουρασμένη.', ['πολλή', 'πολύ', 'πολλές', 'πολλοί'], 1, 'Before the adjective κουρασμένη, the intensifying adverb is invariable πολύ.'),
      q('Choose “many friends” with masculine φίλοι.', ['πολύ φίλοι', 'πολλή φίλοι', 'πολλές φίλοι', 'πολλοί φίλοι'], 3, 'The adjective agrees with masculine plural φίλοι: πολλοί.'),
    ],
  },
  {
    slug: 'comparatives-pio', title: 'Comparisons with πιο and από', level: 'A2', category: 'Adjectives',
    explanation: 'Πιο before an adjective forms a comparison such as πιο μικρός, “smaller”. Από introduces the comparison standard, and the adjective still agrees with its subject; some adjectives also have separate comparative forms such as καλύτερος.',
    formation: 'subject + είμαι + πιο + agreeing adjective + από + comparison',
    examples: [
      e('Ο Νίκος είναι πιο ψηλός από τον Πέτρο.', 'Nikos is taller than Petros.', 'Ο Νίκος είναι ___ ψηλός από τον Πέτρο.', 'πιο', ['ο', 'η', 'τα']),
      e('Η τσάντα μου είναι πιο μικρή από τη δική σου.', 'My bag is smaller than yours.', 'Η τσάντα μου είναι πιο ___ από τη δική σου.', 'μικρή', ['μικρός', 'μικρό', 'μικροί']),
      e('Αυτό το σπίτι είναι πιο μεγάλο από εκείνο.', 'This house is larger than that one.', 'Αυτό το σπίτι είναι πιο μεγάλο ___ εκείνο.', 'από', ['για', 'με', 'μέχρι']),
    ],
    checks: [
      q('Choose “The book is cheaper than the bag”.', ['Το βιβλίο είναι πιο φτηνός από την τσάντα.', 'Το βιβλίο είναι πιο φτηνή από την τσάντα.', 'Το βιβλίο είναι πιο φτηνό από την τσάντα.', 'Το βιβλίο είναι πιο φτηνοί από την τσάντα.'], 2, 'The comparative adjective agrees with neuter βιβλίο: φτηνό.'),
      q('Which word normally introduces the standard in πιο ψηλός ___ εμένα?', ['από', 'και', 'ή', 'μετά'], 0, 'Από introduces the person or thing being compared against.'),
    ],
  },
  {
    slug: 'relative-superlatives', title: 'The most: article plus πιο', level: 'A2', category: 'Adjectives',
    explanation: 'A definite article with πιο and an adjective expresses a relative superlative: ο πιο ψηλός, “the tallest”. This selects the highest degree within a group; it differs from πολύ ψηλός, which only says “very tall”.',
    formation: 'definite article + πιο + adjective + noun; optional group phrase',
    examples: [
      e('Αυτός είναι ο πιο ψηλός μαθητής.', 'He is the tallest student.', 'Αυτός είναι ___ πιο ψηλός μαθητής.', 'ο', ['η', 'το', 'οι']),
      e('Αυτή είναι η πιο μεγάλη αίθουσα.', 'This is the largest room.', 'Αυτή είναι ___ πιο μεγάλη αίθουσα.', 'η', ['ο', 'το', 'τα']),
      e('Αυτό είναι το πιο φτηνό δωμάτιο.', 'This is the cheapest room.', 'Αυτό είναι ___ πιο φτηνό δωμάτιο.', 'το', ['ο', 'η', 'οι']),
    ],
    checks: [
      q('Which phrase means “the most beautiful city”?', ['μια πολύ όμορφη πόλη', 'μια πιο όμορφη πόλη', 'η όμορφη πιο πόλη', 'η πιο όμορφη πόλη'], 3, 'The definite article plus πιο forms the relative superlative.'),
      q('Complete: Αυτά είναι τα πιο ___ σπίτια.', ['μεγάλος', 'μεγάλα', 'μεγάλη', 'μεγάλο'], 1, 'Σπίτια is neuter plural, so the superlative adjective remains μεγάλα.'),
    ],
  },
  {
    slug: 'adverbs-manner', title: 'Adverbs of manner in -α', level: 'A2', category: 'Adverbs',
    explanation: 'Many adjectives form an adverb in -α, such as γρήγορος → γρήγορα and αργός → αργά. Adverbs describe how an action happens and do not agree with the subject; the -α pattern is common but not universal.',
    formation: 'verb + γρήγορα / αργά / καλά / όμορφα',
    examples: [
      e('Η Μαρία μιλάει αργά.', 'Maria speaks slowly.', 'Η Μαρία μιλάει ___.', 'αργά', ['αργή', 'αργός', 'αργές']),
      e('Ο Νίκος τρέχει γρήγορα.', 'Nikos runs quickly.', 'Ο Νίκος τρέχει ___.', 'γρήγορα', ['γρήγορος', 'γρήγορη', 'γρήγοροι']),
      e('Τα παιδιά τραγουδούν όμορφα.', 'The children sing beautifully.', 'Τα παιδιά τραγουδούν ___.', 'όμορφα', ['όμορφος', 'όμορφη', 'όμορφοι']),
    ],
    checks: [
      q('Choose the sentence with an adverb describing how Anna writes.', ['Η Άννα γράφει καλός.', 'Η Άννα γράφει καλή.', 'Η Άννα γράφει καλά.', 'Η Άννα γράφει καλοί.'], 2, 'Καλά modifies γράφει; it does not agree with Anna’s gender.'),
      q('In Ο Νίκος είναι γρήγορος, what is γρήγορος?', ['An adjective agreeing with Νίκος', 'An invariable adverb modifying είναι', 'A feminine plural noun', 'A past-tense verb'], 0, 'After είμαι, γρήγορος describes the subject and agrees with it.'),
    ],
  },
  {
    slug: 'ability-mporo-na', title: 'Ability and permission with μπορώ να', level: 'A1', category: 'Modal constructions',
    explanation: 'Μπορώ να introduces what someone can do and can also make a request for permission. Greek uses να followed by a finite verb, not an English-style infinitive; with the same doer, the two verbs agree in person.',
    formation: 'μπορώ / μπορείς / μπορεί … + να + agreeing verb',
    examples: [
      e('Μπορώ να έρθω αύριο.', 'I can come tomorrow.', 'Μπορώ ___ έρθω αύριο.', 'να', ['ότι', 'που', 'γιατί']),
      e('Μπορείς να ανοίξεις την πόρτα;', 'Can you open the door?', 'Μπορείς να ___ την πόρτα;', 'ανοίξεις', ['ανοίξω', 'ανοίξουμε', 'ανοίξουν']),
      e('Μπορούμε να φύγουμε τώρα.', 'We can leave now.', 'Μπορούμε να ___ τώρα.', 'φύγουμε', ['φύγω', 'φύγεις', 'φύγουν']),
    ],
    checks: [
      q('Choose “I can help”.', ['Μπορώ να βοηθήσεις.', 'Μπορώ να βοηθήσω.', 'Μπορώ ότι βοηθήσω.', 'Μπορώ βοηθώ να.'], 1, 'The first-person forms μπορώ and βοηθήσω share the same subject and are linked by να.'),
      q('Complete a permission request: ___ να καθίσω εδώ; (“May I sit here?”)', ['Μπορείς', 'Μπορούμε', 'Μπορείτε', 'Μπορώ'], 3, 'The speaker asks about their own permission, using μπορώ and καθίσω.'),
    ],
  },
  {
    slug: 'desire-thelo-na', title: 'Wanting with θέλω να', level: 'A1', category: 'Modal constructions',
    explanation: 'Θέλω να expresses wanting to do something, with a finite verb after να. A different subject is possible in the second clause, so the second verb follows the person who would perform that action rather than automatically copying θέλω.',
    formation: 'θέλω + να + finite verb; θέλω να φύγω / θέλω να φύγεις',
    examples: [
      e('Θέλω να μάθω ελληνικά.', 'I want to learn Greek.', 'Θέλω ___ μάθω ελληνικά.', 'να', ['ότι', 'που', 'αν']),
      e('Θέλουμε να φάμε τώρα.', 'We want to eat now.', 'Θέλουμε να ___ τώρα.', 'φάμε', ['φάω', 'φας', 'φάνε']),
      e('Θέλω να έρθεις μαζί μου.', 'I want you to come with me.', 'Θέλω να ___ μαζί μου.', 'έρθεις', ['έρθω', 'έρθουμε', 'έρθετε']),
    ],
    checks: [
      q('Which sentence means “I want to leave” rather than “I want you to leave”?', ['Θέλω να φύγεις.', 'Θέλω να φύγετε.', 'Θέλω να φύγω.', 'Θέλω να φύγουν.'], 2, 'Φύγω identifies the speaker as the person who leaves.'),
      q('Complete: Η Μαρία θέλει ___ κοιμηθεί.', ['να', 'ότι', 'γιατί', 'που'], 0, 'A wanted action is linked to θέλει by να.'),
    ],
  },
  {
    slug: 'necessity-prepei-na', title: 'Necessity with πρέπει να', level: 'A1', category: 'Modal constructions',
    explanation: 'Πρέπει να expresses obligation or necessity. Πρέπει stays in the third-person singular in this impersonal construction, while the verb after να identifies who must act; it does not become πρέπειμε for “we must”.',
    formation: 'πρέπει + να + verb agreeing with the person who acts',
    examples: [
      e('Πρέπει να φύγω.', 'I must leave.', 'Πρέπει να ___.', 'φύγω', ['φύγεις', 'φύγουμε', 'φύγετε']),
      e('Πρέπει να διαβάσεις σήμερα.', 'You must study today.', 'Πρέπει ___ διαβάσεις σήμερα.', 'να', ['ότι', 'που', 'αν']),
      e('Πρέπει να πάμε στο σχολείο.', 'We must go to school.', 'Πρέπει να ___ στο σχολείο.', 'πάμε', ['πάω', 'πας', 'πάνε']),
    ],
    checks: [
      q('Choose “We must work”.', ['Πρέπειμε να δουλέψουμε.', 'Πρέπει να δουλέψουμε.', 'Πρέπει να δουλέψω.', 'Πρέπει να δουλέψεις.'], 1, 'Πρέπει is impersonal; δουλέψουμε marks the first-person plural.'),
      q('Which phrase means “You must wait” to one friend?', ['Πρέπει να περιμένω.', 'Πρέπει να περιμένουμε.', 'Πρέπει να περιμένουν.', 'Πρέπει να περιμένεις.'], 3, 'Second-person singular περιμένεις identifies the person obliged to wait.'),
    ],
  },
  {
    slug: 'future-aspect', title: 'Future actions with θα', level: 'A2', category: 'Tense and aspect',
    explanation: 'Θα forms future expressions with a finite verb. The imperfective stem can present an ongoing or repeated future action, while the perfective stem presents an action as a whole; the distinction concerns viewpoint, not simply how long an action lasts.',
    formation: 'θα γράφω (ongoing/repeated) / θα γράψω (action as a whole)',
    examples: [
      e('Αύριο θα γράψω ένα γράμμα.', 'Tomorrow I will write a letter.', 'Αύριο ___ γράψω ένα γράμμα.', 'θα', ['να', 'ότι', 'που']),
      e('Το καλοκαίρι θα διαβάζω κάθε μέρα.', 'In the summer I will study every day.', 'Το καλοκαίρι θα ___ κάθε μέρα.', 'διαβάζω', ['διάβασα', 'διάβαζα', 'διαβάσαμε']),
      e('Θα αγοράσουμε ένα εισιτήριο αύριο.', 'We will buy a ticket tomorrow.', 'Θα ___ ένα εισιτήριο αύριο.', 'αγοράσουμε', ['αγόρασα', 'αγοράσαμε', 'αγόραζα']),
    ],
    checks: [
      q('Which sentence presents one letter as a whole future task?', ['Θα γράφω γράμματα κάθε μέρα.', 'Έγραφα ένα γράμμα.', 'Θα γράψω ένα γράμμα αύριο.', 'Γράφω ένα γράμμα τώρα.'], 2, 'Θα γράψω uses the perfective stem for the intended complete task.'),
      q('Choose the usual future particle.', ['θα', 'ότι', 'που', 'επειδή'], 0, 'Θα precedes the finite verb in future expressions.'),
    ],
  },
  {
    slug: 'regular-aorist', title: 'Simple past: common aorist patterns', level: 'A2', category: 'Tense and aspect',
    explanation: 'The aorist presents a past event as a whole, often with a time such as χθες. Many verbs form it with a changed stem and endings -α, -ες, -ε, -αμε, -ατε, -αν; changes such as διαβάζω → διάβασα must be learned, not mechanically applied to all verbs.',
    formation: 'διαβάζω → διάβασα, διάβασες, διάβασε, διαβάσαμε, διαβάσατε, διάβασαν',
    examples: [
      e('Χθες διάβασα ένα βιβλίο.', 'Yesterday I read a book.', 'Χθες ___ ένα βιβλίο.', 'διάβασα', ['διαβάζω', 'διαβάζει', 'διαβάζουμε']),
      e('Η Μαρία αγόρασε ψωμί.', 'Maria bought bread.', 'Η Μαρία ___ ψωμί.', 'αγόρασε', ['αγόρασα', 'αγόρασες', 'αγοράσαμε']),
      e('Εμείς μιλήσαμε με τον γιατρό.', 'We spoke with the doctor.', 'Εμείς ___ με τον γιατρό.', 'μιλήσαμε', ['μίλησα', 'μίλησες', 'μίλησαν']),
    ],
    checks: [
      q('Complete with first-person plural aorist: Χθες ___ καφέ.', ['αγόρασα', 'αγοράσαμε', 'αγόρασες', 'αγόρασε'], 1, 'Αγοράσαμε is first-person plural aorist: “we bought”.'),
      q('What viewpoint does the aorist normally express?', ['An action necessarily lasting one second', 'A compulsory present habit', 'A future action only', 'A past event viewed as a whole'], 3, 'Aorist aspect presents the event as a whole; it does not specify a short duration.'),
    ],
  },
  {
    slug: 'imperfect-past', title: 'The imperfect for past habits and background', level: 'A2', category: 'Tense and aspect',
    explanation: 'The imperfect presents past actions as ongoing, repeated or background circumstances. Common forms include έμενα and διάβαζα; it does not assert the event’s endpoint in the way the aorist does.',
    formation: 'μένω → έμενα; διαβάζω → διάβαζα; habit or background + imperfect',
    examples: [
      e('Όταν ήμουν παιδί, έμενα στην Πάτρα.', 'When I was a child, I lived in Patras.', 'Όταν ήμουν παιδί, ___ στην Πάτρα.', 'έμενα', ['μένω', 'μένεις', 'μένουμε']),
      e('Κάθε βράδυ διάβαζα πριν κοιμηθώ.', 'Every evening I used to read before going to sleep.', 'Κάθε βράδυ ___ πριν κοιμηθώ.', 'διάβαζα', ['διαβάζω', 'διαβάζει', 'διαβάζουν']),
      e('Εμείς παίζαμε συχνά στο πάρκο.', 'We often used to play in the park.', 'Εμείς ___ συχνά στο πάρκο.', 'παίζαμε', ['έπαιζα', 'έπαιζες', 'έπαιζαν']),
    ],
    checks: [
      q('Which past form is most appropriate for a repeated childhood habit: Κάθε καλοκαίρι ___ στο χωριό?', ['θα μένω', 'μένω', 'έμενα', 'να μείνω'], 2, 'Έμενα is imperfect and naturally expresses repeated past residence.'),
      q('Which sentence explicitly describes an action in progress in the past?', ['Διάβαζα όταν χτύπησε το τηλέφωνο.', 'Θα διαβάσω αύριο.', 'Διαβάζω τώρα.', 'Θέλω να διαβάσω.'], 0, 'Διάβαζα supplies the ongoing background for the phone ringing.'),
    ],
  },
  {
    slug: 'aorist-imperfect-contrast', title: 'Choosing aorist or imperfect', level: 'A2', category: 'Tense and aspect',
    explanation: 'The imperfect often gives a continuing background or repeated habit, while the aorist gives a bounded event in the story. Both can describe lengthy situations, so choose the viewpoint intended rather than treating “short” and “long” as tense rules.',
    formation: 'background imperfect + όταν + event aorist; e.g. διάβαζα όταν μπήκε',
    examples: [
      e('Διάβαζα όταν μπήκε η Μαρία.', 'I was reading when Maria came in.', '___ όταν μπήκε η Μαρία.', 'Διάβαζα', ['Διαβάζω', 'Θα διαβάσω', 'Να διαβάσω']),
      e('Κάθε μέρα πήγαινα με τα πόδια.', 'Every day I used to go on foot.', 'Κάθε μέρα ___ με τα πόδια.', 'πήγαινα', ['πηγαίνω', 'θα πάω', 'να πάω']),
      e('Χθες πήγα μία φορά στην τράπεζα.', 'Yesterday I went to the bank once.', 'Χθες ___ μία φορά στην τράπεζα.', 'πήγα', ['πηγαίνω', 'θα πάω', 'να πάω']),
    ],
    checks: [
      q('Which choice clearly expresses “I was writing when he arrived”?', ['Έγραψα όταν ερχόταν.', 'Έγραφα όταν έφτασε.', 'Γράφω όταν θα φτάσει.', 'Θα γράψω όταν έφτασε.'], 1, 'Έγραφα is the continuing background and έφτασε is the arrival event.'),
      q('Which claim about aorist versus imperfect is accurate?', ['Aorist actions must be short.', 'Imperfect actions must last years.', 'They refer to different grammatical genders.', 'The choice presents an event as a whole or from within.'], 3, 'Aspect is a difference of viewpoint, not an automatic duration measurement.'),
    ],
  },
  {
    slug: 'irregular-aorists', title: 'Common irregular aorists', level: 'A2', category: 'Tense and aspect',
    explanation: 'Frequent verbs may have an aorist stem very different from the present: βλέπω → είδα, λέω → είπα, τρώω → έφαγα and πηγαίνω → πήγα. Learn these as explicit forms; a productive -σα ending cannot safely predict every past tense.',
    formation: 'βλέπω → είδα; λέω → είπα; τρώω → έφαγα; πηγαίνω → πήγα',
    examples: [
      e('Χθες είδα τη Μαρία.', 'Yesterday I saw Maria.', 'Χθες ___ τη Μαρία.', 'είδα', ['βλέπω', 'βλέπει', 'βλέπουμε']),
      e('Είπα την αλήθεια.', 'I told the truth.', '___ την αλήθεια.', 'Είπα', ['Λέει', 'Λένε', 'Λέτε']),
      e('Το πρωί έφαγα ψωμί.', 'In the morning I ate bread.', 'Το πρωί ___ ψωμί.', 'έφαγα', ['τρώω', 'τρώει', 'τρώμε']),
    ],
    checks: [
      q('Which is the first-person singular aorist of πηγαίνω?', ['πηγαίνω', 'πηγαίναμε', 'πήγα', 'πηγαίνεις'], 2, 'Πήγα means “I went”; it uses an irregular perfective stem.'),
      q('Complete: Εσύ ___ την ταινία χθες; (“Did you see the film yesterday?”)', ['είδες', 'είδα', 'είδαμε', 'είδαν'], 0, 'Second-person singular aorist of βλέπω is είδες.'),
    ],
  },
  {
    slug: 'na-perfective-stems', title: 'Να with perfective and imperfective stems', level: 'A2', category: 'Tense and aspect',
    explanation: 'After να, a perfective stem can present a desired or intended action as a whole: να γράψω. An imperfective stem such as να γράφω presents a continuing or repeated action; perfective forms like γράψω normally need a particle such as να or θα and are not ordinary standalone present statements.',
    formation: 'να γράψω / να διαβάσω (whole event); να γράφω / να διαβάζω (continuing/repeated)',
    examples: [
      e('Θέλω να γράψω ένα γράμμα.', 'I want to write a letter.', 'Θέλω να ___ ένα γράμμα.', 'γράψω', ['έγραψα', 'έγραφα', 'γράψαμε']),
      e('Πρέπει να διαβάζω κάθε μέρα.', 'I need to study every day.', 'Πρέπει να ___ κάθε μέρα.', 'διαβάζω', ['διάβασα', 'διάβαζα', 'διαβάσαμε']),
      e('Μπορείς να ανοίξεις το παράθυρο;', 'Can you open the window?', 'Μπορείς να ___ το παράθυρο;', 'ανοίξεις', ['άνοιξες', 'άνοιξα', 'ανοίξαμε']),
    ],
    checks: [
      q('Which phrase clearly presents reading as a repeated routine?', ['να διάβασα χθες', 'να διαβάζω κάθε μέρα', 'να διαβάσαμε αύριο', 'να διάβαζες τώρα'], 1, 'The imperfective διαβάζω fits the explicit repeated routine κάθε μέρα.'),
      q('Choose the grammatical intended future statement.', ['Γράψω ένα γράμμα αύριο.', 'Έγραψα ένα γράμμα αύριο.', 'Να έγραψα ένα γράμμα αύριο.', 'Θα γράψω ένα γράμμα αύριο.'], 3, 'Θα supports the perfective nonpast form γράψω in a future statement.'),
    ],
  },
  {
    slug: 'negative-na-clauses', title: 'Negative να-clauses with μην', level: 'A2', category: 'Sentence structure',
    explanation: 'A negative clause introduced by να normally uses μη(ν), giving να μην rather than να δεν. The negative belongs to the action after να; δεν θέλω να φύγω and θέλω να μη φύγω place the negation at different levels.',
    formation: 'να + μη(ν) + (short pronoun) + verb',
    examples: [
      e('Πρέπει να μην αργήσουμε.', 'We must not be late.', 'Πρέπει να ___ αργήσουμε.', 'μην', ['δεν', 'όχι', 'θα']),
      e('Θέλω να μην το ξεχάσω.', 'I want not to forget it.', 'Θέλω να ___ το ξεχάσω.', 'μην', ['δεν', 'όχι', 'θα']),
      e('Προσπαθώ να μην κάνω λάθη.', 'I try not to make mistakes.', 'Προσπαθώ να ___ κάνω λάθη.', 'μην', ['δεν', 'όχι', 'ότι']),
    ],
    checks: [
      q('Complete: Καλύτερα να ___ φύγεις ακόμα.', ['δεν', 'θα', 'όχι', 'μην'], 3, 'A negative να-clause takes μην before the verb.'),
      q('Which phrase correctly negates the main indicative verb θέλω?', ['Δεν θέλω να φύγω.', 'Μην θέλω να φύγω.', 'Να δεν θέλω φύγω.', 'Θέλω δεν να φύγω.'], 0, 'Δεν negates the main indicative statement; μην belongs inside a negative να-clause.'),
    ],
  },
  {
    slug: 'affirmative-imperatives', title: 'Affirmative commands', level: 'A2', category: 'Commands',
    explanation: 'An affirmative imperative directly asks someone to act, with distinct singular and plural or polite forms. Common pairs include άνοιξε/ανοίξτε and γράψε/γράψτε; imperatives have their own forms and are not made by merely dropping the subject pronoun.',
    formation: 'singular άνοιξε / γράψε; plural or polite ανοίξτε / γράψτε',
    examples: [
      e('Άνοιξε την πόρτα, Νίκο.', 'Open the door, Nikos.', '___ την πόρτα, Νίκο.', 'Άνοιξε', ['Άνοιξα', 'Άνοιξες', 'Ανοίξαμε']),
      e('Γράψτε το όνομά σας, παρακαλώ.', 'Write your name, please.', '___ το όνομά σας, παρακαλώ.', 'Γράψτε', ['Γράψαμε', 'Έγραψαν', 'Έγραψα']),
      e('Κλείσε το παράθυρο, Μαρία.', 'Close the window, Maria.', '___ το παράθυρο, Μαρία.', 'Κλείσε', ['Έκλεισα', 'Κλείσαμε', 'Έκλεισαν']),
    ],
    checks: [
      q('Choose the polite or plural command “Wait!”.', ['Περίμενα!', 'Περιμένω!', 'Περιμένετε!', 'Περιμέναμε!'], 2, 'Περιμένετε can address several people or one person politely.'),
      q('Which is a singular affirmative command meaning “Read it”?', ['Το διάβασα.', 'Διάβασέ το.', 'Το διαβάσαμε.', 'Θα το διαβάσω.'], 1, 'Διάβασε is an imperative, and the short object pronoun follows it.'),
    ],
  },
  {
    slug: 'prohibitions-min', title: 'Negative commands with μην', level: 'A2', category: 'Commands',
    explanation: 'Greek prohibits an action with μη(ν) and a nonpast verb, rather than by putting δεν before an affirmative imperative. A perfective form can prohibit a particular action, while an imperfective form can tell someone to stop or avoid a continuing behavior.',
    formation: 'μη(ν) + imperfective or perfective nonpast; μην ανοίξεις / μη μιλάς',
    examples: [
      e('Μην ανοίξεις την πόρτα.', 'Do not open the door.', '___ ανοίξεις την πόρτα.', 'Μην', ['Δεν', 'Όχι', 'Ότι']),
      e('Μη μιλάς τόσο δυνατά.', 'Do not speak so loudly.', 'Μη ___ τόσο δυνατά.', 'μιλάς', ['μιλάω', 'μιλάμε', 'μιλούσα']),
      e('Μην ξεχάσετε τα εισιτήρια.', 'Do not forget the tickets.', 'Μην ___ τα εισιτήρια.', 'ξεχάσετε', ['ξεχάσαμε', 'ξέχασα', 'ξέχασαν']),
    ],
    checks: [
      q('Choose a standard prohibition addressed to one friend.', ['Δεν άνοιξε την πόρτα!', 'Όχι άνοιξε την πόρτα!', 'Μην ανοίξεις την πόρτα!', 'Δεν ανοίξεις την πόρτα!'], 2, 'Μην plus the second-person nonpast ανοίξεις makes a negative command.'),
      q('Which form makes Μη μιλάς plural or polite?', ['Μη μιλάτε.', 'Μη μιλάω.', 'Μη μιλάμε.', 'Μη μιλούν.'], 0, 'Μιλάτε is second-person plural and can also be polite singular.'),
    ],
  },
  {
    slug: 'clitic-position', title: 'Object pronouns before verbs and after commands', level: 'A2', category: 'Pronouns',
    explanation: 'Short object pronouns usually precede a finite verb, including after θα, να and μην. With an affirmative imperative they follow the command; attached unstressed pronouns may require an additional accent on the command.',
    formation: 'το διαβάζω / θα το διαβάσω / να το διαβάσω / διάβασέ το',
    examples: [
      e('Θα το αγοράσω αύριο.', 'I will buy it tomorrow.', 'Θα ___ αγοράσω αύριο.', 'το', ['αυτός', 'αυτή', 'αυτοί']),
      e('Διάβασέ το τώρα.', 'Read it now.', 'Διάβασέ ___ τώρα.', 'το', ['αυτός', 'αυτή', 'αυτοί']),
      e('Μην το ανοίξεις.', 'Do not open it.', 'Μην ___ ανοίξεις.', 'το', ['αυτός', 'αυτή', 'αυτοί']),
    ],
    checks: [
      q('Choose the usual affirmative command “Open it” with neuter το.', ['Το άνοιξε!', 'Άνοιξέ το!', 'Άνοιξε τον!', 'Άνοιξε τις!'], 1, 'The short object follows an affirmative imperative; άνοιξέ receives an extra accent.'),
      q('Choose the ordinary word order for “I will see her”.', ['Τη θα δω.', 'Θα δω τη.', 'Δω θα τη.', 'Θα τη δω.'], 3, 'The future particle comes before the preverbal clitic: θα τη δω.'),
    ],
  },
  {
    slug: 'indirect-object-clitics', title: 'Short indirect-object pronouns', level: 'A2', category: 'Pronouns',
    explanation: 'Genitive short pronouns such as μου, σου, του and της can identify a recipient or the person affected by an action. They normally precede a finite verb, and a two-clitic sequence places the indirect object before the direct object: μου το δίνει.',
    formation: 'μου / σου / του / της / μας / σας / τους + verb; indirect clitic + direct clitic + verb',
    examples: [
      e('Μου δίνει ένα βιβλίο.', 'He gives me a book.', '___ δίνει ένα βιβλίο.', 'Μου', ['Εγώ', 'Εμένα', 'Με']),
      e('Η Μαρία; Της τηλεφωνώ συχνά.', 'Maria? I often phone her.', 'Η Μαρία; ___ τηλεφωνώ συχνά.', 'Της', ['Την', 'Τον', 'Τα']),
      e('Ο Νίκος μού το έδωσε.', 'Nikos gave it to me.', 'Ο Νίκος ___ το έδωσε.', 'μού', ['με', 'εγώ', 'εμένα']),
    ],
    checks: [
      q('Choose “I give it to you” to one friend.', ['Το σου δίνω.', 'Σε το δίνω.', 'Σου το δίνω.', 'Εσύ το δίνω.'], 2, 'The recipient clitic σου precedes the direct-object clitic το.'),
      q('Anna is the recipient. Complete: ___ έδωσα το βιβλίο.', ['Της', 'Την', 'Το', 'Τις'], 0, 'A feminine singular recipient uses genitive της, not accusative την.'),
    ],
  },
  {
    slug: 'reflexive-eaftos', title: 'Reflexive reference: τον εαυτό μου', level: 'A2', category: 'Pronouns',
    explanation: 'Ο εαυτός μου means “myself”; as a direct object it becomes τον εαυτό μου. The possessive identifies the person referred back to, and the noun εαυτός remains grammatically masculine even when the person is a woman.',
    formation: 'τον εαυτό μου / σου / του / της / μας / σας / τους',
    examples: [
      e('Προσέχω τον εαυτό μου.', 'I take care of myself.', 'Προσέχω ___ εαυτό μου.', 'τον', ['ο', 'του', 'η']),
      e('Η Μαρία κοιτάζει τον εαυτό της στον καθρέφτη.', 'Maria looks at herself in the mirror.', 'Η Μαρία κοιτάζει τον εαυτό ___ στον καθρέφτη.', 'της', ['του', 'μου', 'μας']),
      e('Πρέπει να φροντίζουμε τον εαυτό μας.', 'We must look after ourselves.', 'Πρέπει να φροντίζουμε τον εαυτό ___.', 'μας', ['μου', 'σου', 'της']),
    ],
    checks: [
      q('Choose “You know yourself” addressed to one friend.', ['Ξέρεις τον εαυτό μου.', 'Ξέρεις τον εαυτό σου.', 'Ξέρεις ο εαυτός σου.', 'Ξέρεις την εαυτό σου.'], 1, 'A direct object requires τον εαυτό and the second-person possessive σου.'),
      q('In Η Άννα φροντίζει τον εαυτό της, why is τον masculine?', ['Because Anna must be a man', 'Because all objects are masculine', 'Because της is masculine', 'Because εαυτός is grammatically masculine'], 3, 'The noun εαυτός has masculine grammatical gender regardless of the person referred to.'),
    ],
  },
  {
    slug: 'present-middle-omai', title: 'Present forms in -ομαι', level: 'A2', category: 'Verbs',
    explanation: 'Verbs such as έρχομαι and εργάζομαι use endings -ομαι, -εσαι, -εται, -όμαστε, -εστε and -ονται. These endings belong to the middle/passive conjugation, but many such verbs have ordinary active meanings; έρχομαι means “come”, not “be come”.',
    formation: 'έρχομαι, έρχεσαι, έρχεται, ερχόμαστε, έρχεστε, έρχονται',
    examples: [
      e('Εγώ έρχομαι αύριο.', 'I am coming tomorrow.', 'Εγώ ___ αύριο.', 'έρχομαι', ['έρχεσαι', 'έρχεται', 'έρχονται']),
      e('Εσύ εργάζεσαι εδώ;', 'Do you work here?', 'Εσύ ___ εδώ;', 'εργάζεσαι', ['εργάζομαι', 'εργάζεται', 'εργάζονται']),
      e('Οι φίλοι μου έρχονται τώρα.', 'My friends are coming now.', 'Οι φίλοι μου ___ τώρα.', 'έρχονται', ['έρχεται', 'έρχεσαι', 'έρχομαι']),
    ],
    checks: [
      q('Complete: Εμείς ___ κάθε μέρα.', ['εργάζομαι', 'εργάζεσαι', 'εργαζόμαστε', 'εργάζονται'], 2, 'The first-person plural in this conjugation is εργαζόμαστε.'),
      q('Which statement about έρχομαι is correct?', ['Its middle/passive endings do not make its meaning passive.', 'It means only “I am brought”.', 'It has no plural forms.', 'It is an imperative.'], 0, 'Some verbs use middle/passive morphology with a lexical meaning such as “come”.'),
    ],
  },
  {
    slug: 'relative-pou', title: 'Relative clauses with που', level: 'A2', category: 'Clauses',
    explanation: 'Unaccented που introduces a common relative clause referring to a preceding person or thing. It is invariable and can correspond to “who”, “which” or “that”; accented πού instead asks “where” and is not the same grammatical word.',
    formation: 'noun + που + relative clause',
    examples: [
      e('Το βιβλίο που διαβάζω είναι καλό.', 'The book that I am reading is good.', 'Το βιβλίο ___ διαβάζω είναι καλό.', 'που', ['πού', 'ποιος', 'ποια']),
      e('Η γυναίκα που μιλάει είναι η δασκάλα μου.', 'The woman who is speaking is my teacher.', 'Η γυναίκα ___ μιλάει είναι η δασκάλα μου.', 'που', ['πού', 'ποιον', 'ποιοι']),
      e('Τα παιδιά που παίζουν είναι φίλοι.', 'The children who are playing are friends.', 'Τα παιδιά ___ παίζουν είναι φίλοι.', 'που', ['πού', 'ποιος', 'ποια']),
    ],
    checks: [
      q('Complete the relative clause: Το σπίτι ___ αγόρασα είναι μικρό.', ['πού', 'ποιος', 'ποια', 'που'], 3, 'Relative που is unaccented and does not agree in gender or number.'),
      q('Which sentence contains interrogative “where” rather than a relative clause?', ['Το βιβλίο που θέλω είναι εδώ.', 'Πού μένεις;', 'Η φίλη που περιμένω ήρθε.', 'Το παιδί που παίζει γελάει.'], 1, 'Accented πού asks a location question; unaccented που links a relative clause.'),
    ],
  },
  {
    slug: 'coordinating-conjunctions', title: 'And, but and or: και, αλλά, ή', level: 'A1', category: 'Clauses',
    explanation: 'Και adds information, αλλά marks a contrast and ή offers alternatives. The conjunction ή has an accent, distinguishing it from the feminine article η; choose the connector for the intended relation between the ideas.',
    formation: 'A και B; A αλλά B; A ή B',
    examples: [
      e('Η Άννα και ο Νίκος είναι φίλοι.', 'Anna and Nikos are friends.', 'Η Άννα ___ ο Νίκος είναι φίλοι.', 'και', ['γιατί', 'επειδή', 'όταν']),
      e('Θέλω να έρθω, αλλά δεν έχω χρόνο.', 'I want to come, but I do not have time.', 'Θέλω να έρθω, ___ δεν έχω χρόνο.', 'αλλά', ['ή', 'η', 'να']),
      e('Θέλεις καφέ ή τσάι;', 'Do you want coffee or tea?', 'Θέλεις καφέ ___ τσάι;', 'ή', ['η', 'να', 'που']),
    ],
    checks: [
      q('Which connector explicitly marks contrast: Είναι μικρό ___ άνετο?', ['επειδή', 'όταν', 'αλλά', 'να'], 2, 'Αλλά means “but”, contrasting small size with comfort.'),
      q('Which word means “or” between alternatives?', ['ή', 'η', 'που', 'να'], 0, 'Accented ή is “or”; unaccented η is a feminine article.'),
    ],
  },
  {
    slug: 'reasons-epeidi-giati', title: 'Giving reasons with επειδή and γιατί', level: 'A2', category: 'Clauses',
    explanation: 'Επειδή and γιατί can introduce a reason corresponding to “because”. Γιατί also asks “why” in a direct question, while επειδή normally introduces an explanation rather than functioning as a direct question word.',
    formation: 'main clause + επειδή / γιατί + reason; γιατί + question',
    examples: [
      e('Μένω σπίτι επειδή είμαι άρρωστος.', 'I am staying home because I am ill.', 'Μένω σπίτι ___ είμαι άρρωστος.', 'επειδή', ['ή', 'να', 'ώστε']),
      e('Δεν έρχομαι γιατί έχω δουλειά.', 'I am not coming because I have work.', 'Δεν έρχομαι ___ έχω δουλειά.', 'γιατί', ['ή', 'να', 'που']),
      e('Επειδή βρέχει, παίρνω ομπρέλα.', 'Because it is raining, I am taking an umbrella.', '___ βρέχει, παίρνω ομπρέλα.', 'Επειδή', ['Ή', 'Να', 'Ποιος']),
    ],
    checks: [
      q('Choose a direct question asking why someone is leaving.', ['Επειδή φεύγεις;', 'Γιατί φεύγεις;', 'Ώστε φεύγεις;', 'Ότι φεύγεις;'], 1, 'Γιατί is the direct question word for “why”.'),
      q('Which connector introduces a reason: Πίνω νερό ___ διψάω?', ['ή', 'να', 'που', 'επειδή'], 3, 'Επειδή gives the reason for drinking: being thirsty.'),
    ],
  },
  {
    slug: 'temporal-clauses', title: 'When, before and after', level: 'A2', category: 'Clauses',
    explanation: 'Όταν introduces “when”, while πριν can introduce a clause for an action occurring later than the main action. Μετά can precede a noun phrase, as in μετά το μάθημα; distinguish a clause containing a verb from a prepositional phrase containing a noun.',
    formation: 'όταν + clause; πριν + nonpast clause; μετά + accusative noun phrase',
    examples: [
      e('Όταν έχω χρόνο, διαβάζω.', 'When I have time, I read.', '___ έχω χρόνο, διαβάζω.', 'Όταν', ['Μετά', 'Πάνω', 'Δίπλα']),
      e('Κλείνω την πόρτα πριν φύγω.', 'I close the door before I leave.', 'Κλείνω την πόρτα πριν ___.', 'φύγω', ['έφυγα', 'φύγαμε', 'έφευγα']),
      e('Θα πάμε για καφέ μετά το μάθημα.', 'We will go for coffee after the lesson.', 'Θα πάμε για καφέ μετά ___ μάθημα.', 'το', ['τον', 'του', 'η']),
    ],
    checks: [
      q('Which phrase means “after work”?', ['μετά η δουλειά', 'μετά της δουλειάς', 'μετά τη δουλειά', 'μετά ο δουλειά'], 2, 'Μετά takes an accusative noun phrase here: τη δουλειά.'),
      q('Choose “before I leave”.', ['πριν φύγω', 'πριν έφυγα', 'πριν φύγαμε', 'πριν φεύγαμε'], 0, 'The intended future-relative action uses πριν with φύγω, not a past indicative form.'),
    ],
  },
  {
    slug: 'real-conditionals-an', title: 'Real conditions with αν', level: 'A2', category: 'Clauses',
    explanation: 'Αν introduces a condition, often followed by a present-form condition and a result with θα. This pattern describes an open possibility, not a past unreal situation; Greek also has other conditional patterns that require separate study.',
    formation: 'αν + present/nonpast condition, θα + result',
    examples: [
      e('Αν έχω χρόνο, θα έρθω.', 'If I have time, I will come.', '___ έχω χρόνο, θα έρθω.', 'Αν', ['Ότι', 'Ποιος', 'Να']),
      e('Αν βρέξει, θα μείνουμε σπίτι.', 'If it rains, we will stay home.', 'Αν βρέξει, ___ μείνουμε σπίτι.', 'θα', ['ότι', 'που', 'γιατί']),
      e('Αν θέλεις, μπορούμε να φύγουμε.', 'If you want, we can leave.', 'Αν ___, μπορούμε να φύγουμε.', 'θέλεις', ['θέλω', 'θέλουμε', 'θέλουν']),
    ],
    checks: [
      q('Choose the connector introducing an open condition: ___ τελειώσω νωρίς, θα σου τηλεφωνήσω.', ['Ότι', 'Που', 'Να', 'Αν'], 3, 'Αν introduces “if I finish early”.'),
      q('Which sentence has a future result after a condition?', ['Αν έχω χρόνο, ήρθα χθες.', 'Αν έχω χρόνο, θα έρθω.', 'Αν έχω χρόνο, έρχομαι χθες.', 'Αν έχω χρόνο, ήρθα πέρσι.'], 1, 'Θα έρθω gives the future consequence of having time.'),
    ],
  },
  {
    slug: 'present-perfect', title: 'The present perfect with έχω', level: 'A2', category: 'Tense and aspect',
    explanation: 'The present perfect uses a form of έχω plus an invariable perfective form, such as έχω γράψει or έχω δει. It often connects a past experience or result to the present; only έχω changes for person and number, and a specific finished past time commonly favors the aorist.',
    formation: 'έχω / έχεις / έχει / έχουμε / έχετε / έχουν + γράψει / δει / φάει',
    examples: [
      e('Έχω διαβάσει αυτό το βιβλίο.', 'I have read this book.', 'Έχω ___ αυτό το βιβλίο.', 'διαβάσει', ['διάβασα', 'διαβάζω', 'διαβάσουμε']),
      e('Η Μαρία έχει φύγει.', 'Maria has left.', 'Η Μαρία ___ φύγει.', 'έχει', ['έχω', 'έχεις', 'έχουμε']),
      e('Έχουμε δει αυτή την ταινία.', 'We have seen this film.', 'Έχουμε ___ αυτή την ταινία.', 'δει', ['είδαμε', 'βλέπουμε', 'είδες']),
    ],
    checks: [
      q('Choose “They have eaten”.', ['Έχουν φάμε.', 'Έχουν έφαγαν.', 'Έχουν φάει.', 'Έχουν τρώνε.'], 2, 'The form φάει is invariable after the conjugated auxiliary έχουν.'),
      q('Which part changes between έχω γράψει and έχουμε γράψει?', ['The auxiliary έχω', 'The invariable form γράψει', 'Both parts must become plural', 'Neither part can change'], 0, 'Person and number are carried by έχω/έχουμε; γράψει stays the same.'),
    ],
  },
  {
    slug: 'duration-edo-kai', title: 'Duration continuing until now: εδώ και', level: 'A2', category: 'Time expressions',
    explanation: 'Εδώ και followed by a duration can describe a situation that began earlier and continues now. Greek commonly uses the present in this construction, where English may use “have been”; do not confuse it with πριν από, which locates an event a duration ago.',
    formation: 'present situation + εδώ και + duration',
    examples: [
      e('Μένω στην Αθήνα εδώ και δύο χρόνια.', 'I have been living in Athens for two years.', 'Μένω στην Αθήνα εδώ ___ δύο χρόνια.', 'και', ['από', 'για', 'με']),
      e('Μαθαίνω ελληνικά εδώ και έναν χρόνο.', 'I have been learning Greek for a year.', 'Μαθαίνω ελληνικά εδώ και ___ χρόνο.', 'έναν', ['ένας', 'μία', 'ένα']),
      e('Περιμένουμε εδώ και μισή ώρα.', 'We have been waiting for half an hour.', 'Περιμένουμε εδώ και ___ ώρα.', 'μισή', ['μισός', 'μισό', 'μισοί']),
    ],
    checks: [
      q('Which phrase marks a duration continuing to the present?', ['πριν από δύο χρόνια', 'εδώ και δύο χρόνια', 'σε δύο χρόνια', 'μετά από δύο χρόνια'], 1, 'Εδώ και gives elapsed duration for a continuing situation.'),
      q('Which sentence means “I arrived two days ago” rather than “I have been here for two days”?', ['Είμαι εδώ εδώ και δύο μέρες.', 'Θα φτάσω σε δύο μέρες.', 'Φτάνω μετά από δύο μέρες.', 'Έφτασα πριν από δύο μέρες.'], 3, 'Πριν από locates a completed arrival two days before now.'),
    ],
  },
  {
    slug: 'frequency-expressions', title: 'Always, often and every day', level: 'A1', category: 'Adverbs',
    explanation: 'Πάντα, συχνά and μερικές φορές describe frequency, while κάθε with a singular noun means “every”. Frequency expressions can move for emphasis, but κάθε itself is invariable and does not take a plural ending.',
    formation: 'πάντα / συχνά / μερικές φορές + clause; κάθε + singular time noun',
    examples: [
      e('Διαβάζω κάθε μέρα.', 'I study every day.', 'Διαβάζω ___ μέρα.', 'κάθε', ['όλες', 'πολλές', 'μερικές']),
      e('Πηγαίνουμε συχνά στο πάρκο.', 'We often go to the park.', 'Πηγαίνουμε ___ στο πάρκο.', 'συχνά', ['συχνός', 'συχνή', 'συχνοί']),
      e('Μερικές φορές τρώω έξω.', 'Sometimes I eat out.', '___ φορές τρώω έξω.', 'Μερικές', ['Μερικοί', 'Μερικά', 'Μερική']),
    ],
    checks: [
      q('Choose the correctly formed expression “every week”.', ['κάθες εβδομάδες', 'κάθε εβδομάδες', 'κάθε εβδομάδα', 'κάθες εβδομάδα'], 2, 'Κάθε is invariable and is followed here by singular εβδομάδα.'),
      q('Which adverb means “always”?', ['πάντα', 'χθες', 'αύριο', 'εδώ'], 0, 'Πάντα expresses frequency; χθες and αύριο locate time, and εδώ locates place.'),
    ],
  },
  {
    slug: 'telling-time', title: 'Clock time: στη μία and στις δύο', level: 'A1', category: 'Time expressions',
    explanation: 'To state the time, use είναι μία for one o’clock and είναι δύο, τρεις and so on for other hours. To say when an event occurs, use στη μία but στις δύο; half past follows the gender of the understood ώρα, giving μία και μισή.',
    formation: 'είναι μία / δύο; στη μία / στις δύο; και τέταρτο / και μισή',
    examples: [
      e('Το μάθημα αρχίζει στη μία.', 'The lesson starts at one o’clock.', 'Το μάθημα αρχίζει ___ μία.', 'στη', ['στις', 'στον', 'στα']),
      e('Το τρένο φεύγει στις δύο.', 'The train leaves at two o’clock.', 'Το τρένο φεύγει ___ δύο.', 'στις', ['στη', 'στον', 'στο']),
      e('Είναι μία και μισή.', 'It is half past one.', 'Είναι μία και ___.', 'μισή', ['μισός', 'μισό', 'μισοί']),
    ],
    checks: [
      q('Choose “at three o’clock”.', ['στη τρία', 'στο τρεις', 'στην τρεις', 'στις τρεις'], 3, 'Hours beyond one use plural στις; the feminine numeral is τρεις.'),
      q('Complete: Είναι δύο και ___. (“It is quarter past two.”)', ['τέταρτος', 'τέταρτο', 'τέταρτη', 'τέταρτοι'], 1, 'The expression for quarter past is και τέταρτο.'),
    ],
  },
  {
    slug: 'days-and-dates', title: 'Weekdays and dates', level: 'A1', category: 'Time expressions',
    explanation: 'A definite accusative weekday can place an event on a day, as in τη Δευτέρα, while στις plus a numeral expresses many calendar dates. Month names commonly appear in the genitive after a date; recurring weekdays can also use plural forms such as τις Δευτέρες.',
    formation: 'τη Δευτέρα / την Τρίτη; στις δύο Μαΐου; τις Δευτέρες for Mondays',
    examples: [
      e('Θα έρθω τη Δευτέρα.', 'I will come on Monday.', 'Θα έρθω ___ Δευτέρα.', 'τη', ['ο', 'του', 'τις']),
      e('Τα γενέθλιά μου είναι στις δύο Μαΐου.', 'My birthday is on the second of May.', 'Τα γενέθλιά μου είναι ___ δύο Μαΐου.', 'στις', ['στη', 'στον', 'των']),
      e('Τις Δευτέρες δουλεύω στο σπίτι.', 'On Mondays I work at home.', '___ Δευτέρες δουλεύω στο σπίτι.', 'Τις', ['Την', 'Της', 'Η']),
    ],
    checks: [
      q('Which phrase explicitly means recurring “on Fridays”?', ['την Παρασκευή', 'της Παρασκευής', 'τις Παρασκευές', 'η Παρασκευή'], 2, 'Plural τις Παρασκευές expresses Fridays as a recurring time.'),
      q('Complete the date: στις τρεις ___. (“on the third of June”)', ['Ιουνίου', 'Ιούνιος', 'Ιούνιο', 'Ιούνιους'], 0, 'The month follows the date in genitive singular: Ιουνίου.'),
    ],
  },
  {
    slug: 'vocative-address', title: 'Addressing someone: the vocative', level: 'A2', category: 'Cases',
    explanation: 'The vocative is used when directly addressing a person and normally has no article. Common masculine names lose final -ς, as in Νίκος → Νίκο, and some -ος nouns use -ε, as in φίλος → φίλε; feminine and neuter forms often remain unchanged.',
    formation: 'Νίκος → Νίκο; φίλος → φίλε; Μαρία → Μαρία',
    examples: [
      e('Νίκο, έλα εδώ.', 'Nikos, come here.', '___, έλα εδώ.', 'Νίκο', ['Νίκος', 'Νίκου', 'Νίκοι']),
      e('Φίλε μου, σε ευχαριστώ.', 'My friend, thank you.', '___ μου, σε ευχαριστώ.', 'Φίλε', ['Φίλος', 'Φίλου', 'Φίλοι']),
      e('Πέτρο, πού είσαι;', 'Petros, where are you?', '___, πού είσαι;', 'Πέτρο', ['Πέτρος', 'Πέτρου', 'Πέτροι']),
    ],
    checks: [
      q('Choose a direct address to Nikos.', ['Ο Νίκος, έλα εδώ.', 'Νίκο, έλα εδώ.', 'Του Νίκου, έλα εδώ.', 'Νίκος, έλα εδώ.'], 1, 'Direct address uses the vocative Νίκο without the definite article.'),
      q('Which sentence uses Μαρία as direct address?', ['Η Μαρία είναι εδώ.', 'Βλέπω τη Μαρία.', 'Το βιβλίο της Μαρίας είναι εδώ.', 'Μαρία, άκουσέ με.'], 3, 'The comma and command show direct address; feminine Μαρία keeps its form.'),
    ],
  },
  {
    slug: 'negative-concord', title: 'Nobody, nothing and nowhere', level: 'A2', category: 'Pronouns',
    explanation: 'Κανείς/κανένας, τίποτα and πουθενά combine with δεν in negative indicative statements, giving Greek negative concord. In questions these words can have “any” meanings, so do not assign them an automatically negative translation in every context.',
    formation: 'δεν + verb + κανέναν / τίποτα / πουθενά; κανείς + δεν + verb',
    examples: [
      e('Δεν ξέρω τίποτα.', 'I do not know anything.', '___ ξέρω τίποτα.', 'Δεν', ['Μην', 'Να', 'Θα']),
      e('Κανείς δεν ήρθε.', 'Nobody came.', 'Κανείς ___ ήρθε.', 'δεν', ['μην', 'να', 'θα']),
      e('Δεν είδα κανέναν.', 'I did not see anyone.', 'Δεν είδα ___.', 'κανέναν', ['κανείς', 'κανένας', 'κανενός']),
    ],
    checks: [
      q('Choose the standard negative statement “I am not going anywhere”.', ['Πηγαίνω πουθενά.', 'Μην πηγαίνω πουθενά.', 'Δεν πηγαίνω πουθενά.', 'Όχι πηγαίνω πουθενά.'], 2, 'Πουθενά occurs with δεν in the ordinary negative indicative statement.'),
      q('In Θέλεις τίποτα;, which interpretation is natural?', ['Do you want anything?', 'You never want anything.', 'Nobody wants you.', 'You want nowhere.'], 0, 'In this question τίποτα has an “anything” interpretation rather than asserting nothing.'),
    ],
  },
  {
    slug: 'indefinite-kapoios', title: 'Someone, something and somewhere', level: 'A2', category: 'Pronouns',
    explanation: 'Κάποιος/κάποια/κάποιο refer to an unspecified person or thing and change for gender, number and case. Κάτι means “something” and κάπου means “somewhere”; neither inflects like κάποιος, so choose the form for the intended role.',
    formation: 'κάποιος / κάποια / κάποιο; object κάποιον; invariable κάτι / κάπου',
    examples: [
      e('Κάποιος χτυπάει την πόρτα.', 'Someone is knocking at the door.', '___ χτυπάει την πόρτα.', 'Κάποιος', ['Κάποιον', 'Κάποιου', 'Κάποιους']),
      e('Θέλω κάτι να φάω.', 'I want something to eat.', 'Θέλω ___ να φάω.', 'κάτι', ['κάπου', 'κάποτε', 'κάπως']),
      e('Είδα κάποιον στον κήπο.', 'I saw someone in the garden.', 'Είδα ___ στον κήπο.', 'κάποιον', ['κάποιος', 'κάποιου', 'κάποιοι']),
    ],
    checks: [
      q('Choose “The keys are somewhere here”.', ['Τα κλειδιά είναι κάτι εδώ.', 'Τα κλειδιά είναι κάποιος εδώ.', 'Τα κλειδιά είναι κάποιον εδώ.', 'Τα κλειδιά είναι κάπου εδώ.'], 3, 'Κάπου is the invariable adverb referring to an unspecified place.'),
      q('Complete the subject: ___ γυναίκα σε περιμένει.', ['Κάποιος', 'Κάποια', 'Κάποιο', 'Κάποιον'], 1, 'The indefinite word agrees with feminine singular γυναίκα: κάποια.'),
    ],
  },
];
export default lessons;
