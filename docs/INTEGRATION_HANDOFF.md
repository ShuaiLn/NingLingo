# NingLingo integration handoff

This handoff describes the local development stage. The original v1 specification remains the product source of truth. Supabase, GitHub, DeepL, and Vercel have not been connected or configured.

## Completed locally

- Next.js App Router, TypeScript, Tailwind, pinned dependencies, and `package-lock.json`; shared `ja`, `es`, and `el` routes; English interface; responsive sidebar/mobile navigation and language themes.
- Replaceable mock personal session, repository contracts, browser persistence behind one adapter, and an in-memory adapter for tests. No component accesses browser storage directly.
- Vocabulary lists/CRUD/search/filter/selection, accepted answers, Japanese ruby/kana display, CSV preview/validation/import/export, and transactional local import.
- Shared browser speech synthesis, runtime voice discovery, locale fallback, global playback control, and answer-safe audio interactions.
- Four quiz types, frozen vocabulary/answers/question templates, deterministic seeded retry scheduling, persisted answers, optimistic versions, idempotent submissions, and save/resume/end.
- Review stages of 1/3/7/14/30/60/120 days, per-account civil dates, once-per-session settlement, once-per-day advancement, due-review error resets, and unchanged due dates for early practice.
- Reading library, UTF-8 TXT/pasted text, body versions/status, positional manual annotations, keyboard/click/350ms hover lookup, personal vocabulary matching, contextual cache, request deduplication, and manual addition/linking to Vocabulary.
- Complete Alphabet structures and local seed content; Grammar list/detail/exercises/80% completion/content metadata with representative development lessons; Dashboard/Progress/Settings calculated from repositories.
- Pure business logic and repository integration tests. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before accepting a connected-data change.

## Local acceptance results

Verified on October 11, 2026: lint and TypeScript checks pass; **113 unit/repository tests** pass; the **production build** passes; **17 Playwright browser tests** pass against the local production server. Browser coverage includes all eight pages in all three languages, mobile navigation, CSV import/export, all four quizzes, retries/save/resume, cross-tab conflicts, frozen choices, answer-safe hints/audio, Reading selection/version/manual annotation/Vocabulary flows, 80% Grammar completion, Dashboard updates, and timezone validation/persistence.

Quiz activity is recorded on each committed answer's actual account learning day, including unfinished/saved sessions; idempotent submissions do not add activity twice. SRS continues to settle only at completion or active ending. Device speech availability is detected at runtime; browser interaction tests use controlled voices and do not certify every real device's installed voices.

## Local-stage limits

The mock profile is a development convenience, not authentication. Data belongs to this browser and origin; cross-device cloud sync and email/password login require the next stage. Browser tabs use storage notifications and Web Locks where available. A blocked/full browser store falls back to memory and reports that state.

The development translation provider returns an explicitly labeled placeholder, with a manual meaning field. It makes no DeepL request and does not fabricate readings, dictionary forms, or parts of speech. Browser/device voices determine pronunciation availability.

Grammar samples remain development drafts. They are not the final 100 Japanese, 80 Spanish, and 60 Modern Greek reviewed lessons. All 240 production lessons still require source/version/license attribution, human review records, three or more valid translated examples, and five or more unambiguous exercises.

## Replaceable boundaries

`src/repositories/contracts.ts` defines `AuthRepository`, `VocabularyRepository`, `QuizRepository`, `ReadingRepository`, `GrammarRepository`, `ProgressRepository`, and `SettingsRepository`. Replace the implementations in `src/repositories/local.ts` through the application provider; retain the UI and pure domain functions.

Replace `MockTranslationProvider` in `src/services/translation.ts` with a **server-only** DeepL provider implementing `TranslationProvider`. `ReadingLookupService` must retain manual annotation → personal vocabulary → contextual cache → provider order. Alphabet can remain static; replace development Grammar seeds with versioned, reviewed content.

## Proposed database schema

This is a design draft, not executable SQL or an applied migration. Use UUIDs for connected records and map the mock user/record IDs explicitly if importing local data.

