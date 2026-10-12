# Alphabet Quiz and Vocabulary CSV verification

Verified October 12, 2026 (America/Tijuana). Implementation and the requested local/cloud verification gates passed. No Vercel deployment was performed.

## Results

| Check | Result |
| --- | --- |
| ESLint (npm run lint) | Passed, zero warnings |
| TypeScript (npm run typecheck) | Passed; repeated after the final production build |
| All unit/repository tests | 654 passed in 32 files |
| Included PostgreSQL migration/repository tests | 55 passed: 29 existing + 26 Alphabet/namespace; all 13 migrations execute in PGlite |
| Migration sequence (npm run db:check) | 13 ordered files validated; no cloud connection/DDL |
| Complete Playwright suite | 40/40 passed in one run (9.8 minutes), no failed cases |
| Production build (npm run build) | Passed, Next.js 16.4.0 / webpack |
| Client secret scan (npm run security:bundle) | Passed |
| Repository/server secret scan | Passed: 178 repository files and 92 final server artifacts |
| Staged secret scan / staged diff check | Passed: 50 legitimate changed files; no credentials or private environment files |
| Live new-feature cloud verification | 232 recorded checks passed, plus browser assertions, using two temporary accounts |
| Independent temporary-account cleanup inventory | Zero verification accounts remaining |
| git diff --check | Passed |

The full browser suite includes 12 Alphabet cases, five CSV cases, existing Quiz modes/retries/conflicts, Reading selections/annotations, Vocabulary examples/relations/onboarding, three-language routes/mobile navigation, Grammar completion and account timezone settings. No test was removed or disabled. Tests that mutate synthetic Grammar fixtures run locally or in embedded PostgreSQL, never against production content.

## Migration and live cloud coverage

The owner successfully applied [013_alphabet_quiz.sql](../database/migrations/013_alphabet_quiz.sql) before this verification pass. Its tables, RPCs, immutable-snapshot triggers and cache namespace were exercised live. No migration was executed, reapplied or edited during this pass. Earlier migrations 001–012 remain unchanged. Do not run the unrestricted migration runner against an empty checksum history of manually applied migrations.

Migration 013 SHA-256: fdb28e904339d99fd7d8ef55556c294f6f860d32beaeda474d48c46c371b5110.

The final cloud runner uses the current production application build with real cookie authentication and the connected Supabase database. All writes belong to disposable accounts. It verifies:

- Creation and frozen content versions/complete item snapshots; Japanese あ accepts ah, Spanish B accepts b and rejects be, H accepts silent, Greek β accepts v and δ accepts dh while rejecting th.
- Incorrect first answers, immediate single-character retries, case-normalized equivalent answers, persisted relational attempts and completed history.
- Save, second-device read/refresh, resume, end, version conflicts returning the latest state, and submissionId replay with changed answer/stale version leaving state unchanged.
- Database rejection of snapshot/accepted-answer replacement and changed frozen audio inside state; saved data remains identical after rejected writes.
- Hint toggles leave persisted versions, attempts and scores unchanged; reload collapses hints. Progress renders separate Alphabet history and first-attempt accuracy. Answers create timezone-aware Alphabet activity without Vocabulary sessions or SRS progress.
- Two populated accounts cannot read each other's Alphabet sessions/attempts in either direction. HTTP history/session/answer ownership is enforced. Ordinary accounts receive 42501 for service-only create/commit RPCs and direct session/attempt writes; unauthenticated repository access is rejected.
- Ordered mappings for 犬,犬,犬,猫; global preview request deduplication; account/language isolation, NFC-equivalent terms and distinct case; Vocabulary and Reading cache identities coexist without crossing namespaces. Preview performs no word/SRS writes.
- Word-only and arbitrary-order legacy CSV through the browser. Cached machine results are labeled/editable, duplicates recalculate after edits, supplied translations survive, manual edits and edited-then-cleared fields survive delayed real cloud responses, and closed/replaced previews reject old results.
- Successful partial confirmation imports only resolved rows and retains unresolved rows; retry resolves remaining meanings and recalculates duplicates. Rejected confirmation retains every preview row. A real PostgreSQL import with an invalid later row leaves no partial writes. Imported rows have no generated readings/examples/POS/categories.

Both temporary accounts and their cascading data were deleted. A separate administrative Auth inventory verified zero remaining Alphabet verification accounts.

## Additional deterministic verification

Injected providers verify that all-miss 犬,犬,犬,猫 sends exactly two unique words, and a cached 犬 sends only 猫. Unit tests also cover cross-batch preview deduplication, NFC/case behavior, account/language/namespace boundaries, at most 25 unique queries, complete UTF-8 request-size splitting, ordered results, provider failures/empty results, successful-only caching and preservation of successful subbatches. Cloud translation checks use cache fixtures and delayed actual HTTP responses; no real DeepL requests were made or claimed for this pass.

Domain, repository and PostgreSQL tests modify test Alphabet source content after creation, then save, refresh, resume and retry. Old sessions retain every original field, audio text, standard answer and accepted alternative, while new sessions use changed content. Browser tests separately prove resumed displays/audio/grading read the stored snapshot. Scheduler comparison tests match existing Vocabulary scheduling for 1, 2, 3, 4, 10, 11 and 27 items. Local compatibility tests preserve the existing storage key and data when alphabetSessions is absent. Generation/edit-revision tests include a changed language and a manually edited translation cleared before late results arrive.

