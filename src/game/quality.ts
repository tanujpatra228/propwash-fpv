import { QUALITY } from '../config';
import type { GameRenderer } from '../core/renderer';
import type { QualityId } from '../ui/menu';
import type { Scenery } from '../world/scenery';
import type { SkyRig } from '../world/sky';

/** Applies a graphics preset: pixel ratio, shadow map size (0 = off) and grass. Cheap to call at any time. */
export function applyQualityPreset(id: QualityId, renderer: GameRenderer, sky: SkyRig, scenery: Scenery): void {
  const preset = QUALITY[id];
  renderer.setPixelRatioCap(preset.pixelRatio);
  sky.setShadowQuality(preset.shadowMapPx);
  scenery.grass.setVisible(preset.hasGrass);
}
