import { Extension, createExtension } from "@ableton-extensions/sdk";
import {
  ArrangementSelection,
  LiveSet,
  MidiTrack,
  Song,
} from "@ableton-extensions/sdk";

const extension = createExtension({
  name: "Fill With Clips",
  version: "1.0.0",

  async onLoad(context) {
    // Register a context menu item that appears when right-clicking in the Arrangement
    context.arrangement.addContextMenuItem({
      label: "Fill With Clips",
      // Only show this menu item when there is an active time selection
      isVisible: async () => {
        const selection = await context.song.getArrangementSelection();
        return (
          selection !== null &&
          selection.startTime !== selection.endTime
        );
      },
      onExecute: async () => {
        const song = context.song;

        // Get the current arrangement time selection
        const selection = await song.getArrangementSelection();

        if (!selection || selection.startTime >= selection.endTime) {
          return;
        }

        const { startTime, endTime, tracks } = selection;
        const clipLength = endTime - startTime;

        // Filter to only MIDI tracks from the selection
        const midiTracks = tracks.filter(
          (track) => track.type === "midi"
        ) as MidiTrack[];

        if (midiTracks.length === 0) {
          return;
        }

        // Wrap all clip creation in a single undo step
        await song.beginUndoStep("Fill With Clips");

        try {
          for (const track of midiTracks) {
            // Create an empty MIDI clip at the selection range on this track
            await track.createMidiClip({
              startTime,
              length: clipLength,
            });
          }
        } finally {
          await song.endUndoStep();
        }
      },
    });
  },

  async onUnload() {
    // Nothing to clean up — context menu items are removed automatically
  },
});

export default extension;
