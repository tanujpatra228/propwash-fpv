import {
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAKE_SURFACE_Y, heightAt } from './terrain';
import { SCENERY, VALLEY, WORLD } from '../config';
import { createRng, fbm, randRange, valueNoise } from '../core/math';
import type { ColliderWorld } from '../physics/colliders';
import { PIT_PAD } from './pit-area';
import { Exclusions, distanceToTrack, scatter, slopeAt } from './scatter';
import { addTreeColliders, type TreeKind } from './tree-colliders';

const PINE_COLORS = [0x2c4a25, 0x33552a, 0x253f22, 0x3b5a2c] as const;
const BROADLEAF_COLORS = [0x557a2e, 0x6b8a34, 0x4a6e2a, 0x8a8a3a] as const;
const ROCK_ZONE_MIN_ABOVE_WATER_M = 0.6;
const BROADLEAF_RADIUS_LIMIT_M = 420;
const TWO_PI = Math.PI * 2;
/** Trees are planted this far into the ground so trunks never float. */
const TREE_SINK_M = 0.3;

const dummy = new Object3D();
const tint = new Color();

type Point = readonly [x: number, h: number, z: number];

function pineGeometry(): BufferGeometry {
  const tiers = [
    new CylinderGeometry(0, 2.7, 4.6, 8).translate(0, 4.4, 0),
    new CylinderGeometry(0, 2.0, 3.9, 8).translate(0, 6.8, 0),
    new CylinderGeometry(0, 1.25, 3.3, 8).translate(0, 9.0, 0),
  ];
  const merged = mergeGeometries(tiers);
  for (const tier of tiers) tier.dispose();
  return merged;
}

function broadleafGeometry(): BufferGeometry {
  const crown = new IcosahedronGeometry(2.6, 1);
  const p = crown.attributes.position;
  if (!p) throw new Error('Broadleaf crown has no positions');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + valueNoise(x * 1.3 + 7, z * 1.3 + y) * 0.22;
    p.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  crown.translate(0, 4.8, 0);
  crown.computeVertexNormals();
  return crown;
}

/** Instanced pines, broadleaf trees and rocks. Trees also register trunk colliders. */
export function buildVegetation(scene: Scene, colliders: ColliderWorld, exclusions: Exclusions): void {
  const rng = createRng(WORLD.seed + 53);
  const pad = PIT_PAD.position;

  const isFree = (x: number, z: number, minTrackM: number): number | null => {
    const h = heightAt(x, z);
    if (h < LAKE_SURFACE_Y + ROCK_ZONE_MIN_ABOVE_WATER_M || h > SCENERY.maxTreeHeightM) return null;
    if (Math.hypot(x - VALLEY.bando.x, z - VALLEY.bando.z) < SCENERY.treeExclusion.bandoRadiusM) return null;
    if (Math.hypot(x - pad.x, z - pad.z) < SCENERY.treeExclusion.padRadiusM) return null;
    if (exclusions.isBlocked(x, z)) return null;
    if (slopeAt(x, z, 2) > SCENERY.maxTreeSlope) return null;
    if (distanceToTrack(x, z) < minTrackM) return null;
    return h;
  };

  const pines = scatter<Point>(SCENERY.pineCount, rng, (x, z) => {
    if (fbm(x * 0.008 + 11, z * 0.008, 3) < -0.08) return null;
    const h = isFree(x, z, SCENERY.treeMinTrackDistanceM);
    return h === null ? null : [x, h, z];
  });
  const broadleaf = scatter<Point>(SCENERY.broadleafCount, rng, (x, z) => {
    if (Math.hypot(x, z) > BROADLEAF_RADIUS_LIMIT_M) return null;
    const h = isFree(x, z, SCENERY.broadleafMinTrackDistanceM);
    return h === null ? null : [x, h, z];
  });

  const trunkGeometry = new CylinderGeometry(0.16, 0.28, 3.2, 6).translate(0, 1.6, 0);
  const foliageMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const trunks = new InstancedMesh(trunkGeometry, new MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }), pines.length + broadleaf.length);
  const pineMesh = new InstancedMesh(pineGeometry(), foliageMaterial, pines.length);
  const broadMesh = new InstancedMesh(broadleafGeometry(), foliageMaterial, broadleaf.length);

  let trunkIndex = 0;
  const place = (points: Point[], mesh: InstancedMesh, kind: TreeKind, palette: readonly number[], minScale: number, maxScale: number): void => {
    points.forEach(([x, h, z], i) => {
      const s = randRange(rng, minScale, maxScale);
      dummy.position.set(x, h - TREE_SINK_M, z);
      dummy.rotation.set(randRange(rng, -0.05, 0.05), randRange(rng, 0, TWO_PI), randRange(rng, -0.05, 0.05));
      const stretch = randRange(rng, 0.9, 1.2);
      dummy.scale.set(s, s * stretch, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      trunks.setMatrixAt(trunkIndex++, dummy.matrix);
      tint.set(palette[Math.floor(rng() * palette.length)] ?? 0x335522).offsetHSL(randRange(rng, -0.02, 0.02), 0, randRange(rng, -0.04, 0.04));
      mesh.setColorAt(i, tint);
      addTreeColliders(colliders, kind, x, z, h - TREE_SINK_M, s, s * stretch);
    });
  };
  place(pines, pineMesh, 'pine', PINE_COLORS, 0.8, 1.7);
  place(broadleaf, broadMesh, 'broadleaf', BROADLEAF_COLORS, 0.7, 1.3);
  for (const mesh of [trunks, pineMesh, broadMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const rocks = scatter<Point>(SCENERY.rockCount, rng, (x, z) => {
    const h = isFree(x, z, SCENERY.rockMinTrackDistanceM);
    return h === null ? null : [x, h, z];
  });
  const rockMesh = new InstancedMesh(
    new DodecahedronGeometry(1, 0),
    new MeshStandardMaterial({ color: 0x7a756d, roughness: 0.9, flatShading: true }),
    rocks.length,
  );
  rocks.forEach(([x, h, z], i) => {
    dummy.position.set(x, h, z);
    dummy.rotation.set(randRange(rng, 0, 6), randRange(rng, 0, 6), randRange(rng, 0, 6));
    dummy.scale.set(randRange(rng, 0.5, 2.4), randRange(rng, 0.4, 1.4), randRange(rng, 0.5, 2.2));
    dummy.updateMatrix();
    rockMesh.setMatrixAt(i, dummy.matrix);
  });
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  scene.add(rockMesh);
}
