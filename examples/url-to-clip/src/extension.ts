import {
  initialize,
  AudioTrack,
  ClipSlot,
  type AudioClip,
  type ActivationContext,
  type ArrangementSelection,
  type Handle,
} from "@ableton-extensions/sdk";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import modalHtml from "./interface.html";

// GUI-launched apps often have a minimal PATH; make sure Homebrew dirs are seen
// so we can find yt-dlp and so yt-dlp can find ffmpeg.
const EXTRA_PATHS = ["/opt/homebrew/bin", "/usr/local/bin"];

function augmentedPath(): string {
  const parts = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const p of EXTRA_PATHS) if (!parts.includes(p)) parts.push(p);
  return parts.join(path.delimiter);
}

/** Resolve a binary to an absolute path by probing Homebrew dirs then PATH. */
function resolveBin(name: string): string | null {
  const dirs = [...EXTRA_PATHS, ...(process.env.PATH ?? "").split(path.delimiter)];
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* not here / not executable */
    }
  }
  return null;
}

function requireDir(dir: string | undefined, name: string): string {
  if (!dir) {
    throw new Error(
      `No ${name} directory available. When running via the CLI, pass --${name}-directory.`,
    );
  }
  return dir;
}

function dataUrl(html: string): string {
  return `data:text/html,${encodeURIComponent(html)}`;
}

interface DownloadResult {
  wavPath: string;
  title: string;
}

/**
 * Spawn yt-dlp to download `url` and extract a WAV into `tempDir`.
 * Reports progress (0–100) and resolves with the WAV path + video title.
 * The output path is deterministic (`-x --audio-format wav` => fixed `.wav`),
 * so we don't have to parse it back; only the title is parsed (tagged line).
 */
