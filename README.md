# NingLingo

A private language-learning workspace for Japanese (`ja`), Spanish (`es`), and Modern Greek (`el`), with English UI and explanations. Next.js App Router, TypeScript, Tailwind, Supabase Cloud, and server-side DeepL.

## Run

Use Node.js 22.12+ and npm. Install pinned dependencies with `npm ci`, configure the existing names from `.env.example` in ignored `.env.local`, then run `npm run dev`. Open http://localhost:3000. Production repositories and email/password authentication are the default.

The cloud database must first receive the ordered migrations. `npm run db:check` validates migration files; `npm run db:migrate` applies them with a Supabase Management API token. The supplied project secret is a Data API credential and cannot execute DDL. No Docker or local Supabase is required. See [database documentation](database/README.md).

Create the personal account with `node scripts/provision-account.mjs` in an interactive terminal after migrations. Its password input is hidden. Public signup must be disabled in Supabase Auth settings. There is no signup UI, social login, or automatic email invitation.

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
npm run test:cloud
```

Unit/repository tests include embedded PostgreSQL executing the checked-in migrations with Supabase identity stubs, ownership isolation, transactional imports, CAS/idempotency, SRS, and draft isolation. Embedded tests do not imply Cloud migrations were applied. Existing E2E tests plus Vocabulary extension tests use installed Microsoft Edge, isolated profiles, and local repositories. `test:cloud` creates two temporary confirmed accounts, tests live cookie authentication and cloud ownership, then removes its accounts even on failure. It reports missing cloud migrations as a failure rather than claiming integration passed.

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
