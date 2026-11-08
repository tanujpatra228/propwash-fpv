import { BoxGeometry, Color, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry, type Scene, type Texture } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY } from '../../config';
import type { ColliderWorld } from '../../physics/colliders';
import { LEDGE_V } from './facade';
import type { CityBox, CityPlan } from './plan';

const tint = new Color();

/** A box mesh whose side faces tile the facade (one bay per `windowBayM`, one floor per `floorHeightM`) and whose roof is solid. */
function boxGeometry(b: CityBox): BoxGeometry {
  const g = new BoxGeometry(b.sx, b.sy, b.sz);
  const uv = g.attributes['uv'];
  if (!uv) throw new Error('Box has no UVs');
  // BoxGeometry builds faces in the order +x, -x, +y, -y, +z, -z, four vertices each.
  const widths = [b.sz, b.sz, 0, 0, b.sx, b.sx];
  for (let face = 0; face < 6; face++) {
    const width = widths[face] ?? 0;
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      if (width === 0) uv.setXY(i, 0.5, LEDGE_V * 0.5);
      else uv.setXY(i, (uv.getX(i) * width) / CITY.windowBayM, (uv.getY(i) * b.sy) / CITY.floorHeightM);
    }
  }
  tint.setHex(b.tint);
  const colors: number[] = [];
  for (let i = 0; i < g.attributes['position']!.count; i++) colors.push(tint.r, tint.g, tint.b);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.translate(b.x, b.y, b.z);
  return g;
}

/** Builds every building as one merged mesh and registers a solid box for each part. Returns the mesh. */
export function buildBuildings(scene: Scene, colliders: ColliderWorld, plan: CityPlan, facade: Texture): Mesh {
  const geometries: BufferGeometry[] = [];
  for (const building of plan.buildings) {
    for (const b of building.boxes) {
      geometries.push(boxGeometry(b));
      colliders.addBox(new Matrix4().makeTranslation(b.x, b.y, b.z), new Vector3(b.sx / 2, b.sy / 2, b.sz / 2), 'building');
    }
  }
  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error('Could not merge city buildings');
  for (const g of geometries) g.dispose();
  const mesh = new Mesh(merged, new MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.5, metalness: 0.15 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
