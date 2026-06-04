---
name: ableton-extension
description: >-
  Build, modify, and debug Ableton Live extensions written with the
  @ableton-extensions/sdk — TypeScript/Node.js code that runs in Live's
  Extension Host. Use this whenever the user is working on an Ableton Live
  extension: scaffolding a new one, adding context-menu actions or commands,
  navigating or mutating the Live Set object model (tracks, clips, devices,
  scenes, cue points), creating audio or MIDI clips, rendering or importing
  audio, showing modal webview dialogs or progress dialogs, grouping changes
  into a single undo step, or building/packaging an .ablx. Also use when you
  see `@ableton-extensions/sdk` imports, an `activate()`/`initialize()` entry
  point, a manifest.json with `minimumApiVersion`, `registerContextMenuAction`,
  `getObjectFromHandle`, `withinTransaction`, or files under an
  `extensions-sdk` folder. Trigger even if the user only says "Ableton
  extension" without naming the SDK.
---

# Ableton Live Extensions (@ableton-extensions/sdk)

## What an extension is

An extension is a **Node.js process** that runs alongside Ableton Live in Live's
**Extension Host**. It gives you programmatic, type-safe access to the Live Set
(tracks, clips, devices, scenes), can render and import audio, show HTML
dialogs, and use the whole npm ecosystem. It is **not** for real-time audio/MIDI
processing, building devices, drawing in Live's native UI, control surfaces, or
running headless — reach for Max for Live for those.

The deliverable is a single bundled `dist/extension.js` plus a `manifest.json`,
packaged as a `.ablx` file users drop onto Live's Extensions settings page.

## The shape of every extension

```ts
import { initialize, type ActivationContext } from "@ableton-extensions/sdk";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0"); // 2nd arg = API version

  // 1. Register commands (named callbacks that do the work)
  context.commands.registerCommand("myExt.doThing", (arg: unknown) => {
    /* ... */
  });

  // 2. Wire commands to UI (e.g. a right-click menu item)
  context.ui.registerContextMenuAction("AudioClip", "Do Thing", "myExt.doThing");
}
```

- `activate(activation)` is the entry point; the host calls it on load.
- `initialize(activation, "1.0.0")` returns the **`ExtensionContext`** — the
  gateway to everything: `.application`, `.commands`, `.ui`, `.environment`,
  `.resources`, `.getObjectFromHandle(...)`, `.withinTransaction(...)`.
- Target the **lowest API version** that has the features you need — the host
  keeps old versions working as Live evolves, so a lower version = compatible
  with more Live releases. Today the only version is `"1.0.0"`.

## Scaffolding a new extension

