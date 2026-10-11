# NingLingo production implementation report

Verified October 11, 2026. The production implementation is committed and pushed to `main`. **The cloud release is blocked by administrative platform access and genuine human content review.** No cloud database migration, public-signup configuration change, permanent personal account, or Vercel deployment is claimed as completed.

The original [SPECIFICATION_V1.md](SPECIFICATION_V1.md) is unchanged. [PRODUCTION_SCOPE.md](PRODUCTION_SCOPE.md) records the subsequently authorized integration and Vocabulary additions. The prior stable local checkpoint remains in Git history (`0d5a027`, merged on `main` at `dde5e8f`).

## Production architecture

Next.js 16.4 App Router uses `@supabase/ssr` cookie sessions, separate browser/server clients, and the current `src/proxy.ts` convention for refresh/protected navigation. Every API operation independently verifies the cookie user with `auth.getUser()`. Login is email/password only; logout, persistence, expired-session handling, and protected pages/APIs are implemented. There is no signup or OAuth UI.

React calls the existing repository contracts through `src/repositories/http.ts`. Authenticated server implementations in `src/repositories/supabase.ts` replace Vocabulary, Quiz, Reading, Grammar, Progress, Settings, and session persistence. No production fallback seeds mock data. The explicit local development/test mode remains available and cannot activate on Vercel. Cross-device refresh uses focus/visibility, polling, optimistic conflicts, and cloud reads; history/activity reads paginate past Supabase's default row limit.

CSV parsing/preview stays client-side; confirmed import is one PostgreSQL transaction. Vocabulary now stores multiple translated examples and six explicit relation types in relational child tables while preserving the original seven-column CSV. Supplied Japanese readings render as ruby and share audio; Spanish/Greek pronunciations and forms remain explicit.

Quiz creation freezes full entries, accepted answers, type/configuration, deterministic seed and scheduler version. The existing tested engine grades/schedules on the server. Service-only atomic CAS functions persist state, relational questions/attempts/reservations, idempotency, activity, and SRS settlement. Snapshot/history immutability, stale versions, same-day advancement, early practice, timezone dates, and once-per-word settlement are preserved.

Reading uses version-checked edits, UTF-16 positional annotations, vocabulary links, longest Japanese matching, preserved accents, and annotation ? vocabulary ? contextual cache ? DeepL priority. Cache identity includes user/language/text/sentence. Concurrent requests merge within a server instance; database uniqueness merges duplicate cache writes. Alphabet stays static. Grammar grades and versioned progress persist through server/RPC operations; Dashboard/Progress read actual repository data.

## Database and migration status

**Cloud: 0 NingLingo migrations applied. Embedded PostgreSQL: all 11 applied and tested.** The supplied project Data API credentials work, but cannot execute DDL. `db:migrate` stopped before SQL execution because an authorized Management API credential was absent. A real grammar import attempt returned `PGRST202` for the missing `nl_import_grammar` function. Live cloud persistence/RLS verification therefore remains blocked; this is not a passing cloud-integration result.

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

[database/migrations](../database/migrations) and [database/README.md](../database/README.md) contain the reproducible schema and RPC contracts. `npm run db:migrate` uses the Cloud Management API, transactionally records SHA-256 migration history, and rejects rewritten/out-of-order history. `.gitattributes` fixes content/migration line endings for portable hashes. No Docker/local Supabase stack is required.

All 24 domain tables enable RLS. Personal SELECT/allowed writes use `auth.uid()`; composite foreign keys preserve ownership/language consistency. Anonymous access is revoked. Users cannot directly forge quiz grades, SRS stages, machine cache, grammar publication/review, or exercise completion. Published grammar requires a human review record; drafts and their child content are hidden. Privileged quiz/cache/content operations run only on the authenticated server or explicit administrative CLI. Pinned function search paths and execution grants are included.

## Authentication and DeepL verification

Live email/password and browser cookie authentication passed **7 assertions**, including login, reload persistence, protected navigation, logout, and unauthenticated API rejection. Two temporary confirmed verification accounts were removed; the final admin probe found **0 users**. No permanent account was invented because the owner's intended email/private password was not supplied. `node scripts/provision-account.mjs` provides interactive account creation with hidden password input and sends no email.

The final Auth settings probe still reports `disable_signup=false`. Disable **Allow new users to sign up** in Supabase [Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration) once configuration access is available. Keep email/password enabled; configure Site URL/redirect URLs for the actual deployed domain. No OAuth configuration is needed.

DeepL is implemented server-side and verified live. The configured hostname rejected the supplied key; only `DEEPL_API_BASE_URL` in ignored `.env.local` was corrected to `https://api-free.deepl.com`. Usage returned HTTP 200 with **1 / 1,000,000 characters used** after one selected Japanese character translation also returned HTTP 200. The provider reads actual allowance, sends selected text with bounded sentence context, labels machine output, infers no reading/POS/lemma, and retains manual entry on configuration/network/rate/quota failure. No billing upgrade was attempted. Cloud cache persistence awaits migrations; adapter/SQL behavior is tested locally.

