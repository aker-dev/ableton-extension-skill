import * as fs from "fs/promises";
import * as path from "path";
import { initialize, type ActivationContext } from "@ableton-extensions/sdk";
import { ClipSlot, Handle } from "@ableton-extensions/sdk";

const WAV_URL = "https://example.com/loop.wav";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  context.commands.registerCommand(
    "importWav.dropIntoClipSlot",
    (arg: unknown) =>
      void (async () => {
        const handle = arg as Handle;
        const clipSlot = context.getObjectFromHandle(handle, ClipSlot);

        await context.ui.withinProgressDialog(
          "Downloading WAV…",
          { progress: 0 },
          async (update, signal) => {
            // Step 1: Download the WAV into the sandbox temp directory.
            await update("Downloading…", 10);
            const response = await fetch(WAV_URL);
            if (!response.ok) {
              throw new Error(
                `Download failed: ${response.status} ${response.statusText}`,
              );
            }
            signal.throwIfAborted();

            await update("Saving to temp…", 40);
            const tempDir = context.environment.tempDirectory;
            if (!tempDir) {
              throw new Error("Temp directory is not available.");
            }
            const tmpFile = path.join(tempDir, "importwav_loop.wav");
            await fs.writeFile(tmpFile, Buffer.from(await response.arrayBuffer()));
            signal.throwIfAborted();

            // Step 2: Import the file into the Live project via the host.
            // importIntoProject can access outside the extension sandbox.
            await update("Importing into project…", 70);
            const imported = await context.resources.importIntoProject(tmpFile);
            signal.throwIfAborted();

            // Step 3: Place the imported WAV into the clip slot as an unwarped audio clip.
            await update("Creating clip…", 90);
            await clipSlot.createAudioClip({ filePath: imported, isWarped: false });

            await update("Done", 100);
          },
        );
      })().catch((err) => console.error("[importWav] Error:", err)),
  );

  context.ui.registerContextMenuAction(
    "ClipSlot",
    "Download WAV Here",
    "importWav.dropIntoClipSlot",
  );
}
