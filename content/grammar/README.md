# Grammar content and provenance

This directory contains **240 AI-prepared draft lessons**, not a human-reviewed production release. Native-speaker review of every example, exercise, explanation, and intended answer is pending. Drafts must not be made visible to ordinary authenticated learners through the production published-content repository.

- `sources/openjlpt/` preserves the N5/N4 candidate data, license, attribution notice, and citation from commit `0d1d3410bec90bd4098a7c72de820543cb4f707c`.
- `authoring/es.mjs` and `authoring/el.mjs` contain original lesson-specific explanations, examples, cloze choices, and application checks. Brackets identify an explicitly authored cloze answer; no automatic inflection or translation model is used in the build.
- `generated/ja.json`, `es.json`, and `el.json` are the normalized import records (100/80/60). Examples, exercises, sources, and review metadata are mapped to normalized database tables by the administrative import transaction.
- `manifest.json` records pinned sources, counts, and SHA-256 hashes for deterministic regenerated data. Never edit generated files directly.

The adapted Japanese data and original NingLingo additions are distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). See the bundled OpenJLPT `LICENSE` and `NOTICE.md` for source-specific credit. The Kallipos reference has a different, noncommercial license: its prose, examples, exercises, audio, and illustrations are **not** included here. Its metadata is a reference citation, not a license claim over the original NingLingo content.

See [`docs/GRAMMAR_CONTENT.md`](../../docs/GRAMMAR_CONTENT.md) for generation, validation, import, and publication requirements.
