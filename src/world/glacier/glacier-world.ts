import { Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Vector3, type BufferGeometry, type Scene } from 'three';
import { GLACIER } from '../../config';
import { sharedTimeS } from '../../core/shared-clock';
import type { ColliderWorld } from '../../physics/colliders';
import { buildClouds } from '../clouds';
import { PIT_PAD } from '../pit-area';
import type { Scenery } from '../scenery';
import { mergeToMesh, tiledBox } from '../tiled-box';
import type { WorldTextures } from '../textures';
import { buildGlacierPlan } from './plan';
import { glacierHeight, isIce, mountainHeight } from './terrain-fn';
import { WindStreaks } from './wind-streaks';

const SIZE_M = 1200;
const SEGMENTS = 300;
const COLORS = {
  snow: new Color(0xdde5ec),
  rock: new Color(0x77757a),
  ice: new Color(0xc6e4f2),
  floor: new Color(0x6f8160),
  scree: new Color(0x9a948a),
};

/** The mountains as one vertex-coloured mesh: snow high up and on gentle slopes, rock on steep ones, ice on the lake. */
function buildTerrain(scene: Scene): void {
  const geometry = new PlaneGeometry(SIZE_M, SIZE_M, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2);
  const position = geometry.attributes['position'];
  if (!position) throw new Error('Terrain has no positions');
  for (let i = 0; i < position.count; i++) position.setY(i, glacierHeight(position.getX(i), position.getZ(i)));
  geometry.computeVertexNormals();
  const normal = geometry.attributes['normal'];
  if (!normal) throw new Error('Terrain has no normals');
  const colors: number[] = [];
  const c = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = position.getY(i);
    const steepness = 1 - normal.getY(i);
    // Snow-line wobbles with the mountain noise so it is not a flat band.
    const snowLine = GLACIER.snowLineM + (mountainHeight(x * 0.7, z * 0.7) - 160) * 0.18;
    if (isIce(x, z)) c.copy(COLORS.ice);
    else if (steepness > GLACIER.rockSlope) c.copy(COLORS.rock).lerp(COLORS.scree, 0.35 * ((x * 13 + z * 7) % 1 + 1) % 1);
    else if (y > snowLine) c.copy(COLORS.snow);
    else c.copy(COLORS.floor).lerp(COLORS.snow, 0.35);
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/** Pines as instanced trunks and snowy crowns, each with two solid cylinders. */
function buildPines(scene: Scene, colliders: ColliderWorld, plan: ReturnType<typeof buildGlacierPlan>): void {
  const { pines } = plan;
  const trunk = new InstancedMesh(new CylinderGeometry(0.35, 0.5, 2.6, 6).translate(0, 1.3, 0), new MeshStandardMaterial({ color: 0x4d3b2c, roughness: 1 }), pines.length);
  const crown = new InstancedMesh(new ConeGeometry(2.4, 8.5, 8).translate(0, 6.2, 0), new MeshStandardMaterial({ color: 0x2f5238, roughness: 0.9 }), pines.length);
  const snow = new InstancedMesh(new ConeGeometry(1.5, 3.2, 8).translate(0, 10.2, 0), new MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.9 }), pines.length);
  const o = new Object3D();
  pines.forEach((p, i) => {
    o.position.set(p.x, p.baseY, p.z);
    o.scale.setScalar(p.scale);
    o.rotation.y = (i * 2.399) % (Math.PI * 2);
    o.updateMatrix();
    for (const mesh of [trunk, crown, snow]) mesh.setMatrixAt(i, o.matrix);
    colliders.addCylinder(p.x, p.z, p.baseY, 2.6 * p.scale, 0.5 * p.scale, 'tree');
    colliders.addCylinder(p.x, p.z, p.baseY + 2.4 * p.scale, 8.5 * p.scale, 2.1 * p.scale, 'tree');
  });
  for (const mesh of [trunk, crown, snow]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    scene.add(mesh);
  }
}

/** Builds Glacier Pass: terrain, pines, the rock arch, the lodge, blowing snow, the landing pad and clouds. */
export function buildGlacierScenery(scene: Scene, colliders: ColliderWorld, textures: WorldTextures): Scenery {
  const plan = buildGlacierPlan();
  buildTerrain(scene);
  buildPines(scene, colliders, plan);
  const parts: BufferGeometry[] = plan.solids.map((s) => tiledBox(s.sx, s.sy, s.sz, s.x, s.y, s.z, s.color, 6, 6));
  mergeToMesh(scene, parts, new MeshStandardMaterial({ map: textures.concrete, vertexColors: true, roughness: 0.9 }));
  for (const s of plan.solids) colliders.addBox(new Matrix4().makeTranslation(s.x, s.y, s.z), new Vector3(s.sx / 2, s.sy / 2, s.sz / 2), s.kind);
  const streaks = new WindStreaks(scene);
  const pad = new Mesh(new CylinderGeometry(1.4, 1.5, 0.12, 40), new MeshStandardMaterial({ map: textures.pad, roughness: 0.7 }));
  pad.position.copy(PIT_PAD.position).y += 0.12;
  scene.add(pad);
  buildClouds(scene, textures);
  return {
    setDetail(): void {
      // Nothing here is optional detail yet.
    },
    update(): void {
      streaks.update(sharedTimeS());
    },
  };
}

