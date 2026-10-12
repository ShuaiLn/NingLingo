# NingLingo production implementation report

Verified October 11, 2026 (America/Tijuana). **Supabase is connected and all 240 grammar lessons have been imported as drafts.** The owner applied migrations 001–011 and created the permanent personal account. Live verification found two concrete integration problems: browser-origin validation and Reading version-conflict errors. The browser fix is implemented; the Reading correction is prepared as migration 012 and needs cloud SQL execution. The configured Auth endpoint still reports signup enabled. **Vercel deployment is explicitly postponed by the owner.**

The original [SPECIFICATION_V1.md](SPECIFICATION_V1.md) is unchanged. [PRODUCTION_SCOPE.md](PRODUCTION_SCOPE.md) records the subsequently authorized integration and Vocabulary additions. The prior stable local checkpoint remains in Git history (`0d5a027`, merged on `main` at `dde5e8f`).

## Production architecture

Next.js 16.4 App Router uses `@supabase/ssr` cookie sessions, separate browser/server clients, and the current `src/proxy.ts` convention for refresh/protected navigation. Every API operation independently verifies the cookie user with `auth.getUser()`. Login is email/password only; logout, persistence, expired-session handling, and protected pages/APIs are implemented. There is no signup or OAuth UI.

React calls the existing repository contracts through `src/repositories/http.ts`. Authenticated server implementations in `src/repositories/supabase.ts` replace Vocabulary, Quiz, Reading, Grammar, Progress, Settings, and session persistence. No production fallback seeds mock data. The explicit local development/test mode remains available and cannot activate on Vercel. Cross-device refresh uses focus/visibility, polling, optimistic conflicts, and cloud reads; history/activity reads paginate past Supabase's default row limit.

CSV parsing/preview stays client-side; confirmed import is one PostgreSQL transaction. Vocabulary now stores multiple translated examples and six explicit relation types in relational child tables while preserving the original seven-column CSV. Supplied Japanese readings render as ruby and share audio; Spanish/Greek pronunciations and forms remain explicit.

Quiz creation freezes full entries, accepted answers, type/configuration, deterministic seed and scheduler version. The existing tested engine grades/schedules on the server. Service-only atomic CAS functions persist state, relational questions/attempts/reservations, idempotency, activity, and SRS settlement. Snapshot/history immutability, stale versions, same-day advancement, early practice, timezone dates, and once-per-word settlement are preserved.

Reading uses version-checked edits, UTF-16 positional annotations, vocabulary links, longest Japanese matching, preserved accents, and annotation → vocabulary → contextual cache → DeepL priority. Cache identity includes user/language/text/sentence. Concurrent requests merge within a server instance; database uniqueness merges duplicate cache writes. Alphabet stays static. Grammar grades and versioned progress persist through server/RPC operations; Dashboard/Progress read actual repository data.

## Database and migration status

**Cloud: migrations 001–011 applied by the owner; live schema/RPC operations are available. Embedded PostgreSQL: all 12 migrations applied and tested.** Original migration files remain unchanged. No runner-managed cloud checksum history is claimed because the owner applied SQL independently. Existing Data API credentials cannot execute the additional DDL, and no Management token or authenticated Supabase CLI is available.

Migration **[012_reading_conflict_errors.sql](../database/migrations/012_reading_conflict_errors.sql)** replaces only `nl_save_reading` and `nl_annotate_reading`. Stale versions currently raise `40001`, which the live PostgREST service retries instead of returning promptly. The correction uses non-retryable `22023`, preserving ownership checks, row locks, body-version validation and execution grants. Both corrected conflict paths pass actual PostgreSQL regression tests. [Supabase documents the retry-loop behavior](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). **012 has not been applied to Cloud.**

| Migration | Responsibility |
| --- | --- |
| 001 | Profiles, timezone/language settings, account bootstrap |
| 002 | Lists, entries, accepted answers, word progress |
| 003 | Immutable quiz snapshots, questions, attempts, retries, settlements, activity |
| 004 | Readings, body versions, annotations, contextual cache, Unicode ranges |
| 005 | Normalized grammar versions/examples/exercises/sources/reviews/progress |
| 006 | Vocabulary examples and related/derived words |
| 007 | Ownership RLS and published-content isolation |
| 008 | Validated repository read/mutation functions and atomic CSV import |
| 009 | Service-only quiz CAS/idempotency and transactional SRS |
| 010 | Atomic immutable grammar import and publication validation |
| 011 | Ownership/query indexes and explicit execution grants |
| 012 | Non-retryable Reading version-conflict errors; prepared, cloud application pending |

