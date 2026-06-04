# Webviews & Design

How to build custom UI for an extension and make it feel at home in Live.

## Showing a webview

UI is shown via **modal dialogs**: `context.ui.showModalDialog(url, width, height)`
opens a window that loads `url` and resolves to the string the page sends back.

Supported URL schemes: `file:`, `data:`, `https:`, `http://localhost`.

The common pattern is to inline an HTML file as a **data URL** so you don't host
anything. Configure your bundler to import `.html` as text (esbuild:
`loader: { ".html": "text" }`) and add `src/html.d.ts` so TypeScript accepts the
import (see `assets/templates/html.d.ts`).

```ts
import html from "./interface.html"; // string, inlined by esbuild
const result = await context.ui.showModalDialog(
  `data:text/html,${encodeURIComponent(html)}`, 360, 240);
const data = JSON.parse(result); // whatever the page posted back
```

## Communication protocol

The webview runs in a **separate environment** from your extension. It talks back
through the host's message handler, which differs per OS — handle both:

- macOS (WebKit): `window.webkit.messageHandlers.live.postMessage(msg)`
- Windows (WebView2): `window.chrome.webview.postMessage(msg)`

**To return a result and close the dialog**, post a message named
`close_and_send` whose `params` is an array containing a single string (usually
stringified JSON). That string becomes the resolved value of `showModalDialog`.

```js
function closeWithResult(result) {
  const message = { method: "close_and_send", params: [JSON.stringify(result)] };
  if (window.webkit?.messageHandlers?.live)
    window.webkit.messageHandlers.live.postMessage(message);
  else if (window.chrome?.webview)
    window.chrome.webview.postMessage(message);
}
```

**Passing data into the webview:** inline it into the HTML string before
`encodeURIComponent`, or append query params to the data URL and read them in the
page (`new URLSearchParams(location.search)`).

A complete, Live-themed boilerplate (form, OK/Cancel, Enter/Escape handling,
focus management, dark-theme CSS variables) is in
`assets/templates/interface.html`. Start from it.

## Modal vs. progress dialog

| | Modal (webview) | Progress |
|---|---|---|
| Use for | custom UI, input, forms | background tasks + feedback |
| Content | your HTML/CSS/JS | Live's standard progress bar |
| Blocking | yes (extension suspended awaiting result) | yes (user UI blocked) |
| Best for | rename, pick options, configure | analyze audio, batch create |

---

## Ableton design guidelines (for dialogs)

Webviews use standard browser tech, so you can match Live or do your own thing.
To feel native, follow Ableton's principles:

**Hierarchy & layout**
- Use visual hierarchy to signal *sonic* importance — high-impact parameters are
  prominent; secondary ones use smaller/lower-contrast controls. Scan with your
  eyes: do the important elements stand out?
- Choose a focal point (a visualization or LCD) and arrange around it.
- Group related parameters with dividers, spacing, or color accents.
- Vary control types so the UI doesn't feel mechanical (e.g. a select vs. a radio
  group for five options).
- Use whitespace deliberately; if controls feel cramped, add padding/margins.
- Reflect processing order in the layout (top→bottom or left→right), matching
  hardware and Live conventions.
- Hide advanced/secondary controls in expandable sections; show essentials.
- Prefer **disabling** controls (`:disabled`, greyed out) over hiding them.
- Stay consistent with Live's terminology and interaction patterns.

**Color**
- Live's signature yellow/blue communicate interactivity. With custom colors,
  aim to meet WCAG contrast guidelines.

**Components**
- **Buttons:** verb labels, single word where possible; equal widths in a group;
  confirmation labels describe the action; use "Cancel" consistently. Don't use a
  button for on/off — use a checkbox/toggle.
- **Radios vs. select:** radios for ≤5 options you want visible at once; a select
  for many options or long labels.
- **Toggles vs. checkboxes:** prominent toggles for primary on/off; checkboxes
  for secondary options/preferences ("Save my settings").
- **Sliders:** for ranges where relative position matters; avoid for 2-step
  discrete values (a radio group conveys discreteness better).

**Audio caveat:** extensions can't process Live's audio in real time. Where it
helps, *visualize* the expected output as parameters change rather than implying
you can preview the sound.
