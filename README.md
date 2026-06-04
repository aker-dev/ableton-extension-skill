# 🎛️ Ableton Extension Skill — for Claude Code

A [Claude Code](https://claude.com/claude-code) **Skill** that teaches Claude how to build
**Ableton Live extensions** with the official [`@ableton-extensions/sdk`](https://www.ableton.com/)
(TypeScript / Node.js code that runs in Live's Extension Host).

The Extensions SDK is a young, private beta — it's essentially **absent from model training data**, so
out of the box Claude *hallucinates* the API (`extends Extension`, `song.beginUndoStep()`,
`clip.warpMode.set()` … none of which exist). This skill grounds Claude in the **real, verified API**,
the patterns that matter, the gotchas that bite, and copy‑paste project templates.

> **TL;DR** — install the skill, then just ask Claude Code *"build me an Ableton extension that …"*.
> You get correct, idiomatic, buildable code instead of confident nonsense.

---

## 📊 Does it actually help?

Measured with Anthropic's `skill-creator` (3 realistic tasks, **with‑skill vs no‑skill baseline**,
graded on objective API‑usage assertions), then confirmed by building a real tool that ran in Live first try.

| Metric | **With skill** | Without skill |
|---|---|---|
| Correct SDK usage (assertions passed) | **100 %** (19/19) | 5.6 % (1/19) |
| Compiles & follows the real API | ✅ | ❌ hallucinated |

The full benchmark, per‑task breakdown, and a browseable side‑by‑side of the outputs live in
[`ableton-extension-workspace/iteration-1/`](ableton-extension-workspace/iteration-1/)
(`benchmark.md`, `review.html`).

---

## 📦 What's inside

A skill is a folder Claude reads progressively (only what it needs, when it needs it):

```
ableton-extension/
├── SKILL.md                       # always-on: workflow, core concepts, the high-value gotchas
├── references/
│   ├── api.md                     # the full SDK surface — every class, method, enum, type
│   ├── concepts.md                # worked patterns: handles, transactions, progress, sandbox, …
│   └── webviews-and-design.md     # webview ⇄ host protocol + Ableton UI design guidelines
└── assets/templates/              # copy-paste project scaffold
    ├── manifest.json  build.ts  package.json  tsconfig.json
    ├── extension.ts   interface.html   html.d.ts
    └── .env.example   .gitignore   README.md
```

`ableton-extension.skill` is the same folder zipped into a single installable file.

---

## ✅ Requirements

- **Claude Code** (this is what loads the skill).
- **The Ableton Extensions SDK** (`1.0.0-beta.x`) — you obtain this from **Ableton** (Centercode beta
  programme). It is **not** redistributed here; this repo only teaches Claude how to use it.
- **Node.js ≥ 24**, an **Ableton Live Beta** build that supports Extensions, and **Developer Mode** enabled
  in *Live → Preferences → Extensions*.

---

## 🚀 Installation

A `.skill` file is just a zip of the skill folder. Pick one:

**Personal (recommended) — available in every project**
```bash
# from this repo
unzip ableton-extension.skill -d ~/.claude/skills/
# → ~/.claude/skills/ableton-extension/SKILL.md
```
or simply copy the folder:
```bash
cp -R ableton-extension ~/.claude/skills/
```

**Project‑scoped — ships with one repo**
```bash
mkdir -p .claude/skills && cp -R ableton-extension .claude/skills/
```

Restart / reopen Claude Code. Verify with `/skills` (you should see **ableton-extension**), or just ask it
something Ableton‑extension‑related and watch it consult the skill.

---

## 🛠️ Usage

You don't invoke anything special — the skill **auto‑triggers** when you're working on an Ableton Live
extension. Just describe what you want, in plain language. Example prompts:

- *"Scaffold a new Ableton Live extension that adds a **Reverse clip name** right‑click action on audio clips."*
- *"Add a context‑menu action on a MIDI‑track time selection that fills it with empty clips — as a single undo step."*
- *"Build an extension that downloads audio from a URL with yt‑dlp and drops it into the selected clip slot."*
- *"Rename every clip in the set to `<track name> N` in one undoable operation."*

What you get back: a correct `activate()` / `initialize()` entry point, properly scoped context‑menu
actions, safe handle resolution, transactions for clean undo, progress dialogs for long work,
sandbox‑safe file handling, optional webview UIs, and a project that **builds to a `.ablx`**.

### What the skill covers

| Area | What Claude gets right |
|---|---|
| **Scaffolding** | official `create-extension` flow *or* the bundled templates |
| **Commands & menus** | every `ContextMenuScope` incl. `*.ArrangementSelection` & `ClipSlotSelection` |
| **Object model** | `Song → Track → Clip / Device / Scene / CuePoint …` navigation |
| **Handles** | resolve‑don't‑cache, `instanceof` narrowing, generic version args (`MidiTrack<"1.0.0">`) |
| **Undo** | `withinTransaction` incl. the async `Promise.all` grouping pattern |
| **Long tasks** | `withinProgressDialog` with cancel / `AbortSignal` |
| **Files & audio** | `importIntoProject`, `renderPreFxAudio`, the **storage/temp sandbox** (+ `mkdir`/undefined guards) |
| **Custom UI** | webview modals, the `close_and_send` protocol, Live‑themed CSS |
| **Build & ship** | esbuild bundling, `manifest.json`, packaging a `.ablx` |
| **Gotchas** | non‑contiguous `WarpMode` enum, beats‑vs‑seconds, import‑first, CLI `--temp/--storage-directory` |

---

## 🎬 Examples

Four working extensions built with this skill live in [`examples/`](examples/):

- **[`url-to-clip/`](examples/url-to-clip/)** — the flagship showcase. Right‑click a **clip slot**
  (Session) or an **audio track / time selection** (Arrangement) → *"Import audio from URL…"* → a webview
  asks for a URL → **yt‑dlp** downloads it, **ffmpeg** extracts WAV → it's imported and dropped in as a
  clip, **named after the video title**. It exercises the hardest corners at once — webview modal, three
  context‑menu scopes, `child_process` under the filesystem sandbox, `importIntoProject`, `createAudioClip`
  in both views, progress + cancel — and **worked first try in Live**. Its README includes the one‑prompt
  request that generated it.
- **[`downloadwav/`](examples/downloadwav/)** — a minimal URL → clip‑slot variant.
- **[`cyclewarpmode/`](examples/cyclewarpmode/)** — cycle an audio clip's Warp Mode (the non‑contiguous enum, done right).
- **[`fillwithclips/`](examples/fillwithclips/)** — fill a MIDI time selection with clips as a single undo step.

> **The URL examples (`url-to-clip`, `downloadwav`) require `brew install yt-dlp ffmpeg`.** Each example's
> README covers setup; you also supply the SDK tarballs in its `vendor/` folder (not redistributed here).

---

## 🔁 Keeping it up to date

The SDK is in beta and will change. When a new beta drops:

- Regenerate **`references/api.md`** from the SDK's TypeDoc HTML (the SDK ships rendered docs under `api/`).
- Re‑read **`docs/`** for new concepts and fold any new gotchas into `SKILL.md`.
- Bump the API version string examples if `initialize(activation, "x.y.z")` changes.

Contributions welcome — issues and PRs that add patterns, fix gotchas, or extend the templates are great.

---

## 📁 Repository layout

```
.
├── README.md                       # you are here
├── LICENSE                         # MIT (© AKER)
├── CHANGELOG.md
├── ableton-extension/              # the skill (install this)
├── ableton-extension.skill         # the same, zipped for one-step install
├── examples/                       # 4 working extensions built with the skill
├── evals/evals.json                # the eval tasks + assertions used to measure the skill
└── ableton-extension-workspace/    # benchmark + side-by-side outputs (proof / methodology)
```

---

## ⚖️ Disclaimer & license

Community project, **not affiliated with or endorsed by Ableton**. *Ableton* and *Live* are trademarks of
Ableton AG. The Extensions SDK is Ableton's and is **not** included here — get it from Ableton's beta
programme. This repo contains only documentation/skill content describing how to use that SDK.

Made by [**aker-dev**](https://github.com/aker-dev) with Claude Code · tested against `@ableton-extensions/sdk@1.0.0-beta.0`.
