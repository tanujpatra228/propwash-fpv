import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VALLEY, WORLD } from '../config';
import { createRng, randRange } from '../core/math';
import type { ColliderWorld } from '../physics/colliders';
import { CONTAINER_COLORS, type ContainerBatch } from './containers';
import { BANDO_FLOOR_Y } from './terrain';
import type { WorldTextures } from './textures';
import { track } from './track';

const ROOF_HEIGHT_M = 9.2;
const PILLAR_Z = [-13, -4.3, 4.3, 13] as const;

/** The old factory ("bando"): open concrete frame the track flies through, with containers around it. */
export function buildFactory(scene: Scene, colliders: ColliderWorld, textures: WorldTextures, containers: ContainerBatch): void {
  const rng = createRng(WORLD.seed + 7);
  const index = track.nearestSampleIndex(new Vector3(VALLEY.bando.x, BANDO_FLOOR_Y, VALLEY.bando.z));
  const along = track.horizontalTangent(index, new Vector3());
  const centre = track.positions[index] ?? new Vector3(VALLEY.bando.x, 0, VALLEY.bando.z);

  const factory = new Group();
  factory.position.set(centre.x, BANDO_FLOOR_Y, centre.z);
  factory.lookAt(centre.x + along.x, BANDO_FLOOR_Y, centre.z + along.z);
  scene.add(factory);
  factory.updateMatrixWorld(true);

  // Every concrete box is merged into one mesh and every steel box into another; each solid box
  // still gets its own collider.
  const concreteParts: BoxGeometry[] = [];
  const steelParts: BoxGeometry[] = [];
  const box = (parts: BoxGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, isSolid = true): void => {
    parts.push(new BoxGeometry(w, h, d).translate(x, y, z) as BoxGeometry);
    if (isSolid) {
      colliders.addBox(factory.matrixWorld.clone().multiply(new Matrix4().makeTranslation(x, y, z)), new Vector3(w / 2, h / 2, d / 2), 'factory');
    }
  };

  for (const x of [-7.5, 7.5]) for (const z of PILLAR_Z) box(concreteParts, 0.8, ROOF_HEIGHT_M, 0.8, x, ROOF_HEIGHT_M / 2, z);
  box(concreteParts, 17.5, 0.55, 29, 0, ROOF_HEIGHT_M + 0.27, 0);
  for (const z of PILLAR_Z) box(steelParts, 15, 0.5, 0.35, 0, ROOF_HEIGHT_M - 0.25, z);
  // Broken side walls with window gaps.
  for (const x of [-8.6, 8.6]) {
    box(concreteParts, 0.4, 2.6, 28, x, 1.3, 0);
    for (const z of [-11, -2, 7]) box(concreteParts, 0.4, 2.2, 4.6, x, ROOF_HEIGHT_M - 1.1, z);
    for (const z of PILLAR_Z) box(concreteParts, 0.4, ROOF_HEIGHT_M - 4.8, 1.6, x, 2.6 + (ROOF_HEIGHT_M - 4.8) / 2, z);
  }
  // Debris: decoration only, too small to matter for collisions.
  for (let i = 0; i < 9; i++) {
    const side = rng() < 0.5 ? -5.5 : 5.5;
    box(concreteParts, randRange(rng, 0.4, 1.4), randRange(rng, 0.3, 0.9), randRange(rng, 0.4, 1.4), side + randRange(rng, -1.8, 1.8), 0.3, randRange(rng, -12, 12), false);
  }

  const addMerged = (parts: BoxGeometry[], material: MeshStandardMaterial): void => {
    const mesh = new Mesh(mergeGeometries(parts), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    factory.add(mesh);
    for (const part of parts) part.dispose();
  };
  addMerged(concreteParts, new MeshStandardMaterial({ map: textures.concrete, roughness: 0.95 }));
  addMerged(steelParts, new MeshStandardMaterial({ color: 0x5b3f30, roughness: 0.7, metalness: 0.6 }));

  const [red, blue, green, amber, grey] = CONTAINER_COLORS;
  containers.add(factory, -15, 0, -6, 0, red);
  containers.add(factory, -15, 0, 1, 0.04, blue);
  containers.add(factory, -15, 2.6, -2.5, 0.02, green);
  containers.add(factory, 15.5, 0, 8, 0, amber);
  containers.add(factory, 16, 0, -9, Math.PI / 2, grey);
}
