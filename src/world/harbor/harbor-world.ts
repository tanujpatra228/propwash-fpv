import { BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry, type Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HARBOR } from '../../config';
import { sharedTimeS } from '../../core/shared-clock';
import type { ColliderWorld } from '../../physics/colliders';
import { buildClouds } from '../clouds';
import { PIT_PAD } from '../pit-area';
import type { Scenery } from '../scenery';
import type { WorldTextures } from '../textures';
import { MovingCranes } from './cranes';
import { buildLighthouse } from './lighthouse';
import { buildHarborPlan, type HarborBox } from './plan';
import { buildWater } from './water';

const tint = new Color();

/** A box whose faces tile `unitM` metres per texture repeat and carry a vertex colour. */
function tiledBox(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number, unitX: number, unitY: number): BufferGeometry {
  const g = new BoxGeometry(sx, sy, sz);
  const uv = g.attributes['uv'];
  if (!uv) throw new Error('Box has no UVs');
  const widths = [sz, sz, sx, sx, sx, sx];
  const heights = [sy, sy, sz, sz, sy, sy];
  for (let face = 0; face < 6; face++) {
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      uv.setXY(i, (uv.getX(i) * (widths[face] ?? 1)) / unitX, (uv.getY(i) * (heights[face] ?? 1)) / unitY);
    }
  }
  tint.setHex(color);
  const colors: number[] = [];
  for (let i = 0; i < g.attributes['position']!.count; i++) colors.push(tint.r, tint.g, tint.b);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.translate(x, y, z);
  return g;
}

function mergeToMesh(scene: Scene, parts: BufferGeometry[], material: MeshStandardMaterial): void {
  if (parts.length === 0) return;
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Could not merge harbor geometry');
  for (const g of parts) g.dispose();
  const mesh = new Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/** Builds the harbor: quay and piers, yard, ship, warehouse, cranes, lighthouse, water, the landing pad and clouds. */
export function buildHarborScenery(scene: Scene, colliders: ColliderWorld, textures: WorldTextures): Scenery {
  const plan = buildHarborPlan();
  const { yard } = HARBOR;

  // Land: slabs from below the water up to the quay top.
  const quay = new MeshStandardMaterial({ color: 0x8d8b84, roughness: 0.9 });
  for (const [x0, x1, z0, z1] of HARBOR.land) {
    const slab = new Mesh(new BoxGeometry(x1 - x0, HARBOR.quayY + 4, z1 - z0), quay);
    slab.position.set((x0 + x1) / 2, (HARBOR.quayY - 4) / 2, (z0 + z1) / 2);
    slab.receiveShadow = true;
    scene.add(slab);
  }

  // Containers (yard levels, ship cargo): ribbed, tinted per level.
  const ribbed: BufferGeometry[] = [];
  for (const b of plan.yardBlocks) {
    for (let level = 0; level < b.levels; level++) {
      ribbed.push(tiledBox(yard.blockX, yard.levelM, yard.blockZ, b.x, HARBOR.quayY + yard.levelM * (level + 0.5), b.z, b.colors[level] ?? 0x888888, 2.44, 2.6));
    }
  }
  const plain: BufferGeometry[] = [];
  for (const s of plan.solids) {
    if (s.kind === 'container' && s.sx === yard.blockX && s.sz === yard.blockZ) continue; // yard blocks are drawn above, level by level
    (s.kind === 'container' ? ribbed : plain).push(tiledBox(s.sx, s.sy, s.sz, s.x, s.y, s.z, s.color, s.kind === 'container' ? 2.44 : 6, s.kind === 'container' ? 2.6 : 6));
  }
  mergeToMesh(scene, ribbed, new MeshStandardMaterial({ map: textures.ribs, vertexColors: true, roughness: 0.7, metalness: 0.3 }));
  mergeToMesh(scene, plain, new MeshStandardMaterial({ map: textures.concrete, vertexColors: true, roughness: 0.8 }));
  for (const s of plan.solids) addSolid(colliders, s);

  buildLighthouse(scene, colliders);
  const cranes = new MovingCranes(scene, colliders);
  const water = buildWater(scene);

  const pad = new Mesh(new CylinderGeometry(1.4, 1.5, 0.12, 40), new MeshStandardMaterial({ map: textures.pad, roughness: 0.7 }));
  pad.position.copy(PIT_PAD.position).y += 0.12;
  scene.add(pad);
  buildClouds(scene, textures);

  return {
    setDetail(): void {
      // Nothing here is optional detail yet.
    },
    update(): void {
      const t = sharedTimeS();
      cranes.update(t);
      water.update(t);
    },
  };
}

function addSolid(colliders: ColliderWorld, s: HarborBox): void {
  colliders.addBox(new Matrix4().makeTranslation(s.x, s.y, s.z), new Vector3(s.sx / 2, s.sy / 2, s.sz / 2), s.kind);
}

