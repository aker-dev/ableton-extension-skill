import {
  extension,
  ExtensionContext,
  ClipSlot,
  ClipSlotAction,
  Filesystem,
  fetch,
} from "@ableton-extensions/sdk";

const WAV_URL = "https://example.com/loop.wav";

extension({
  name: "Download WAV to Clip Slot",
  version: "1.0.0",

  async activate(context: ExtensionContext): Promise<void> {
    // Register a right-click context menu action on clip slots in the Session view
    context.session.clipSlots.addAction({
      id: "download-wav-to-slot",
      label: "Download WAV to Slot",
      async execute(clipSlot: ClipSlot): Promise<void> {
        // Fetch the WAV file from the hardcoded URL using the SDK's sandboxed fetch
        const response = await fetch(WAV_URL);
        if (!response.ok) {
          throw new Error(
            `Failed to download WAV: ${response.status} ${response.statusText}`
          );
        }

        const buffer = await response.arrayBuffer();

        // Write the file into the extension's sandbox filesystem.
        // The SDK exposes a virtual filesystem rooted at the extension's
        // designated storage directory — files must be written there before
        // they can be imported into Live.
        const fs: Filesystem = context.filesystem;
        const fileName = "downloaded_loop.wav";
        const filePath = await fs.write(fileName, buffer);

        // Import the written file as an audio clip into the target clip slot.
        // `importAudioFile` places the clip and, when `warped` is false,
        // leaves it in "unwarped" mode (raw file playback).
        await clipSlot.importAudioFile(filePath, { warped: false });
      },
    } as ClipSlotAction);
  },

  async deactivate(_context: ExtensionContext): Promise<void> {
    // Nothing to clean up — the SDK removes registered actions automatically
  },
});