## Preservation and remaining blockers

Production Grammar inventory was unchanged: all **240 original v1 drafts** remain drafts, and **240 pre-existing published v2 records** were untouched. No production lesson was imported, regenerated, reviewed, published or assigned a different status. Existing Vocabulary SRS/scheduler, Reading, Grammar, Auth/RLS and CSV export compatibility passed regression coverage. Privileged keys remain server-only.

No external blocker remains for this feature verification pass. Migration 013 is applied and verified. Vercel was not deployed.

## Reproduction

```powershell
npm run lint
npm run typecheck
node node_modules/vitest/vitest.mjs run --maxWorkers=2
npm run db:check
node node_modules/@playwright/test/cli.js test --output=test-results-final
npm run build
npm run typecheck
npm run security:bundle
node scripts/check-repository-secrets.mjs
npm run test:cloud:alphabet
git diff --check
# After staging legitimate changes:
node scripts/check-staged-secrets.mjs
git diff --cached --check
```

## Changed files

- [database/README.md](../database/README.md)
- [database/migrations/013_alphabet_quiz.sql](../database/migrations/013_alphabet_quiz.sql)
- [docs/ALPHABET_AND_CSV.md](../docs/ALPHABET_AND_CSV.md)
- [docs/ALPHABET_CSV_VERIFICATION.md](../docs/ALPHABET_CSV_VERIFICATION.md)
- [docs/INTEGRATION_HANDOFF.md](../docs/INTEGRATION_HANDOFF.md)
- [package.json](../package.json)
- [scripts/verify-alphabet-cloud.mjs](../scripts/verify-alphabet-cloud.mjs)
- [src/components/alphabet-page.tsx](../src/components/alphabet-page.tsx)
- [src/components/alphabet-progress.tsx](../src/components/alphabet-progress.tsx)
- [src/components/alphabet-quiz.css](../src/components/alphabet-quiz.css)
- [src/components/alphabet-quiz.tsx](../src/components/alphabet-quiz.tsx)
- [src/components/app-provider.tsx](../src/components/app-provider.tsx)
- [src/components/progress-page.tsx](../src/components/progress-page.tsx)
- [src/components/vocabulary-page.tsx](../src/components/vocabulary-page.tsx)
- [src/data/alphabet.test.ts](../src/data/alphabet.test.ts)
- [src/data/alphabet.ts](../src/data/alphabet.ts)
- [src/domain/alphabet-quiz.test.ts](../src/domain/alphabet-quiz.test.ts)
- [src/domain/alphabet-quiz.ts](../src/domain/alphabet-quiz.ts)
- [src/domain/alphabet-stats.test.ts](../src/domain/alphabet-stats.test.ts)
- [src/domain/alphabet-stats.ts](../src/domain/alphabet-stats.ts)
- [src/domain/csv-preview.test.ts](../src/domain/csv-preview.test.ts)
- [src/domain/csv-preview.ts](../src/domain/csv-preview.ts)
- [src/domain/csv.test.ts](../src/domain/csv.test.ts)
- [src/domain/csv.ts](../src/domain/csv.ts)
- [src/domain/models.ts](../src/domain/models.ts)
- [src/domain/quiz.ts](../src/domain/quiz.ts)
- [src/domain/reading.test.ts](../src/domain/reading.test.ts)
- [src/domain/reading.ts](../src/domain/reading.ts)
- [src/repositories/alphabet-database.test.ts](../src/repositories/alphabet-database.test.ts)
- [src/repositories/alphabet-quiz.test.ts](../src/repositories/alphabet-quiz.test.ts)
- [src/repositories/contracts.ts](../src/repositories/contracts.ts)
- [src/repositories/database.test.ts](../src/repositories/database.test.ts)
- [src/repositories/http.ts](../src/repositories/http.ts)
- [src/repositories/local.ts](../src/repositories/local.ts)
- [src/repositories/seed.ts](../src/repositories/seed.ts)
- [src/repositories/storage.ts](../src/repositories/storage.ts)
- [src/repositories/supabase.test.ts](../src/repositories/supabase.test.ts)
- [src/repositories/supabase.ts](../src/repositories/supabase.ts)
- [src/repositories/vocabulary-translation.test.ts](../src/repositories/vocabulary-translation.test.ts)
- [src/services/api-handler.test.ts](../src/services/api-handler.test.ts)
- [src/services/api-handler.ts](../src/services/api-handler.ts)
- [src/services/deepl.test.ts](../src/services/deepl.test.ts)
- [src/services/deepl.ts](../src/services/deepl.ts)
- [src/services/repository-operations.test.ts](../src/services/repository-operations.test.ts)
- [src/services/repository-operations.ts](../src/services/repository-operations.ts)
- [src/services/vocabulary-translation.test.ts](../src/services/vocabulary-translation.test.ts)
- [src/services/vocabulary-translation.ts](../src/services/vocabulary-translation.ts)
- [tests/e2e/alphabet-quiz.spec.ts](../tests/e2e/alphabet-quiz.spec.ts)
- [tests/e2e/csv-auto-translation.spec.ts](../tests/e2e/csv-auto-translation.spec.ts)
- [tests/e2e/workspace.spec.ts](../tests/e2e/workspace.spec.ts)