## Grammar content status

| Language | Prepared | Draft | Human reviewed | Published |
| --- | ---: | ---: | ---: | ---: |
| Japanese | 100 (81 N5, 19 foundational N4) | 100 | 0 | 0 |
| Spanish | 80 | 80 | 0 | 0 |
| Modern Greek | 60 | 60 | 0 | 0 |
| Total | 240 | 240 | 0 | 0 |

The dataset has **720 translated examples and 1,200 exercises**, stable IDs, pinned source/license metadata, content versions and modification notes. Structural QA passes every record; it does not certify native-speaker correctness or semantic uniqueness of every distractor. No AI authoring/automated QA is mislabeled as human review. Production UI reads published content only and explains review-pending empty states.

[GRAMMAR_CONTENT.md](GRAMMAR_CONTENT.md) documents OpenJLPT attribution, original Spanish/Greek authoring, pinned Wikibooks/Kallipos references, and review/version rules. `grammar:build`, `grammar:validate`, and `grammar:import` prepare/validate/import the initial drafts atomically. An explicit `--reviewed-file=...` import accepts genuinely approved version-2-or-later records with reviewer/date metadata; initial draft files stay unchanged. All 240 require actual qualified human review before the full v1 content release.

## Final verification results

| Check | Verified result |
| --- | --- |
| ESLint | PASS, zero warnings |
| TypeScript | PASS |
| Unit/repository tests | **451 / 451**, 20 files |
| Included PostgreSQL migration/security tests | **27 / 27**, including all 240 draft imports, ownership A/B, atomic rollback, CAS, SRS and draft isolation |
| Included production Supabase adapter tests | **27 / 27**, including field mapping, version/idempotency conflicts, lookup/cache and pagination |
| Included production grammar QA tests | **255 / 255** |
| Playwright browser tests | **20 / 20**, Microsoft Edge, explicit local repositories; all original 17 retained plus 3 Vocabulary extension flows |
| Live Supabase Auth | **7 assertions PASS**, 2 temporary accounts cleaned up |
| Live cloud persistence/RLS | BLOCKED by unapplied schema; `test:cloud` intentionally reports failure after passing Auth |
| Live DeepL | Usage and selected-text translation HTTP 200 |
| Grammar CLI / migration file validation | PASS: 240 records / 11 ordered files |
| Production build | PASS, Next.js webpack production build with protected dynamic routes and Proxy |
| Secret checks | PASS: configured server credentials absent from client artifacts and staged files; `.env.local` ignored/uncommitted |

Browser checks include four quiz modes, one-word typing/retries, conflicts/resume/frozen snapshots, hint/audio isolation, Reading selection/version/cache architecture, CSV, richer Vocabulary data, grammar 80% completion, Dashboard/settings, all pages/languages, and mobile layout. Local/database tests cover the remaining scheduler boundary counts, collision/repeated/tail retries, SRS/timezone/ownership and structural content cases. These local results do not imply unperformed live database or deployment checks passed.

## GitHub, deployment and remaining access

Implementation commit: **`426791aa05c4e3d30917ef27d3bb8ee591ee45c0`** on `main`, successfully pushed to [ShuaiLn/NingLingo](https://github.com/ShuaiLn/NingLingo). The report is recorded in a subsequent documentation commit. No feature branch, force push, or secret commit was used; the remote was fetched/reconciled before pushing.

**Vercel: not deployed; no production URL verified.** No connected Vercel account/project or CLI token was available. `vercel.json`, Next.js build settings, ignored local project files, and production environment documentation are prepared. GitHub's `main` must be connected to the accessible Vercel project, then deployment/build/runtime and live flows verified. Supabase Auth URL configuration follows the actual domain.

Required Vercel production variable names are **`NEXT_PUBLIC_SUPABASE_URL`**, **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**, **`SUPABASE_SECRET_KEY`**, **`DEEPL_API_KEY`**, **`DEEPL_API_BASE_URL`**. Only the first two are browser-public. Do not set the local mock-mode switch in production. `SUPABASE_ACCESS_TOKEN` is an operator-only migration credential and is not required by the deployed app.

Exact remaining external inputs/actions:

1. Supply authorized Supabase SQL/Management access to apply migrations 001?011 and configure public signup off. Existing publishable/secret Data API keys cannot perform those actions. Then import drafts and re-run full live persistence/RLS verification.
2. Supply the intended personal-account identity/private password securely or use the prepared interactive provisioner; no permanent account currently exists.
3. Supply Vercel account/project access to connect the repository, configure the five production variables, deploy, inspect logs, verify the real URL, and finish Supabase URL settings.
4. Complete genuine human review/corrections for all 240 grammar lessons and publish approved immutable versions with actual reviewer/date records.

No known local implementation/test/build failures remain. The cloud-backed acceptance flow and complete v1 publication remain explicitly unverified until these external prerequisites are resolved.