function runYtDlp(
  ytDlpPath: string,
  url: string,
  tempDir: string,
  onProgress: (pct: number, speed: string) => void,
  signal: AbortSignal,
): Promise<DownloadResult> {
  return new Promise<DownloadResult>((resolve, reject) => {
    const base = `u2c-${Date.now()}`;
    const wavPath = path.join(tempDir, `${base}.wav`);
    const args = [
      url,
      "-x",
      "--audio-format",
      "wav",
      "--newline", // emit progress as discrete lines
      "--no-playlist",
      "--no-simulate", // --print would otherwise imply --simulate
      "--print",
      "TT::%(title)s", // tagged so we can pick it out of stdout
      "-o",
      path.join(tempDir, `${base}.%(ext)s`),
    ];

    const child = spawn(ytDlpPath, args, {
      env: { ...process.env, PATH: augmentedPath() },
    });

    let title = "";
    let stderrTail = "";
    let buf = "";

    const onAbort = () => child.kill();
    signal.addEventListener("abort", onAbort, { once: true });

    const handleLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;
      if (line.startsWith("TT::")) {
        title = line.slice(4).trim();
        return;
      }
      const pct = /\[download\]\s+([\d.]+)%/.exec(line);
      if (pct?.[1]) {
        const speed = /at\s+(\S+\/s)/.exec(line);
        onProgress(parseFloat(pct[1]), speed?.[1] ?? "");
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        handleLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-800);
    });

    child.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      if (buf) handleLine(buf);
      if (signal.aborted) {
        reject(new Error("aborted"));
      } else if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}.\n${stderrTail}`));
      } else {
        resolve({ wavPath, title });
      }
    });
  });
}

function errorHtml(heading: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<style>
:root{--bg:hsl(0,0%,21%);--fg:hsl(0,0%,71%);--accent:hsl(31,100%,67%)}
html{background:var(--bg);color:var(--fg);font-family:sans-serif;font-size:12px}
body{margin:0;height:100vh;display:flex;flex-direction:column;gap:.6em;align-items:center;justify-content:center;padding:1.4em;text-align:center}
h1{font-size:1.1em;margin:0;color:#fff}code{background:hsl(0,0%,12%);padding:.15em .4em;border-radius:3px;color:var(--accent)}
button{margin-top:.4em;background:hsl(0,0%,16%);color:var(--fg);border:1px solid hsl(0,0%,7%);height:22px;padding:0 1.2em;border-radius:11px;cursor:pointer}
</style><script>
function done(){var m={method:"close_and_send",params:["{}"]};
if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.live)window.webkit.messageHandlers.live.postMessage(m);
else if(window.chrome&&window.chrome.webview)window.chrome.webview.postMessage(m);}
document.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key==="Escape")done();});
</script></head><body><h1>${heading}</h1><div>${body}</div><button onclick="done()">OK</button></body></html>`;
}

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  type Placement = (filePath: string) => Promise<AudioClip<"1.0.0">>;

  const run = async (buildPlacement: () => Placement): Promise<void> => {
    // Resolve the right-clicked target now (don't cache handles across edits).
    const placement = buildPlacement();

    // Preflight: yt-dlp + ffmpeg must be installed (Homebrew).
    const ytDlpPath = resolveBin("yt-dlp");
    const ffmpegPath = resolveBin("ffmpeg");
    if (!ytDlpPath || !ffmpegPath) {
      const missing = [!ytDlpPath ? "yt-dlp" : "", !ffmpegPath ? "ffmpeg" : ""]
        .filter(Boolean)
        .join(" and ");
      await context.ui.showModalDialog(
        dataUrl(
          errorHtml(
            `${missing} not found`,
            `Install the required tools, then try again:<br><br><code>brew install yt-dlp ffmpeg</code>`,
          ),
        ),
        440,
        190,
      );
      return;
    }

    // Ask for the URL.
    const raw = await context.ui.showModalDialog(dataUrl(modalHtml), 460, 200);
    let url: string | null = null;
    try {
      url = (JSON.parse(raw) as { url: string | null }).url;
    } catch {
      url = null;
    }
    if (!url) return;
    const targetUrl = url;

    await context.ui.withinProgressDialog(
      "Importing audio…",
      { progress: 0 },
      async (update, signal) => {
        try {
          const tempDir = requireDir(context.environment.tempDirectory, "temp");
          await fsp.mkdir(tempDir, { recursive: true });

          await update("Downloading…", 5);
          const { wavPath, title } = await runYtDlp(
            ytDlpPath,
            targetUrl,
            tempDir,
            (pct, speed) => {
              // Reserve 0–85% of the bar for the download phase.
              void update(
                speed ? `Downloading… ${speed}` : "Downloading…",
                Math.min(85, Math.round(pct * 0.85)),
              );
            },
            signal,
          );
          if (signal.aborted) return;

          await update("Importing into project…", 92);
          const imported = await context.resources.importIntoProject(wavPath);
          if (signal.aborted) return;

          await update("Creating clip…", 98);
          const clip = await placement(imported);
          clip.name = title || targetUrl;

          await update("Done", 100);
        } catch (err) {
          if (signal.aborted) return; // user cancelled — swallow
          console.error("[url-to-clip]", err);
          throw err; // surface unexpected errors to the host
        }
      },
    );
  };

  // --- Session view: a clip slot -------------------------------------------
  context.commands.registerCommand("urlToClip.slot", (arg: unknown) => {
    void run(() => {
      const slot = context.getObjectFromHandle(arg as Handle, ClipSlot);
      return (filePath: string) => slot.createAudioClip({ filePath, isWarped: false });
    }).catch((e: unknown) => console.error("[url-to-clip]", e));
  });

  // --- Arrangement view: a time selection on an audio track ----------------
  context.commands.registerCommand("urlToClip.arrSelection", (arg: unknown) => {
    void run(() => {
      const sel = arg as ArrangementSelection;
      const first = sel.selected_lanes[0];
      if (!first) throw new Error("No track in the arrangement selection.");
      const track = context.getObjectFromHandle(first, AudioTrack);
      return (filePath: string) =>
        track.createAudioClip({
          filePath,
          startTime: sel.time_selection_start,
          isWarped: false,
        });
    }).catch((e: unknown) => console.error("[url-to-clip]", e));
  });

  // --- Arrangement view: a bare audio track (no selection) -> beat 0 -------
  context.commands.registerCommand("urlToClip.track", (arg: unknown) => {
    void run(() => {
      const track = context.getObjectFromHandle(arg as Handle, AudioTrack);
      return (filePath: string) =>
        track.createAudioClip({ filePath, startTime: 0, isWarped: false });
    }).catch((e: unknown) => console.error("[url-to-clip]", e));
  });

  context.ui.registerContextMenuAction("ClipSlot", "Import audio from URL…", "urlToClip.slot");
  context.ui.registerContextMenuAction(
    "AudioTrack.ArrangementSelection",
    "Import audio from URL…",
    "urlToClip.arrSelection",
  );
  context.ui.registerContextMenuAction("AudioTrack", "Import audio from URL…", "urlToClip.track");
}
