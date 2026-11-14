import { BoxGeometry, Color, Float32BufferAttribute, Mesh, type BufferGeometry, type MeshStandardMaterial, type Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tint = new Color();

/** A box whose faces tile `unitM` metres per texture repeat and carry a vertex colour. */
export function tiledBox(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number, unitX: number, unitY: number): BufferGeometry {
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

export function mergeToMesh(scene: Scene, parts: BufferGeometry[], material: MeshStandardMaterial): void {
  if (parts.length === 0) return;
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Could not merge harbor geometry');
  for (const g of parts) g.dispose();
  const mesh = new Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

