# Learning and quiz expansion

This implementation extends the current Vocabulary and Alphabet session engines. The original scheduler version, retry intervals, frozen snapshots, optimistic versions, answer submission idempotency, SRS settlement, and local storage key remain in use. Migrations 001–013 and the original 240 grammar lessons/releases remain unchanged.

## Implemented behavior

- Korean (`ko`, `ko-KR`) throughout navigation/authentication, vocabulary/CSV, translation, reading, quizzes, progress and speech. The curriculum contains 40 Hangul cards and 60 published AI-authored lessons, each with at least three translated examples and five exercises. All sixty are now installed in production with independent `published-ai` status and explicit disclosure that they have not been reviewed by a human.
- Independently selectable languages, word sets, words, question types and translation directions. Ordinary multi-language questions do not require word pairs. Translation-only, type-only and combined mixing use only feasible user-enabled configurations. Ineligible words are explained before starting.
- Word pair suggestions from saved English meanings and accepted answers, confidence warnings, confirmation, editing, and deletion tombstones. Confirmed relationships take priority. Only the tested word receives progress/SRS and activity; contextual target languages remain searchable in history.
- Per-question frozen modes, source/target languages, answers, distractors and directions. Native spelling preserves accents and scripts. Japanese kana readings do not substitute for kanji spelling.
- Alphabet MCQ in both directions, with exactly four frozen options and one defensible answer. Ambiguity is checked independently for each direction. Retry, resume and history retain option IDs/order, even after live content changes.
- Independent manual care and automatic suppression. Correct answers and settlement retain manual care. Remove preserves historical evidence; only a newly inserted incorrect answer can clear suppression. Replays and delayed settlements cannot reactivate care.
- Saved per-session answer-detail presentation, defaulting to Always show. Shared full word details show current saved metadata; deleted words use the historical snapshot and disable care controls.
- Complete completed/ended Quiz Summary, reopened from history and grouped by tested word ID. Every attempt remains ordered; initial/final outcomes, question/initial accuracy, retries, fillers and actual unique tested words are separate. Zero answers display 0/0 and empty accuracy.
- Separate Vocabulary/Alphabet automatic audio preferences and manual replay. Native source text is spoken with the matching language; listening spelling hides the written answer. Delayed voices, effect replay, question transitions, page exit and audio failure are handled.

## New migrations

| File | Purpose |
| --- | --- |
| `014_korean_and_ai_grammar.sql` | Korean constraints and independent AI lesson publication/read/grading support |
| `015_mixed_language_quiz.sql` | Owner-scoped word pairs, participating-language history, per-question grading and frozen template checks |
| `016_quiz_presentation_and_care.sql` | Owner-scoped preferences/care, immutable session presentation, new incorrect-answer reactivation |
| `017_alphabet_mcq.sql` | Frozen four-option/direction validation and service-only Alphabet grading extensions |

All 17 migrations apply sequentially in embedded PostgreSQL. The resulting 29 public domain tables have RLS. Ordinary users cannot write grades, SRS, frozen snapshots or grammar publication states.

## Cloud state

The user manually applied migrations 014–017. This verification executed **no migrations or cloud DDL**. Read-only Data API inspection verified 24 tables / 115 selected columns, 21 new column types and 15 RPC signatures, including required/optional arguments.

The user supplied the JSON returned by `database/verify_expansion_schema.sql` in Supabase SQL Editor. Manual comparison against an isolated PGlite database built from migrations 001–017 verified 27 tables, 223 columns, 171 CHECK/FK/UNIQUE/PK/constraint-trigger definitions, 76 indexes, 34 RLS policies, seven public table triggers and the auth bootstrap trigger. All 40 function body MD5 values match the local definitions; signatures, security settings and execution grants match. Live PostgreSQL 17 stores NOT NULL in column attributes; local PostgreSQL 18 additionally exposes these as constraint objects. No live catalog JSON file was fabricated and no automated full-file comparison is claimed. `scripts/compare-cloud-schema.mjs` supports future file-based comparisons.

The private checksum ledger remains inaccessible through the Data API (`PGRST106`). No Management API token or database connection string is configured. This does not justify replaying already installed migrations; schema and behavior were verified independently.

The migration runner now inspects schema/history before DDL and refuses to replay legacy migrations when an existing schema has incomplete checksum history. It does not fabricate old migration history.

The final live run passed **537 checks**: 116 legacy/baseline, 293 new-feature repository/RPC, 69 grammar/publication/cleanup, 35 production-browser and 24 owner cleanup checks. It exercised actual production repositories, RPCs and the existing production Next build with real Supabase accounts and browser cookie sessions; network/data responses were not mocked.

Coverage includes independent and combined language/type/direction selection; suggested/confirmed/ambiguous/edited/deleted pairs; frozen cross-language grading; only the tested word advancing SRS/activity; manual/automatic/suppressed care and submission replay; all three presentation settings; full completed/ended/deleted-word Summary and history reopening; both Alphabet MCQ directions, frozen retry/resume/order and rejection of forged answers; four native-script audio sources; two-device persistence; populated bidirectional RLS, anonymous denial and protected-write denial; Korean AI provenance/publication and hidden drafts; and old Vocabulary, Reading, Grammar, Alphabet and SRS behavior.

The final run removed 2/2 disposable accounts, both imported temporary grammar points and associated fixtures. Cleanup verified zero residuals across 23 owner tables and seven grammar tables, preserved existing accounts, and restored the original grammar inventory. An earlier run's cleanup dependency was corrected (temporary grammar progress must be removed before its point); its two accounts and two temporary points were also removed and verified before the final run.

