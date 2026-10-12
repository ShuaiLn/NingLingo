# NingLingo production verification report

## Alphabet Quiz and Vocabulary CSV — October 12, 2026

The new features passed live verification against the connected production Supabase project and the current production build. Migration [013_alphabet_quiz.sql](../database/migrations/013_alphabet_quiz.sql) was applied by the owner before this pass. No DDL was executed here, and no applied migration was rewritten. Migrations 001–013 now form the verified schema, with 26 RLS-enabled domain tables.

The final new-feature cloud run passed **232 recorded checks**, plus browser assertions, using two disposable accounts. It verified three-language Alphabet creation/grading/retries, immutable versioned snapshots, Save/Resume/end, submission replay, version conflicts, hints, separate Progress/history, bidirectional session/attempt isolation and service-only grant denial. Cloud-backed CSV browser checks verified word-only and legacy previews, lookup deduplication, account/language/Reading cache separation, manual edits including clearing while a response is pending, file replacement/closure, duplicate reclassification, retry and partial atomic imports. Rejected confirmation retains the complete preview; a real database import failure rolls back the entire batch. Both accounts and their cascading data were deleted; an independent Auth inventory found zero remaining verification accounts.

Provider misses and failures are tested with injected providers; cloud lookups use disposable cache fixtures, so this pass made no real DeepL requests. The accepted pronunciation strings remain explicit learner answers. Vocabulary SRS and the existing Quiz scheduler are unchanged in behavior. Reading, Grammar and Auth regressions passed the full test suites.

| Current verification | Result |
| --- | --- |
| Lint / standalone typecheck | Passed, zero lint warnings; typecheck repeated after production build |
| All unit/repository tests | 654 passed in 32 files |
| Included PostgreSQL/database tests | 55 passed: 29 existing + 26 Alphabet/namespace tests, all 13 migrations |
| Complete Playwright run | 40/40 passed in one run, including all three languages and existing features |
| New-feature live cloud | 232 checks passed; two accounts cleaned up |
| Migration sequence | 13 ordered files validated without cloud writes |
| Production build | Passed, Next.js 16.4.0 / webpack |
| Client and repository/server secret scans | Passed: 178 repository files and 92 server artifacts |
| Staged secret scan / staged diff check | Passed: 50 changed files, no credentials/private environment files |
| Diff whitespace check | Passed |

Production Grammar inventory was identical before and after verification: **240 original v1 drafts and 240 pre-existing published v2 records**. None was regenerated, imported, reviewed, published or assigned a different status in this work. The historical report below predates the existing v2 publication and must not be read as the current inventory.

There is no remaining external blocker for these features. No Vercel deployment was performed. See [ALPHABET_CSV_VERIFICATION.md](ALPHABET_CSV_VERIFICATION.md) for the coverage boundaries, reproduction commands and complete changed-file manifest, and [ALPHABET_AND_CSV.md](ALPHABET_AND_CSV.md) for behavior.

<details>
<summary>Historical integration verification — October 11, 2026</summary>

Verified October 11, 2026 (America/Tijuana). **The final cloud run passed 858 assertions with no unresolved application/database failures.** Migrations 001–012 are applied; both Reading conflict checks pass. Public email/password signup remains intentionally enabled, and email confirmation remains required. All 240 grammar lessons remain drafts. **Vercel was not touched.**

The remaining external public-signup prerequisite is **custom SMTP**. The actual signup request received Supabase's built-in sender `429 over_email_send_rate_limit`. Provisioning, confirmation, cookie sessions, and isolation passed separately with disposable confirmation fixtures. Successful public registration and inbox delivery are not claimed.

The original [SPECIFICATION_V1.md](SPECIFICATION_V1.md) is preserved. [PRODUCTION_SCOPE.md](PRODUCTION_SCOPE.md) explicitly records the owner's public-signup change and Vocabulary extension. The personal-only restriction is superseded; `disable_signup=false` is intentional, not an unresolved issue or deployment blocker.

