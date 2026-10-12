# Grammar content and provenance

This directory preserves **240 AI-prepared version 1 draft lessons** and the separate **version 2 production release** approved by the project owner, **ning lu**, on **2026-10-11**. The owner confirmed review was complete and all lessons correct. Original draft records remain unchanged and hidden from ordinary authenticated learners; the approved release contains the explicit review metadata.

- `sources/openjlpt/` preserves the N5/N4 candidate data, license, attribution notice, and citation from commit `0d1d3410bec90bd4098a7c72de820543cb4f707c`.
- `authoring/es.mjs` and `authoring/el.mjs` contain original lesson-specific explanations, examples, cloze choices, and application checks. Brackets identify an explicitly authored cloze answer; no automatic inflection or translation model is used in the build.
- `generated/ja.json`, `es.json`, and `el.json` are the normalized import records (100/80/60). Examples, exercises, sources, and review metadata are mapped to normalized database tables by the administrative import transaction.
- `manifest.json` records pinned sources, counts, and SHA-256 hashes for deterministic regenerated data. Never edit generated files directly.
- `releases/2026-10-11-v2.json` contains all 240 approved lessons (100 Japanese, 80 Spanish, 60 Greek) with published version 2 and the owner's supplied reviewer signature/date. It uses the administrative reviewed-file import; rebuilding the draft dataset does not overwrite this release.

The adapted Japanese data and original NingLingo additions are distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). See the bundled OpenJLPT `LICENSE` and `NOTICE.md` for source-specific credit. The Kallipos reference has a different, noncommercial license: its prose, examples, exercises, audio, and illustrations are **not** included here. Its metadata is a reference citation, not a license claim over the original NingLingo content.

See [`docs/GRAMMAR_CONTENT.md`](../../docs/GRAMMAR_CONTENT.md) for generation, validation, import, and publication requirements.
