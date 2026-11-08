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
import { CityLife } from './life';
import { Traffic } from './traffic';

/** Builds the city: ground and roads, buildings (solid), the park, the landing pad and clouds. */
export function buildCityScenery(scene: Scene, colliders: ColliderWorld, textures: WorldTextures, maxAnisotropy: number): Scenery {
  buildRoads(scene);
  buildBuildings(scene, colliders, buildCityPlan(), createFacadeTexture(maxAnisotropy));
  buildPark(scene, colliders);
  const traffic = new Traffic(scene, colliders);
  const life = new CityLife(scene);
  const pad = new Mesh(new CylinderGeometry(1.4, 1.5, 0.12, 40), new MeshStandardMaterial({ map: textures.pad, roughness: 0.7 }));
  pad.position.copy(PIT_PAD.position).y += 0.12;
  scene.add(pad);
  buildClouds(scene, textures);
  return {
    setDetail: (isOn) => life.setDetail(isOn),
    update(timeS: number): void {
      traffic.update(timeS);
      life.update(timeS);
    },
  };
}