## Production architecture

Next.js 16.4 App Router uses `@supabase/ssr` cookie sessions, separate browser/server Supabase clients, and `src/proxy.ts` for session refresh/protected navigation. Each API operation independently verifies the user with `auth.getUser()`. Email/password signup, login, logout, confirmation callbacks, persistent sessions, and expired-session handling are implemented. No OAuth/social login was added.

React uses repository contracts through `src/repositories/http.ts`; authenticated implementations in `src/repositories/supabase.ts` provide Vocabulary, Quiz, Reading, Grammar, Progress, Settings, and session persistence. Production does not seed mock data. Explicit local repositories remain for development/browser tests and cannot activate on Vercel. Focus/visibility, polling, optimistic conflicts, and cloud reads support cross-device refresh; history/activity queries paginate past the default row limit.

CSV parsing/preview remain client-side; confirmed imports are one PostgreSQL transaction. Vocabulary supports relational translated examples and six explicit relation types while preserving the seven-column CSV. Japanese ruby/audio use supplied readings; Spanish/Greek forms and pronunciation remain explicit.

Quiz freezes entries, accepted answers, type/configuration, random seed, and scheduler version. The existing server-side engine and service-only CAS functions atomically persist questions, attempts, reservations, idempotency, activity, and once-per-word SRS settlement. Frozen snapshots, stale versions, cross-device resume, retry spacing, same-day advancement, early practice, and timezone dates are verified.

Reading retains version-checked edits, UTF-16 annotations, vocabulary links, longest Japanese matching, accents, and annotation → vocabulary → contextual cache → DeepL priority. Cache identity includes user/language/text/sentence. Concurrent requests merge within a server instance; database uniqueness merges cache writes. Alphabet remains static. Grammar scoring/versioned progress and Dashboard use production repositories.

## Database and migration status

**All 12 migrations were applied to Cloud by the owner.** Live schema/RPC checks and embedded PostgreSQL tests pass. Migration source files were not rewritten, and no additional cloud DDL was executed during this pass. Owner-applied SQL does not imply that the optional runner's checksum-history table was populated.

| Migration | Responsibility |
| --- | --- |
| 001 | Profiles, timezone/language settings, automatic Auth account bootstrap |
| 002 | Lists, entries, accepted answers, word progress |
| 003 | Quiz snapshots, questions, attempts, retries, settlements, activity |
| 004 | Readings, versions, annotations, contextual cache, Unicode ranges |
| 005 | Grammar versions/examples/exercises/sources/reviews/progress |
| 006 | Vocabulary examples and related/derived words |
| 007 | Ownership RLS and published-content isolation |
| 008 | Validated repository functions and atomic CSV import |
| 009 | Service-only quiz CAS/idempotency and transactional SRS |
| 010 | Immutable grammar import and publication validation |
| 011 | Ownership/query indexes and explicit execution grants |
| 012 | Non-retryable Reading version-conflict errors |

[Migration 012](../database/migrations/012_reading_conflict_errors.sql) replaces retryable `40001` application errors with `22023`, preserving ownership, locks, version validation, and grants. **Both stale-save and stale-annotation checks return HTTP 400 promptly in Cloud.** No SQL application remains pending for this verification stage.

[database/migrations](../database/migrations) and [database/README.md](../database/README.md) preserve the schema/RPC contracts. `db:check` validates ordered files without cloud writes. The optional Management API runner records checksums and rejects rewritten/out-of-order history. Do not reapply initial migrations to this existing project. No Docker/local Supabase is required.

## RLS and security

