# Extension project templates

Copy these into a new extension when scaffolding by hand. **The recommended path
is still the official creator** — it fills in `.env`, vendors the SDK/CLI
tarballs, and avoids version-mismatch mistakes:

```bash
mkdir my-extension && cd my-extension
npx file:/path/to/sdk/ableton-create-extension-<version>.tgz
```

Use these templates when the creator isn't available, when adding files to an
existing project, or as a reference for what each file should contain.

| File | Purpose |
|---|---|
| `manifest.json` | Metadata Live + the CLI read: `name`, `author`, `version`, `entry` (the bundle), `minimumApiVersion`. |
| `package.json` | Scripts (`start`/`build`/`build:dev`/`package`) and deps. **Fix the SDK/CLI tarball paths and versions** to match your SDK download. |
| `build.ts` | esbuild bundler → single `dist/extension.js`. Includes the `.html` text loader so webview imports work. |
| `tsconfig.json` | Strict TS config matching the SDK examples. |
| `src/extension.ts` | Starter entry point: `activate` → `initialize`, one command + context-menu action. |
| `src/html.d.ts` | Lets TS accept `import html from "./x.html"` (needed for webviews). |
| `src/interface.html` | Live-themed modal webview boilerplate (form + OK/Cancel + host messaging). Omit if you have no UI. |
| `.env.example` | Copy to `.env`; set `EXTENSION_HOST_PATH` to your Live install so `npm start` can connect. |
| `.gitignore` | Ignores `node_modules/` and `dist/`. |

## After copying

1. `npm install`
2. Enable **Preferences → Extensions → Developer Mode** in the Live Beta.
3. Set `EXTENSION_HOST_PATH` in `.env` (or pass `--live <path>` to `npm start`).
4. `npm start`

## Notes

- The host does **not** resolve `node_modules` at runtime — everything must be
  bundled into the one file named by `manifest.json`'s `entry`.
- `npm run package` builds for production then emits a `.ablx` users install by
  dropping it on Live's Extensions settings page.
- No UI? Delete `src/interface.html` and `src/html.d.ts` (the `.html` loader in
  `build.ts` is then just unused, which is harmless).
- **Storage/temp dirs in dev:** Live provides and creates
  `environment.storageDirectory`/`tempDirectory`, but `extensions-cli run` does
  not. The `start` script passes `--storage-directory .dev/storage
  --temp-directory .dev/temp` (gitignored) so `npm start` has them; your code
  must still `fs.mkdir(dir, { recursive: true })` before writing, and guard the
  `undefined` case. This is harmless in production, where Live supplies the dirs.
