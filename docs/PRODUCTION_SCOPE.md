# Owner-approved production stage

This stage follows the completed local checkpoint. The original [v1 specification](SPECIFICATION_V1.md) remains unchanged. The owner's subsequent implementation request authorizes Supabase Cloud/Auth, server-side DeepL, ordered remote migrations when administrative access is supplied, 240 honestly labeled grammar candidates, GitHub `main` push, and Vercel deployment when account access is available. It supersedes the archived local-stage stopping instruction for this stage only.

The additional Vocabulary requirement is implemented as a compatible extension: every entry supports word, explicit reading/pronunciation, English translation, part of speech, category, notes, shared audio, multiple example sentences with English translations, and related/derived words. Examples support an optional supplied reading and audio. Related records contain word, reading, translation, and one of `derived`, `compound`, `synonym`, `antonym`, `word_form`, `related`.

The seven-column CSV contract remains `word,reading,translation,type,category,example,notes`. The legacy example imports as one sentence without an invented translation or reading; its missing translation is visibly identified. Export writes the first example to the legacy column. Additional structured examples/relations persist through the repository/database model. Japanese ruby displays only supplied readings; Spanish/Greek inflections and derivations are entered explicitly.

True human grammar review remains a release requirement. Automated structural validation and AI authorship do not satisfy it. All 240 initial content records therefore remain drafts, hidden by published-content RLS until genuine human review and publication.
