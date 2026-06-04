# Concepts & Patterns

Worked patterns and the reasoning behind them. Read the section you need; each is
self-contained. For exact signatures see `api.md`.

## Contents
1. [Lifecycle & context](#1-lifecycle--context)
2. [Commands & context-menu scopes](#2-commands--context-menu-scopes)
3. [Handles & polymorphism](#3-handles--polymorphism)
4. [Transactions (sync + async grouping)](#4-transactions)
5. [Progress dialogs](#5-progress-dialogs)
6. [Resources & the filesystem sandbox](#6-resources--the-filesystem-sandbox)
7. [Working with clips, notes, warp, devices](#7-working-with-clips-notes-warp-devices)
8. [Annotated example: Strip Silence](#8-annotated-example-strip-silence)

---

## 1. Lifecycle & context

Every extension exports `activate`. The host calls it once on load. Call
`initialize` immediately to get the `ExtensionContext`, then register everything.

```ts
import { initialize, type ActivationContext } from "@ableton-extensions/sdk";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");
  // register commands + UI here. Reading the model is also fine:
  const song = context.application.song;
  console.log(`Tempo: ${song.tempo} bpm, ${song.tracks.length} tracks`);
}
```

`console.log/info/warn/error` and uncaught stack traces go to `ExtensionHost.txt`
(macOS `~/Library/Preferences/Ableton/Live x.x.x/`,
Windows `…\AppData\Roaming\Ableton\Live x.x.x\Preferences\`).

---

## 2. Commands & context-menu scopes

A command is a named callback. A context-menu action binds a Live right-click
(in a *scope*) to a command id. Register both, usually in `activate`.

```ts
context.commands.registerCommand("myExt.cmd", (arg: unknown) => { /* ... */ });
const unregister = await context.ui.registerContextMenuAction(
  "AudioClip", "My Action", "myExt.cmd");
// await unregister();  // later, to remove it
```

**What `arg` is, by scope:**

| Scope | `arg` type | Notes |
|---|---|---|
| `AudioClip` / `MidiClip` | `Handle` | the clicked clip |
| `AudioTrack` / `MidiTrack` | `Handle` | the clicked track |
| `ClipSlot` | `Handle` | the clicked session slot |
| `Scene` | `Handle` | the clicked scene |
| `Simpler` / `Sample` / `DrumRack` | `Handle` | the clicked device/sample |
| `AudioTrack.ArrangementSelection` | `ArrangementSelection` | time range + lanes, audio tracks |
| `MidiTrack.ArrangementSelection` | `ArrangementSelection` | time range + lanes, MIDI tracks |
| `ClipSlotSelection` | `ClipSlotSelection` | `selected_clip_slots: Handle[]` |

The arg is delivered untyped (`unknown`). Cast it, then resolve handles. Register
the same command under several scopes when it applies to more than one:

```ts
(["AudioClip", "MidiClip"] as const).forEach((scope) =>
  context.ui.registerContextMenuAction(scope, "Rename", "myExt.rename"));
```

Commands can also be invoked programmatically:
`context.commands.executeCommand("myExt.cmd", someArg)`.

---

## 3. Handles & polymorphism

Live objects travel as `Handle`s (`{ id: bigint }`). Resolve to a typed object
with the class you expect:

```ts
const track = context.getObjectFromHandle(handle, AudioTrack);
```

**Type safety + narrowing.** If unsure of the concrete type, resolve as a base
class and branch with `instanceof`. This is the norm for mixed selections:

```ts
const selection = arg as ArrangementSelection;
const objs = selection.selected_lanes.map((h) =>
  context.getObjectFromHandle(h, DataModelObject));
// A type predicate is a *type position*, so the generic classes need their
// version arg (matching initialize). Bare `Track` here triggers TS2314.
const tracksAndLanes = objs.filter(
  (o): o is Track<"1.0.0"> | TakeLane<"1.0.0"> =>
    o instanceof Track || o instanceof TakeLane);
const midiLanes = tracksAndLanes.filter(
  (o): o is MidiTrack<"1.0.0"> | TakeLane<"1.0.0"> =>
    o instanceof MidiTrack ||
    (o instanceof TakeLane && o.parent instanceof MidiTrack));
```

**Why handles, and the rules:**
- A handle is a snapshot reference, valid *now*. It is invalidated by deleting
  the object, **moving** a track/clip (a new handle is allocated), or
  loading/closing a Set. Using a stale one throws.
- So: resolve on demand, don't cache objects/handles across user edits, and
  re-query the model (`song.tracks`, `track.clipSlots`, …) when you need fresh
  references.
- `getObjectFromHandle` caches by id within a session, so the same live object
  returns the same instance — but that does not protect you across deletions/moves.
- Never fabricate a `Handle`; only host-provided ones are valid.

Inheritance map: `DataModelObject` → everything; `Track` → `AudioTrack`,
`MidiTrack`; `Clip` → `AudioClip`, `MidiClip`; `Device` → `RackDevice`
(→ `DrumRack`), `Simpler`; `Chain` → `DrumChain`.

**Generics in type positions.** Every model class is generic over the API
version (`MidiTrack<Version>`). `instanceof MidiTrack` is a value position and
stays bare, but a **type annotation** or an **`is` type predicate** is a type
position and needs the argument — `(o): o is MidiTrack<"1.0.0">`, or
`const t: AudioTrack<"1.0.0"> = …`. Use the same version string you passed to
`initialize`. Omitting it is the `TS2314 "requires 1 type argument"` error.

---

## 4. Transactions

`context.withinTransaction(fn)` collapses the mutations inside `fn` into **one**
undo step. Each mutation is *already* undoable on its own, so reach for a
transaction only to bundle several into one user-facing undo.

```ts
context.withinTransaction(() => {
  song.tracks.forEach((t, i) => { t.name = `Track ${i + 1}`; });
});
```

**It is synchronous — no `await` inside.** To group async operations, return a
`Promise.all` and await the transaction call:

```ts
const tracks = await context.withinTransaction(() =>
  Promise.all([song.createAudioTrack(), song.createAudioTrack()]));
```

**Create then modify = two transactions.** You can't modify an object you create
in the same transaction (you need the instance, which only resolves after the
async create settles):

```ts
const newTracks = await context.withinTransaction(() =>
  Promise.all([song.createAudioTrack(), song.createAudioTrack()]));
context.withinTransaction(() => {
  newTracks.forEach((t, i) => { t.name = `Grouped ${i + 1}`; });
});
```

Nested `withinTransaction` calls collapse into the outermost one — so helper
functions can each use their own transaction yet still merge when composed.
Changes apply atomically from the user's view: Live won't show intermediate
states or update the undo history until the transaction completes.

---

## 5. Progress dialogs

For anything beyond a few milliseconds, run inside `withinProgressDialog`. It
shows Live's standard progress bar and blocks the user from changing the Set
mid-operation. The dialog opens on call and closes when your callback settles.

```ts
await context.ui.withinProgressDialog(
  "Starting…",
  { progress: 0 },                       // optional initial percentage
  async (update, signal) => {
    await someWork();
    await update("Halfway there", 50);   // message + 0–100
    if (signal.aborted) return;          // user cancelled
    await update("Finishing", 90);
    await moreWork();
  },
);
```

Cancellation: check `signal.aborted`, or call `signal.throwIfAborted()` and catch.

**Combine with a transaction** for the canonical "async work, then atomic
changes" shape — do the async part, then commit state in a transaction that
returns `Promise.all`:

```ts
await context.ui.withinProgressDialog("Analyzing…", { progress: 10 }, async (update) => {
  const ranges = await analyze();
  await update("Applying…", 90);
  const ops = context.withinTransaction(() =>
    ranges.map((r) => track.clearClipsInRange(r.start, r.end)));
  await Promise.all(ops);
});
```

Modal vs. progress: use a **modal dialog** (webview) for input/forms; use a
**progress dialog** for background tasks with feedback.

---

## 6. Resources & the filesystem sandbox

Extensions run under a restricted permission model. **All** code you run —
including `child_process` and native addons — may only read/write:
- `context.environment.storageDirectory` (persistent), and
- `context.environment.tempDirectory` (scratch, may be cleared).

Don't touch Documents/Downloads/Desktop or other arbitrary paths; a stricter OS
sandbox is coming and such code will break.

Both paths are `string | undefined`, and the folder may not exist yet. Live
provides and creates them; `extensions-cli run` (`npm start`) does **not** — you
pass `--storage-directory`/`--temp-directory` *and* `fs.mkdir(dir, { recursive:
true })` before writing. Always guard the `undefined` case too. (The patterns
below show this.)

**Bring an external file into the Set** via the host (it can read outside the
sandbox on your behalf), and use the returned path thereafter:

```ts
const imported = await context.resources.importIntoProject("/abs/in.wav");
await clipSlot.createAudioClip({ filePath: imported, isWarped: false });
```

**Download → temp → import** pattern:

```ts
import * as fs from "fs/promises";
import * as path from "path";
const tempDir = context.environment.tempDirectory;
if (!tempDir) throw new Error("No temp directory available");
await fs.mkdir(tempDir, { recursive: true }); // the CLI won't pre-create it
const res = await fetch("https://api.example.com/audio");
const tmp = path.join(tempDir, "dl.wav");
await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
const imported = await context.resources.importIntoProject(tmp);
```

**Persist config across sessions:**

```ts
const storageDir = context.environment.storageDirectory;
if (!storageDir) throw new Error("No storage directory available");
await fs.mkdir(storageDir, { recursive: true });
const cfg = path.join(storageDir, "config.json");
await fs.writeFile(cfg, JSON.stringify({ apiKey: "…" }));
const saved = JSON.parse(await fs.readFile(cfg, "utf-8"));
```

**Render arrangement audio** (pre-FX, beats in → WAV path in temp):

```ts
const wav = await context.resources.renderPreFxAudio(audioTrack, startBeat, endBeat);
const data = await fs.readFile(wav);
```

---

## 7. Working with clips, notes, warp, devices

**Create an audio clip** (always import first):
```ts
const imported = await context.resources.importIntoProject(filePath);
await audioTrack.createAudioClip({
  filePath: imported, startTime: 0, isWarped: true,
  loopSettings: { looping: true, startMarker: 0, endMarker: 2, loopStart: 0, loopEnd: 1 },
});
```

**MIDI notes** — replace a clip's notes (times/durations in beats, pitch is a
MIDI number):
```ts
const clip = context.getObjectFromHandle(handle, MidiClip);
clip.notes = [
  { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
  { pitch: 64, startTime: 1, duration: 1 },
];
```

**Warp mode** — values are non-contiguous (`Beats=0, Tones=1, Texture=2,
Repitch=3, Complex=4, ComplexPro=6`, no `5`). Cycle via an explicit list:
```ts
const modes = [WarpMode.Beats, WarpMode.Tones, WarpMode.Texture,
               WarpMode.Repitch, WarpMode.Complex, WarpMode.ComplexPro];
clip.warpMode = modes[(modes.indexOf(clip.warpMode) + 1) % modes.length]!;
```

**Devices & parameters** — `getValue`/`setValue` are async:
```ts
const dev = await track.insertDevice("Reverb", 0);       // built-in devices only
const dryWet = dev.parameters.find((p) => p.name === "Dry/Wet");
if (dryWet) await dryWet.setValue(dryWet.max * 0.3);
await track.mixer.volume.setValue(0.85);                 // mixer params too
```

**Beats ↔ seconds** — arrangement APIs use beats; convert with tempo:
```ts
const beatsPerSecond = 60 / context.application.song.tempo;
const beats = seconds * beatsPerSecond;
```

---

## 8. Annotated example: Strip Silence

The most complete example — combines arrangement selection, rendering, async
analysis, progress, and a single-undo transaction. Shape:

```ts
context.commands.registerCommand("example.stripSilence", (arg: unknown) =>
  void (async (selection: ArrangementSelection) => {
    // 1. Resolve the selection's lanes; keep only audio tracks.
    const tracks = selection.selected_lanes
      .map((h) => context.getObjectFromHandle(h, DataModelObject))
      .filter((o) => o instanceof AudioTrack);
    if (!tracks.length) return;

    await context.ui.withinProgressDialog("Strip Silence", {}, async (update, signal) => {
      // 2. Phase one — render each track's audio and analyze for silence.
      // Note the version arg in the type annotation (type position): AudioTrack<"1.0.0">.
      const results: { track: AudioTrack<"1.0.0">; silence: SilenceRange[] }[] = [];
      for (let i = 0; i < tracks.length; i++) {
        if (signal.aborted) return;
        const track = tracks[i]!;
        update(`Analyzing ${i + 1}/${tracks.length}`, (i / tracks.length) * 50);
        const wav = await context.resources.renderPreFxAudio(
          track, selection.time_selection_start, selection.time_selection_end);
        if (signal.aborted) return;
        const decoded = await decodeAudio(await fs.readFile(wav));
        const channels = Array.from({ length: decoded.numberOfChannels },
          (_, j) => decoded.getChannelData(j));
        const silence = computeSilenceRanges(channels, { /* opts */ });
        if (silence.length) results.push({ track, silence });
      }
      if (signal.aborted) return;

      // 3. Phase two — strip everything in ONE undo step.
      if (results.length) {
        update("Stripping silence", 80);
        const beatsPerSecond = 60 / context.application.song.tempo;
        const ops = context.withinTransaction(() =>
          results.flatMap(({ track, silence }) =>
            silence.map((r) =>
              track.clearClipsInRange(
                selection.time_selection_start + r.start / beatsPerSecond,
                selection.time_selection_start + r.end / beatsPerSecond))));
        await Promise.all(ops);   // await results before the dialog closes
      }
    });
  })(arg as ArrangementSelection).catch((e) => console.error(e)));

context.ui.registerContextMenuAction(
  "AudioTrack.ArrangementSelection", "Strip Silence", "example.stripSilence");
```

Lessons it encodes: resolve-and-filter a mixed selection; check `signal.aborted`
between async steps; render returns a temp WAV you read with `fs`; convert the
analysis's seconds back to beats with the tempo; and collect the mutation
promises from `withinTransaction` then `await Promise.all` so they finish before
the progress dialog closes — yielding a single undo entry for the whole job.