| Table | Main fields and constraints |
| --- | --- |
| `profiles` | `user_id` → `auth.users`, display name, IANA timezone default `America/Tijuana`, timestamps. |
| `vocabulary_lists` | ID, owner, language constrained to `ja/es/el`, name, timestamps. |
| `vocabulary_entries` | ID, owner, language, owned list, word/reading/English translation/type/category/example/notes, timestamps; required nonblank word/translation; unique owner + language + canonically normalized word/reading/translation. Same spelling with different meaning remains valid. |
| `accepted_answers` | ID, owned entry, explicit English answer; unique entry + normalized answer. Primary translation also remains an accepted Typing answer. |
| `word_progress` | Owner/entry unique pair, stage `0..6`, due civil date, last-advanced/studied dates, first-attempt/correct/error counters. |
| `quiz_sessions` | Owner, language/type/status, immutable entry/answer/question configuration snapshots, random seed/state, scheduler version, optimistic version, creation/answer timestamps, due-word snapshot, start learning date, settled marker. |
| `quiz_questions` | Session, stable question ID, ordinal, entry snapshot ID, initial/retry/filler kind, frozen prompt/choices/answers; unique session + ordinal. |
| `quiz_attempts` | Session/question/word snapshot IDs, submission ID, ordinal/kind, submitted answer, correctness, answered timestamp; unique session + submission ID and one committed answer per question. |
| `retry_reservations` | Session, word snapshot ID, future ordinal, interval; unique session + future ordinal and session + word. |
| `review_settlements` | Owner/session/entry unique tuple, settlement learning date and result. Guarantees once-per-word/session SRS updates independently of request retries. |
| `readings` | Owner, language, title, current body/version, status, timestamps. |
| `reading_versions` | Reading/version unique pair, immutable body and creation timestamp. |
| `reading_annotations` | Owner, reading/body version, start/end offsets, selected text, manual translation/reading, optional owned vocabulary link. Positions use the UI's UTF-16 offsets; server validation must use that same convention. |
| `translation_cache` | Owner, language, selected text, sentence context, translation/source, timestamp; unique owner + language + normalized text + context (a digest may index large contexts, with full-key equality validation). |
| `grammar_points` / `grammar_versions` | Stable lesson ID/language/level/category and immutable content version, explanation/formation, draft/reviewed/published status, modification notes. |
| `grammar_examples` / `grammar_exercises` | Lesson version, ordered translated examples/readings and ordered exercise choices/correct answer/explanation. Validate minimum counts and unique correct answers before publication. |
| `grammar_sources` / `grammar_reviews` | Lesson version, pinned source URL/version/license/attribution, author details for reused sentence/translation pairs, human reviewer/date/modification record. |
| `grammar_progress` | Owner/lesson version, latest correct/total result, completion at `>=80%`, attempt timestamp. Once achieved, completion remains true for that content version even after a lower practice score; a new content version must be completed separately. |
| `learning_activity` | Owner/language/civil learning date/kind/count and idempotent originating event ID for streak and history calculations. |

Foreign keys must enforce language and ownership consistency as well as existence. Deleting a live vocabulary word must not destroy a frozen quiz snapshot. Use a nullable live-word link for old annotations or a deliberate unlink operation. Keep indexes on owner + language, due dates, session owner/status, and reading/version/range.

## Required RLS and authorization

- Enable RLS on every personal or exposed table. Grant personal reads/inserts/updates/deletes only to authenticated users whose ID equals the row owner. Update policies need both `USING` and `WITH CHECK`; insert policies need `WITH CHECK`. No anonymous personal-data access.
- Child tables must verify the owned parent and matching ownership/language. Apply this to accepted answers, versions, annotations, quiz questions/attempts/reservations, and settlements; an arbitrary foreign ID is never sufficient authorization.
- Published Grammar content can be read by the signed-in personal account. Content editing/publishing and human review metadata require a separately authorized administrative process. User progress remains owner-only.
- Prefer invoker-rights RPCs. Any unavoidable privileged function needs explicit ownership checks, restricted execution grants, and a safe search path. Read-only views must preserve underlying RLS.
- Validate the authenticated session and record ownership on every server mutation. Do not trust a client-supplied user ID, correct answer, grade, review stage, provider source, or publication status.

## Required Auth setup

After the owner connects Supabase, enable email/password sign-in, disable public sign-up, and pre-create the personal account through the approved administrative path. Provide login/logout and password recovery, configure local/production redirect URLs, and use the Next.js SSR cookie integration. Replace `AuthRepository` and the mock profile; protect pages and server handlers with verified session checks.