All 24 domain tables enable RLS. Personal access uses `auth.uid()`; composite foreign keys preserve ownership/language consistency. Anonymous domain access is denied. Both fixture accounts have populated rows in all 18 user-owned tables: **A cannot read or modify B's data, and B cannot read or modify A's data**, including profiles/settings, vocabulary children, SRS, quiz state/history, Reading versions/annotations/cache, grammar progress, and activity. Foreign-record application operations reject access. Both temporary accounts and their fixtures were removed; the permanent account and existing accounts were preserved.

Authenticated users receive permission denial (`42501`) for `nl_create_quiz`, `nl_commit_quiz`, and `nl_import_grammar`. They cannot forge grades, directly change SRS/cache, create human-review records, publish grammar, or write completion scores. No RLS policy or execution grant was weakened for signup.

Published grammar requires genuine human-review metadata. Drafts and their child content remain hidden. Embedded PostgreSQL verifies published-content access/grading; live tests verify draft isolation/rejection. Read-only advisor/function review found no additional actionable integration defect: callable definer functions enforce ownership/publication with fixed search paths; the platform `rls_auto_enable` event trigger rejects ordinary invocation before executing its body. No platform configuration was changed.

## Authentication and email delivery

The final independent Auth probe returned HTTP 200: **`disable_signup=false`**, email/password enabled, **`mailer_autoconfirm=false`**. Keep signup enabled and confirmation enforced.

`/signup` provides validated email/password and password confirmation, pending state, safe errors, confirmation-required/success states, and internal return links. Duplicate-email handling preserves Supabase's anti-enumeration behavior. New Auth accounts automatically receive an owned profile with timezone `America/Tijuana`, preferences `ja`, `es`, `el`, and an empty learning workspace. Production signup never uses admin account creation.

The runner attempted actual UI signup and observed the exact `429 over_email_send_rate_limit`, reported separately. An administrative disposable signup-token fixture then verified bootstrap, unconfirmed-login/protected-route rejection, the real `/auth/confirm` path, cookie persistence after navigation/reload, owned profile access, logout, single-use tokens, and subsequent email/password login. It did not disable/bypass confirmation or alter a real account. PKCE `/auth/callback`, safe redirects, provider failures, duplicate privacy, and credential exclusion also pass action/route tests. Inbox delivery remains unverified.

