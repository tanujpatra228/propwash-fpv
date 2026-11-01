import type { Scene } from 'three';
import type { ColliderWorld } from '../physics/colliders';
import { buildClouds } from './clouds';
import { buildFactory } from './factory';
import { buildGrass, type Grass } from './grass';
import { buildHamlet } from './houses';
import { PIT_PAD, buildPitArea } from './pit-area';
import { Exclusions } from './scatter';
import type { WorldTextures } from './textures';
import { buildVegetation } from './vegetation';

const PIT_EXCLUSION_RADIUS_M = 22;

export interface Scenery {
  grass: Grass;
  /** Advance wind and other ambient motion. */
  update(timeS: number): void;
}

/** Builds everything static and decorative, and registers colliders as each piece is made. */
export function buildScenery(scene: Scene, colliders: ColliderWorld, textures: WorldTextures): Scenery {
  const exclusions = new Exclusions();
  exclusions.add(PIT_PAD.position.x, PIT_PAD.position.z, PIT_EXCLUSION_RADIUS_M);
  buildPitArea(scene, colliders, textures);
  buildFactory(scene, colliders, textures);
  buildHamlet(scene, colliders, textures, exclusions);
  buildVegetation(scene, colliders, exclusions);
  const grass = buildGrass(scene);
  buildClouds(scene, textures);
  return {
    grass,
    update(timeS: number): void {
      grass.update(timeS);
    },
  };
}
