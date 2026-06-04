import { Extension, Song, Clip, WarpMode, ContextMenu, MenuItem } from "@ableton-extensions/sdk";

const WARP_MODES: WarpMode[] = [
  WarpMode.Beats,
  WarpMode.Tones,
  WarpMode.Texture,
  WarpMode.Repitch,
  WarpMode.Complex,
  WarpMode.ComplexPro,
];

export default class CycleWarpModeExtension extends Extension {
  async onLoad(): Promise<void> {
    this.registerContextMenu();
  }

  private registerContextMenu(): void {
    this.contextMenu.register({
      target: "AudioClip",
      items: [
        {
          label: "Cycle Warp Mode",
          action: async (clip: Clip) => {
            await this.cycleWarpMode(clip);
          },
        } as MenuItem,
      ],
    });
  }

  private async cycleWarpMode(clip: Clip): Promise<void> {
    const currentMode = await clip.warpMode.get();
    const currentIndex = WARP_MODES.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % WARP_MODES.length;
    const nextMode = WARP_MODES[nextIndex];
    await clip.warpMode.set(nextMode);
  }

  async onUnload(): Promise<void> {
    // Nothing to clean up
  }
}
