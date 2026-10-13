# Grammar content pipeline

## Current production release

The project owner confirmed human review of all 240 lessons, approved every lesson as correct, and requested production publication. The release records the supplied reviewer signature **ning lu** and review date **2026-10-11** in [`content/grammar/releases/2026-10-11-v2.json`](../content/grammar/releases/2026-10-11-v2.json). Every lesson is `published`, has `contentVersion: 2`, and retains its original explanation, examples, exercises, and source attribution. The version 1 draft files and their manifest hashes remain unchanged.

## Korean AI course

The additional 60 beginner Korean lessons use the independent `published-ai` status. They are immediately available for study and display **AI-authored; not human-reviewed · AI 编写，未经人工审核**. Each lesson has an English explanation, formation, three original Hangul examples with English translations, and five answer-keyed exercises. No human review record is created for these lessons. The original 240-lesson release and its historical versions and review records remain intact; older drafts remain hidden in cloud learner repositories.

The syllabus and original explanations are in [`content/grammar/authoring/ko.mjs`](../content/grammar/authoring/ko.mjs), with deterministic generated output in [`content/grammar/generated/ko.json`](../content/grammar/generated/ko.json). [`scripts/grammar-build-ko.mjs`](../scripts/grammar-build-ko.mjs) rebuilds only Korean and updates its manifest entry without rewriting the original three language files. The [National Institute of Korean Language’s Korean-English Learners’ Dictionary](https://krdict.korean.go.kr/eng/mainAction?nation=eng) is a reference; no dictionary prose, examples, audio, or illustrations are copied. The new instructional material is original AI-authored content licensed CC BY-SA 4.0.

The existing 60 Korean lessons were published to the configured production Supabase project on **2026-10-12 (America/Tijuana)**. All are `published-ai`, version 1, readable by normal authenticated users, and retain their original content and answer keys. There are exactly 180 translated examples, 300 exercises and **zero Korean human-review records**. The production repository preserves the authored Korean syllabus order while retaining live content and the original ordering of other languages.

Use `npm run grammar:publish:ko` for the scoped Korean-only administrative import. It validates the pinned generated dataset and imports exactly its sixty Korean manifests through the existing RPC; it never submits Japanese, Spanish or Greek content. An identical replay returned **0 imported / 60 unchanged**, with identical normalized child-record hashes. `npm run grammar:verify:ko` verifies every Korean lesson using a disposable authenticated account and checks original-language content/version/review integrity. Add `-- --browser` after a production build for a two-device browser smoke test of listing order and first/middle/last lessons. Verification output and redacted logs stay under ignored `.local-preview/`; disposable accounts and their owned data are deleted.

The publication passed 379 checks; a subsequent verification with browser smoke passed 380 checks, including 20 browser checks. Before/after hashes preserved all original 240 points, 480 versions, 1,440 examples, 2,400 exercises, 1,120 source records and 240 review records. No migration was rerun and no unrelated user data was changed. Server-side grammar grading, the 80% completion threshold, owner-isolated progress, and immutable content versions apply to Korean as well. A later genuine human review should use a new immutable version and the existing reviewed-file workflow.

Validate or publish this exact release from the repository root:

```sh
npm run grammar:import -- --reviewed-file=content/grammar/releases/2026-10-11-v2.json --validate-only
npm run grammar:import -- --reviewed-file=content/grammar/releases/2026-10-11-v2.json
```

The second command writes to the configured Supabase project using the existing server-only credential. Identical imports are idempotent. Automated checks verify structure and persistence; the human-review record reflects the owner's explicit confirmation, not a claim that automated validation performed the review.

## Original draft preparation

The v1 target is prepared as 100 Japanese, 80 Spanish, and 60 Modern Greek lessons. All 240 are **draft** records with `reviewer: null`, `contentVersion: 1`, and `developmentSeed: false`. They are production-schema content candidates rather than development sample lessons. They are not represented as reviewed or published.

Each lesson has an English explanation, formation, three translated examples, five single-answer exercises with explanations, stable language-prefixed IDs, attribution/license metadata, and modification notes. Spanish and Greek have three explicitly authored contextual cloze questions and two application/contrast questions. Japanese adapts source examples and adds translation, formation, and meaning questions. Structural QA cannot establish native-speaker correctness or prove every distractor is semantically unambiguous; those checks remain part of human review.

## Pinned sources

| Language | Reference and use | Version/license |
| --- | --- | --- |
| Japanese | [OpenJLPT](https://github.com/evanclan/OpenJLPT/tree/0d1d3410bec90bd4098a7c72de820543cb4f707c), all 81 N5 candidate grammar points and 19 foundational N4 points. Explanations, formations, and grammar examples adapted; one original example supplements や. | Commit `0d1d3410bec90bd4098a7c72de820543cb4f707c`, CC BY-SA 4.0. Preserve bundled LICENSE, NOTICE, and CITATION; source grammar content is credited to OpenJLPT contributors, with aggregate dataset upstream credit retained. JLPT levels are community estimates. |
| Spanish | [Wikibooks Spanish Contents](https://en.wikibooks.org/w/index.php?title=Spanish/Contents&oldid=4487563) and linked grammar organization guide the syllabus. Learner explanations, sentences, and questions are original AI drafts. | Contents revision `4487563`, 2025-04-21; Tenses revision `4343296`; Pronouns revision `3979135`; El tiempo pasado revision `4661004`. CC BY-SA 4.0 reference sources. No large Wikibooks passages are copied. |
| Modern Greek | Maria Poulopoulou, [Modern Greek: Grammar Notes for Absolute Beginners](https://repository-web.kallipos.gr/handle/11419/4393), A1–A2 topic reference. All NingLingo text and exercises are original AI drafts. | 2015, ISBN 978-960-603-129-8, DOI `10.57713/kallipos-583`; reference licensed CC BY-NC-SA 3.0 Greece. No textbook prose, examples, questions, audio, or illustrations are redistributed. Its source reviewer is not a NingLingo reviewer. |

Tatoeba sentence pairs are not imported by this pipeline, so it does not manufacture individual Tatoeba authors or translation-pair licenses. OpenJLPT grammar examples are its original contributor material, distinct from its vocabulary/Tatoeba dataset.

## Rebuild and validate

Run from the repository root using the project's Node 22.12+ requirement:

```sh
node scripts/grammar-sources.mjs # Optional: re-download the exact pinned source files, never latest main.
node scripts/grammar-build.mjs
node --experimental-strip-types scripts/grammar-validate.mjs
node --experimental-strip-types scripts/grammar-import.mjs --validate-only
```

The build is deterministic: no wall-clock timestamp, unseeded random choices, network request, or machine translation is used. Choice positions are derived from SHA-256 of the stable exercise ID. The validator checks 300 lessons (the 240 original drafts and 60 Korean AI lessons), required fields, statuses, stable/unique IDs and titles, at least three nonduplicate examples, translations, five exercises, two to four distinct Unicode-normalized choices, one valid answer index, explanations, source/license versions, and honest human-review requirements. The import additionally verifies generated-file hashes against the manifest. Original drafts remain drafts; only Korean uses the independent, explicitly disclosed AI publication state.

## Import and versioning

After ordered SQL migrations exist in the connected cloud project:

```sh
node --experimental-strip-types scripts/grammar-import.mjs
```

This administrative command reads `.env.local` locally and uses the existing server-only `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) and `NEXT_PUBLIC_SUPABASE_URL`. It never prints credentials, runs in browser code, or substitutes an anonymous/public key for administrative authorization. It calls the service-role-only `nl_import_grammar(p_points)` transaction; content, examples, exercises, and sources persist in normalized relational tables. Reimporting an identical version is idempotent. A different payload for an existing version must be rejected, preserving content history.

Ordinary cloud learner repositories read **published** human-reviewed content and independently labeled **published-ai** content. Drafts and review-only versions stay hidden. Empty published content does not fall back to development samples. Drafts remain available to the administrative pipeline and repository audit tests.

For the first release, a qualified human must review each lesson against its cited reference, correct language/naturalness/translation and distractor ambiguity, record the actual reviewer and review date, and document modifications. Publish only after the required lesson checks and genuine review records exist. Do not copy a source textbook reviewer into NingLingo metadata or label automated validation as human review. Revised content uses a new immutable content version; learner progress remains tied to the version they actually completed.

After actual review, an operator may import a JSON array of approved lessons with `node --experimental-strip-types scripts/grammar-import.mjs --reviewed-file=path/to/approved-lessons.json` (append `--validate-only` to check without writing). This explicit path requires unique lessons, version 2 or later, real reviewer/date metadata, and reviewed/published status. The initial pinned draft files stay unchanged. The database transaction checks the same content structure and publication metadata; metadata alone is never described as proof that a human actually performed the review.

For a later review, copy the chosen lessons into a separate JSON array, check the explanation and formation, all translated examples, every question and answer choice, the intended answer, and source attribution. Record the actual reviewer and date, document corrections in `modificationNotes`, increment `contentVersion` beyond the latest imported version, and set `status: "published"` when approved for learners. `correctIndex` is zero-based. Validate the file before importing it.

`reviewed` content is still hidden from learners. Status is part of the immutable version: importing version 2 as `reviewed` and later changing it to `published` requires version 3. Importing a newer draft or review-only version also advances the current version and hides the older published lesson, so prepare review changes offline and import the final approved version when ready. The learner page has no administrative review control; publication uses this CLI. Unknown or duplicate CLI flags are rejected.
