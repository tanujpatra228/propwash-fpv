import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  DoubleSide,
  type Scene,
} from 'three';
import { SCENERY } from '../config';
import type { ColliderWorld } from '../physics/colliders';
import { addContainer } from './containers';
import { heightAt } from './terrain';
import type { WorldTextures } from './textures';
import { track } from './track';

const startTangent = track.horizontalTangent(0, new Vector3());
const startRight = new Vector3(-startTangent.z, 0, startTangent.x);

/** Where free flight starts and where batteries are swapped. Derived from the start gate. */
export const PIT_PAD = (() => {
  const start = track.positions[0] ?? new Vector3();
  const position = start
    .clone()
    .addScaledVector(startRight, SCENERY.pad.besideStartM)
    .addScaledVector(startTangent, -SCENERY.pad.behindStartM);
  position.y = heightAt(position.x, position.z);
  return {
    position,
    /** Heading along the start straight (rotation about Y; forward is -Z). */
    yawRad: Math.atan2(-startTangent.x, -startTangent.z),
    radiusM: SCENERY.pad.radiusM,
  };
})();

const DARK = 0x2b2e33;
const LEG = 0x8b9096;

/** Landing pad, two containers, a pop-up tent and a table, next to the start gate. */
export function buildPitArea(scene: Scene, colliders: ColliderWorld, textures: WorldTextures): void {
  const { position } = PIT_PAD;
  const pad = new Mesh(new CylinderGeometry(1.4, 1.5, 0.12, 40), [
    new MeshStandardMaterial({ color: DARK, roughness: 0.8 }),
    new MeshStandardMaterial({ map: textures.pad, roughness: 0.7 }),
    new MeshStandardMaterial({ color: DARK }),
  ]);
  pad.position.copy(position).y += 0.06;
  pad.receiveShadow = true;
  scene.add(pad);

  const pits = new Group();
  pits.position.copy(position);
  pits.lookAt(position.x + startTangent.x, position.y, position.z + startTangent.z);
  scene.add(pits);

  addContainer(pits, colliders, textures.ribs, 6, -0.2, 2, 0, 0x2f5d7a);
  addContainer(pits, colliders, textures.ribs, 6, -0.2, -5, 0.05, 0x8a3a2a);

  const tent = new Mesh(
    new ConeGeometry(2.6, 1.0, 4, 1, true),
    new MeshStandardMaterial({ color: 0xff7a1a, side: DoubleSide, roughness: 0.8 }),
  );
  tent.position.set(-4, 3.0, 0);
  tent.rotation.y = Math.PI / 4;
  tent.castShadow = true;
  pits.add(tent);
  colliders.addMeshBox(tent, 'container');

  const legGeometry = new CylinderGeometry(0.04, 0.04, 2.5, 5);
  const legMaterial = new MeshStandardMaterial({ color: LEG, roughness: 0.4, metalness: 0.8 });
  for (const [x, z] of [[-5.8, -1.8], [-2.2, -1.8], [-5.8, 1.8], [-2.2, 1.8]] as const) {
    const leg = new Mesh(legGeometry, legMaterial);
    leg.position.set(x, 1.25, z);
    pits.add(leg);
  }
  const table = new Mesh(new BoxGeometry(1.8, 0.06, 0.8), new MeshStandardMaterial({ color: 0xdddddd }));
  table.position.set(-4, 0.8, 0);
  table.castShadow = true;
  pits.add(table);
  colliders.addMeshBox(table, 'container');
}