[database/migrations](../database/migrations) and [database/README.md](../database/README.md) contain the reproducible schema and RPC contracts. `npm run db:migrate` uses the Cloud Management API, transactionally records SHA-256 migration history, and rejects rewritten/out-of-order history. `.gitattributes` fixes content/migration line endings for portable hashes. No Docker/local Supabase stack is required.

All 24 domain tables enable RLS. Personal SELECT/allowed writes use `auth.uid()`; composite foreign keys preserve ownership/language consistency. Anonymous access is revoked. Users cannot directly forge quiz grades, SRS stages, machine cache, grammar publication/review, or exercise completion. Published grammar requires a human review record; drafts and their child content are hidden. Privileged quiz/cache/content operations run only on the authenticated server or explicit administrative CLI. Pinned function search paths and execution grants are included.

## Authentication and DeepL verification

The permanent personal account and its migrated profile were verified without reading or changing its password. Live email/password and browser-cookie authentication pass the original **7 authentication assertions**; two additional preflight checks verify existing accounts/profiles. Verification creates two disposable confirmed users, uses independent browser contexts, removes their data/accounts, and verifies existing accounts remain intact. No owner learning data is changed.

An initial Playwright timeout included a disposable test-session cookie in diagnostic output. That account was deleted; the runner now withholds raw authenticated request headers and redacts its ignored local server log.

The confirmed application fix changes API origin validation to use the incoming Host and forwarded protocol rather than Next's internal `localhost` URL. Valid browser requests on `127.0.0.1` previously returned HTTP 403. Six regression cases cover local/public HTTPS origins and foreign/opaque/cross-site rejection. Same-origin browser API access is verified live.

The final Auth settings probe still reports `disable_signup=false`. Disable **Allow new users to sign up** in Supabase [Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration) once configuration access is available. Keep email/password enabled; configure Site URL/redirect URLs for the actual deployed domain. No OAuth configuration is needed.

DeepL is implemented server-side and verified live through the authenticated Reading API. Usage reads the actual allowance from `https://api-free.deepl.com`; the final independent check returned HTTP 200 and **11 / 1,000,000 characters used**. A selected Spanish word with sentence context was translated, concurrent lookups produced one stored contextual cache record, and a second browser context reused that cache. Manual annotations and personal vocabulary take precedence over cache/provider results. Machine output supplies translation only; editing it before adding to Vocabulary works. No full document translation or billing upgrade is performed. Missing configuration, service/rate/quota failures retain manual entry and remain covered by provider tests.

## Grammar content status

| Language | Prepared | Draft | Human reviewed | Published |
| --- | ---: | ---: | ---: | ---: |
| Japanese | 100 (81 N5, 19 foundational N4) | 100 | 0 | 0 |
| Spanish | 80 | 80 | 0 | 0 |
| Modern Greek | 60 | 60 | 0 | 0 |
| Total | 240 | 240 | 0 | 0 |

All 240 records are stored in Cloud as version-1 drafts, with **720 translated examples and 1,200 exercises**, stable IDs, pinned source/license metadata and modification notes. Re-import is idempotent. No review records or published lessons were created. Structural QA passes every record; it does not certify native-speaker correctness or semantic uniqueness of every distractor. Production clients cannot read draft lessons or their child metadata, and the UI explains the pending human review.

No live published-lesson grading is claimed while every lesson is a draft. The 80% rule and versioned completion are verified with embedded PostgreSQL and development browser fixtures. Cloud checks reject draft submissions and verify grammar-progress persistence/isolation using one disposable admin-created progress fixture with `completed=false`, removed with its temporary account.

[GRAMMAR_CONTENT.md](GRAMMAR_CONTENT.md) documents OpenJLPT attribution, original Spanish/Greek authoring, pinned Wikibooks/Kallipos references, and review/version rules. `grammar:build`, `grammar:validate`, and `grammar:import` prepare/validate/import the initial drafts atomically. An explicit `--reviewed-file=...` import accepts genuinely approved version-2-or-later records with reviewer/date metadata; initial draft files stay unchanged. All 240 require actual qualified human review before the full v1 content release.

## Final verification results

