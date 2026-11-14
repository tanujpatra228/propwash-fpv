import type { Scene } from 'three';
import type { GameRenderer } from '../core/renderer';
import type { ColliderWorld } from '../physics/colliders';
import { buildBoundary, type Boundary } from '../world/boundary';
import { buildGates, type Gate } from '../world/gates';
import { buildScenery, type Scenery } from '../world/scenery';
import { buildCityScenery } from '../world/city/city-world';
import { buildGlacierScenery } from '../world/glacier/glacier-world';
import { buildHarborScenery } from '../world/harbor/harbor-world';
import { ACTIVE_TRACK_DEF } from '../config';
import { buildSky, type SkyRig } from '../world/sky';
import { buildTerrain, buildWater } from '../world/terrain';
import { createWorldTextures } from '../world/textures';

export interface WorldContent {
  sky: SkyRig;
  scenery: Scenery;
  gates: Gate[];
  boundary: Boundary;
}

/** Builds everything that makes up the valley (sky, ground, water, scenery, gates, boundary) into the scene and collider world. */
export function buildWorldContent(scene: Scene, renderer: GameRenderer, colliders: ColliderWorld): WorldContent {
  const sky = buildSky(scene, renderer.webgl);
  const maxAnisotropy = renderer.webgl.capabilities.getMaxAnisotropy();
  const textures = createWorldTextures(maxAnisotropy);
  let scenery: Scenery;
  if (ACTIVE_TRACK_DEF.family === 'city') {
    scenery = buildCityScenery(scene, colliders, textures, maxAnisotropy);
  } else if (ACTIVE_TRACK_DEF.family === 'glacier') {
    scenery = buildGlacierScenery(scene, colliders, textures);
  } else if (ACTIVE_TRACK_DEF.family === 'harbor') {
    scenery = buildHarborScenery(scene, colliders, textures);
  } else {
    buildTerrain(scene, textures.detail);
    buildWater(scene);
    scenery = buildScenery(scene, colliders, textures);
  }
  const gates = buildGates(scene, colliders, textures);
  const boundary = buildBoundary(scene);
  return { sky, scenery, gates, boundary };
}
