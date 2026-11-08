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
export function buildBuildings(scene: Scene, colliders: ColliderWorld, plan: CityPlan, facade: Texture, windowMask: Texture | null): Mesh {
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
  const material = new MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.5, metalness: 0.15 });
  if (windowMask) makeWindowsGlow(material, windowMask);
  const mesh = new Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/**
 * Night: the windows glow warm, but only some of them. Each window (one bay by one floor, found from the world position)
 * gets a hash, and only windows whose hash is high enough are lit, so the towers look inhabited, not floodlit.
 */
function makeWindowsGlow(material: MeshStandardMaterial, mask: Texture): void {
  material.emissive = new Color(0xffc27a);
  material.emissiveMap = mask;
  material.emissiveIntensity = 0.85;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vWorldPos;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    )}`;
    shader.fragmentShader = `varying vec3 vWorldPos;
float windowHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
${shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      vec3 windowCell = floor(vec3(vWorldPos.x / ${CITY.windowBayM.toFixed(1)}, vWorldPos.y / ${CITY.floorHeightM.toFixed(1)}, vWorldPos.z / ${CITY.windowBayM.toFixed(1)}));
      float windowRoll = windowHash(windowCell);
      totalEmissiveRadiance *= step(0.6, windowRoll) * (0.55 + 0.45 * windowHash(windowCell + 7.0));`,
    )}`;
  };
}