**Production content verified:** after explicit authorization, the exact existing Korean dataset was imported without generating or changing any lessons. Cloud inventory is Japanese 100 / Spanish 80 / Greek 60 / Korean **60/60**. All Korean lessons retain `published-ai`, null reviewers and the required AI disclosure. There are 180 translated examples, 300 exercises and zero Korean human-review records. Replaying the exact import returned **0 imported / 60 unchanged**, with unchanged relational hashes.

The Korean-only publisher passed **379 checks**. Subsequent verification with a real production Next server passed **380 checks**, including **20 browser checks** of all sixty ordered lesson cards, first/middle/last lesson content, reload and two authenticated devices. Both temporary publication-verification accounts were removed with zero owned-data residuals. SHA-256 snapshots preserved all original 240 points, 480 versions, 1,440 examples, 2,400 exercises, 1,120 source records and 240 review records. No migrations were replayed or unrelated production user data changed.

The existing database RPC orders by ID. A Korean-only repository mapping restores the authored syllabus order without replacing live content, exposing hidden lessons or changing other languages' ordering. Three regression tests cover ordering, empty/partial published sets, future IDs and old-language behavior. `grammar:publish:ko` submits only the exact pinned Korean manifests; the default `grammar:import` remains available for its existing all-language workflow.

## Main changed modules

- `src/domain/quiz.ts`, `mixed-quiz.ts`, `word-pairs.ts`, `alphabet-quiz.ts`: existing scheduler integration, explicit feasibility, deterministic frozen generation and grading.
- `src/domain/quiz-summary.ts`, `word-care.ts`, `quiz-preferences.ts`: ordered word aggregation, independent care/suppression, presentation behavior.
- `src/repositories/{contracts,local,storage,http,supabase}.ts` and `src/services/repository-operations.ts`: compatible persistence, authenticated API validation, cloud owner operations and history queries.
- `src/components/{quiz-page,quiz-summary,word-details,word-care,word-pairs,alphabet-quiz,quiz-audio}.tsx`: selection, full details/history, shared actions, keyboard controls and audio timing.
- Korean language/auth/translation plumbing, `src/data/alphabet.ts`, `content/grammar/{authoring/ko.mjs,generated/ko.json}` and grammar tooling/UI.
- Migrations 014–017, safe migration/cloud inspection scripts, unit/PostgreSQL tests and desktop/mobile Playwright coverage.

## Validation

Validation commands were run separately with explicit time limits after the stale shell recovery. The old validation session was no longer available and no stale Node/tsc process was present; standalone typecheck completed successfully.

| Check | Result |
| --- | --- |
| Unit and database regression suite | **40 files, 827/827 tests passed**, including 76 real embedded PostgreSQL integration tests and three Korean cloud-order regression checks |
| Browser/Playwright | **60/60 distinct scenarios verified**: 51 passed in the first bounded full run; its 2 corrected expectations and 7 cases left by the 600-second suite limit all passed in a separate 9-case run |
| ESLint | Passed with zero warnings |
| Typecheck | Passed as a standalone bounded command |
| Grammar validation | 300 lessons (100 Japanese, 80 Spanish, 60 Greek, 60 Korean), 900 examples, 1,500 exercises |
| Migration order/application validation | 17 ordered files; all apply sequentially in embedded PostgreSQL; 001–013 unchanged |
| Live cloud integration | **537 expansion checks passed**; Korean publication **379 checks passed**, followed by **380 verification checks** including 20 real production-browser checks; all temporary accounts/data cleaned |
| Production build | Passed with Next.js 16.4.0 webpack; static generation and TypeScript completed |
| Client secret scan | Passed; no configured server credentials in client artifacts |
| Repository/server secret scan | Passed for 219 repository files and 92 server artifacts; no embedded credentials or private environment files |

The browser expectation changes preserve exact assertions: disabled word-set labels now match the actual accessible name, and Japanese example speech checks the saved Japanese source sentence while retaining ruby/kana and unchanged-progress checks. No existing regression scenario was deleted or disabled. Cloud schema and Korean publication are independently verified above.

The final database integration check also verifies that direct session creation remembers its explicit presentation preference while preserving both audio preferences, another account's defaults, and legacy snapshots without a presentation field. This uses the new migration 016 only.

After Korean publication, standalone typecheck and ESLint (zero warnings) passed, followed by a fresh full **827-test** unit/database regression run. The final production build, client secret scan and repository/server secret scan also passed. Commands ran sequentially with explicit time limits. Earlier migration sequence and grammar validation passed. The 60 local Playwright scenarios above are the preceding complete browser regression results; cloud verification separately added 35 expansion-browser checks and 20 production Korean course browser checks. No existing test or rule was weakened or disabled.

The release commit contains legitimate application code, new migrations 014–017, tests, documentation, Korean authoring/generated content and verification tooling. Original migrations 001–013 remain unchanged. Ignored `.local-preview/`, `.next/`, `node_modules/`, test outputs/reports, coverage, TypeScript caches, local environment files and platform caches are excluded. Final commit/push synchronization is reported in the release response; no Vercel deployment or deployment-setting change is authorized in this release step.

## Practical limits

Suggested word pairs can connect different senses of a shared English meaning; warnings and manual confirmation/editing remain available. Device speech depends on installed matching voices. Korean courses retain their AI-authored, not human-reviewed status. Vercel was not deployed and deployment settings were not changed.
