import { CylinderGeometry, Mesh, MeshStandardMaterial, type Scene } from 'three';
import type { ColliderWorld } from '../../physics/colliders';
import { buildClouds } from '../clouds';
import { PIT_PAD } from '../pit-area';
import type { Scenery } from '../scenery';
import type { WorldTextures } from '../textures';
import { buildBuildings } from './buildings';
import { createFacadeTexture } from './facade';
import { buildPark } from './park';
import { buildCityPlan } from './plan';
import { buildRoads } from './roads';

/** Builds the city: ground and roads, buildings (solid), the park, the landing pad and clouds. */
export function buildCityScenery(scene: Scene, colliders: ColliderWorld, textures: WorldTextures, maxAnisotropy: number): Scenery {
  buildRoads(scene);
  buildBuildings(scene, colliders, buildCityPlan(), createFacadeTexture(maxAnisotropy));
  buildPark(scene, colliders);
  const pad = new Mesh(new CylinderGeometry(1.4, 1.5, 0.12, 40), new MeshStandardMaterial({ map: textures.pad, roughness: 0.7 }));
  pad.position.copy(PIT_PAD.position).y += 0.12;
  scene.add(pad);
  buildClouds(scene, textures);
  return {
    setDetail(): void {
      // Nothing in the city is optional detail yet.
    },
    update(): void {
      // Static for now: traffic and birds arrive next.
    },
  };
}
