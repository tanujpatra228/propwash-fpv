import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, Object3D, type Scene } from 'three';
import { CITY } from '../../config';
import { createRng, randRange } from '../../core/math';
import type { CityPlan } from './plan';

const SIGNS = 34;
const COLORS = [0xff2d95, 0x2dd4ff, 0xffb02d, 0x7dff5a, 0xb07cff];
const AVENUES = [-240, -120, 0, 120, 240] as const;

/** Glowing signs on the street-facing walls of the taller buildings. Night only. */
export function buildNeonSigns(scene: Scene, plan: CityPlan): void {
  const rng = createRng(CITY.seed + 61);
  const candidates = plan.buildings.filter((b) => (b.kind === 'tower' || b.kind === 'mid') && !b.hasPortal && b.heightM > 24);
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), SIGNS);
  const o = new Object3D();
  const color = new Color();
  for (let i = 0; i < SIGNS; i++) {
    const b = candidates[Math.floor(rng() * candidates.length)];
    if (!b) break;
    // Face the avenue that is closest to one of the building's sides.
    const nearest = (c: number): number => AVENUES.reduce((best, a) => (Math.abs(a - c) < Math.abs(best - c) ? a : best), 0);
    const ax = nearest(b.x);
    const az = nearest(b.z);
    const gapX = Math.abs(ax - b.x) - b.halfX;
    const gapZ = Math.abs(az - b.z) - b.halfZ;
    const width = randRange(rng, 5, 9);
    const height = randRange(rng, 1.4, 2.6);
    const y = Math.min(b.heightM - 3, randRange(rng, 12, 42));
    if (gapX <= gapZ) {
      const side = Math.sign(ax - b.x) || 1;
      o.position.set(b.x + side * (b.halfX + 0.12), y, b.z + randRange(rng, -b.halfZ * 0.5, b.halfZ * 0.5));
      o.scale.set(0.2, height, width);
    } else {
      const side = Math.sign(az - b.z) || 1;
      o.position.set(b.x + randRange(rng, -b.halfX * 0.5, b.halfX * 0.5), y, b.z + side * (b.halfZ + 0.12));
      o.scale.set(width, height, 0.2);
    }
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i, color.setHex(COLORS[Math.floor(rng() * COLORS.length)] ?? 0xffffff));
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}
