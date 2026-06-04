# Skill Benchmark: ableton-extension

**Model**: claude-sonnet-4-6 (Agent model: sonnet)
**Date**: 2026-06-03T21:43:15Z
**Evals**: warp-cycle, import-place, selection-undo (1 run each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 6% ± 10% | +0.94 |
| Time | 46s ± 11 | 26s ± 11 | +19.6 |
| Tokens | 24698 ± 2321 | 11807 ± 29 | +12891 |

## Per-eval pass rate

| Eval | With Skill | Without Skill |
|------|------------|---------------|
| warp-cycle | 6/6 | 1/6 |
| import-place | 7/7 | 0/7 |
| selection-undo | 6/6 | 0/6 |

## Analyst notes

- Decisive separation: with-skill passes 19/19 SDK-usage assertions (100%); baseline passes 1/19 (5.6%). Every API-shape assertion discriminates perfectly.
- The single assertion the baseline passes (warp-cycle: explicit WarpMode array) is the least discriminating — the baseline happened to list the modes, but still wrapped them in a fully hallucinated class API.
- Baseline failures are systematic API hallucination: extends Extension / createExtension, context.filesystem.write, clipSlot.importAudioFile, song.beginUndoStep, clip.warpMode.set(). None exist in the real SDK — expected, since this SDK is a private beta absent from training data, which is exactly when a reference skill pays off.
- Cost of the skill: ~+20s and ~+13k tokens per task (reading SKILL.md + references). A reasonable price for moving from non-compiling code to correct, idiomatic code.
- Grading is static: outputs were checked with regex assertions for correct SDK API usage and the specific gotchas the skill targets (non-contiguous WarpMode, importIntoProject-first, async withinTransaction) — not compiled or run inside Live.
- Single run per cell. The with-skill cell is saturated at 100%; additional runs would mainly probe baseline variance, and baseline failures are systematic rather than flaky.
