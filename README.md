# NingLingo

A language-learning workspace with isolated accounts for Japanese (`ja`), Spanish (`es`), and Modern Greek (`el`), with English UI and explanations. Next.js App Router, TypeScript, Tailwind, Supabase Cloud, and server-side DeepL.

## Run

Use Node.js 22.12+ and npm. Install pinned dependencies with `npm ci`, configure the existing names from `.env.example` in ignored `.env.local`, then run `npm run dev`. Open http://localhost:3000. Production repositories and email/password authentication are the default.

The cloud database must first receive the ordered migrations. `npm run db:check` validates migration files; `npm run db:migrate` applies them with a Supabase Management API token. The supplied project secret is a Data API credential and cannot execute DDL. No Docker or local Supabase is required. See [database documentation](database/README.md).

Public email/password signup is intentionally enabled (`disable_signup=false`). Create an account at `/signup`, follow the confirmation email when required, and sign in at `/login`. The Auth insert trigger initializes an isolated profile with timezone `America/Tijuana` and all three language preferences. There is no social login. The optional `node scripts/provision-account.mjs` administrator utility remains available with hidden password input.

Allow the app's `/auth/callback` URL in Supabase Auth redirect settings for each actual app origin. The default confirmation email supports the PKCE callback; open it in the browser that initiated signup. A custom SSR confirmation template can instead link to `/auth/confirm?token_hash={{ .TokenHash }}&type=signup`. Email delivery must have sufficient capacity for public registrations; the app retains clear errors for SMTP/rate/service failures. It never disables confirmation to bypass delivery failures.

To use the preserved local/mock workspace, explicitly set `NINGLINGO_REPOSITORY_MODE=local` for your development process. This mode is disabled on Vercel. Development browser data remains separate from cloud accounts and is never silently uploaded. The existing browser tests explicitly select this mode.

## Learning flows

Vocabulary supports lists, CRUD, search/categories, selection/export, accepted answers, ruby/kana, explicit pronunciation, multiple translated examples, and all six related-word relation types. UTF-8 CSV preview preserves the original seven columns and reports valid, duplicate, and invalid rows. Confirmed cloud imports run in one database transaction.

All four quizzes freeze selected words, answers, type, configuration, random seed, and scheduler version. The existing retry engine runs on the authenticated server. Atomic optimistic commits save every answer, retries, history, and once-per-word SRS settlement; conflicts return the latest session. Review stages remain 1/3/7/14/30/60/120 days in the profile timezone (default America/Tijuana).

Reading supports paste/TXT, statuses, body versions, positional manual annotations, vocabulary links, and arbitrary selections. Lookup remains annotation ? personal vocabulary ? sentence-specific cache ? DeepL. Only selected text and bounded sentence context are sent. Actual usage/allowance and machine source are displayed; failures retain manual input. No dictionary readings or inflections are inferred from machine translation.

Alphabet contains the three complete static datasets. Grammar has a versioned production pipeline with 100 Japanese, 80 Spanish, and 60 Modern Greek draft candidates (720 examples, 1,200 exercises), pinned references, and honest review metadata. Production reads only human-reviewed published lessons. See [content provenance and review workflow](docs/GRAMMAR_CONTENT.md).

## Verify

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run grammar:validate
npm run build
npm run security:bundle
node scripts/check-repository-secrets.mjs
npm run test:cloud
```

Unit/repository tests include embedded PostgreSQL executing the checked-in migrations with Supabase identity stubs, ownership isolation, transactional imports, CAS/idempotency, SRS, and draft isolation. Embedded tests do not imply Cloud migrations were applied. Existing E2E tests plus Vocabulary extension tests use installed Microsoft Edge, isolated profiles, and local repositories. After `npm run build`, `test:cloud` starts the production server, attempts real public signup with a disposable reserved-domain email, verifies confirmation/provisioning/cookie sessions, and tests live persistence and populated ownership isolation in both directions for two temporary accounts. An admin-generated confirmation fixture keeps independent checks running if email delivery fails. The exact `429 over_email_send_rate_limit` is reported as an external custom-SMTP prerequisite after the Auth architecture checks pass; every other integration failure still exits nonzero. This does not claim successful public registration/inbox delivery. All temporary accounts/data are removed, existing accounts are preserved, and the 240 drafts are only read, never regenerated or published.

## Architecture

- `src/domain/`: shared models, CSV, deterministic quiz/retry engine, SRS, timezone dates, lookup priority, grammar scoring, statistics.
- `src/repositories/contracts.ts`: replaceable persistence and identity contracts.
- `src/repositories/http.ts`: browser facade and refresh/subscription boundary.
- `src/repositories/supabase.ts`: authenticated server repositories, RPC transactions, version conflicts, cloud mapping.
- `src/lib/supabase/`: separate browser/server clients; privileged client is server-only.
- `src/proxy.ts`: Next.js 16 cookie refresh and protected navigation; operations independently verify users.
- `src/services/`: validated API operations, server translation provider, shared audio controller.
- `src/repositories/local.ts` and `storage.ts`: preserved mock/test implementation with isolated browser storage.
- `database/migrations/`: ordered schema, RLS, functions, constraints and indexes.
- `content/grammar/` and `scripts/grammar-*.mjs`: pinned sources, authored candidates, generation, QA and atomic import.

See [the unchanged product specification](docs/SPECIFICATION_V1.md), [the approved production/Vocabulary extension](docs/PRODUCTION_SCOPE.md), and [the verified completion report and external blockers](docs/INTEGRATION_HANDOFF.md). Credentials and `.env.local` must never be committed.
