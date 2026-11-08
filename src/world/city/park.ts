import { CylinderGeometry, DodecahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D, type Scene } from 'three';
import { CITY, WORLD } from '../../config';
import { createRng, randRange } from '../../core/math';
import type { ColliderWorld } from '../../physics/colliders';
import { PARK } from './roads';

const TREES = 46;
/** The race line crosses the park along this strip; keep it free of trunks. */
const CORRIDOR_HALF_WIDTH_M = 7;
const CURB_M = 0.12;

/** Solid trees on the park lawn, kept off the pond and the race corridor. */
export function buildPark(scene: Scene, colliders: ColliderWorld): void {
  const rng = createRng(WORLD.seed + 4242);
  const trunk = new InstancedMesh(new CylinderGeometry(0.3, 0.42, 3.4, 6).translate(0, 1.7, 0), new MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }), TREES);
  const crown = new InstancedMesh(new DodecahedronGeometry(2.7, 0).translate(0, 5.2, 0), new MeshStandardMaterial({ color: 0x4f8a35, roughness: 0.9, flatShading: true }), TREES);
  const o = new Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < TREES && guard++ < 2000) {
    const x = PARK.x + randRange(rng, -CITY.blockHalfM + 4, CITY.blockHalfM - 4);
    const z = PARK.z + randRange(rng, -CITY.blockHalfM + 4, CITY.blockHalfM - 4);
    const scale = randRange(rng, 0.8, 1.35);
    const pondDistance = Math.hypot(x - PARK.pond.x, z - PARK.pond.z);
    if (pondDistance < PARK.pond.radiusM + 4 || Math.abs(z - PARK.z) < CORRIDOR_HALF_WIDTH_M) continue;
    o.position.set(x, CURB_M, z);
    o.rotation.y = rng() * Math.PI * 2;
    o.scale.setScalar(scale);
    o.updateMatrix();
    trunk.setMatrixAt(placed, o.matrix);
    crown.setMatrixAt(placed, o.matrix);
    colliders.addCylinder(x, z, CURB_M, 3.4 * scale, 0.45 * scale, 'tree');
    colliders.addCylinder(x, z, CURB_M + 2.6 * scale, 5.6 * scale, 2.3 * scale, 'tree');
    placed++;
  }
  trunk.count = placed;
  crown.count = placed;
  for (const mesh of [trunk, crown]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    scene.add(mesh);
  }
}
