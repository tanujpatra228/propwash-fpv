import { BoxGeometry, Color, CylinderGeometry, InstancedMesh, MeshStandardMaterial, Object3D, Vector3, type Scene } from 'three';
import { LAKE_SURFACE_Y, heightAt } from './terrain';
import { SCENERY, VALLEY, WORLD } from '../config';
import { createRng, randRange } from '../core/math';
import type { ColliderWorld } from '../physics/colliders';
import { Exclusions, distanceToTrack, slopeAt } from './scatter';
import type { WorldTextures } from './textures';

const WALL_HEIGHT_M = 3.1;
/** Roof height as a fraction of roof depth. */
const ROOF_PITCH = 0.45;
/** A unit prism's base sits this far below its centre (its radius is 1/sqrt(3); the base is at -radius/2). */
const PRISM_BASE_OFFSET = 1 / (2 * Math.sqrt(3));
const SQRT3 = Math.sqrt(3);
const WALL_TINTS = [0xf2e6d0, 0xe8c9a0, 0xd9d4c8, 0xcfa88a, 0xe6dfc9] as const;
const ROOF_TINTS = [0x8a3a2a, 0x6b4a3a, 0x4d5a64, 0x7a5a3a] as const;
const MIN_HOUSE_SPACING_M = 15;
const FOOTPRINT_EXCLUSION_M = 10;

interface Placed {
  x: number;
  z: number;
}

/** A small hamlet near the middle of the valley: familiar objects of known size, so speed is easy to judge. */
export function buildHamlet(scene: Scene, colliders: ColliderWorld, textures: WorldTextures, exclusions: Exclusions): void {
  const rng = createRng(WORLD.seed + 31);
  const { x: cx, z: cz, spreadM, houseCount } = SCENERY.hamlet;
  const placed: Placed[] = [];
  let tries = 0;
  while (placed.length < houseCount && tries < 400) {
    tries++;
    const x = cx + randRange(rng, -spreadM, spreadM);
    const z = cz + randRange(rng, -spreadM, spreadM);
    if (heightAt(x, z) < LAKE_SURFACE_Y + 1.5 || slopeAt(x, z, 3) > 0.18) continue;
    if (distanceToTrack(x, z) < SCENERY.houseMinTrackDistanceM) continue;
    if (Math.hypot(x - VALLEY.lake.x, z - VALLEY.lake.z) < VALLEY.lake.radiusM + 12) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < MIN_HOUSE_SPACING_M)) continue;
    placed.push({ x, z });
  }

  // Two instanced meshes (walls, roofs) keep the whole hamlet to a handful of draw calls.
  const wallMesh = new InstancedMesh(
    new BoxGeometry(1, WALL_HEIGHT_M, 1),
    new MeshStandardMaterial({ map: textures.houseWall, color: 0xffffff, roughness: 0.9 }),
    placed.length,
  );
  const roofGeometry = new CylinderGeometry(1 / SQRT3, 1 / SQRT3, 1, 3);
  roofGeometry.rotateZ(Math.PI / 2); // ridge along the house width (X)
  roofGeometry.rotateX(-Math.PI / 2); // ridge pointing up
  const roofMesh = new InstancedMesh(
    roofGeometry,
    new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }),
    placed.length,
  );
  const dummy = new Object3D();
  const tint = new Color();
  const halfExtents = new Vector3(0.5, WALL_HEIGHT_M / 2, 0.5);

  placed.forEach(({ x, z }, i) => {
    const width = randRange(rng, 6, 9);
    const depth = randRange(rng, 5, 7.5);
    const baseY =
      Math.max(
        heightAt(x - width / 2, z - depth / 2),
        heightAt(x + width / 2, z - depth / 2),
        heightAt(x - width / 2, z + depth / 2),
        heightAt(x + width / 2, z + depth / 2),
      ) - 0.4;
    const yawRad = Math.round(randRange(rng, 0, 24)) * (Math.PI / 12);

    dummy.position.set(x, baseY + WALL_HEIGHT_M / 2, z);
    dummy.rotation.set(0, yawRad, 0);
    dummy.scale.set(width, 1, depth);
    dummy.updateMatrix();
    wallMesh.setMatrixAt(i, dummy.matrix);
    wallMesh.setColorAt(i, tint.set(WALL_TINTS[Math.floor(rng() * WALL_TINTS.length)] ?? 0xffffff));
    colliders.addBox(dummy.matrix, halfExtents, 'building');

    // Gable roof: a 3-sided prism with a gentle pitch, a little wider than the walls.
    const roofDepth = depth + 0.9;
    const pitch = ROOF_PITCH * roofDepth;
    dummy.position.set(x, baseY + WALL_HEIGHT_M + PRISM_BASE_OFFSET * pitch, z);
    dummy.scale.set(width + 0.9, pitch, roofDepth);
    dummy.updateMatrix();
    roofMesh.setMatrixAt(i, dummy.matrix);
    roofMesh.setColorAt(i, tint.set(ROOF_TINTS[Math.floor(rng() * ROOF_TINTS.length)] ?? 0x884433));

    exclusions.add(x, z, FOOTPRINT_EXCLUSION_M + Math.max(width, depth) / 2);
  });
  for (const mesh of [wallMesh, roofMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}
