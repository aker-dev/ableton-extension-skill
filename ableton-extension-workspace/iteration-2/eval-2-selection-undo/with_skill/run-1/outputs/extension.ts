import {
  initialize,
  type ActivationContext,
  type ArrangementSelection,
  type Handle,
  DataModelObject,
  MidiTrack,
  TakeLane,
} from "@ableton-extensions/sdk";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  context.commands.registerCommand(
    "fillWithClips.fillMidiTracks",
    (arg: unknown) =>
      void (async (selection: ArrangementSelection) => {
        const { time_selection_start, time_selection_end, selected_lanes } =
          selection;

        const duration = time_selection_end - time_selection_start;

        if (duration <= 0) {
          console.warn(
            "Fill With Clips: time selection has zero or negative duration, aborting."
          );
          return;
        }

        if (selected_lanes.length === 0) {
          console.warn("Fill With Clips: no lanes selected, aborting.");
          return;
        }

        // Resolve all selected lanes and keep only MIDI tracks (not take lanes on
        // non-MIDI tracks). A take lane whose parent is a MidiTrack also qualifies.
        const midiTracks = selected_lanes
          .map((h: Handle) => context.getObjectFromHandle(h, DataModelObject))
          .filter(
            (o): o is MidiTrack<"1.0.0"> =>
              o instanceof MidiTrack
          );

        if (midiTracks.length === 0) {
          console.warn(
            "Fill With Clips: no MIDI tracks in selection, aborting."
          );
          return;
        }

        // Create one empty MIDI clip on each MIDI track, all in a single undo step.
        // withinTransaction returns Promise.all so the async creates are grouped.
        const clips = await context.withinTransaction(() =>
          Promise.all(
            midiTracks.map((track) =>
              track.createMidiClip(time_selection_start, duration)
            )
          )
        );

        console.log(
          `Fill With Clips: created ${clips.length} MIDI clip(s) at beats ` +
            `${time_selection_start}–${time_selection_end}.`
        );
      })(arg as ArrangementSelection).catch((e) => console.error(e))
  );

  void context.ui.registerContextMenuAction(
    "MidiTrack.ArrangementSelection",
    "Fill With Clips",
    "fillWithClips.fillMidiTracks"
  );
}
