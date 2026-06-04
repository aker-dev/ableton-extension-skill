import * as esbuild from "esbuild";
import * as fs from "node:fs";

// The Extension Host loads a single standalone file and does NOT resolve
// node_modules at runtime, so everything must be bundled into manifest.entry.
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const production = process.argv.includes("--production");

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  outfile: manifest.entry,
  bundle: true,
  format: "cjs",
  platform: "node",
  sourcesContent: false,
  logLevel: "info",
  minify: production,
  sourcemap: !production,
  // Lets us `import html from "./interface.html"` for the webview modal.
  loader: { ".html": "text" },
});