| Check | Verified result |
| --- | --- |
| ESLint | PASS, zero warnings |
| TypeScript | PASS |
| Unit/repository tests | **459 / 459 PASS**, 20 files; all previous tests retained |
| Included PostgreSQL migration/security tests | **29 / 29**, all 12 migrations, including both non-retryable Reading conflict regressions |
| Included production Supabase adapter tests | **27 / 27**, including field mapping, version/idempotency conflicts, lookup/cache and pagination |
| Included production grammar QA tests | **255 / 255** |
| Playwright browser tests | **20 / 20**, Microsoft Edge, explicit local repositories; all original 17 retained plus 3 Vocabulary extension flows |
| Live Supabase Auth | 7 authentication assertions plus 2 account/profile preflight checks; temporary accounts cleaned up |
| Live cloud persistence/RLS | **789 assertions PASS; 3 checks unresolved.** Both stale Reading RPCs time out until 012 is applied; Auth still reports signup enabled. The full runner correctly exits nonzero. All 24 tables pass populated-owner A/B isolation, anonymous denial and privileged-write checks. |
| Independent anonymous RPC probe | **3 / 3 PASS**: profile, grammar listing and privileged grammar-import calls rejected |
| Live DeepL | Usage and selected-text translation HTTP 200 |
| Grammar CLI / migration file validation | PASS: 240 draft records / 12 ordered files; cloud import returned imported=240, unchanged=0; repeated import unchanged=240 |
| Production build | PASS, Next.js webpack production build with protected dynamic routes and Proxy |
| Secret checks | PASS: production client artifacts, all **142 repository files**, and both commit staging scans (7 implementation files and this report) contain no configured server credentials/private environment files. `.env.local` remains ignored/uncommitted. |

Browser checks include four quiz modes, one-word typing/retries, conflicts/resume/frozen snapshots, hint/audio isolation, Reading selection/version/cache architecture, CSV, richer Vocabulary data, grammar 80% completion, Dashboard/settings, all pages/languages, and mobile layout. Local/database tests cover the remaining scheduler boundary counts, collision/repeated/tail retries, SRS/timezone/ownership and structural content cases. These local results do not imply unperformed live database or deployment checks passed.

## GitHub, deployment and remaining access

Verification/fix commit: **`0d4c5b792e4acdad9e433e8b0343aa33971ca1fa`** on `main`, successfully pushed to [ShuaiLn/NingLingo](https://github.com/ShuaiLn/NingLingo). The prior implementation commit `426791aa05c4e3d30917ef27d3bb8ee591ee45c0` remains in history. This report is recorded in a subsequent documentation commit. No feature branch, force push, or secret commit was used; the remote was fetched and matched local `main` before the verification commit was pushed.

**Vercel: not deployed, as explicitly requested for this verification stage; no production URL is verified or claimed.** No Vercel configuration or deployment action was attempted. Deployment, production environment configuration and domain-specific Supabase redirect settings belong to a later authorized stage.

Required Vercel production variable names are **`NEXT_PUBLIC_SUPABASE_URL`**, **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**, **`SUPABASE_SECRET_KEY`**, **`DEEPL_API_KEY`**, **`DEEPL_API_BASE_URL`**. Only the first two are browser-public. Do not set the local mock-mode switch in production. `SUPABASE_ACCESS_TOKEN` is an operator-only migration credential and is not required by the deployed app.

Exact remaining external actions for live verification:

1. Execute **only migration 012** in the configured project's SQL editor, or provide authorized SQL/Management execution access. Do not reapply migrations 001–011. This fixes the two live Reading conflict checks that currently time out.
2. In that same project's **Authentication → Sign In / Providers**, turn off **Allow new users to sign up** and save. The live `/auth/v1/settings` response still has `disable_signup=false`, despite the owner's earlier dashboard change. Email/password remains enabled. The supplied credentials cannot change this configuration.

Then rerun `npm run test:cloud`; it fails honestly while either prerequisite remains unresolved. It attempts both conflict checks with bounded deadlines, removes their disposable readings to stop retries, continues the independent persistence/security checks, and reports each outstanding failure. It never modifies owner learning data or publishes grammar. The server log is kept in ignored `.local-preview/cloud-server.log`, with credential/cookie redaction; browser exceptions omit raw authenticated headers.

Future full-v1 content publication still requires genuine human review and approved versioned records for all 240 lessons. This stage deliberately keeps every lesson a draft. Vercel remains postponed by instruction, rather than being a blocker to this verification stage.
