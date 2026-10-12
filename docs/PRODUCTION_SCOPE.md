# Owner-approved production stage

This stage follows the completed local checkpoint. The original [v1 specification](SPECIFICATION_V1.md) remains unchanged. The owner's subsequent implementation request authorizes Supabase Cloud/Auth, server-side DeepL, ordered remote migrations when administrative access is supplied, 240 honestly labeled grammar candidates, GitHub `main` push, and Vercel deployment when account access is available. It supersedes the archived local-stage stopping instruction for this stage only.

The additional Vocabulary requirement is implemented as a compatible extension: every entry supports word, explicit reading/pronunciation, English translation, part of speech, category, notes, shared audio, multiple example sentences with English translations, and related/derived words. Examples support an optional supplied reading and audio. Related records contain word, reading, translation, and one of `derived`, `compound`, `synonym`, `antonym`, `word_form`, `related`.

The seven-column CSV contract remains `word,reading,translation,type,category,example,notes`. The legacy example imports as one sentence without an invented translation or reading; its missing translation is visibly identified. Export writes the first example to the legacy column. Additional structured examples/relations persist through the repository/database model. Japanese ruby displays only supplied readings; Spanish/Greek inflections and derivations are entered explicitly.

True human grammar review remains a release requirement. Automated structural validation and AI authorship do not satisfy it. All 240 initial content records therefore remain drafts, hidden by published-content RLS until genuine human review and publication.

## Public email/password signup — owner-approved change, October 11, 2026

Public email/password registration is intentionally allowed. This replaces the original personal-only/pre-created-account restriction; all other v1 product rules remain in force. Keep Supabase `disable_signup=false` and **Allow new users to sign up** enabled. Enabled signup is not an unresolved issue or a deployment blocker. Do not add OAuth/social login.

The application provides signup, sign-in, logout, confirmation-required/success/error states, and cookie-based session persistence. Email confirmation follows the project's actual Auth configuration; an unconfirmed account cannot enter protected pages. Duplicate-email handling preserves Supabase's anti-enumeration behavior. New accounts automatically receive an owned profile with timezone `America/Tijuana` and language preferences `ja`, `es`, `el`; learning data starts empty.

Every account has an isolated workspace under the existing RLS policies. Public signup grants no administrative privileges: users cannot forge quiz grades, write SRS stages/cache directly, invoke service-only RPCs, or review/publish Grammar. Shared published lessons remain readable to authenticated users; drafts and pending-review content stay hidden. All 240 existing lessons remain drafts until genuine human review. Vercel deployment is postponed for this verification stage.

The owner explicitly classifies Supabase's built-in sender `429 over_email_send_rate_limit` as an external email-delivery condition when signup/confirmation architecture is verified. Configure custom SMTP before public signup release. Keep email confirmation enforced; verification fixtures must not become a public registration bypass or be represented as successful inbox delivery.
