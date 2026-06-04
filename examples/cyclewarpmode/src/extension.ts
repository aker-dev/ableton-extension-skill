import {
  initialize,
  type ActivationContext,
  AudioClip,
  type Handle,
  WarpMode,
} from "@ableton-extensions/sdk";

// WarpMode enum values are NOT contiguous — 5 is unused.
// Cycle must use an explicit ordered array.
const WARP_MODE_CYCLE: WarpMode[] = [
  WarpMode.Beats,      // 0
  WarpMode.Tones,      // 1
  WarpMode.Texture,    // 2
  WarpMode.Repitch,    // 3
  WarpMode.Complex,    // 4
  WarpMode.ComplexPro, // 6
];

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  // Register the command that cycles through warp modes.
  context.commands.registerCommand(
    "cycleWarpMode.cycleWarpMode",
    (arg: unknown) => {
      const clip = context.getObjectFromHandle(arg as Handle, AudioClip);

      // If the clip is not currently warped, enable warping first so that
      // changing the warp mode has an audible effect.
      if (!clip.warping) {
        clip.warping = true;
      }

      const currentMode = clip.warpMode;
      const currentIndex = WARP_MODE_CYCLE.indexOf(currentMode);

      // If somehow the current mode isn't in our list, default to index 0
      // (i.e. next will be index 1 = Tones). Otherwise advance to next,
      // wrapping back to the first mode after the last.
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + 1) % WARP_MODE_CYCLE.length;

      clip.warpMode = WARP_MODE_CYCLE[nextIndex];
    },
  );

  // Wire the command to the AudioClip right-click context menu.
  context.ui.registerContextMenuAction(
    "AudioClip",
    "Cycle Warp Mode",
    "cycleWarpMode.cycleWarpMode",
  );
}
