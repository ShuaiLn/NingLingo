# Grammar content pipeline

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

The build is deterministic: no wall-clock timestamp, unseeded random choices, network request, or machine translation is used. Choice positions are derived from SHA-256 of the stable exercise ID. The validator checks language counts, required fields, statuses, stable/unique IDs and titles, at least three nonduplicate examples, translations, five exercises, two to four distinct Unicode-normalized choices, one valid answer index, explanations, source/license versions, and honest human-review requirements. The import additionally verifies generated-file hashes against the manifest and refuses to publish the initial AI dataset.

## Import and versioning

After ordered SQL migrations exist in the connected cloud project:

```sh
node --experimental-strip-types scripts/grammar-import.mjs
```

This administrative command reads `.env.local` locally and uses the existing server-only `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) and `NEXT_PUBLIC_SUPABASE_URL`. It never prints credentials, runs in browser code, or substitutes an anonymous/public key for administrative authorization. It calls the service-role-only `nl_import_grammar(p_points)` transaction; content, examples, exercises, and sources persist in normalized relational tables. Reimporting an identical version is idempotent. A different payload for an existing version must be rejected, preserving content history.

Ordinary learner repositories read **published** content only. Empty published content should explain that review is pending rather than falling back to development sample lessons. Drafts remain available to the administrative pipeline and repository audit tests.

For the first release, a qualified human must review each lesson against its cited reference, correct language/naturalness/translation and distractor ambiguity, record the actual reviewer and review date, and document modifications. Publish only after the required lesson checks and genuine review records exist. Do not copy a source textbook reviewer into NingLingo metadata or label automated validation as human review. Revised content uses a new immutable content version; learner progress remains tied to the version they actually completed.

After actual review, an operator may import a JSON array of approved lessons with `node --experimental-strip-types scripts/grammar-import.mjs --reviewed-file=path/to/approved-lessons.json` (append `--validate-only` to check without writing). This explicit path requires unique lessons, version 2 or later, real reviewer/date metadata, and reviewed/published status. The initial pinned draft files stay unchanged. The database transaction checks the same content structure and publication metadata; metadata alone is never described as proof that a human actually performed the review.
