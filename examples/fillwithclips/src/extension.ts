import {
  initialize,
  type ActivationContext,
  DataModelObject,
  MidiTrack,
  type ArrangementSelection,
  type Handle,
} from "@ableton-extensions/sdk";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  context.commands.registerCommand(
    "fillWithClips.fillSelection",
    (arg: unknown) =>
      void (async (selection: ArrangementSelection) => {
        const { time_selection_start, time_selection_end, selected_lanes } =
          selection;

        // Compute clip duration from the time selection (in beats)
        const duration = time_selection_end - time_selection_start;

        if (duration <= 0 || selected_lanes.length === 0) {
          return;
        }

        // Resolve handles and keep only MidiTrack objects (not TakeLanes, not
        // AudioTracks). The scope is MidiTrack.ArrangementSelection so all
        // lanes *should* belong to MIDI tracks, but we guard with instanceof
        // to be safe.
        const midiTracks = selected_lanes
          .map((h: Handle) =>
            context.getObjectFromHandle(h, DataModelObject)
          )
          .filter((o): o is MidiTrack<"1.0.0"> => o instanceof MidiTrack);

        if (midiTracks.length === 0) {
          return;
        }

        // Create one empty MIDI clip per selected MIDI track, all grouped into
        // a single undo step. withinTransaction with Promise.all is the correct
        // pattern for async operations that must land as one undo entry.
        const clipPromises = context.withinTransaction(() =>
          Promise.all(
            midiTracks.map((track) =>
              track.createMidiClip(time_selection_start, duration)
            )
          )
        );

        await clipPromises;
      })(arg as ArrangementSelection).catch((e: unknown) =>
        console.error("[fillWithClips] Error:", e)
      )
  );

  // Register the context menu item for MIDI track arrangement selections.
  // The MidiTrack.ArrangementSelection scope delivers an ArrangementSelection
  // containing the time range and the selected MIDI track lanes.
  context.ui
    .registerContextMenuAction(
      "MidiTrack.ArrangementSelection",
      "Fill With Clips",
      "fillWithClips.fillSelection"
    )
    .catch((e: unknown) =>
      console.error("[fillWithClips] Failed to register context menu:", e)
    );
}
