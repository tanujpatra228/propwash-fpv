import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Scene } from 'three';
import { LAKE_SURFACE_Y, heightAt } from './terrain';
import { SCENERY, VALLEY, WORLD } from '../config';
import { createRng, randRange } from '../core/math';
import type { ColliderWorld } from '../physics/colliders';
import { Exclusions, distanceToTrack, slopeAt } from './scatter';
import type { WorldTextures } from './textures';

const WALL_HEIGHT_M = 3.1;
const ROOF_SQUASH = 0.45;
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

  const wallGeometry = new BoxGeometry(1, WALL_HEIGHT_M, 1);
  for (const { x, z } of placed) {
    const width = randRange(rng, 6, 9);
    const depth = randRange(rng, 5, 7.5);
    const baseY = Math.max(
      heightAt(x - width / 2, z - depth / 2),
      heightAt(x + width / 2, z - depth / 2),
      heightAt(x - width / 2, z + depth / 2),
      heightAt(x + width / 2, z + depth / 2),
    );
    const house = new Group();
    house.position.set(x, baseY - 0.4, z);
    house.rotation.y = Math.round(randRange(rng, 0, 24)) * (Math.PI / 12);
    scene.add(house);

    const wallMaterial = new MeshStandardMaterial({
      map: textures.houseWall,
      color: WALL_TINTS[Math.floor(rng() * WALL_TINTS.length)] ?? 0xffffff,
      roughness: 0.9,
    });
    const walls = new Mesh(wallGeometry, wallMaterial);
    walls.scale.set(width, 1, depth);
    walls.position.y = WALL_HEIGHT_M / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    house.add(walls);

    // Gable roof: a 3-sided prism along the long axis, squashed to a gentle pitch.
    const radius = (depth + 0.9) / SQRT3;
    const roofGeometry = new CylinderGeometry(radius, radius, width + 0.9, 3);
    roofGeometry.rotateZ(Math.PI / 2); // axis along the house width (X)
    roofGeometry.rotateX(-Math.PI / 2); // ridge pointing up
    const roof = new Mesh(
      roofGeometry,
      new MeshStandardMaterial({ color: ROOF_TINTS[Math.floor(rng() * ROOF_TINTS.length)] ?? 0x884433, roughness: 0.85, flatShading: true }),
    );
    roof.scale.y = ROOF_SQUASH;
    roof.position.y = WALL_HEIGHT_M + (radius * ROOF_SQUASH) / 2;
    roof.castShadow = true;
    house.add(roof);

    house.updateMatrixWorld(true);
    colliders.addMeshBox(walls, 'building');
    exclusions.add(x, z, FOOTPRINT_EXCLUSION_M + Math.max(width, depth) / 2);
  }
}