**Configure custom SMTP in Supabase Auth before public signup release**, using provider host/port/credentials and a verified sender/domain, then verify registration and confirmation in a real inbox. The [built-in sender is restricted and rate-limited](https://supabase.com/docs/guides/auth/auth-smtp). SMTP credentials belong in provider/Supabase settings, never browser variables. No custom SMTP credentials/access were available for this pass.

Allow the app's `/auth/callback` in Site URL/redirect configuration for the actual origin. A custom SSR template may use `/auth/confirm?token_hash={{ .TokenHash }}&type=signup`; deployment-domain configuration remains for the later stage.

The cloud runner now uses the production build and redacted diagnostics. Reverse-isolation fixtures allocate unique child UUIDs. Signup tests restore fields after React's form reset so mismatch validation cannot mask the delivery response. Only the exact sender-rate-limit condition is exempted; other integration failures exit nonzero. Test-generated confirmation fixtures are not an application registration bypass.

## DeepL

Server-side selected-text translation with sentence context, source labeling, concurrent request merging, persistent contextual cache, and second-device cache reuse pass live checks. Annotation/Vocabulary priority and editing before adding to Vocabulary are preserved. Machine results provide translation only. Missing configuration, service/rate/quota errors retain manual entry and pass tests. No document-wide translation or billing upgrade occurred.

The final independent usage probe returned HTTP 200 from `https://api-free.deepl.com`: **31 / 1,000,000 characters used** at verification time. The key remains server-only.

## Grammar content

| Language | Prepared | Draft | Human reviewed | Published |
| --- | ---: | ---: | ---: | ---: |
| Japanese | 100 (81 N5, 19 foundational N4) | 100 | 0 | 0 |
| Spanish | 80 | 80 | 0 | 0 |
| Modern Greek | 60 | 60 | 0 | 0 |
| Total | 240 | 240 | 0 | 0 |

Cloud/local validation confirms 240 version-1 drafts, **720 translated examples and 1,200 exercises**, stable IDs, source/license metadata, and modification notes. **No lesson was regenerated, re-imported, reviewed, or published during this pass.** Structural validation is not human linguistic review. Production shows pending-review status without leaking draft content.

No live published-lesson grading is claimed while every lesson is a draft. The 80% completion rule/versioned progress pass embedded PostgreSQL and local browser tests. Cloud rejects draft submissions and verifies progress isolation using disposable admin-created rows with `completed=false`, removed during cleanup. [GRAMMAR_CONTENT.md](GRAMMAR_CONTENT.md) preserves source/license and review/version rules. Genuine qualified human review remains required before full-v1 publication.

## Final verification

| Check | Result |
| --- | --- |
| ESLint | PASS, zero warnings |
| TypeScript | PASS, including final production-generated route types |
| Unit/repository tests | **504 / 504 PASS**, 23 files; all previous tests retained |
| Included embedded PostgreSQL migration/security tests | **29 / 29 PASS**, all 12 migrations and both Reading conflicts |
| Included Supabase adapter tests | **27 / 27 PASS** |
| Included grammar QA tests | **255 / 255 PASS** |
| Playwright | **20 / 20 PASS**, Microsoft Edge/local repositories; no tests removed |
| Live cloud/Auth/database/RLS | **858 assertions PASS**, exit 0; no application/database issues; sender limit reported separately |
| Reading conflict RPCs | Both PASS live: prompt HTTP 400 |
| Isolation/admin protections | Both populated-user directions, anonymous denial, and service-only RPC denial PASS |
| Auth settings | Signup intentionally enabled; email confirmation required |
| DeepL | Live selected-text/cache/usage PASS |
| Grammar validation | PASS, 240 drafts: 100 Japanese / 80 Spanish / 60 Modern Greek |
| Migration validation | PASS, 12 ordered files; no DDL replay |
| Production build | PASS, Next.js 16.4 webpack, protected dynamic routes, signup/callback/confirmation and Proxy |
| Client secret scan | PASS, no configured server credentials in client artifacts |
| Repository/server secret scan | PASS, 153 repository files and 92 final server artifacts; `.env.local` ignored/untracked |
| Staged secret scans / diff checks | PASS for implementation and report; `git diff --check` passes |

Live checks include all quiz modes/boundary counts, deterministic retries/collisions/tails, immutable snapshots, idempotency, stale sessions, cross-device resume, SRS/timezones, atomic CSV/accepted answers/richer Vocabulary, Reading versions/cache, Grammar isolation, settings, Dashboard/activity, and all eight pages. Browser tests additionally cover audio/hints, arbitrary selection, grammar 80% completion, three-language pages, and mobile layout. These results do not claim delivered signup email or deployment.

## GitHub and remaining release actions

Implementation commit: **`1aa2e2f0a3ca8ed5ae19b57806fa56d4a07f57a7`**, committed directly on `main` and successfully pushed to [ShuaiLn/NingLingo](https://github.com/ShuaiLn/NingLingo). This report follows in a separate documentation commit. No branch, force push, secret commit, or grammar/migration source change occurred during this pass.

**Vercel: untouched and not deployed, as requested.** No production URL is claimed. Future deployment uses the existing names `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DEEPL_API_KEY`, `DEEPL_API_BASE_URL`; only the first two are browser-public. Do not enable local repositories in production. `SUPABASE_ACCESS_TOKEN` is an optional operator migration credential, not a runtime requirement.

The remaining external public-signup prerequisite is custom SMTP and a delivered-email confirmation check. Human review remains necessary for eventual publication of the 240 drafts. Vercel/domain configuration is deliberately postponed. Migration 012 and enabled signup are **not** unresolved issues; no application/database integration failure remains.

</details>
