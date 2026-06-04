# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-04

Initial public release.

### Added
- **`ableton-extension` skill** for Claude Code:
  - `SKILL.md` — workflow, core concepts, and the high‑value gotchas.
  - `references/api.md` — the full `@ableton-extensions/sdk` surface (classes, methods, enums, types).
  - `references/concepts.md` — worked patterns: handles, transactions, progress, the filesystem sandbox, an annotated strip‑silence walkthrough.
  - `references/webviews-and-design.md` — the webview ⇄ host protocol + Ableton UI design guidelines.
  - `assets/templates/` — a copy‑paste project scaffold (manifest, esbuild build, tsconfig, starter `extension.ts`, Live‑themed `interface.html`).
- `ableton-extension.skill` — the packaged, one‑step‑installable skill.
- **Examples** (`examples/`): `url-to-clip` (flagship yt‑dlp showcase), `downloadwav`, `cyclewarpmode`, `fillwithclips`.
- **Benchmark** (`ableton-extension-workspace/`): with‑skill vs no‑skill, regex‑graded — 100% vs 5.6% correct SDK usage across 3 tasks.

### Notes
- Built and tested against `@ableton-extensions/sdk@1.0.0-beta.0`.
- The Ableton Extensions SDK is **not** redistributed here; obtain it from Ableton's beta programme.

[1.0.0]: https://github.com/aker-dev/ableton-extension-skill/releases/tag/v1.0.0
