import type { PilotSettings } from '../core/pilot-settings';
import { FpsMeter } from '../core/fps-meter';
import type { GameRenderer } from '../core/renderer';
import { ResolutionController } from '../core/resolution-controller';
import type { Input } from '../input/input';
import type { QualityId } from '../ui/menu';
import type { Scenery } from '../world/scenery';
import type { SkyRig } from '../world/sky';
import type { CameraRig } from './camera-rig';
import { applyQualityPreset } from './quality';

/** Keeps the picture smooth and applies the player's graphics and camera choices to the parts that use them. */
export class Tuning {
  private readonly fpsMeter = new FpsMeter();
  private readonly resolution = new ResolutionController();

  constructor(
    private readonly parts: { renderer: GameRenderer; sky: SkyRig; scenery: Scenery; rig: CameraRig; input: Input },
  ) {}

  /** The pilot's camera, mouse and units choices. */
  applyPilot(pilot: Readonly<PilotSettings>): void {
    this.parts.rig.setGogglesView(pilot.fovDeg, pilot.uptiltDeg);
    this.parts.input.setInvertTurn(pilot.isTurnInverted);
  }

  /** A graphics preset. Resets dynamic resolution to full so it can find the right level again. */
  applyQuality(id: QualityId): void {
    const { renderer, sky, scenery } = this.parts;
    this.resolution.reset();
    renderer.setResolutionScale(1);
    applyQualityPreset(id, renderer, sky, scenery);
  }

  /**
   * Call once per frame. Once a second, while flying, a low frame rate lowers the resolution a little (and a good
   * one raises it again). Returns the frame rate when a new average is ready, otherwise null.
   */
  tick(dtS: number, isPlaying: boolean): number | null {
    const fps = this.fpsMeter.tick(dtS);
    if (fps === null) return null;
    if (isPlaying) {
      const scale = this.resolution.update(fps);
      if (scale !== null) this.parts.renderer.setResolutionScale(scale);
    }
    return fps;
  }
}
