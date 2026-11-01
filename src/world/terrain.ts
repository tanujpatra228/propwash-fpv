import {
  BufferAttribute,
  CircleGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
} from 'three';
import { VALLEY } from '../config';
import { fbm, smoothstep } from '../core/math';

const { lake, bando } = VALLEY;

function baseHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const far = smoothstep(VALLEY.valleyFloorRadiusM, VALLEY.mountainRingRadiusM, d);
  let h = fbm(x * 0.0045, z * 0.0045) * 30 * (0.35 + 0.65 * far) + fbm(x * 0.02, z * 0.02, 3) * 2.2;
  h += far * far * (80 + fbm(x * 0.003 + 5, z * 0.003 - 3, 4) * 110);
  return h;
}

const lakeShoreY = baseHeight(lake.x, lake.z);
/** Height of the lake surface in metres. */
export const LAKE_SURFACE_Y = lakeShoreY - lake.depthBelowShoreM;
/** Ground height at the factory, which is flattened to this level. */
export const BANDO_FLOOR_Y = baseHeight(bando.x, bando.z);

/** Terrain height at a point (the lake bed is below the water). Deterministic. */
export function heightAt(x: number, z: number): number {
  let h = baseHeight(x, z);
  const lakeDistance = Math.hypot(x - lake.x, z - lake.z);
  if (lakeDistance < lake.radiusM * 1.7) {
    const t = 1 - smoothstep(lake.radiusM, lake.radiusM * 1.7, lakeDistance);
    h += (lakeShoreY - h) * t;
    h -= (1 - smoothstep(lake.radiusM * 0.25, lake.radiusM, lakeDistance)) * 8;
  }
  const bandoDistance = Math.hypot(x - bando.x, z - bando.z);
  if (bandoDistance < bando.outerRadiusM) {
    h += (BANDO_FLOOR_Y - h) * (1 - smoothstep(bando.innerRadiusM, bando.outerRadiusM, bandoDistance));
  }
  return h;
}

/** What the drone would touch first: terrain, or the lake surface over the lake. */
export function groundY(x: number, z: number): number {
  const h = heightAt(x, z);
  return Math.hypot(x - lake.x, z - lake.z) < lake.radiusM ? Math.max(h, LAKE_SURFACE_Y) : h;
}

const COLORS = {
  grassA: new Color(0x4a6526),
  grassB: new Color(0x6f7c32),
  dry: new Color(0x8c8550),
  rock: new Color(0x6f6a62),
  snow: new Color(0xe9edf0),
  mud: new Color(0x5f5038),
};

/** Builds the vertex-coloured terrain mesh. Colours blend by noise, slope and height. */
export function buildTerrain(scene: Scene): Mesh {
  const geometry = new PlaneGeometry(VALLEY.sizeM, VALLEY.sizeM, VALLEY.segments, VALLEY.segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  if (!position) throw new Error('Terrain geometry has no positions');
  for (let i = 0; i < position.count; i++) position.setY(i, heightAt(position.getX(i), position.getZ(i)));
  geometry.computeVertexNormals();
  const normal = geometry.attributes.normal;
  if (!normal) throw new Error('Terrain geometry has no normals');

  const colors = new Float32Array(position.count * 3);
  const c = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const slopeUp = normal.getY(i);
    const n1 = fbm(x * 0.012, z * 0.012, 3) * 0.5 + 0.5;
    const n2 = fbm(x * 0.05 + 3, z * 0.05, 2) * 0.5 + 0.5;
    c.copy(COLORS.grassA).lerp(COLORS.grassB, n1).lerp(COLORS.dry, smoothstep(0.62, 0.85, n2) * 0.6);
    c.lerp(COLORS.mud, (1 - smoothstep(LAKE_SURFACE_Y + 0.3, LAKE_SURFACE_Y + 2.5, y)) * 0.9);
    c.lerp(COLORS.rock, smoothstep(0.86, 0.72, slopeUp));
    c.lerp(COLORS.rock, smoothstep(110, 150, y) * 0.8);
    c.lerp(COLORS.snow, smoothstep(175, 205, y + n2 * 20) * smoothstep(0.6, 0.8, slopeUp));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, envMapIntensity: 0.5 }),
  );
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function buildWater(scene: Scene): Mesh {
  const water = new Mesh(
    new CircleGeometry(lake.radiusM * 0.98, 64),
    new MeshStandardMaterial({
      color: 0x1f3a44,
      roughness: 0.06,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92,
      envMapIntensity: 1.2,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(lake.x, LAKE_SURFACE_Y, lake.z);
  water.receiveShadow = true;
  scene.add(water);
  return water;
}
