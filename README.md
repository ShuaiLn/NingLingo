# NingLingo

A personal language-learning workspace for Japanese (`ja`), Spanish (`es`), and Modern Greek (`el`). This stage runs entirely locally with a mock personal identity and replaceable development repositories. English is the interface and explanation language.

## Run locally

Use Node.js 22.12 or newer (22.13+ recommended for the current lint dependency tree) and npm.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. The root opens `/ja`; use the sidebar or mobile language selector to switch languages. No `.env` file or service credentials are needed. Dependencies are pinned and `package-lock.json` is included for a later Git commit. No Git repository or remote has been configured.

The first visit seeds 42 words, three short readings, complete alphabets, and one draft grammar lesson per language. Seed words are due today so the review flow can be exercised immediately. New words start at the 1-day stage and are due tomorrow. Existing data is retained in this browser profile and origin; a different browser/device/origin has separate data.

## Validate

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

Browser acceptance tests:

```sh
npm run test:e2e
```

The Playwright configuration uses installed Microsoft Edge (`channel: msedge`). It starts a local server when needed. On a machine without Edge, install Edge or change the project to an installed Playwright browser. Browser tests use isolated profiles and never touch your normal browser’s learning data.

## Local learning flow

1. Open Vocabulary. Add/edit words, create lists, maintain explicit additional Typing answers, or import a UTF-8 CSV. Preview separates valid, duplicate, and invalid rows before confirmation. Export shown or selected words.
2. Select words and use **Quiz selected**, or open Quiz and choose words/type. The setup shows the eligible count and retry interval. Hints/audio do not affect scoring. Answers save immediately; **Save & exit** preserves the remaining question and retry schedule. Resume from Quiz or Dashboard. Completing/ending settles each tested word once.
3. Open Reading, choose a seed passage or paste/upload TXT. Hover, focus, click, or select text. Unknown text uses an explicitly labeled mock placeholder; enter a manual English meaning, optional reading, and Vocabulary link. Add it to Vocabulary if useful. Body edits create versions and require confirmation to clear positional annotations.
4. Explore Alphabet, then complete the five exercises in a sample Grammar lesson. Four correct answers marks the lesson complete. All samples remain unreviewed development drafts.
5. Dashboard and Progress reflect first attempts, review stages, weak words, completed lessons, and activity. Settings changes your display name and IANA learning timezone.

## Architecture

- `src/domain/`: shared models and pure CSV, quiz/scheduler, SRS, dates, Reading lookup, Grammar scoring, and statistics.
- `src/repositories/contracts.ts`: persistence and identity interfaces.
- `src/repositories/local.ts`: the local composition, ownership checks, atomic imports, optimistic session versions, idempotent answers, and review settlement.
- `src/repositories/storage.ts`: the sole browser-storage boundary, plus a memory adapter for tests. Web Locks serialize cross-tab writes where supported. Storage notifications refresh repository-backed UI. Failed/blocked storage reports memory-only mode.
- `src/services/`: global SpeechSynthesis controller and development TranslationProvider.
- `src/components/`: repository-driven UI; components do not access storage.
- `src/data/`: local vocabulary, Alphabet, and clearly labeled draft Grammar samples.
- `src/app/[language]/`: shared Dashboard, Vocabulary, Quiz, Reading, Grammar, Alphabet, Progress, and Settings routes. Grammar details live at `/[language]/grammar/[id]`.

See [the archived v1 product specification](docs/SPECIFICATION_V1.md) and [the integration handoff](docs/INTEGRATION_HANDOFF.md).

## Stage boundary

The local mock profile is not authentication. Cloud sync, email/password login, real DeepL results/quota checks, and the 240 reviewed production lessons remain for the connected-data stage. Pronunciation depends on voices installed on the device. The UI reports missing voices and retains all other learning controls.

No Supabase connection/schema execution, GitHub configuration/push, real DeepL request, or Vercel deployment is part of this stage. Future environment variable names are documented in `.env.example`; leave them unset until integration is explicitly configured.
