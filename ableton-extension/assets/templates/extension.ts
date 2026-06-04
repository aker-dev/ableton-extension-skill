import {
  initialize,
  Clip,
  type ActivationContext,
  type Handle,
} from "@ableton-extensions/sdk";

// The Extension Host calls `activate` once when your extension loads.
export function activate(activation: ActivationContext) {
  // Initialize the SDK with the lowest API version that has what you need.
  const context = initialize(activation, "1.0.0");

  // Sanity check — appears in ExtensionHost.txt.
  const song = context.application.song;
  console.log(`Loaded. Tempo ${song.tempo} bpm, ${song.tracks.length} tracks.`);

  // A command is a named callback. The arg it receives depends on the scope it's
  // wired to. An object scope (like AudioClip/MidiClip) delivers a Handle.
  context.commands.registerCommand("myExt.renameClip", (arg: unknown) => {
    // Resolve as the base Clip so this works for both audio and MIDI clips.
    // Re-resolve handles on demand; never cache them across user edits.
    const clip = context.getObjectFromHandle(arg as Handle, Clip);
    clip.name = `${clip.name} ✏️`;
  });

  // Bind the command to Live's right-click menu, for both clip types.
  (["AudioClip", "MidiClip"] as const).forEach((scope) => {
    context.ui.registerContextMenuAction(scope, "Rename (demo)", "myExt.renameClip");
  });

  // ---------------------------------------------------------------------------
  // Next steps (delete what you don't need):
  //
  // • Arrangement selection scope delivers an ArrangementSelection instead of a
  //   Handle (time_selection_start/end in beats, selected_lanes: Handle[]):
  //     context.ui.registerContextMenuAction(
  //       "AudioTrack.ArrangementSelection", "Process", "myExt.process");
  //
  // • Group several mutations into one undo step:
  //     context.withinTransaction(() => { /* ...sync mutations... */ });
  //   For async creation, return Promise.all and await the transaction call.
  //
  // • Long task with feedback:
  //     await context.ui.withinProgressDialog("Working…", {}, async (update, signal) => {
  //       await update("Halfway", 50);
  //     });
  //
  // • Custom UI (needs interface.html + html.d.ts + the .html loader in build.ts):
  //     import html from "./interface.html";
  //     const result = await context.ui.showModalDialog(
  //       `data:text/html,${encodeURIComponent(html)}`, 360, 240);
  //
  // • Filesystem (storage/temp): the values can be undefined and the folder may
  //   not exist — `extensions-cli run` doesn't provide/create them (Live does).
  //   Guard + mkdir before writing (the `start` script passes .dev/storage|temp):
  //     import * as fs from "fs/promises";
  //     const dir = context.environment.tempDirectory;
  //     if (dir) { await fs.mkdir(dir, { recursive: true }); /* then write... */ }
  // ---------------------------------------------------------------------------
}