**Prefer the official project creator** — it wires up `.env` (the path to
Live's Extension Host), vendored SDK/CLI tarballs, and scripts:

```bash
mkdir my-extension && cd my-extension
npx file:/path/to/sdk/ableton-create-extension-<version>.tgz
# Answer: name, author, Live install to target, and whether you need a UI.
```

If you must scaffold by hand (or the user already has a project), copy the files
in `assets/templates/` and adjust. The pieces you always need:
`manifest.json`, `build.ts`, `package.json`, `tsconfig.json`, `src/extension.ts`
(and `src/html.d.ts` + `src/interface.html` if you use a webview). See
**`assets/templates/README.md`** for what each one is.

## Commands and context menus — the core loop

Commands are named callbacks. A context-menu action ties a Live right-click to a
command by ID. **The argument your callback receives depends on the scope**:

| Scope kind | Example scopes | Callback receives |
|---|---|---|
| Object | `AudioClip`, `MidiClip`, `AudioTrack`, `MidiTrack`, `ClipSlot`, `Scene`, `Simpler`, `Sample`, `DrumRack` | a single `Handle` |
| Arrangement selection | `AudioTrack.ArrangementSelection`, `MidiTrack.ArrangementSelection` | an `ArrangementSelection` |
| Session selection | `ClipSlotSelection` | a `ClipSlotSelection` |

The arg arrives untyped — cast it, then resolve handles (see below):

```ts
context.commands.registerCommand("myExt.renameClip", (arg: unknown) => {
  const clip = context.getObjectFromHandle(arg as Handle, Clip);
  clip.name = "Renamed";
});
context.ui.registerContextMenuAction("AudioClip", "Rename", "myExt.renameClip");
context.ui.registerContextMenuAction("MidiClip", "Rename", "myExt.renameClip");
```

`registerContextMenuAction` returns a `Promise<() => Promise<void>>` — await it
to get an **unregister** function if you ever need to remove the item.

## Handles: how you reference Live objects (read this before mutating)

Live objects are passed as **`Handle`s** (`{ id: bigint }`), not full objects.
Resolve a handle into a typed object with the expected class:

```ts
const track = context.getObjectFromHandle(handle, AudioTrack);
```

Three rules that prevent almost every handle bug:

1. **Handles are not permanent.** They are invalidated by deleting the object,
   *moving* a track/clip (a new handle is allocated), or loading/closing a Set.
   Using a stale handle throws.
2. **Resolve on demand; do not cache** SDK objects or handles across operations.
   Re-query the model (`song.tracks`, etc.) when you need fresh references.
3. **Pass the right class, or a base class + `instanceof`.** When the type is
   unknown (e.g. a mixed Arrangement selection), resolve as the base class and
   narrow:

   ```ts
   const obj = context.getObjectFromHandle(handle, DataModelObject);
   if (obj instanceof AudioTrack) { /* ... */ }
   ```

Base classes: `Track` → `AudioTrack`|`MidiTrack`; `Clip` → `AudioClip`|`MidiClip`;
`Device` → `RackDevice`|`Simpler` (and `RackDevice` → `DrumRack`);
`DataModelObject` is the root of everything.

## The object model at a glance

```
Application
└─ song: Song                         tempo, scale*, gridQuantization, ...
   ├─ tracks: Track[]                  (Audio|Midi) — excludes returns & main
   │  ├─ clipSlots: ClipSlot[]         .clip; createAudioClip/createMidiClip
   │  ├─ arrangementClips: Clip[]
   │  ├─ takeLanes: TakeLane[]
   │  ├─ devices: Device[]             RackDevice→chains; Simpler→sample
   │  └─ mixer: TrackMixer             volume/panning/sends (DeviceParameter)
   ├─ returnTracks: Track[]  · mainTrack: Track
   ├─ scenes: Scene[]                  createScene/deleteScene/duplicateScene
   └─ cuePoints: CuePoint[]
```

Start from `context.application.song`. Most collection getters return arrays you
can `.map`/`.filter`. Creating/deleting/duplicating returns a `Promise` — await it.
For the **full signature of every class, accessor, and method**, read
**`references/api.md`**.

## Mutations, undo, and long tasks

**Transactions group changes into one undo step.** Each individual mutation is
already its own undo step, so only use `withinTransaction` to *collapse several*:

```ts
context.withinTransaction(() => {
  song.tracks.forEach((t, i) => { t.name = `Track ${i + 1}`; });
}); // one undo entry
```

`withinTransaction` is **strictly synchronous — you cannot `await` inside it.**
To group *async* operations (creating clips/tracks), return a `Promise.all` from
the callback and await the call itself:

```ts
const tracks = await context.withinTransaction(() =>
  Promise.all([song.createAudioTrack(), song.createAudioTrack()]),
);
```

You can't create-then-modify in one transaction (you need the instance first) —
do it as two sequential transactions. Nested transactions auto-collapse.

**Long-running work belongs in a progress dialog** so the user sees feedback and
Live's UI is blocked from changing state mid-operation:

```ts
await context.ui.withinProgressDialog("Working…", {}, async (update, signal) => {
  await update("Halfway", 50);     // message + percentage 0–100
  signal.throwIfAborted();         // or: if (signal.aborted) return;
  await update("Done", 100);
});
```

A common shape: do async work (render/fetch) inside the progress callback, then
wrap the final state changes in a `withinTransaction` (returning `Promise.all`)
so they land as one undo step. See the strip-silence example pattern in
`references/concepts.md`.

## Audio, files, and the filesystem sandbox

Extensions run under a **restricted permission model**. Your code (including
`child_process` and native addons) may only read/write:

- `context.environment.storageDirectory` — persistent (config, credentials, cache).
- `context.environment.tempDirectory` — scratch (may be cleared between sessions).

Both are typed `string | undefined`, and **the folder isn't guaranteed to
exist**. Live supplies and creates them, but `extensions-cli run` (i.e.
`npm start`) does **not** — you must pass `--storage-directory`/`--temp-directory`
*and* create the folder yourself. So guard for `undefined` and `mkdir` before
writing:

```ts
import * as fs from "fs/promises";
import * as path from "path";

const tempDir = context.environment.tempDirectory;
if (!tempDir) throw new Error("No temp directory available");
await fs.mkdir(tempDir, { recursive: true }); // the CLI won't pre-create it
const out = path.join(tempDir, "scratch.wav");
await fs.writeFile(out, data);
```

Do **not** touch arbitrary paths (Documents, Downloads, Desktop) — a stricter
OS sandbox is coming and such code will break. To bring an *outside* file into
the Set, let the host do it:

```ts
const imported = await context.resources.importIntoProject("/abs/path/in.wav");
await clipSlot.createAudioClip({ filePath: imported, isWarped: false });
// ^ ALWAYS use the returned path, not the original, in later API calls.
```

Render audio from the arrangement (returns a WAV path in the temp dir):

```ts
const wav = await context.resources.renderPreFxAudio(audioTrack, startBeat, endBeat);
```

## Custom UI with webviews (modal dialogs)

`context.ui.showModalDialog(url, width, height)` opens a webview and resolves to
the string the page sends back. Inline an HTML file as a data URL (configure
esbuild's `.html` loader to `"text"`):

```ts
import html from "./interface.html"; // bundled as a string
const result = await context.ui.showModalDialog(
  `data:text/html,${encodeURIComponent(html)}`, 360, 240);
const { name } = JSON.parse(result);
```

The page returns data + closes by posting a `close_and_send` message; it must
handle both macOS (`webkit.messageHandlers.live`) and Windows
(`chrome.webview`). The ready-to-use, Live-themed boilerplate is in
`assets/templates/interface.html`. Design guidance is in
`references/webviews-and-design.md`.

## Build, run, package

Scripts an created project gives you (esbuild via `build.ts`):

| Command | Does |
|---|---|
| `npm start` | Builds (dev) and launches Live's Extension Host with your extension |
| `npm run build` | Production bundle → `dist/extension.js` (minified) |
| `npm run build:dev` | Dev bundle (sourcemaps) |
| `npm run package` | Production build, then a shareable `.ablx` |

The host **does not resolve `node_modules` at runtime** — you must bundle to one
JS file. `manifest.json` declares `entry` (the bundle), plus `name`, `author`,
`version`, `minimumApiVersion`.

**Dev loop:** enable **Preferences → Extensions → Developer Mode** in the Live
Beta (required, or `npm start` can't connect). `npm start` reads
`EXTENSION_HOST_PATH` from `.env`. Override the Live path with
`npx extensions-cli run --live "/Applications/Ableton Live 12.x Beta.app"`.
Debug with `--inspect`. If your extension uses the storage/temp dirs, pass
`--storage-directory <dir>` and `--temp-directory <dir>` to `extensions-cli run`
(Live provides these automatically; the CLI does not). Logs (your `console.*` +
stack traces) go to `ExtensionHost.txt` (macOS:
`~/Library/Preferences/Ableton/Live x.x.x/`).

## Gotchas that cost the most time

- **Enum values aren't contiguous.** `WarpMode` is `Beats=0, Tones=1, Texture=2,
  Repitch=3, Complex=4, ComplexPro=6` — **5 is unused.** Cycle through an
  explicit array of modes, never `(mode + 1) % n`.
- **Arrangement times are in beats**, not seconds. Convert with the tempo:
  `beatsPerSecond = 60 / song.tempo`.
- **`importIntoProject` first.** `createAudioClip`/`replaceSample` need a path
  Live manages; passing a raw external path will fail or break later.
- **Don't cache handles** across user edits — re-resolve.
- **No `await` inside `withinTransaction`** — return `Promise.all(...)` instead.
- **Cast the command arg** to the type the scope delivers (`Handle` /
  `ArrangementSelection` / `ClipSlotSelection`) before using it.
- **Bundle everything** — a bare `import "some-pkg"` won't resolve at runtime
  unless esbuild bundled it in.
- **Generic classes need their version arg in type positions.** Model classes
  are generic (`MidiTrack<Version>`). In a type annotation or an `is` type
  predicate, supply the version — `(o): o is MidiTrack<"1.0.0">` — or you get
  `TS2314`. `instanceof MidiTrack` (a value position) stays bare. Use the same
  version you passed to `initialize`.
- **`mkdir` storage/temp before writing**, and guard them for `undefined`.
  Under `extensions-cli run` they're neither provided nor created automatically
  (Live does both) — see the filesystem section.

## Reference files

Read these as needed (don't load everything up front):

- **`references/api.md`** — every class, accessor, method, enum, type, and
  interface with signatures. Go here for "what's the exact method/property?"
- **`references/concepts.md`** — deeper, worked patterns: lifecycle, handles &
  polymorphism, transactions (incl. async grouping), progress, resources, the
  full context-menu scope reference, and an annotated strip-silence walkthrough.
- **`references/webviews-and-design.md`** — webview communication protocol,
  passing data in/out, and Ableton's UI design guidelines for dialogs.
- **`assets/templates/`** — copy-paste `manifest.json`, `build.ts`,
  `package.json`, `tsconfig.json`, `html.d.ts`, starter `extension.ts`, and a
  Live-themed `interface.html`. See its `README.md`.
