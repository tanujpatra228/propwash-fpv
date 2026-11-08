import type { Scene } from 'three';
import type { GameRenderer } from '../core/renderer';
import type { ColliderWorld } from '../physics/colliders';
import { buildBoundary, type Boundary } from '../world/boundary';
import { buildGates, type Gate } from '../world/gates';
import { buildScenery, type Scenery } from '../world/scenery';
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
  const textures = createWorldTextures(renderer.webgl.capabilities.getMaxAnisotropy());
  buildTerrain(scene, textures.detail);
  buildWater(scene);
  const scenery = buildScenery(scene, colliders, textures);
  const gates = buildGates(scene, colliders, textures);
  const boundary = buildBoundary(scene);
  return { sky, scenery, gates, boundary };
}
