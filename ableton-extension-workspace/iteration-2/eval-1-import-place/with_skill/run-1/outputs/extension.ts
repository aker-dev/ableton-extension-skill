import { initialize, type ActivationContext } from "@ableton-extensions/sdk";
import { ClipSlot, Handle } from "@ableton-extensions/sdk";
import * as fs from "fs/promises";
import * as path from "path";
import * as https from "https";
import * as http from "http";

const WAV_URL = "https://example.com/loop.wav";

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https://") ? https : http;
    const file = require("fs").createWriteStream(destPath);
    protocol
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          file.destroy();
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        file.destroy();
        reject(err);
      });
  });
}

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  context.commands.registerCommand(
    "downloadWav.dropIntoClipSlot",
    async (arg: unknown) => {
      const handle = arg as Handle;

      await context.ui.withinProgressDialog(
        "Downloading WAV…",
        {},
        async (update, signal) => {
          // 1. Resolve temp directory, guard for undefined, and ensure it exists.
          const tempDir = context.environment.tempDirectory;
          if (!tempDir) {
            throw new Error(
              "No temp directory available. " +
                "When running via the CLI, pass --temp-directory <dir>."
            );
          }
          await fs.mkdir(tempDir, { recursive: true });

          const fileName = `loop-${Date.now()}.wav`;
          const localPath = path.join(tempDir, fileName);

          await update("Downloading WAV…", 10);
          signal.throwIfAborted();

          // 2. Download the WAV into the temp directory.
          await downloadFile(WAV_URL, localPath);
          signal.throwIfAborted();

          await update("Importing into project…", 60);

          // 3. Import the file into the Live project so Live manages it.
          //    ALWAYS use the returned path in subsequent API calls.
          const importedPath = await context.resources.importIntoProject(localPath);
          signal.throwIfAborted();

          await update("Creating clip…", 80);

          // 4. Resolve the ClipSlot handle and create an unwarped audio clip.
          const clipSlot = context.getObjectFromHandle(handle, ClipSlot);
          await clipSlot.createAudioClip({
            filePath: importedPath,
            isWarped: false,
          });

          await update("Done", 100);
        }
      );
    }
  );

  // Register a right-click action on any Session-view clip slot.
  context.ui.registerContextMenuAction(
    "ClipSlot",
    "Download WAV here",
    "downloadWav.dropIntoClipSlot"
  );
}