Keep development mocks as an explicit local/test composition. A production-connected build must use real authentication rather than silently allowing the mock account.

## Future environment variables

No credentials are required for this stage. In the connected stage, document and configure:

| Variable | Scope/purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL for browser/server clients. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client key, protected by RLS; never substitute an administrative secret. |
| `SUPABASE_SECRET_KEY` | Optional server/admin-only account provisioning or content import; never included in browser bundles. Ordinary user operations should use their authenticated session. |
| `DEEPL_API_KEY` | Server-only DeepL credential. |
| `DEEPL_API_BASE_URL` | Server-only endpoint selected from the actual connected plan; configure from current official documentation. |
| `APP_URL` | Canonical application URL for the final Auth redirect configuration. |

Pin any added Supabase packages and update the existing lockfile. Do not commit `.env.local` or secrets.

## Server integration and DeepL steps

1. Implement transactional Vocabulary import, quiz creation/answer/settlement, and Reading version updates behind the existing contracts. Expose the specified quiz session/answer and Reading lookup server endpoints; enforce owner checks and optimistic session versions. Reading edits must check the submitted expected body version, and annotations must retain the version of their original selection.
2. Lock a quiz session row while checking submission ID, expected version, grading, scheduling its next question, and committing the answer. Check an existing submission ID before rejecting a stale version. Return the latest session on a version conflict. Settle SRS exactly once when completed or actively ended; save-and-exit does not settle.
3. Preserve frozen selections, answers, choices, seed/state, and scheduler version. Test concurrent submissions from desktop/mobile and recovery after refresh before enabling real sync.
4. Implement server-only DeepL translation and usage retrieval. Send only the requested text and its sentence context, with the correct source language and English target. Never pretranslate an article, infer readings/lemmas/POS, or leak the key.
5. Scope caches and deduplicated requests to user/language/text/sentence; label machine results and let the user revise/add them to Vocabulary. Treat provider failure, exhausted allowance, and stale Reading versions as recoverable conditions with manual entry still available.
6. Read the actual account allowance. The product specifies the new API Developer free allowance as a cumulative 1,000,000 characters with no reset; verify the connected plan and current usage response rather than hardcoding a monthly assumption. Never switch automatically to a paid plan. Discard development placeholder cache rows during migration.

Official references for the connected implementation: [Supabase Next.js SSR](https://supabase.com/docs/guides/auth/server-side/nextjs), [DeepL translation request](https://developers.deepl.com/api-reference/translate/request-translation), and [DeepL API plans](https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans). These integrations have not been executed in this stage.

## Proposed migration order

1. Profile/language/status constraints and ownership keys.
2. Vocabulary lists/entries/accepted answers and word progress.
3. Quiz snapshots/questions/attempts/reservations/settlements and activity.
4. Readings/body versions/annotations/contextual translation cache.
5. Versioned Grammar content/source/review tables and user progress.
6. Ownership foreign keys, indexes, grants, RLS policies, and transactional RPCs; verify isolation using two test users before importing personal data.
7. Provision the personal account, replace mock adapters/provider, import explicitly approved local data, and test timezone/concurrency/idempotency/CSV rollback/provider failure end to end.
8. Import/review all 240 licensed production lessons, then complete the original full acceptance journey. GitHub setup and Vercel deployment require the owner to connect/configure them in a later stage.

## Remaining decisions and acceptance

Choose the connected Supabase project/region and provisioned personal account, approve local-to-cloud import, supply DeepL credentials/verified plan, and arrange human reviewers and licensed source versions for all 240 Grammar lessons. Validate real device voices, cross-device resume, Auth redirects, RLS isolation, and actual DeepL quota/error responses once those services are connected. No production lesson review or cloud/device synchronization is claimed by the local stage.

The production content plan remains: [OpenJLPT](https://github.com/evanclan/OpenJLPT) candidates with CC BY-SA 4.0 attribution for Japanese, [Wikibooks Spanish](https://en.wikibooks.org/wiki/Spanish/Contents), and the [Kallipos beginner Greek grammar](https://repository-web.kallipos.gr/handle/11419/4393) as references. Optional [Tatoeba](https://tatoeba.org/en/terms_of_use) direct translation pairs must retain both authors and each sentence's license. Pin source versions and record `draft → reviewed → published`; do not treat generated development samples as reviewed production content.
