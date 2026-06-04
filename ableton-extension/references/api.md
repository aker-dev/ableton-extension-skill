# API Reference — @ableton-extensions/sdk (v1.0.0)

Complete surface of the SDK. All model classes are generic over `Version` (e.g.
`Track<"1.0.0">`); the version param is elided below for readability, but in real
TypeScript you must supply it in **type positions** — type annotations and `is`
type predicates, e.g. `(o): o is MidiTrack<"1.0.0">` — matching the version you
pass to `initialize` (bare `instanceof MidiTrack` is fine; omitting it elsewhere
is the `TS2314` error). Accessors are properties (`get`/`set`); methods returning
`Promise` must be awaited.

## Contents

- [Entry point](#entry-point) — `initialize`, `ActivationContext`, `ExtensionContext`
- [Services](#services) — `Commands`, `Ui`, `Environment`, `Resources`
- [Root model](#root-model) — `Application`, `Song`
- [Tracks](#tracks) — `Track`, `AudioTrack`, `MidiTrack`, `TakeLane`
- [Clips & slots](#clips--slots) — `Clip`, `AudioClip`, `MidiClip`, `ClipSlot`
- [Arrangement structure](#arrangement-structure) — `Scene`, `CuePoint`
- [Devices](#devices) — `Device`, `RackDevice`, `DrumRack`, `Simpler`, `Chain`, `DrumChain`, `DeviceParameter`, mixers, `Sample`
- [Base & handles](#base--handles) — `DataModelObject`, `Handle`
- [Selections](#selections) — `ArrangementSelection`, `ClipSlotSelection`
- [Enums & helper types](#enums--helper-types) — `WarpMode`, `GridQuantization`, `NoteDescription`, `ClipLoopSettings`, `WarpMarker`, `ContextMenuScope`, `DeviceParameterValueItem`

---

## Entry point

### `initialize(context, apiVersion)`
```ts
initialize<V extends "1.0.0">(context: ActivationContext, apiVersion: V): ExtensionContext<V>
```
Initializes the SDK against the host and returns the API context. Pass the
lowest API version covering the features you need (older = compatible with more
Live releases). Throws if the host doesn't support the requested version.
Available versions are in `EXTENSIONS_API_VERSIONS` (newest first).

### `interface ActivationContext`
The object passed to your `activate` function. Pass it to `initialize`.
- `hostApiVersion: string` — latest API version the host supports.

### `interface ExtensionContext`
Everything the SDK offers. Returned by `initialize`.
- `application: Application` — root of the object model.
- `commands: Commands` — register/execute commands.
- `ui: Ui` — context menus, modal dialogs, progress dialogs.
- `environment: Environment` — filesystem paths and locale.
- `resources: Resources` — import files / render audio.
- `getObjectFromHandle<T>(handle: Handle, type: new (...args) => T): T` —
  resolve a handle to a typed object. Pass `DataModelObject` when the type is
  unknown, then `instanceof`-narrow. Objects are cached by handle id (same Live
  object → same instance). **Throws** if deleted, wrong type, or unrecognised.
- `withinTransaction<T>(fn: () => T): T` — group mutations into one undo step.
  Callback must be **synchronous**; return `Promise.all([...])` to group async
  ops. Nested transactions collapse into the outermost.

---

## Services

### `class Commands`
- `registerCommand(commandId: string, callback: (...args: unknown[]) => void): void`
  — register a named command. The args it receives depend on the invoker (see
  context-menu scopes).
- `executeCommand(commandId: string, ...args: unknown[]): void` — invoke a
  registered command programmatically.

### `class Ui`
- `registerContextMenuAction(scope: ContextMenuScope, title: string, commandId: string): Promise<() => Promise<void>>`
  — add a right-click menu item in `scope`; triggering it runs `commandId`.
  Resolves to an **unregister** function.
- `showModalDialog(url: string, width: number, height: number): Promise<string>`
  — open a webview at `url` (schemes: `file:`, `data:`, `https:`,
  `http://localhost`). Resolves with the string the page posts via
  `{ method: "close_and_send", params: [result] }`. Rejects on malformed URL.
- `withinProgressDialog(text, options, callback): Promise<unknown>`
  ```ts
  withinProgressDialog(
    text: string,
    options: { progress?: number },
    callback: (update: (text: string, progress?: number) => Promise<void>,
               abortSignal: AbortSignal) => Promise<unknown>,
  ): Promise<unknown>
  ```
  Shows a progress bar while `callback` runs; `update` sets message/percentage
  (0–100); `abortSignal` fires on user cancel. Closes when the callback settles.

### `class Environment`
- `storageDirectory: string | undefined` — persistent per-extension dir.
- `tempDirectory: string | undefined` — temp per-extension dir (may be cleared).
- `language: string | undefined` — Live UI language, uppercase ISO 639-1 (`"EN"`).

> The directory values can be `undefined`, and the folder isn't guaranteed to
> exist. Live supplies/creates them; `extensions-cli run` does not — pass
> `--storage-directory`/`--temp-directory` and `fs.mkdir(dir, { recursive: true })`
> before writing.

### `class Resources`
- `importIntoProject(filePath: string): Promise<string>` — copy a file into the
  Live project folder so Live manages it. **Use the returned path** afterwards.
- `renderPreFxAudio(track: AudioTrack, startTime: number, endTime: number): Promise<string>`
  — render a track's pre-FX audio between two **beat** positions; returns a WAV
  path in the temp dir.

---

## Root model

### `class Application` (extends `DataModelObject`)
- `song: Song` — the current Live Set.

### `class Song` (extends `DataModelObject`)
Accessors:
- `tracks: Track[]` — regular tracks only (excludes returns and main).
- `returnTracks: Track[]`, `mainTrack: Track`
- `scenes: Scene[]`, `cuePoints: CuePoint[]`
- `tempo: number` (get/set)
- `gridQuantization: GridQuantization`, `gridIsTriplet: boolean` — combine for
  the full arrangement grid setting.
- `rootNote: number` — scale root as MIDI note 0–11 (C–B).
- `scaleIntervals: number[]`, `scaleMode: boolean`, `scaleName: string`

Methods (all async):
- `createAudioTrack(): Promise<AudioTrack>` / `createMidiTrack(): Promise<MidiTrack>`
  — inserted after the last selected track, else appended.
- `createScene(index: number): Promise<Scene>` — insert at 0-based `index` in
  `[0, scenes.length]`; `-1` appends.
- `createCuePoint(time: number): Promise<CuePoint>` — `time` in beats.
- `deleteTrack(track)`, `deleteScene(scene)`, `deleteCuePoint(cuePoint)` → `Promise<void>`
- `duplicateTrack(track): Promise<Track>`, `duplicateScene(scene): Promise<Scene>`
  — duplicate inserted immediately after the original.

---

## Tracks

### `class Track` (extends `DataModelObject`) — base of AudioTrack/MidiTrack
Accessors:
- `name: string` (get/set), `arm`, `mute`, `solo: boolean` (get/set)
- `mutedViaSolo: boolean` (get)
- `arrangementClips: Clip[]`, `clipSlots: ClipSlot[]`, `takeLanes: TakeLane[]`
- `devices: Device[]`, `mixer: TrackMixer`
- `groupTrack: Track | null`

Methods:
- `clearClipsInRange(startTime, endTime): Promise<void>` — delete clips in the
  beat range; clips overlapping a boundary are **truncated**, not fully removed.
- `createTakeLane(): Promise<TakeLane>` — appended.
- `deleteClip(clip): Promise<void>` — arrangement clips (session: use `ClipSlot.deleteClip`).
- `insertDevice(deviceName: string, index: number): Promise<Device>` — insert a
  **built-in** Live device (e.g. `"Reverb"`, `"Auto Filter"`) at 0-based `index`.
  Third-party plug-ins are not supported.
- `deleteDevice(device): Promise<void>`, `duplicateDevice(device): Promise<Device>`

### `class AudioTrack` (extends `Track`)
- `createAudioClip(args): Promise<AudioClip>` — create an arrangement audio clip:
  ```ts
  createAudioClip(args: {
    filePath: string;          // absolute path (use an imported path)
    startTime: number;         // arrangement position, beats
    duration?: number;         // beats; capped at sample length for non-looping
    isWarped?: boolean;        // required if loopSettings is given
    loopSettings?: ClipLoopSettings; // requires isWarped defined
  }): Promise<AudioClip>
  ```

### `class MidiTrack` (extends `Track`)
- `createMidiClip(startTime: number, duration: number): Promise<MidiClip>` — beats.

### `class TakeLane` (extends `DataModelObject`)
- `clips: Clip[]`, `name: string` (get/set)
- `createAudioClip(args): Promise<AudioClip>` — same args as `AudioTrack.createAudioClip`.
- `createMidiClip(startTime: number, duration: number): Promise<MidiClip>`

---

## Clips & slots

### `class Clip` (extends `DataModelObject`) — base of AudioClip/MidiClip
Accessors:
- `name: string` (get/set), `color: number` (get/set), `muted: boolean` (get/set)
- `looping: boolean` (get/set) — enabling on an unwarped audio clip auto-enables warping.
- `startTime`, `endTime`, `duration` (get) — beats
- `startMarker`, `endMarker`, `loopStart`, `loopEnd` (get) — beats

### `class AudioClip` (extends `Clip`)
- `filePath: string` (get)
- `warping: boolean` (get/set)
- `warpMode: WarpMode` (get/set)
- `warpMarkers: WarpMarker[]` (get)

### `class MidiClip` (extends `Clip`)
- `notes: NoteDescription[]` (get/set) — read or replace the clip's notes.

### `class ClipSlot` (extends `DataModelObject`) — a Session grid cell
- `clip: Clip | null` (get)
- `createAudioClip(args: { filePath: string; isWarped?: boolean; loopSettings?: ClipLoopSettings }): Promise<AudioClip>`
- `createMidiClip(length: number): Promise<MidiClip>` — `length` in beats.
- `deleteClip(): Promise<void>`

---

## Arrangement structure

### `class Scene` (extends `DataModelObject`)
- `name: string` (get/set)
- `tempo: number`, `signatureNumerator: number`, `signatureDenominator: number` (get)

### `class CuePoint` (extends `DataModelObject`)
- `name: string` (get/set), `time: number` (get) — beats.

---

## Devices

### `class Device` (extends `DataModelObject`) — base of all devices
- `name: string` (get), `parameters: DeviceParameter[]` (get)

### `class RackDevice` (extends `Device`)
- `chains: Chain[]` (get)
- `insertChain(index: number): Promise<Chain>` — insert at `[0, chains.length]`.

### `class DrumRack` (extends `RackDevice`)
- `chains: DrumChain[]` (get) — overrides to the drum-specific chain type.

### `class Simpler` (extends `Device`)
- `sample: Sample | null` (get)
- `replaceSample(filePath: string): Promise<Sample>` — absolute path.

### `class Chain` (extends `DataModelObject`)
- `devices: Device[]`, `mixer: ChainMixer` (get)
- `insertDevice(deviceName, index): Promise<Device>`, `deleteDevice(device)`,
  `duplicateDevice(device)` — as on `Track`.

### `class DrumChain` (extends `Chain`)
- `receivingNote: number` (get/set) — the pad/MIDI note this chain responds to.

### `class DeviceParameter` (extends `DataModelObject`)
- `name: string`, `min`, `max`, `defaultValue: number`, `isQuantized: boolean` (get)
- `valueItems: DeviceParameterValueItem[]` (get) — labels for quantized params.
- `getValue(): Promise<number>`, `setValue(value: number): Promise<void>`

### `class TrackMixer` / `class ChainMixer` (extend `DataModelObject`)
- `volume: DeviceParameter`, `panning: DeviceParameter`, `sends: DeviceParameter[]` (get)

### `class Sample` (extends `DataModelObject`)
- `filePath: string` (get)

---

## Base & handles

### `class DataModelObject` — base class for every model object
- `handle: Handle` (readonly) — the object's handle.
- `parent: DataModelObject | null` (get) — canonical parent in Live's hierarchy.
- Static `className: string` — discriminator (`"Song"`, `"AudioClip"`, …).

Pass `DataModelObject` to `getObjectFromHandle` when the type is unknown, then
narrow with `instanceof`.

### `interface Handle`
- `id: bigint` — opaque id assigned by the host. **Never construct one
  yourself**; only host-provided handles are valid. Handles are not permanent
  (invalidated by deletion, moving the object, or changing the Set).

---

## Selections

### `interface ArrangementSelection`
Passed to commands triggered from `*.ArrangementSelection` scopes.
- `selected_lanes: Handle[]` — tracks/take-lanes in the selection.
- `time_selection_start: number`, `time_selection_end: number` — beats.

### `interface ClipSlotSelection`
Passed to commands triggered from the `ClipSlotSelection` scope.
- `selected_clip_slots: Handle[]`

---

## Enums & helper types

### `enum WarpMode`
**Values are not contiguous — 5 is unused.** Cycle via an explicit array.
`Beats=0`, `Tones=1`, `Texture=2`, `Repitch=3`, `Complex=4`, `ComplexPro=6`.

### `enum GridQuantization`
`NoGrid=0`, `EightBars=1`, `FourBars=2`, `TwoBars=3`, `Bar=4`, `Half=5`,
`Quarter=6`, `Eighth=7`, `Sixteenth=8`, `ThirtySecond=9`. Combine with
`Song.gridIsTriplet` for the full grid.

### `type NoteDescription` (MIDI note for `MidiClip.notes`)
```ts
type NoteDescription = {
  pitch: number;            // MIDI note number
  startTime: number;        // beats
  duration: number;         // beats
  velocity?: number;
  velocityDeviation?: number;
  releaseVelocity?: number;
  probability?: number;
  muted?: boolean;
  selected?: boolean;
};
```

### `interface ClipLoopSettings` (for `createAudioClip`)
```ts
interface ClipLoopSettings {
  startMarker: number; endMarker: number;  // beats
  loopStart: number;  loopEnd: number;     // beats
  looping: boolean;
}
```
Enforced: `startMarker ≤ endMarker`; loop ≥ 0.25 beats (a 16th); when
`looping === false` then `loopStart === startMarker` and `loopEnd === endMarker`;
when `isWarped === false`, positions must be ≥ 0 and `looping` must be `false`.

### `interface WarpMarker`
- `beatTime: number`, `sampleTime: number`.

### `type ContextMenuScope` (v1.0.0)
Object scopes (callback gets a `Handle`): `"AudioClip"`, `"AudioTrack"`,
`"ClipSlot"`, `"DrumRack"`, `"MidiClip"`, `"MidiTrack"`, `"Sample"`, `"Scene"`,
`"Simpler"`.
Selection scopes: `"ClipSlotSelection"` (→ `ClipSlotSelection`),
`"AudioTrack.ArrangementSelection"` and `"MidiTrack.ArrangementSelection"`
(→ `ArrangementSelection`).

### `interface DeviceParameterValueItem`
- `name: string`, `shortName: string`.
