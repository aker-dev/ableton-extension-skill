# Examples

Working Ableton Live extensions built with the [`ableton-extension`](../) skill.
Each is a standalone project.

| Example | What it shows | Needs `yt-dlp`+`ffmpeg` |
|---|---|---|
| [`url-to-clip/`](url-to-clip/) | **Flagship showcase** — webview URL modal → yt‑dlp/ffmpeg → audio clip in Session *and* Arrangement, named from the video title (3 context‑menu scopes, progress + cancel, sandbox‑safe). | ✅ |
| [`downloadwav/`](downloadwav/) | Minimal "download a WAV from a URL into a clip slot" variant. | ✅ |
| [`cyclewarpmode/`](cyclewarpmode/) | Right‑click an audio clip to cycle its Warp Mode (handles the non‑contiguous `WarpMode` enum correctly). | — |
| [`fillwithclips/`](fillwithclips/) | Fill a MIDI‑track time selection with empty clips as a **single undo step**. | — |

The last three were scaffolded with the official `create-extension` tool and
hand‑verified in Live; `url-to-clip` was built from the skill's templates.

## Setup (same for every example)

> Examples that download from URLs (`url-to-clip`, `downloadwav`) also require:
> ```bash
> brew install yt-dlp ffmpeg
> ```

1. Put the Ableton SDK + CLI tarballs in the example's `vendor/` folder — see each
   `vendor/README.md`. They're **not** in this repo (Ableton's private beta).
2. `npm install`
3. `cp .env.example .env` and set `EXTENSION_HOST_PATH` to your Live Beta app.
4. In Live (Beta): **Preferences → Extensions → Developer Mode** (on).
5. `npm start`, then right‑click in Live to find the extension's menu item.
